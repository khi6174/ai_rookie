#!/usr/bin/env python3

from __future__ import annotations

import argparse
import importlib.util
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Diagnose a development result without changing its original verdict."
    )
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--result-json", type=Path, required=True)
    parser.add_argument("--output-json", type=Path, required=True)
    return parser.parse_args()


def load_runner() -> Any:
    path = Path(__file__).with_name("local-model-operations-documents.py")
    spec = importlib.util.spec_from_file_location("operations_v1_0", path)
    if spec is None or spec.loader is None:
        raise SystemExit("RUNNER_IMPORT_FAILED")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def unwrap_single_markdown_fence(raw: str) -> str | None:
    match = re.fullmatch(r"```(?:json)?\s*\n([\s\S]*?)\n```\s*", raw)
    return match.group(1).strip() if match else None


def main() -> None:
    args = parse_args()
    runner = load_runner()
    bundle = runner.read_bundle(args.bundle)
    run = json.loads(args.result_json.read_text(encoding="utf-8"))
    tasks = {item["taskId"]: item for item in bundle["tasks"]}
    original_codes: Counter[str] = Counter()
    original_by_kind: dict[str, Counter[str]] = {}
    fenced_inner_codes: Counter[str] = Counter()
    fenced_inner_by_kind: dict[str, Counter[str]] = {}
    top_level_missing: Counter[str] = Counter()
    top_level_extra: Counter[str] = Counter()
    fact_id_exact_count = 0
    fact_id_mismatch_count = 0
    complete_single_fence_count = 0

    for result in run["results"]:
        task = tasks[result["taskId"]]
        code = str(result["validationCode"])
        kind = str(result["documentKind"])
        original_codes[code] += 1
        original_by_kind.setdefault(kind, Counter())[code] += 1
        raw = str(result["rawOutput"])
        candidate = raw
        if code == "MARKDOWN_WRAPPER":
            inner = unwrap_single_markdown_fence(raw)
            if inner is None:
                fenced_inner_codes["INCOMPLETE_OR_MULTIPLE_FENCE"] += 1
                fenced_inner_by_kind.setdefault(kind, Counter())[
                    "INCOMPLETE_OR_MULTIPLE_FENCE"
                ] += 1
                continue
            complete_single_fence_count += 1
            candidate = inner
            accepted, inner_code, parsed = runner.validate_output(inner, task)
            if accepted:
                inner_code = "LATENT_PASS_NOT_PROMOTED"
            fenced_inner_codes[inner_code] += 1
            fenced_inner_by_kind.setdefault(kind, Counter())[inner_code] += 1
        else:
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                parsed = None
        if isinstance(parsed, dict):
            expected_keys = set(task["expected"])
            for key in expected_keys - set(parsed):
                top_level_missing[key] += 1
            for key in set(parsed) - expected_keys:
                top_level_extra[key] += 1
            facts = parsed.get("facts")
            if isinstance(facts, list) and all(isinstance(fact, dict) for fact in facts):
                actual_ids = [fact.get("fieldId") for fact in facts]
                expected_ids = [
                    fact["fieldId"] for fact in task["expected"]["facts"]
                ]
                if actual_ids == expected_ids:
                    fact_id_exact_count += 1
                else:
                    fact_id_mismatch_count += 1

    report = {
        "schemaVersion": "local-model-operations-documents-diagnostic-v1",
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "sourceResultSchemaVersion": run["schemaVersion"],
        "sourceCapturedAt": run["capturedAt"],
        "evaluatedSplit": run["evaluatedSplit"],
        "sourceTaskCount": run["taskCount"],
        "originalVerdictPreserved": True,
        "originalPassed": run["metrics"]["passed"],
        "originalFallback": run["metrics"]["fallback"],
        "originalUnsafeDisplayCount": run["metrics"]["unsafeDisplayCount"],
        "originalCodes": dict(sorted(original_codes.items())),
        "originalCodesByDocumentKind": {
            kind: dict(sorted(counts.items()))
            for kind, counts in sorted(original_by_kind.items())
        },
        "completeSingleFenceCount": complete_single_fence_count,
        "fencedInnerDiagnosticOnly": {
            "codes": dict(sorted(fenced_inner_codes.items())),
            "codesByDocumentKind": {
                kind: dict(sorted(counts.items()))
                for kind, counts in sorted(fenced_inner_by_kind.items())
            },
            "latentPassesAreNotPromoted": True,
        },
        "contractShape": {
            "factIdExactCount": fact_id_exact_count,
            "factIdMismatchCount": fact_id_mismatch_count,
            "topLevelMissing": dict(sorted(top_level_missing.items())),
            "topLevelExtra": dict(sorted(top_level_extra.items())),
        },
        "decision": "DEVELOPMENT_PROMPT_REVISION_REQUIRED",
        "nextPromptVersion": "local-operations-extract-ko-v1.1.0",
        "validationAndFrozenRemainLocked": True,
        "limitations": [
            "코드펜스 내부 진단은 원본 PASS로 승격하지 않는다.",
            "개발 split에서만 프롬프트를 수정하며 expected label과 원본문서는 바꾸지 않는다.",
            "합성 문서 추출 기준선이며 실제 운영문서 성능이나 모델 학습 완료 증거가 아니다.",
        ],
    }
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        "LOCAL_MODEL_OPERATIONS_DIAGNOSTIC_PASS "
        f"original=0/{run['taskCount']} fenced={complete_single_fence_count} "
        f"latent_pass={fenced_inner_codes.get('LATENT_PASS_NOT_PROMOTED', 0)} "
        "verdict_preserved=true"
    )
    print(f"diagnostic_json={args.output_json}")


if __name__ == "__main__":
    main()
