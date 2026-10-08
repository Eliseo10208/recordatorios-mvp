"""Run browser checks against an explicitly named PostgreSQL test database."""

from __future__ import annotations

import base64
import os
import secrets
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "api"
WEB = ROOT / "web"


def wait_for_port(port: int, process: subprocess.Popen[bytes]) -> None:
    for _ in range(80):
        if process.poll() is not None:
            raise RuntimeError(f"Test service on port {port} exited early")
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.3):
                return
        except OSError:
            time.sleep(0.5)
    raise RuntimeError(f"Test service on port {port} did not start")


def main() -> None:
    database_url = os.environ.get("TEST_DATABASE_URL", "")
    if "_test" not in urlsplit(database_url).path:
        raise RuntimeError("TEST_DATABASE_URL must name a test database")
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    api_port = int(os.environ.get("E2E_API_PORT", "8000"))
    worker_port = int(os.environ.get("E2E_WORKER_PORT", "8001"))
    web_port = int(os.environ.get("E2E_WEB_PORT", "3000"))
    origin = f"http://127.0.0.1:{web_port}"
    env = os.environ.copy()
    env.pop("WHATSAPP_SERVICE_TOKEN", None)
    env.pop("WHATSAPP_API_URL", None)
    env.update(
        {
            "DATABASE_URL": database_url,
            "JWT_PRIVATE_KEY": private.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            ).decode(),
            "JWT_PUBLIC_KEY": private.public_key()
            .public_bytes(
                serialization.Encoding.PEM,
                serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            .decode(),
            "JWT_KID": "e2e-test",
            "JWT_ISSUER": "recordatorios-e2e",
            "JWT_AUDIENCE": "recordatorios-web-e2e",
            # Keep shared visual-test storage fresh while the long-running auth
            # test still exercises renewal near the end of the token lifetime.
            "JWT_ACCESS_SECONDS": "120",
            "REFRESH_SECRET": secrets.token_urlsafe(48),
            "AUTH_SECRET": secrets.token_urlsafe(48),
            "AUTH_URL": origin,
            "API_BASE_URL": f"http://127.0.0.1:{api_port}",
            "WEB_ORIGIN": origin,
            "PLAYWRIGHT_BASE_URL": origin,
            "WORKER_POLL_SECONDS": "1",
            "WHATSAPP_ENABLED": "true",
            "WHATSAPP_PHONE_KEY": base64.b64encode(secrets.token_bytes(32)).decode(),
        }
    )
    pnpm = shutil.which("pnpm")
    if not pnpm:
        raise RuntimeError("pnpm is required")
    api = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(api_port),
        ],
        cwd=API,
        env=env,
    )
    web: subprocess.Popen[bytes] | None = None
    worker: subprocess.Popen[bytes] | None = None
    try:
        wait_for_port(api_port, api)
        worker_env = {**env, "WHATSAPP_ENABLED": "false"}
        worker = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.worker_app:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(worker_port),
            ],
            cwd=API,
            env=worker_env,
        )
        wait_for_port(worker_port, worker)
        web = subprocess.Popen(
            [
                "node",
                str(WEB / "node_modules/next/dist/bin/next"),
                "start",
                "-p",
                str(web_port),
            ],
            cwd=WEB,
            env=env,
        )
        wait_for_port(web_port, web)
        test_command = [pnpm, "--filter", "@recordatorios/web", "test:e2e"]
        if os.environ.get("E2E_TEST_FILE"):
            test_command.append(os.environ["E2E_TEST_FILE"])
        subprocess.run(
            test_command,
            cwd=ROOT,
            env=env,
            check=True,
        )
    finally:
        for process in (web, worker, api):
            if process and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()


if __name__ == "__main__":
    main()
