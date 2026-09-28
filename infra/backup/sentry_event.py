"""Send a Sentry-compatible event (GlitchTip) without a full SDK."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse


def parse_dsn(dsn: str) -> tuple[str, str, str]:
    parsed = urlparse(dsn)
    if not parsed.hostname or not parsed.username or not parsed.path:
        raise ValueError("invalid Sentry DSN")
    project_id = parsed.path.strip("/")
    if not project_id:
        raise ValueError("invalid Sentry DSN project")
    host = parsed.hostname
    if host in {"localhost", "127.0.0.1"}:
        host = os.environ.get("BACKUP_SENTRY_HOST", "host.docker.internal")
    port = f":{parsed.port}" if parsed.port else ""
    store = f"{parsed.scheme}://{host}{port}/api/{project_id}/store/"
    return store, parsed.username, parsed.scheme


def capture(message: str, job: str, extra: dict | None = None) -> None:
    dsn = os.environ.get("BACKUP_SENTRY_DSN") or os.environ.get("SENTRY_DSN") or ""
    if not dsn.strip():
        return
    store, public_key, _scheme = parse_dsn(dsn)
    event = {
        "event_id": uuid.uuid4().hex,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "platform": "other",
        "logger": "orcadom.backup",
        "level": "error",
        "server_name": os.environ.get("HOSTNAME", "postgres-backup"),
        "environment": os.environ.get("SENTRY_ENVIRONMENT", "development"),
        "message": message,
        "tags": {"job": job, "component": "postgres-backup"},
        "extra": extra or {},
    }
    payload = json.dumps(event).encode("utf-8")
    auth = (
        f"Sentry sentry_version=7, sentry_client=orcadom-backup/1.0, "
        f"sentry_key={public_key}"
    )
    request = urllib.request.Request(
        store,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Sentry-Auth": auth,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            response.read()
    except urllib.error.URLError as exc:
        print(
            json.dumps(
                {
                    "level": "error",
                    "msg": "failed to send backup failure to Sentry",
                    "error": str(exc),
                    "job": job,
                }
            ),
            flush=True,
        )


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("job")
    parser.add_argument("message")
    args = parser.parse_args()
    capture(args.message, args.job)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
