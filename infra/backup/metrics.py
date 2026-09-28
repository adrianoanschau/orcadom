"""File-backed Prometheus metrics for the backup job."""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import tempfile
from pathlib import Path
from typing import Any

STATE_DIR = Path(os.environ.get("BACKUP_METRICS_DIR", "/var/lib/backup-metrics"))
STATE_PATH = STATE_DIR / "state.json"
PROM_PATH = STATE_DIR / "metrics.prom"

DEFAULT_STATE: dict[str, Any] = {
    "up": 1,
    "runs": {},
    "last_success": {},
    "last_duration": {},
    "last_size": {},
    "retained": {},
}


def _empty_runs() -> dict[str, int]:
    return {"success": 0, "failure": 0}


def load_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return json.loads(json.dumps(DEFAULT_STATE))
    with STATE_PATH.open(encoding="utf-8") as handle:
        data = json.load(handle)
    merged = json.loads(json.dumps(DEFAULT_STATE))
    merged.update(data)
    return merged


def render(state: dict[str, Any]) -> str:
    lines = [
        "# HELP orcadom_backup_up 1 while the backup exporter is running",
        "# TYPE orcadom_backup_up gauge",
        f"orcadom_backup_up {int(state.get('up', 1))}",
        "# HELP orcadom_backup_runs_total Backup or restore-test runs by result",
        "# TYPE orcadom_backup_runs_total counter",
    ]
    runs = state.get("runs") or {}
    for job, results in sorted(runs.items()):
        for result in ("success", "failure"):
            value = int((results or {}).get(result, 0))
            lines.append(f'orcadom_backup_runs_total{{job="{job}",result="{result}"}} {value}')
    lines += [
        "# HELP orcadom_backup_last_success_timestamp Unix time of the last successful run",
        "# TYPE orcadom_backup_last_success_timestamp gauge",
    ]
    for job, value in sorted((state.get("last_success") or {}).items()):
        lines.append(f'orcadom_backup_last_success_timestamp{{job="{job}"}} {float(value)}')
    lines += [
        "# HELP orcadom_backup_last_duration_seconds Duration of the last run",
        "# TYPE orcadom_backup_last_duration_seconds gauge",
    ]
    for job, value in sorted((state.get("last_duration") or {}).items()):
        lines.append(f'orcadom_backup_last_duration_seconds{{job="{job}"}} {float(value)}')
    lines += [
        "# HELP orcadom_backup_last_size_bytes Size of the last encrypted dump",
        "# TYPE orcadom_backup_last_size_bytes gauge",
    ]
    for job, value in sorted((state.get("last_size") or {}).items()):
        lines.append(f'orcadom_backup_last_size_bytes{{job="{job}"}} {int(value)}')
    lines += [
        "# HELP orcadom_backup_objects_retained Encrypted dumps retained per GFS slot",
        "# TYPE orcadom_backup_objects_retained gauge",
    ]
    for slot, value in sorted((state.get("retained") or {}).items()):
        lines.append(f'orcadom_backup_objects_retained{{slot="{slot}"}} {int(value)}')
    return "\n".join(lines) + "\n"


def _write_state(state: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(state, indent=2, sort_keys=True)
    fd, tmp_name = tempfile.mkstemp(dir=STATE_DIR, prefix="state.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(encoded)
            handle.write("\n")
        os.replace(tmp_name, STATE_PATH)
    except Exception:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
        raise
    prom = render(state)
    fd, tmp_prom = tempfile.mkstemp(dir=STATE_DIR, prefix="metrics.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(prom)
        os.replace(tmp_prom, PROM_PATH)
    except Exception:
        if os.path.exists(tmp_prom):
            os.unlink(tmp_prom)
        raise


def _locked_update(mutator) -> dict[str, Any]:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    lock_path = STATE_DIR / "state.lock"
    with lock_path.open("a+", encoding="utf-8") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        state = load_state()
        mutator(state)
        _write_state(state)
        return state


def inc_run(job: str, result: str) -> None:
    if result not in {"success", "failure"}:
        raise ValueError(f"invalid result {result}")

    def mutate(state: dict[str, Any]) -> None:
        runs = state.setdefault("runs", {})
        job_runs = runs.setdefault(job, _empty_runs())
        job_runs[result] = int(job_runs.get(result, 0)) + 1

    _locked_update(mutate)


def set_gauge(group: str, job: str, value: float) -> None:
    def mutate(state: dict[str, Any]) -> None:
        bucket = state.setdefault(group, {})
        bucket[job] = value

    _locked_update(mutate)


def init_exporter() -> None:
    def mutate(state: dict[str, Any]) -> None:
        state["up"] = 1

    _locked_update(mutate)


def prometheus_text() -> str:
    if PROM_PATH.exists():
        return PROM_PATH.read_text(encoding="utf-8")
    return render(load_state())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init")
    sub.add_parser("render")

    inc = sub.add_parser("inc")
    inc.add_argument("job")
    inc.add_argument("result")

    gauge = sub.add_parser("set")
    gauge.add_argument("group")
    gauge.add_argument("job")
    gauge.add_argument("value", type=float)

    args = parser.parse_args(argv)
    if args.command == "init":
        init_exporter()
    elif args.command == "render":
        print(prometheus_text(), end="")
    elif args.command == "inc":
        inc_run(args.job, args.result)
    elif args.command == "set":
        set_gauge(args.group, args.job, args.value)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
