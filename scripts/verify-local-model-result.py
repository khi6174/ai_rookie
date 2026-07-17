#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from pathlib import Path
from typing import Any


EXPECTED_MODEL_ID = "skt/A.X-4.0-Light"
EXPECTED_REVISION = "ba21c20ea1b31ded1ec3e2fb432335077dc4be98"
EXPECTED_PROMPT_VERSION = "local-structured-ko-v1.2.0"
EXPECTED_TASK_ID = "local-smoke-admin-support-001"
EXPECTED_SEED = 6174
EXPECTED_FACTS = [
    {"factId": "safety-budget-remaining", "displayValue": "31/100"},
    {"factId": "time-to-breach", "displayValue": "52분"},
    {"factId": "breach-stop", "displayValue": "17번째 배송지"},
    {"factId": "confidence", "displayValue": "87%"},
]
EXPECTED_CITATIONS = ["synthetic-safety-manual#support-protocol"]
EXPECTED_KEYS = {
    "role",
    "summary",
    "facts",
    "citations",
    "allowedAction",
    "demoLabel",
}
FORBIDDEN_TERMS = (
    "저성과",
    "징계",
    "게으름",
    "기사 책임",
    "불이익",
    "침해",
    "차단할 수",
)
ALLOWED_NUMBER_TOKENS = {"31", "100", "52", "17", "87"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Independently verify a local model smoke JSON and CSV result pair."
    )
    parser.add_argument("--result-json", required=True, type=Path)
    parser.add_argument("--result-csv", required=True, type=Path)
    return parser.parse_args()


def require(condition: bool, code: str, failures: list[str]) -> None:
    if not condition:
        failures.append(code)


def load_csv_row(path: Path, failures: list[str]) -> dict[str, str]:
    with path.open("r", encoding="utf-8", newline="") as source:
        rows = list(csv.DictReader(source))
    require(len(rows) == 1, f"CSV_ROW_COUNT actual={len(rows)}", failures)
    return rows[0] if rows else {}


def validate_generated_object(parsed: Any, failures: list[str]) -> None:
    require(isinstance(parsed, dict), "RAW_OUTPUT_NOT_OBJECT", failures)
    if not isinstance(parsed, dict):
        return
    require(set(parsed) == EXPECTED_KEYS, "RAW_OUTPUT_SCHEMA_MISMATCH", failures)
    require(parsed.get("role") == "admin", "RAW_OUTPUT_ROLE_MISMATCH", failures)
    require(parsed.get("facts") == EXPECTED_FACTS, "RAW_OUTPUT_FACT_MISMATCH", failures)
    require(
        parsed.get("citations") == EXPECTED_CITATIONS,
        "RAW_OUTPUT_CITATION_MISMATCH",
        failures,
    )
    require(
        parsed.get("allowedAction") == "지원 검토",
        "RAW_OUTPUT_ACTION_MISMATCH",
        failures,
    )
    require(
        parsed.get("demoLabel") == "합성 Demo",
        "RAW_OUTPUT_DEMO_LABEL_MISMATCH",
        failures,
    )
    summary = parsed.get("summary")
    require(isinstance(summary, str) and bool(summary.strip()), "RAW_OUTPUT_EMPTY_SUMMARY", failures)
    if isinstance(summary, str):
        require(
            all(fact["displayValue"] in summary for fact in EXPECTED_FACTS),
            "RAW_OUTPUT_DISPLAY_VALUE_OMISSION",
            failures,
        )


def main() -> None:
    args = parse_args()
    result = json.loads(args.result_json.read_text(encoding="utf-8"))
    csv_row = load_csv_row(args.result_csv, failures := [])

    require(result.get("taskId") == EXPECTED_TASK_ID, "RESULT_TASK_MISMATCH", failures)
    require(result.get("modelId") == EXPECTED_MODEL_ID, "RESULT_MODEL_MISMATCH", failures)
    require(result.get("revision") == EXPECTED_REVISION, "RESULT_REVISION_MISMATCH", failures)
    require(
        result.get("promptVersion") == EXPECTED_PROMPT_VERSION,
        "RESULT_PROMPT_VERSION_MISMATCH",
        failures,
    )
    require(result.get("seed") == EXPECTED_SEED, "RESULT_SEED_MISMATCH", failures)
    require(result.get("status") == "passed", "RESULT_STATUS_NOT_PASSED", failures)
    require(result.get("validationCode") == "PASS", "RESULT_CODE_NOT_PASS", failures)
    require(result.get("displayApproved") is True, "RESULT_DISPLAY_NOT_APPROVED", failures)
    require(result.get("fallbackOutput") is None, "RESULT_UNEXPECTED_FALLBACK", failures)

    raw_output = result.get("rawOutput")
    require(isinstance(raw_output, str), "RESULT_RAW_OUTPUT_NOT_STRING", failures)
    parsed = None
    if isinstance(raw_output, str):
        actual_hash = hashlib.sha256(raw_output.encode("utf-8")).hexdigest()
        require(actual_hash == result.get("outputSha256"), "RESULT_OUTPUT_HASH_MISMATCH", failures)
        require("```" not in raw_output, "RESULT_MARKDOWN_WRAPPER", failures)
        require(
            not any(term in raw_output for term in FORBIDDEN_TERMS),
            "RESULT_FORBIDDEN_LANGUAGE",
            failures,
        )
        number_tokens = set(re.findall(r"\d+(?:[.,]\d+)?", raw_output))
        require(
            number_tokens.issubset(ALLOWED_NUMBER_TOKENS),
            "RESULT_NEW_NUMBER",
            failures,
        )
        try:
            parsed = json.loads(raw_output)
        except json.JSONDecodeError:
            failures.append("RESULT_RAW_OUTPUT_MALFORMED_JSON")

    if parsed is not None:
        validate_generated_object(parsed, failures)
        require(
            parsed == result.get("validatedOutput"),
            "RESULT_VALIDATED_OUTPUT_MISMATCH",
            failures,
        )

    csv_expectations = {
        "taskId": str(result.get("taskId")),
        "modelId": str(result.get("modelId")),
        "revision": str(result.get("revision")),
        "promptVersion": str(result.get("promptVersion")),
        "seed": str(result.get("seed")),
        "status": str(result.get("status")),
        "validationCode": str(result.get("validationCode")),
        "outputSha256": str(result.get("outputSha256")),
        "displayApproved": str(result.get("displayApproved")),
    }
    for key, expected in csv_expectations.items():
        require(csv_row.get(key) == expected, f"CSV_MISMATCH field={key}", failures)

    if failures:
        for failure in failures:
            print(failure)
        raise SystemExit(f"LOCAL_MODEL_RESULT_VERIFY_FAIL count={len(failures)}")

    print(
        "LOCAL_MODEL_RESULT_VERIFY_PASS "
        f"prompt={result['promptVersion']} output_sha256={result['outputSha256']}"
    )


if __name__ == "__main__":
    main()
