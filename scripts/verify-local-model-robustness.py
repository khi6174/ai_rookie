#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import runpy
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any


EXPECTED_CSV_FIELDS = [
    "taskId",
    "baseCaseId",
    "variant",
    "role",
    "seed",
    "status",
    "validationCode",
    "generationMs",
    "inputTokens",
    "outputTokens",
    "peakMemoryMiB",
    "promptInputSha256",
    "outputSha256",
    "displayApproved",
]
FULL_FENCE_PATTERN = re.compile(
    r"^```(?:json)?\s*\n?(.*?)\n?```$", re.DOTALL | re.IGNORECASE
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Independently recompute a local robustness run and optional fence diagnosis."
    )
    parser.add_argument("--source-script", required=True, type=Path)
    parser.add_argument(
        "--prompt-script",
        type=Path,
        help="Optional versioned prompt wrapper; fixed contracts still come from source-script.",
    )
    parser.add_argument("--result-json", required=True, type=Path)
    parser.add_argument("--result-csv", required=True, type=Path)
    parser.add_argument("--summary-json", required=True, type=Path)
    parser.add_argument("--diagnose-fences", action="store_true")
    return parser.parse_args()


def require(condition: bool, code: str, failures: list[str]) -> None:
    if not condition:
        failures.append(code)


def expected_fallback(namespace: dict[str, Any], item: dict[str, Any]) -> dict[str, Any]:
    return {
        **namespace["fixed_contract"](item),
        "summary": "합성 Demo 구조화 설명을 검증하지 못했습니다. 제공된 사실을 직접 확인해 주세요.",
    }


