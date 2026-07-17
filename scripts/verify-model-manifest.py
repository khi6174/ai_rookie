#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify an offline model directory against a SafeRoute model manifest."
    )
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolve_manifest_path(model_dir: Path, relative_path: str) -> Path:
    candidate = (model_dir / relative_path).resolve()
    root = model_dir.resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError(f"Manifest path escapes model directory: {relative_path}")
    return candidate


def main() -> None:
    args = parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))

    failures = []
    checked_bytes = 0
    for entry in manifest["snapshot"]["files"]:
        path = resolve_manifest_path(args.model_dir, entry["path"])
        if not path.is_file():
            failures.append(f"MISSING {entry['path']}")
            continue

        actual_size = path.stat().st_size
        checked_bytes += actual_size
        if actual_size != entry["sizeBytes"]:
            failures.append(
                f"SIZE_MISMATCH {entry['path']} expected={entry['sizeBytes']} actual={actual_size}"
            )
            continue

        actual_sha256 = sha256_file(path)
        if actual_sha256 != entry["sha256"]:
            failures.append(
                f"SHA256_MISMATCH {entry['path']} expected={entry['sha256']} actual={actual_sha256}"
            )

    if failures:
        for failure in failures:
            print(failure)
        raise SystemExit(f"MODEL_MANIFEST_VERIFY_FAIL count={len(failures)}")

    print(
        "MODEL_MANIFEST_VERIFY_PASS "
        f"files={len(manifest['snapshot']['files'])} bytes={checked_bytes} "
        f"revision={manifest['source']['revision']}"
    )


if __name__ == "__main__":
    main()
