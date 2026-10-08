"""Fail when handwritten source files exceed the repository line limit."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

MAX_LINES = 500
SOURCE_SUFFIXES = {
    ".cjs",
    ".css",
    ".cts",
    ".js",
    ".jsx",
    ".mjs",
    ".mts",
    ".py",
    ".pyi",
    ".scss",
    ".ts",
    ".tsx",
}
GENERATED_FILES = {Path("web/src/lib/api-types.ts")}
ROOT = Path(__file__).resolve().parent.parent


def violations(root: Path, paths: list[Path]) -> list[tuple[Path, int]]:
    """Return source files whose physical line count exceeds MAX_LINES."""
    excessive = []
    for relative in sorted(set(paths)):
        if relative.suffix not in SOURCE_SUFFIXES or relative in GENERATED_FILES:
            continue
        source = root / relative
        if not source.is_file():
            continue
        with source.open(encoding="utf-8") as stream:
            count = sum(1 for _ in stream)
        if count > MAX_LINES:
            excessive.append((relative, count))
    return excessive


def repository_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [Path(os.fsdecode(value)) for value in result.stdout.split(b"\0") if value]


def main() -> int:
    excessive = violations(ROOT, repository_files())
    if excessive:
        for path, count in excessive:
            print(f"{path}: {count} lines (maximum {MAX_LINES})")
        return 1
    print(f"Source files meet the {MAX_LINES}-line limit.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
