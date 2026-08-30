from __future__ import annotations

import runpy
import sys
from io import StringIO
from pathlib import Path
from typing import Any

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPOSITORY_ROOT / "scripts" / "send_sample_event.py"


class _TTYInput(StringIO):
    def isatty(self) -> bool:
        return True


def _script_namespace() -> dict[str, Any]:
    return runpy.run_path(str(SCRIPT_PATH))


def test_sample_script_reads_secret_from_environment_or_hidden_input() -> None:
    namespace = _script_namespace()
    resolve = namespace["_resolve_webhook_url"]
    secret_url = "https://example.com/api/v1/hooks/workflow/secret-token"
    assert resolve({"AUTORELAY_WEBHOOK_URL": secret_url}, StringIO()) == secret_url
    assert resolve({}, StringIO(f"{secret_url}\n")) == secret_url
    assert resolve({}, _TTYInput(), lambda _message: secret_url) == secret_url


def test_sample_script_rejects_url_arguments_without_echoing_them(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    namespace = _script_namespace()
    secret_url = "https://example.com/api/v1/hooks/workflow/do-not-print-this-token"
    monkeypatch.setattr(sys, "argv", [str(SCRIPT_PATH), secret_url])
    with pytest.raises(SystemExit):
        namespace["main"]()
    captured = capsys.readouterr()
    assert "do-not-print-this-token" not in captured.err
    assert "AUTORELAY_WEBHOOK_URL" in captured.err


def test_backend_dockerignore_excludes_secrets_and_local_artifacts() -> None:
    content = (REPOSITORY_ROOT / "backend" / ".dockerignore").read_text(encoding="utf-8")
    for required_pattern in (".env", ".env.*", ".venv/", ".pytest_cache/", ".git/"):
        assert required_pattern in content.splitlines()
