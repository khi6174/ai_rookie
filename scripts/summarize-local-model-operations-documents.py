#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


RUNS = [
    ("development-v1.0.0", "operations-documents-dev-v1.0.0-run1", "development", "local-operations-extract-ko-v1.0.0"),
    ("development-v1.1.0", "operations-documents-dev-v1.1.0-run1", "development", "local-operations-extract-ko-v1.1.0"),
    ("development-v1.2.0", "operations-documents-dev-v1.2.0-run1", "development", "local-operations-extract-ko-v1.2.0"),
    ("development-v1.3.0", "operations-documents-dev-v1.3.0-run1", "development", "local-operations-extract-ko-v1.3.0"),
    ("validation-v1.4.0", "operations-documents-validation-v1.4.0-run1", "validation", "local-operations-extract-ko-v1.4.0"),
    ("frozen-v1.4.0", "operations-documents-frozen-v1.4.0-run1", "frozen-test", "local-operations-extract-ko-v1.4.0"),
]
KINDS = [
    "DELIVERY_WORK_SHEET",
    "SHIFT_ROSTER",
    "ROUTE_STOP_MANIFEST",
    "SAFETY_INCIDENT_PREVENTION_REPORT",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a deterministic mentoring comparison from all A100 operations-document runs."
    )
    parser.add_argument("--runs-root", type=Path, required=True)
    parser.add_argument("--output-json", type=Path, required=True)
    parser.add_argument("--output-csv", type=Path, required=True)
    return parser.parse_args()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    args = parse_args()
    rows: list[dict[str, Any]] = []
    final_results: list[dict[str, Any]] = []
    for run_id, directory_name, split, prompt_version in RUNS:
        directory = args.runs_root / directory_name
        summary_path = directory / "local-model-operations-documents-summary.json"
        result_path = directory / "local-model-operations-documents.json"
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        result = json.loads(result_path.read_text(encoding="utf-8"))
        if summary["evaluatedSplit"] != split:
            raise SystemExit(f"SPLIT_MISMATCH run={run_id}")
        if summary["promptVersion"] != prompt_version:
            raise SystemExit(f"PROMPT_VERSION_MISMATCH run={run_id}")
        if summary["taskCount"] != len(result["results"]):
            raise SystemExit(f"TASK_COUNT_MISMATCH run={run_id}")
        metrics = summary["metrics"]
        row = {
            "runId": run_id,
            "split": split,
            "promptVersion": prompt_version,
            "passed": metrics["passed"],
            "taskCount": summary["taskCount"],
            "passRate": metrics["firstAttemptPassRate"],
            "fallback": metrics["fallback"],
            "unsafeDisplayCount": metrics["unsafeDisplayCount"],
            "injectionPassed": metrics["injectionPassed"],
            "injectionCases": metrics["injectionCases"],
            "averageGenerationMs": metrics["averageGenerationMs"],
            "p95GenerationMs": metrics["p95GenerationMs"],
            "maxPeakMemoryMiB": metrics["maxPeakMemoryMiB"],
            "fallbackCodes": metrics["fallbackCodes"],
            "resultSha256": sha256(result_path),
            "summarySha256": sha256(summary_path),
            "byDocumentKind": {
                kind: metrics["byDocumentKind"][kind] for kind in KINDS
            },
        }
        rows.append(row)
        if split == "frozen-test":
            final_results = result["results"]

    if [row["passed"] for row in rows[:4]] != [0, 28, 33, 35]:
        raise SystemExit("DEVELOPMENT_PROGRESSION_MISMATCH")
    if rows[4]["passed"] != 15 or rows[5]["passed"] != 17:
        raise SystemExit("FINAL_SPLIT_RESULT_MISMATCH")
    if any(row["unsafeDisplayCount"] != 0 for row in rows):
        raise SystemExit("UNSAFE_DISPLAY_DETECTED")

    frozen_failures = [
        {
            "taskId": result["taskId"],
            "documentKind": result["documentKind"],
            "validationCode": result["validationCode"],
            "displayApproved": result["displayApproved"],
        }
        for result in final_results
        if result["status"] != "passed"
    ]
    report = {
        "schemaVersion": "a100-operations-documents-mentoring-comparison-v1",
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "modelId": "skt/A.X-4.0-Light",
        "revision": "ba21c20ea1b31ded1ec3e2fb432335077dc4be98",
        "dataMode": "SYNTHETIC",
        "dataset": {
            "documentCount": 100,
            "development": 60,
            "validation": 20,
            "frozenTest": 20,
            "documentKinds": 4,
        },
        "runCount": len(rows),
        "runs": rows,
        "finalDecision": {
            "validationClassification": "PARTIAL_RESEARCH_BASELINE",
            "frozenClassification": "PARTIAL_RESEARCH_BASELINE",
            "frozenPassRate": 0.85,
            "frozenInjectionPassRate": 0.0,
            "unsafeDisplayCountAcrossRuns": 0,
            "productIntegrationAllowed": False,
            "modelTrainingOrFineTuningPerformed": False,
        },
        "frozenFailures": frozen_failures,
        "claimsNotSupported": [
            "실제 운영문서 성능",
            "모델 학습·파인튜닝 완료",
            "현장 안전효과 또는 사고감소",
            "제품 런타임 통합 적격성",
        ],
    }
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    fields = [
        "runId",
        "split",
        "promptVersion",
        "passed",
        "taskCount",
        "passRate",
        "fallback",
        "unsafeDisplayCount",
        "injectionPassed",
        "injectionCases",
        "averageGenerationMs",
        "p95GenerationMs",
        "maxPeakMemoryMiB",
        "deliveryWorkSheet",
        "shiftRoster",
        "routeStopManifest",
        "safetyReport",
        "fallbackCodes",
        "resultSha256",
    ]
    with args.output_csv.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            by_kind = row["byDocumentKind"]
            writer.writerow(
                {
                    "runId": row["runId"],
                    "split": row["split"],
                    "promptVersion": row["promptVersion"],
                    "passed": row["passed"],
                    "taskCount": row["taskCount"],
                    "passRate": row["passRate"],
                    "fallback": row["fallback"],
                    "unsafeDisplayCount": row["unsafeDisplayCount"],
                    "injectionPassed": row["injectionPassed"],
                    "injectionCases": row["injectionCases"],
                    "averageGenerationMs": row["averageGenerationMs"],
                    "p95GenerationMs": row["p95GenerationMs"],
                    "maxPeakMemoryMiB": row["maxPeakMemoryMiB"],
                    "deliveryWorkSheet": f"{by_kind['DELIVERY_WORK_SHEET']['passed']}/{by_kind['DELIVERY_WORK_SHEET']['passed'] + by_kind['DELIVERY_WORK_SHEET']['fallback']}",
                    "shiftRoster": f"{by_kind['SHIFT_ROSTER']['passed']}/{by_kind['SHIFT_ROSTER']['passed'] + by_kind['SHIFT_ROSTER']['fallback']}",
                    "routeStopManifest": f"{by_kind['ROUTE_STOP_MANIFEST']['passed']}/{by_kind['ROUTE_STOP_MANIFEST']['passed'] + by_kind['ROUTE_STOP_MANIFEST']['fallback']}",
                    "safetyReport": f"{by_kind['SAFETY_INCIDENT_PREVENTION_REPORT']['passed']}/{by_kind['SAFETY_INCIDENT_PREVENTION_REPORT']['passed'] + by_kind['SAFETY_INCIDENT_PREVENTION_REPORT']['fallback']}",
                    "fallbackCodes": json.dumps(row["fallbackCodes"], ensure_ascii=False, sort_keys=True),
                    "resultSha256": row["resultSha256"],
                }
            )
    print(
        "LOCAL_MODEL_OPERATIONS_MENTORING_SUMMARY_PASS "
        "runs=6 validation=15/20 frozen=17/20 unsafe_display=0 "
        "classification=PARTIAL_RESEARCH_BASELINE"
    )
    print(f"comparison_json={args.output_json}")
    print(f"comparison_csv={args.output_csv}")


if __name__ == "__main__":
    main()