def main() -> None:
    args = parse_args()
    namespace = runpy.run_path(str(args.source_script))
    prompt_namespace = (
        runpy.run_path(str(args.prompt_script)) if args.prompt_script else namespace
    )
    validate_output = prompt_namespace.get("validate_output", namespace["validate_output"])
    tasks = namespace["TASKS"]
    run = json.loads(args.result_json.read_text(encoding="utf-8"))
    summary = json.loads(args.summary_json.read_text(encoding="utf-8"))
    with args.result_csv.open("r", encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        csv_fields = reader.fieldnames
        csv_rows = list(reader)

    failures: list[str] = []
    require(run.get("schemaVersion") == "local-model-robustness-v1", "RUN_SCHEMA_MISMATCH", failures)
    require(run.get("modelId") == namespace["MODEL_ID"], "RUN_MODEL_MISMATCH", failures)
    require(run.get("revision") == namespace["MODEL_REVISION"], "RUN_REVISION_MISMATCH", failures)
    require(
        run.get("promptVersion") == prompt_namespace["PROMPT_VERSION"],
        "RUN_PROMPT_VERSION_MISMATCH",
        failures,
    )
    captured_at = run.get("capturedAt")
    try:
        captured = datetime.fromisoformat(captured_at) if isinstance(captured_at, str) else None
    except ValueError:
        captured = None
    require(captured is not None and captured.tzinfo is not None, "RUN_CAPTURED_AT_INVALID", failures)
    require(isinstance(run.get("loadMs"), (int, float)) and run["loadMs"] > 0, "RUN_LOAD_MS_INVALID", failures)
    require(run.get("taskCount") == len(tasks), "RUN_TASK_COUNT_MISMATCH", failures)
    require(summary == {key: value for key, value in run.items() if key != "results"}, "SUMMARY_MISMATCH", failures)

    results = run.get("results")
    require(isinstance(results, list), "RUN_RESULTS_NOT_LIST", failures)
    if not isinstance(results, list):
        results = []
    require(len(results) == len(tasks), "RUN_RESULTS_COUNT_MISMATCH", failures)
    require(csv_fields == EXPECTED_CSV_FIELDS, "CSV_FIELDS_MISMATCH", failures)
    require(len(csv_rows) == len(tasks), "CSV_ROWS_COUNT_MISMATCH", failures)

    for index, item in enumerate(tasks):
        if index >= len(results):
            failures.append(f"TASK_{index + 1:03d}_MISSING")
            continue
        result = results[index]
        prefix = f"TASK_{index + 1:03d}"
        require(result.get("taskId") == item["taskId"], f"{prefix}_ID_MISMATCH", failures)
        require(result.get("baseCaseId") == item["baseCaseId"], f"{prefix}_BASE_MISMATCH", failures)
        require(result.get("variant") == item["variant"], f"{prefix}_VARIANT_MISMATCH", failures)
        require(result.get("role") == item["role"], f"{prefix}_ROLE_MISMATCH", failures)
        require(result.get("seed") == namespace["SEED"] + index, f"{prefix}_SEED_MISMATCH", failures)

        messages = prompt_namespace["build_messages"](item)
        prompt_hash = hashlib.sha256(
            json.dumps(messages, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        require(result.get("promptInputSha256") == prompt_hash, f"{prefix}_PROMPT_HASH_MISMATCH", failures)
        raw_output = result.get("rawOutput")
        require(isinstance(raw_output, str), f"{prefix}_RAW_NOT_STRING", failures)
        if not isinstance(raw_output, str):
            continue
        output_hash = hashlib.sha256(raw_output.encode("utf-8")).hexdigest()
        require(result.get("outputSha256") == output_hash, f"{prefix}_OUTPUT_HASH_MISMATCH", failures)

        valid, code, parsed = validate_output(raw_output, item)
        expected_status = "passed" if valid else "safe-fallback"
        require(result.get("status") == expected_status, f"{prefix}_STATUS_MISMATCH", failures)
        require(result.get("validationCode") == code, f"{prefix}_CODE_MISMATCH", failures)
        require(result.get("displayApproved") is valid, f"{prefix}_DISPLAY_MISMATCH", failures)
        require(
            result.get("validatedOutput") == (parsed if valid else None),
            f"{prefix}_VALIDATED_OUTPUT_MISMATCH",
            failures,
        )
        require(
            result.get("fallbackOutput") == (None if valid else expected_fallback(namespace, item)),
            f"{prefix}_FALLBACK_OUTPUT_MISMATCH",
            failures,
        )
        require(
            isinstance(result.get("generationMs"), (int, float)) and result["generationMs"] > 0,
            f"{prefix}_GENERATION_MS_INVALID",
            failures,
        )
        require(
            isinstance(result.get("inputTokens"), int)
            and 0 < result["inputTokens"] <= namespace["MAX_INPUT_TOKENS"],
            f"{prefix}_INPUT_TOKENS_INVALID",
            failures,
        )
        require(
            isinstance(result.get("outputTokens"), int)
            and 0 < result["outputTokens"] <= namespace["MAX_NEW_TOKENS"],
            f"{prefix}_OUTPUT_TOKENS_INVALID",
            failures,
        )
        require(
            isinstance(result.get("peakMemoryMiB"), (int, float)) and result["peakMemoryMiB"] > 0,
            f"{prefix}_PEAK_MEMORY_INVALID",
            failures,
        )
        if index < len(csv_rows):
            for field in EXPECTED_CSV_FIELDS:
                require(
                    csv_rows[index].get(field) == str(result.get(field)),
                    f"{prefix}_CSV_MISMATCH field={field}",
                    failures,
                )

    if len(results) == len(tasks):
        latencies = [float(result["generationMs"]) for result in results]
        passed = sum(result["status"] == "passed" for result in results)
        fallback_codes = Counter(
            result["validationCode"]
            for result in results
            if result["validationCode"] != "PASS"
        )
        expected_metrics = {
            "passed": passed,
            "failed": len(results) - passed,
            "fallback": len(results) - passed,
            "firstAttemptPassRate": round(passed / len(results), 4),
            "averageGenerationMs": round(__import__("statistics").mean(latencies), 2),
            "p95GenerationMs": round(namespace["percentile95"](latencies), 2),
            "maxPeakMemoryMiB": max(float(result["peakMemoryMiB"]) for result in results),
            "unsafeDisplayCount": 0,
            "fallbackCodes": dict(fallback_codes),
            "byVariant": namespace["grouped_metrics"](results, "variant"),
            "byRole": namespace["grouped_metrics"](results, "role"),
        }
        require(run.get("metrics") == expected_metrics, "RUN_METRICS_MISMATCH", failures)

    if failures:
        for failure in failures:
            print(failure)
        raise SystemExit(f"LOCAL_MODEL_ROBUSTNESS_VERIFY_FAIL count={len(failures)}")

    metrics = run["metrics"]
    print(
        "LOCAL_MODEL_ROBUSTNESS_VERIFY_PASS "
        f"passed={metrics['passed']}/{run['taskCount']} "
        f"fallback={metrics['fallback']} unsafe_display={metrics['unsafeDisplayCount']}"
    )

    if args.diagnose_fences:
        diagnostic_codes: Counter[str] = Counter()
        full_fences = 0
        for item, result in zip(tasks, results):
            match = FULL_FENCE_PATTERN.fullmatch(result["rawOutput"].strip())
            if not match:
                diagnostic_codes["NOT_SINGLE_FULL_FENCE"] += 1
                continue
            full_fences += 1
            valid, code, _ = validate_output(match.group(1).strip(), item)
            diagnostic_codes["LATENT_PASS" if valid else code] += 1
        print(
            "LOCAL_MODEL_ROBUSTNESS_FENCE_DIAGNOSTIC "
            f"full_fence={full_fences}/{len(results)} "
            f"codes={json.dumps(dict(diagnostic_codes), ensure_ascii=False, sort_keys=True)}"
        )


if __name__ == "__main__":
    main()
