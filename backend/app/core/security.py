from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken

_password_hasher = PasswordHasher(time_cost=3, memory_cost=65_536, parallelism=4)


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    try:
        return _password_hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def new_secret(byte_count: int = 32) -> str:
    return secrets.token_urlsafe(byte_count)


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def secrets_match(value: str, expected_hash: str) -> bool:
    return hmac.compare_digest(hash_secret(value), expected_hash)


class SecretBox:
    def __init__(self, key: str) -> None:
        try:
            self._fernet = Fernet(key.encode("ascii"))
        except (ValueError, UnicodeEncodeError) as exc:
            raise ValueError("FERNET_KEY must be a valid Fernet key") from exc

    def encrypt_text(self, value: str) -> str:
        return self._fernet.encrypt(value.encode("utf-8")).decode("ascii")

    def decrypt_text(self, value: str) -> str:
        try:
            return self._fernet.decrypt(value.encode("ascii")).decode("utf-8")
        except (InvalidToken, UnicodeDecodeError) as exc:
            raise ValueError("Encrypted configuration could not be decrypted") from exc

    def encrypt_json(self, value: dict[str, Any]) -> str:
        serialized = json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        return self.encrypt_text(serialized)

    def decrypt_json(self, value: str) -> dict[str, Any]:
        decoded = json.loads(self.decrypt_text(value))
        if not isinstance(decoded, dict):
            raise ValueError("Encrypted configuration is not an object")
        return decoded
