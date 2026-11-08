"""Run mypy once per Python service (each has its own top-level main.py, so one run can't cover all)."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVICES = [ROOT / "apps" / "ai-orchestrator", *sorted(p for p in (ROOT / "agents").iterdir() if p.is_dir())]

failed = []
for service in SERVICES:
    print(f"== {service.relative_to(ROOT)}", flush=True)
    result = subprocess.run([sys.executable, "-m", "mypy", str(service)], cwd=ROOT, check=False)  # noqa: S603
    if result.returncode:
        failed.append(service.name)

if failed:
    print(f"\nmypy failed for: {', '.join(failed)}")
    sys.exit(1)
