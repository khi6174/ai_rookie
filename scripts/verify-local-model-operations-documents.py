#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import statistics
from pathlib import Path
from typing import Any


MODEL_ID = "skt/A.X-4.0-Light"
MODEL_REVISION = "ba21c20ea1b31ded1ec3e2fb432335077dc4be98"
PROMPT_VERSION = "local-operations-extract-ko-v1.0.0"
RESULT_SCHEMA = "local-model-operations-documents-v1"
CSV_FIELDS = [
    "taskId",
    "documentId",
    "documentKind",
    "split",
    "seed",
    "status",
    "validationCode",
    "generationMs",
    "inputTokens",
    "outputTokens",
    "peakMemoryMiB",
    "outputSha256",
    "displayApproved",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Independently verify an A100 synthetic operations-document result."
    )
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--result-dir", type=Path, required=True)
    return parser.parse_args()


def percentile95(values: list[float]) -> float:
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * 0.95) - 1)]


def require(condition: bool, code: str) -> None:
    if not condition:
        raise SystemExit(code)


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def main() -> None:
    args = parse_args()
    bundle_bytes = args.bundle.read_bytes()
    bundle = json.loads(bundle_bytes)
    result_path = args.result_dir / "local-model-operations-documents.json"
    summary_path = args.result_dir / "local-model-operations-documents-summary.json"
    csv_path = args.result_dir / "local-model-operations-documents.csv"
    run = json.loads(result_path.read_text(encoding="utf-8"))
    summary = json.loads(summary_path.read_text(encoding="utf-8"))

    require(run.get("schemaVersion") == RESULT_SCHEMA, "RESULT_SCHEMA_MISMATCH")
    require(run.get("modelId") == MODEL_ID, "MODEL_ID_MISMATCH")
    require(run.get("revision") == MODEL_REVISION, "REVISION_MISMATCH")
    require(run.get("promptVersion") == PROMPT_VERSION, "PROMPT_VERSION_MISMATCH")
    require(run.get("dataMode") == "SYNTHETIC", "DATA_MODE_MISMATCH")
    require(
        run.get("bundleSha256") == hashlib.sha256(bundle_bytes).hexdigest(),
        "BUNDLE_HASH_MISMATCH",
    )
    split = run.get("evaluatedSplit")
    selected = [
        item
        for item in bundle["tasks"]
        if split == "all" or item["expected"]["split"] == split
    ]
    expected_by_id = {item["taskId"]: item for item in selected}
    results = run.get("results")
    require(isinstance(results, list), "RESULTS_INVALID")
    require(len(results) == len(selected) == run.get("taskCount"), "TASK_COUNT_MISMATCH")
    require(
        {result.get("taskId") for result in results} == set(expected_by_id),
        "TASK_SET_MISMATCH",
    )

    passed = 0
    fallback_codes: dict[str, int] = {}
    by_kind: dict[str, dict[str, int]] = {}
    injection_count = 0
    injection_passed = 0
    for result in results:
        item = expected_by_id[result["taskId"]]
        expected = item["expected"]
        require(result["documentId"] == expected["documentId"], "DOCUMENT_ID_MISMATCH")
        require(result["documentKind"] == expected["documentKind"], "DOCUMENT_KIND_MISMATCH")
        require(result["split"] == expected["split"], "SPLIT_MISMATCH")
        require(result["seed"] == item["seed"], "SEED_MISMATCH")
        require(result["sourceSha256"] == item["sourceSha256"], "SOURCE_HASH_MISMATCH")
        raw = result.get("rawOutput")
        require(isinstance(raw, str), "RAW_OUTPUT_INVALID")
        require(
            result["outputSha256"] == hashlib.sha256(raw.encode("utf-8")).hexdigest(),
            "OUTPUT_HASH_MISMATCH",
        )
        is_pass = (
            result.get("status") == "passed"
            and result.get("validationCode") == "PASS"
            and result.get("displayApproved") is True
            and result.get("validatedOutput") == expected
            and result.get("fallbackOutput") is None
            and canonical(json.loads(raw)) == canonical(expected)
        )
        if result.get("status") == "passed":
            require(is_pass, "FALSE_PASS_DETECTED")
            passed += 1
        else:
            require(
                result.get("status") == "safe-fallback"
                and result.get("displayApproved") is False
                and result.get("validatedOutput") is None
                and isinstance(result.get("fallbackOutput"), dict),
                "UNSAFE_FALLBACK_DETECTED",
            )
            code = str(result.get("validationCode"))
            require(code != "PASS", "FALLBACK_PASS_CODE")
            fallback_codes[code] = fallback_codes.get(code, 0) + 1
        kind = result["documentKind"]
        by_kind.setdefault(kind, {"passed": 0, "fallback": 0})
        by_kind[kind]["passed" if is_pass else "fallback"] += 1
        if expected["containsUntrustedInstruction"]:
            injection_count += 1
            if is_pass:
                injection_passed += 1

    latencies = [float(result["generationMs"]) for result in results]
    peaks = [float(result["peakMemoryMiB"]) for result in results]
    expected_metrics = {
        "passed": passed,
        "failed": len(results) - passed,
        "fallback": len(results) - passed,
        "firstAttemptPassRate": round(passed / len(results), 4),
        "averageGenerationMs": round(statistics.mean(latencies), 2),
        "p95GenerationMs": round(percentile95(latencies), 2),
        "maxPeakMemoryMiB": max(peaks),
        "unsafeDisplayCount": 0,
        "injectionCases": injection_count,
        "injectionPassed": injection_passed,
        "byDocumentKind": by_kind,
        "fallbackCodes": fallback_codes,
    }
    require(run.get("metrics") == expected_metrics, "METRICS_MISMATCH")
    require(
        summary == {key: value for key, value in run.items() if key != "results"},
        "SUMMARY_MISMATCH",
    )
    with csv_path.open("r", encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        require(reader.fieldnames == CSV_FIELDS, "CSV_HEADER_MISMATCH")
        rows = list(reader)
    require(len(rows) == len(results), "CSV_ROW_COUNT_MISMATCH")
    for row, result in zip(rows, results):
        for field in CSV_FIELDS:
            expected_cell = str(result[field])
            require(row[field] == expected_cell, f"CSV_VALUE_MISMATCH field={field}")

    print(
        "LOCAL_MODEL_OPERATIONS_RESULT_VERIFY_PASS "
        f"split={split} tasks={len(results)} passed={passed} "
        f"fallback={len(results) - passed} unsafe_display=0"
    )


if __name__ == "__main__":
    main()
