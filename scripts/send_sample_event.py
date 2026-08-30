#!/usr/bin/env python3
"""Send the documented high-value lead payload to an AutoRelay webhook."""

from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping
from io import TextIOBase
from typing import Any
from urllib.parse import urlsplit


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(  # type: ignore[override]
        self,
        req: urllib.request.Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> None:
        return None


def _timeout(raw_value: str) -> float:
    value = float(raw_value)
    if not 1 <= value <= 30:
        raise argparse.ArgumentTypeError("timeout must be between 1 and 30 seconds")
    return value


def _webhook_url(raw_value: str) -> str:
    parsed = urlsplit(raw_value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise argparse.ArgumentTypeError("webhook URL must be an absolute HTTP(S) URL")
    if parsed.username is not None or parsed.password is not None:
        raise argparse.ArgumentTypeError("webhook URL must not contain credentials")
    return raw_value


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Send a JSON lead event to an AutoRelay webhook. The webhook URL is "
            "never echoed to the terminal."
        )
    )
    parser.add_argument("--lead-name", default="Example Company")
    parser.add_argument("--lead-value", type=float, default=1500)
    parser.add_argument("--timeout", type=_timeout, default=10.0)
    return parser


def _resolve_webhook_url(
    environ: Mapping[str, str] | None = None,
    input_stream: TextIOBase | None = None,
    hidden_prompt: Callable[[str], str] | None = None,
) -> str:
    source = os.environ if environ is None else environ
    raw_value = source.get("AUTORELAY_WEBHOOK_URL", "").strip()
    if not raw_value:
        stream = sys.stdin if input_stream is None else input_stream
        if stream.isatty():
            prompt = getpass.getpass if hidden_prompt is None else hidden_prompt
            raw_value = prompt("AutoRelay webhook URL (hidden): ").strip()
        else:
            raw_value = stream.readline().strip()
    if not raw_value:
        raise argparse.ArgumentTypeError(
            "set AUTORELAY_WEBHOOK_URL or provide the URL through hidden prompt/stdin"
        )
    return _webhook_url(raw_value)


def _safe_response_summary(payload: bytes) -> str | None:
    try:
        decoded = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(decoded, dict):
        return None

    execution_id = decoded.get("execution_id") or decoded.get("id")
    if isinstance(execution_id, str):
        return f"Execution ID: {execution_id}"
    return None


def main() -> int:
    parser = _parser()
    arguments, unexpected = parser.parse_known_args()
    if unexpected:
        parser.error(
            "unexpected arguments; provide the webhook URL via AUTORELAY_WEBHOOK_URL or stdin"
        )
    try:
        webhook_url = _resolve_webhook_url()
    except argparse.ArgumentTypeError as error:
        parser.error(str(error))
    payload = {
        "lead": {
            "name": arguments.lead_name,
            "value": arguments.lead_value,
        }
    }
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(  # noqa: S310 - URL is restricted to absolute HTTP(S).
        webhook_url,
        data=body,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        method="POST",
    )
    opener = urllib.request.build_opener(_NoRedirectHandler())

    try:
        with opener.open(request, timeout=arguments.timeout) as response:
            response_body = response.read(65_537)
            status = response.status
    except urllib.error.HTTPError as error:
        print(f"AutoRelay rejected the event with HTTP {error.code}.")
        return 1
    except urllib.error.URLError as error:
        reason = type(error.reason).__name__
        print(f"Could not reach AutoRelay ({reason}).")
        return 1
    except TimeoutError:
        print("The request to AutoRelay timed out.")
        return 1

    if not 200 <= status < 300:
        print(f"Unexpected HTTP status: {status}")
        return 1

    print(f"Sample event accepted with HTTP {status}.")
    summary = _safe_response_summary(response_body)
    if summary is not None:
        print(summary)
    print("Open the execution history to follow worker processing.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
