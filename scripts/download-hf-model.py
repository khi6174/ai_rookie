#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from huggingface_hub import HfApi, snapshot_download


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download a fixed public Hugging Face model revision and write a checksum manifest."
    )
    parser.add_argument("--repo-id", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--local-dir", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--license", required=True, dest="license_name")
    parser.add_argument("--max-workers", type=int, default=4)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    args = parse_args()
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

    info = HfApi().model_info(args.repo_id, revision=args.revision, files_metadata=True)
    if info.sha != args.revision:
        raise RuntimeError(
            f"Resolved revision mismatch: expected {args.revision}, received {info.sha}"
        )
    if info.private or info.gated:
        raise RuntimeError("This downloader is limited to public, non-gated benchmark models.")

    args.local_dir.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=args.repo_id,
        revision=args.revision,
        local_dir=args.local_dir,
        max_workers=args.max_workers,
    )

    files = []
    total_bytes = 0
    for path in sorted(args.local_dir.rglob("*")):
        if not path.is_file() or ".cache" in path.relative_to(args.local_dir).parts:
            continue
        size_bytes = path.stat().st_size
        total_bytes += size_bytes
        files.append(
            {
                "path": path.relative_to(args.local_dir).as_posix(),
                "sizeBytes": size_bytes,
                "sha256": sha256_file(path),
            }
        )

    manifest = {
        "schemaVersion": "local-model-manifest-v1",
        "status": "downloaded-and-checksummed",
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "provider": "Hugging Face",
            "repoId": args.repo_id,
            "revision": args.revision,
            "license": args.license_name,
            "private": False,
            "gated": False,
        },
        "benchmarkPolicy": {
            "purpose": "A100 structured JSON generation baseline",
            "dtype": "bfloat16",
            "quantization": "none",
            "batchSize": 1,
            "maxInputTokens": 4096,
            "maxNewTokens": 512,
            "mayChangeDeterministicSafetyDecision": False,
        },
        "snapshot": {
            "fileCount": len(files),
            "totalBytes": total_bytes,
            "files": files,
        },
        "privacy": {
            "credentialsStored": False,
            "connectionIdentifiersStored": False,
            "localAbsolutePathStored": False,
        },
    }

    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"MODEL_DOWNLOAD_PASS repo={args.repo_id} revision={args.revision}")
    print(f"files={len(files)} total_bytes={total_bytes}")
    print(f"manifest={args.manifest}")


if __name__ == "__main__":
    main()
