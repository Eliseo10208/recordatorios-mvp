"""Encrypt destination numbers and derive non-reversible uniqueness keys."""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import os
import re

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.auth_service import AuthProblem

E164 = re.compile(r"\+[1-9][0-9]{7,14}\Z")


def enabled() -> bool:
    return os.environ.get("WHATSAPP_ENABLED", "false").lower() == "true"


def available() -> bool:
    if not enabled():
        return False
    try:
        keys()
    except AuthProblem:
        return False
    return True


def keys() -> tuple[bytes, bytes]:
    value = os.environ.get("WHATSAPP_PHONE_KEY", "")
    try:
        master = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise AuthProblem(503, "WhatsApp is not configured") from exc
    if len(master) != 32:
        raise AuthProblem(503, "WhatsApp is not configured")
    derived = HKDF(
        algorithm=hashes.SHA256(),
        length=64,
        salt=None,
        info=b"recordatorios-whatsapp-phone-v1",
    ).derive(master)
    return derived[:32], derived[32:]


def normalize(phone: str) -> str:
    value = re.sub(r"[\s()\-]", "", phone.strip())
    if not E164.fullmatch(value):
        raise AuthProblem(422, "Invalid E.164 phone")
    if value.startswith("+521") and len(value) == 14:
        return "+52" + value[4:]
    return value


def fingerprint(phone: str, hash_key: bytes) -> str:
    return hmac.new(hash_key, phone.encode(), hashlib.sha256).hexdigest()


def encrypt(phone: str, encryption_key: bytes) -> str:
    nonce = os.urandom(12)
    sealed = AESGCM(encryption_key).encrypt(nonce, phone.encode(), None)
    return base64.urlsafe_b64encode(nonce + sealed).decode()


def decrypt(value: str, encryption_key: bytes) -> str:
    raw = base64.urlsafe_b64decode(value)
    return AESGCM(encryption_key).decrypt(raw[:12], raw[12:], None).decode()
