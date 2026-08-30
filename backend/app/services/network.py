from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from urllib.parse import SplitResult, urlsplit, urlunsplit

from app.core.errors import AppError

_DISCORD_HOSTS = frozenset(
    {"discord.com", "canary.discord.com", "ptb.discord.com", "discordapp.com"}
)
_DISCORD_PATH = re.compile(r"^/api(?:/v\d+)?/webhooks/[0-9]+/[A-Za-z0-9._-]+/?$")
_DNS_TIMEOUT_SECONDS = 5.0
_DEVELOPMENT_PRIVATE_NETWORKS = (
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("fc00::/7"),
)


def _parse_http_url(url: str) -> SplitResult:
    try:
        parsed = urlsplit(url)
        _ = parsed.port
    except ValueError as exc:
        raise AppError(422, "invalid_action_url", "The action URL is invalid.") from exc
    if parsed.scheme.casefold() not in {"http", "https"}:
        raise AppError(422, "invalid_action_url", "Action URLs must use HTTP or HTTPS.")
    if not parsed.hostname:
        raise AppError(422, "invalid_action_url", "The action URL must include a hostname.")
    if parsed.username is not None or parsed.password is not None:
        raise AppError(422, "invalid_action_url", "Action URLs cannot contain credentials.")
    if parsed.fragment:
        raise AppError(422, "invalid_action_url", "Action URLs cannot contain fragments.")
    return parsed


def _is_allowed_address(
    address: ipaddress.IPv4Address | ipaddress.IPv6Address, *, allow_private: bool
) -> bool:
    if (
        address.is_multicast
        or address.is_unspecified
        or address.is_reserved
        or address.is_link_local
        or bool(getattr(address, "is_site_local", False))
    ):
        return False
    if address.is_global:
        return True
    if not allow_private:
        return False
    if address.is_loopback:
        return True
    return any(address in network for network in _DEVELOPMENT_PRIVATE_NETWORKS)


async def validate_outbound_url(url: str, *, allow_private: bool) -> str:
    parsed = _parse_http_url(url.strip())
    hostname = parsed.hostname
    assert hostname is not None
    normalized_host = hostname.rstrip(".").casefold()
    if normalized_host == "localhost" or normalized_host.endswith(".localhost"):
        if not allow_private:
            raise AppError(
                422, "blocked_action_target", "The action target is not publicly routable."
            )
    port = parsed.port or (443 if parsed.scheme.casefold() == "https" else 80)
    try:
        direct_address = ipaddress.ip_address(normalized_host.strip("[]"))
        addresses = {direct_address}
    except ValueError:
        try:
            loop = asyncio.get_running_loop()
            async with asyncio.timeout(_DNS_TIMEOUT_SECONDS):
                resolved = await loop.getaddrinfo(
                    normalized_host, port, family=socket.AF_UNSPEC, type=socket.SOCK_STREAM
                )
        except (OSError, TimeoutError) as exc:
            raise AppError(
                422, "unresolvable_action_target", "The action target could not be resolved."
            ) from exc
        addresses = {ipaddress.ip_address(item[4][0]) for item in resolved}
    if not addresses:
        raise AppError(
            422, "unresolvable_action_target", "The action target could not be resolved."
        )
    if any(not _is_allowed_address(address, allow_private=allow_private) for address in addresses):
        raise AppError(422, "blocked_action_target", "The action target is not publicly routable.")
    netloc = normalized_host
    if ":" in normalized_host and not normalized_host.startswith("["):
        netloc = f"[{normalized_host}]"
    if parsed.port is not None:
        netloc = f"{netloc}:{parsed.port}"
    return urlunsplit((parsed.scheme.casefold(), netloc, parsed.path or "/", parsed.query, ""))


def validate_discord_webhook_url(url: str) -> str:
    parsed = _parse_http_url(url.strip())
    host = (parsed.hostname or "").rstrip(".").casefold()
    if parsed.scheme.casefold() != "https" or host not in _DISCORD_HOSTS:
        raise AppError(
            422,
            "invalid_discord_webhook",
            "Discord webhooks must use HTTPS on a recognized Discord host.",
        )
    if parsed.port not in (None, 443) or not _DISCORD_PATH.fullmatch(parsed.path):
        raise AppError(422, "invalid_discord_webhook", "The Discord webhook path is invalid.")
    return urlunsplit(("https", host, parsed.path, parsed.query, ""))
