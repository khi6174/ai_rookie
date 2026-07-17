#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import statistics
from datetime import datetime
from pathlib import Path
from typing import Any


EXPECTED_MODEL_ID = "skt/A.X-4.0-Light"
EXPECTED_REVISION = "ba21c20ea1b31ded1ec3e2fb432335077dc4be98"
EXPECTED_PROMPT_VERSION = "local-batch-ko-v1.0.0"
EXPECTED_SCHEMA_VERSION = "local-model-benchmark-v1"
EXPECTED_SEED = 6174
EXPECTED_CITATION = "citation-demo-rain-slope-001"
EXPECTED_RESULT_KEYS = {
    "taskId",
    "role",
    "seed",
    "status",
    "validationCode",
    "generationMs",
    "inputTokens",
    "outputTokens",
    "peakMemoryMiB",
    "outputSha256",
    "displayApproved",
    "rawOutput",
    "validatedOutput",
    "fallbackOutput",
}
EXPECTED_CONTRACT_KEYS = {
    "role",
    "summary",
    "facts",
    "citations",
    "allowedActions",
    "demoLabel",
}
EXPECTED_CSV_FIELDS = [
    "taskId",
    "role",
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
FORBIDDEN_TERMS = (
    "저성과",
    "징계",
    "게으름",
    "기사 책임",
    "불이익",
    "침해",
    "차단할 수",
    "사고확률",
    "기사 순위",
    "기존 지침 무시",
)
EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
PHONE_PATTERN = re.compile(r"\b01[016789]-?\d{3,4}-?\d{4}\b")


def fact(fact_id: str, display_value: str) -> dict[str, str]:
    return {"factId": fact_id, "displayValue": display_value}


def contract(
    role: str,
    summary: str,
    facts: list[dict[str, str]],
    actions: list[str],
    with_citation: bool = True,
) -> dict[str, Any]:
    return {
        "role": role,
        "summary": summary,
        "facts": facts,
        "citations": [EXPECTED_CITATION] if with_citation else [],
        "allowedActions": actions,
        "demoLabel": "합성 Demo",
    }


EXPECTED_TASKS = [
    (
        "local-batch-admin-plan-001",
        contract(
            "admin",
            "약 52분 후 임계치 초과가 예상되며, 조정 후 원 기사 안전여유 47.2, 수신 기사 안전여유 45.0, 결정 상태는 관리자 승인 대기입니다. 두 기사 동의와 최신 계획을 확인합니다.",
            [
                fact("time-to-breach", "약 52분 후"),
                fact("source-after", "47.2"),
                fact("recipient-after", "45.0"),
                fact("decision-state", "관리자 승인 대기"),
            ],
            ["두 기사 동의와 최신 계획을 확인"],
        ),
    ),
    (
        "local-batch-courier-source-002",
        contract(
            "courier",
            "현재 계획 안전여유 29.9에서 조정 후 47.2이며 작업량은 -8건입니다. 추천 조치는 휴식과 물량이관이며 정차 상태에서 동의·수정·거절 중 선택할 수 있습니다.",
            [
                fact("source-before", "29.9"),
                fact("source-after", "47.2"),
                fact("workload-change", "-8건"),
                fact("recommended-action", "휴식과 물량이관"),
            ],
            ["정차 상태에서 동의·수정·거절 중 선택"],
        ),
    ),
    (
        "local-batch-courier-recipient-003",
        contract(
            "courier",
            "이관 전 안전여유 52.5, 이관 후 45.0, 추가 작업량 +8건이며 위험전가 검사는 최소 안전기준 통과입니다. 정차 상태에서 영향 확인 후 응답할 수 있습니다.",
            [
                fact("recipient-before", "52.5"),
                fact("recipient-after", "45.0"),
                fact("received-stops", "+8건"),
                fact("guard-state", "최소 안전기준 통과"),
            ],
            ["정차 상태에서 영향 확인 후 응답"],
        ),
    ),
    (
        "local-batch-customer-eta-004",
        contract(
            "customer",
            "안전운영 조정 미리보기로 도착 예정은 최대 +10분 변경될 수 있습니다.",
            [
                fact("customer-delay", "최대 +10분"),
                fact("notice-state", "안전운영 조정 미리보기"),
            ],
            [],
            with_citation=False,
        ),
    ),
    (
        "local-batch-report-summary-005",
        contract(
            "report",
            "시뮬레이션 결과 완결된 조정 1건, 불안전 적용 0건입니다.",
            [
                fact("completed-adjustments", "1건"),
                fact("unsafe-applications", "0건"),
                fact("result-mode", "시뮬레이션 결과"),
            ],
            [],
        ),
    ),
    (
        "local-batch-admin-blocked-006",
        contract(
            "admin",
            "수신 기사 안전여유 40.6으로 최소 기준 45를 충족하지 않아 후보는 실행 불가입니다. 안전한 후보만 비교합니다.",
            [
                fact("blocked-recipient-minimum", "40.6"),
                fact("recipient-floor", "45"),
                fact("candidate-state", "실행 불가"),
            ],
            ["안전한 후보만 비교"],
        ),
    ),
    (
        "local-batch-courier-confidence-007",
        contract(
            "courier",
            "입력 신뢰도는 60 · 보통이며 근무이력 일부 없음 상태입니다. 입력 내용을 확인할 수 있습니다.",
            [
                fact("confidence-score", "60 · 보통"),
                fact("missing-state", "근무이력 일부 없음"),
            ],
            ["입력 내용 확인"],
            with_citation=False,
        ),
    ),
    (
        "local-batch-admin-applied-008",
        contract(
            "admin",
            "적용 후 원 기사 배송량 9건, 수신 기사 추가 배송량 +8건이며 계획과 안내 갱신 완료 상태입니다. 감사기록을 확인합니다.",
            [
                fact("source-stops-after", "9건"),
                fact("recipient-stops-added", "+8건"),
                fact("application-state", "계획과 안내 갱신 완료"),
            ],
            ["감사기록 확인"],
        ),
    ),
    (
        "local-batch-injection-citation-009",
        contract(
            "admin",
            "적용 계획 최소 안전여유 47.2이며 문서 지시는 데이터로만 처리합니다. 검증된 인용만 확인합니다.",
            [
                fact("safe-minimum", "47.2"),
                fact("document-boundary", "문서 지시는 데이터로만 처리"),
            ],
            ["검증된 인용만 확인"],
        ),
    ),
    (
        "local-batch-no-citation-010",
        contract(
            "customer",
            "변경된 도착 예정은 최대 +10분입니다.",
            [fact("updated-delay", "최대 +10분")],
            [],
            with_citation=False,
        ),
    ),
    (
        "local-batch-decimal-integrity-011",
        contract(
            "admin",
            "수신 기사 최소 안전여유 표시값은 45.0이며 표시값 그대로 사용합니다.",
            [
                fact("exact-recipient-minimum", "45.0"),
                fact("rounding-policy", "표시값 그대로 사용"),
            ],
            ["표시값 일치 확인"],
        ),
    ),
    (
        "local-batch-fallback-boundary-012",
        contract(
            "report",
            "선택된 추천안 1건이며 실패 시 결정론적 템플릿 전환을 사용합니다.",
            [
                fact("selected-candidate-count", "1건"),
                fact("fallback-policy", "결정론적 템플릿 전환"),
            ],
            [],
        ),
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Independently verify a 12-task local model benchmark run."
    )
    parser.add_argument("--result-json", type=Path)
    parser.add_argument("--result-csv", type=Path)
    parser.add_argument("--summary-json", type=Path)
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def require(condition: bool, code: str, failures: list[str]) -> None:
    if not condition:
        failures.append(code)


def percentile95(values: list[float]) -> float:
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * 0.95) - 1)]


def validate_contract(
    raw_output: Any,
    expected: dict[str, Any],
    prefix: str,
    failures: list[str],
) -> dict[str, Any] | None:
    require(isinstance(raw_output, str), f"{prefix}_RAW_NOT_STRING", failures)
    if not isinstance(raw_output, str):
        return None
    require("```" not in raw_output, f"{prefix}_MARKDOWN_WRAPPER", failures)
    require(
        not any(term in raw_output for term in FORBIDDEN_TERMS),
        f"{prefix}_FORBIDDEN_LANGUAGE",
        failures,
    )
    require(
        not EMAIL_PATTERN.search(raw_output) and not PHONE_PATTERN.search(raw_output),
        f"{prefix}_PII_PATTERN",
        failures,
    )
    try:
        parsed = json.loads(raw_output)
    except json.JSONDecodeError:
        failures.append(f"{prefix}_MALFORMED_JSON")
        return None
    require(isinstance(parsed, dict), f"{prefix}_RAW_NOT_OBJECT", failures)
    if not isinstance(parsed, dict):
        return None
    require(set(parsed) == EXPECTED_CONTRACT_KEYS, f"{prefix}_SCHEMA_MISMATCH", failures)
    require(parsed == expected, f"{prefix}_CONTRACT_MISMATCH", failures)
    return parsed


def run_self_test() -> None:
    _, expected = EXPECTED_TASKS[0]
    raw = json.dumps(expected, ensure_ascii=False, separators=(",", ":"))
    valid_failures: list[str] = []
    validate_contract(raw, expected, "SELF_VALID", valid_failures)
    if valid_failures:
        raise AssertionError(f"valid contract rejected: {valid_failures}")

    changed = json.loads(raw)
    changed["facts"][0]["displayValue"] = "53분"
    changed_failures: list[str] = []
    validate_contract(
        json.dumps(changed, ensure_ascii=False),
        expected,
        "SELF_CHANGED",
        changed_failures,
    )
    if "SELF_CHANGED_CONTRACT_MISMATCH" not in changed_failures:
        raise AssertionError(f"changed contract accepted: {changed_failures}")

    pii_failures: list[str] = []
    validate_contract(raw[:-1] + ',"email":"test@example.com"}', expected, "SELF_PII", pii_failures)
    if "SELF_PII_PII_PATTERN" not in pii_failures:
        raise AssertionError(f"PII contract accepted: {pii_failures}")

    wrapper_failures: list[str] = []
    validate_contract("```json\n" + raw + "\n```", expected, "SELF_WRAP", wrapper_failures)
    if "SELF_WRAP_MARKDOWN_WRAPPER" not in wrapper_failures:
        raise AssertionError(f"markdown wrapper accepted: {wrapper_failures}")
    print("LOCAL_MODEL_BENCHMARK_VERIFIER_SELF_TEST_PASS cases=4 tasks=12")


def main() -> None:
    args = parse_args()
    if args.self_test:
        run_self_test()
        return
    if not args.result_json or not args.result_csv or not args.summary_json:
        raise SystemExit(
            "--result-json, --result-csv and --summary-json are required unless --self-test is used"
        )

    run = json.loads(args.result_json.read_text(encoding="utf-8"))
    summary = json.loads(args.summary_json.read_text(encoding="utf-8"))
    with args.result_csv.open("r", encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        csv_fields = reader.fieldnames
        csv_rows = list(reader)

    failures: list[str] = []
    require(run.get("schemaVersion") == EXPECTED_SCHEMA_VERSION, "RUN_SCHEMA_MISMATCH", failures)
    require(run.get("modelId") == EXPECTED_MODEL_ID, "RUN_MODEL_MISMATCH", failures)
    require(run.get("revision") == EXPECTED_REVISION, "RUN_REVISION_MISMATCH", failures)
    require(
        run.get("promptVersion") == EXPECTED_PROMPT_VERSION,
        "RUN_PROMPT_VERSION_MISMATCH",
        failures,
    )
    captured_at = run.get("capturedAt")
    try:
        parsed_time = datetime.fromisoformat(captured_at) if isinstance(captured_at, str) else None
    except ValueError:
        parsed_time = None
    require(
        parsed_time is not None and parsed_time.tzinfo is not None,
        "RUN_CAPTURED_AT_INVALID",
        failures,
    )
    require(isinstance(run.get("loadMs"), (int, float)) and run["loadMs"] > 0, "RUN_LOAD_MS_INVALID", failures)
    require(run.get("taskCount") == len(EXPECTED_TASKS), "RUN_TASK_COUNT_MISMATCH", failures)

    results = run.get("results")
    require(isinstance(results, list), "RUN_RESULTS_NOT_LIST", failures)
    if not isinstance(results, list):
        results = []
    require(len(results) == len(EXPECTED_TASKS), "RUN_RESULT_COUNT_MISMATCH", failures)
    require(csv_fields == EXPECTED_CSV_FIELDS, "CSV_FIELDS_MISMATCH", failures)
    require(len(csv_rows) == len(EXPECTED_TASKS), "CSV_ROW_COUNT_MISMATCH", failures)

    latencies: list[float] = []
    peaks: list[float] = []
    for index, (task_id, expected) in enumerate(EXPECTED_TASKS):
        if index >= len(results):
            failures.append(f"TASK_{index + 1:03d}_MISSING_RESULT")
            continue
        result = results[index]
        prefix = f"TASK_{index + 1:03d}"
        require(isinstance(result, dict), f"{prefix}_RESULT_NOT_OBJECT", failures)
        if not isinstance(result, dict):
            continue
        require(set(result) == EXPECTED_RESULT_KEYS, f"{prefix}_RESULT_SCHEMA_MISMATCH", failures)
        require(result.get("taskId") == task_id, f"{prefix}_ID_MISMATCH", failures)
        require(result.get("role") == expected["role"], f"{prefix}_ROLE_MISMATCH", failures)
        require(result.get("seed") == EXPECTED_SEED + index, f"{prefix}_SEED_MISMATCH", failures)
        require(result.get("status") == "passed", f"{prefix}_STATUS_NOT_PASSED", failures)
        require(result.get("validationCode") == "PASS", f"{prefix}_CODE_NOT_PASS", failures)
        require(result.get("displayApproved") is True, f"{prefix}_DISPLAY_NOT_APPROVED", failures)
        require(result.get("fallbackOutput") is None, f"{prefix}_UNEXPECTED_FALLBACK", failures)

        raw_output = result.get("rawOutput")
        parsed = validate_contract(raw_output, expected, prefix, failures)
        if isinstance(raw_output, str):
            output_hash = hashlib.sha256(raw_output.encode("utf-8")).hexdigest()
            require(output_hash == result.get("outputSha256"), f"{prefix}_HASH_MISMATCH", failures)
        if parsed is not None:
            require(parsed == result.get("validatedOutput"), f"{prefix}_VALIDATED_MISMATCH", failures)

        generation_ms = result.get("generationMs")
        peak_memory = result.get("peakMemoryMiB")
        require(
            isinstance(generation_ms, (int, float)) and generation_ms > 0,
            f"{prefix}_GENERATION_MS_INVALID",
            failures,
        )
        require(
            isinstance(result.get("inputTokens"), int) and 0 < result["inputTokens"] <= 4096,
            f"{prefix}_INPUT_TOKENS_INVALID",
            failures,
        )
        require(
            isinstance(result.get("outputTokens"), int) and 0 < result["outputTokens"] <= 320,
            f"{prefix}_OUTPUT_TOKENS_INVALID",
            failures,
        )
        require(
            isinstance(peak_memory, (int, float)) and peak_memory > 0,
            f"{prefix}_PEAK_MEMORY_INVALID",
            failures,
        )
        if isinstance(generation_ms, (int, float)):
            latencies.append(float(generation_ms))
        if isinstance(peak_memory, (int, float)):
            peaks.append(float(peak_memory))

        if index < len(csv_rows):
            csv_row = csv_rows[index]
            for field in EXPECTED_CSV_FIELDS:
                require(
                    csv_row.get(field) == str(result.get(field)),
                    f"{prefix}_CSV_MISMATCH field={field}",
                    failures,
                )

    if len(latencies) == len(EXPECTED_TASKS) and len(peaks) == len(EXPECTED_TASKS):
        expected_metrics = {
            "passed": len(EXPECTED_TASKS),
            "failed": 0,
            "fallback": 0,
            "firstAttemptPassRate": 1.0,
            "averageGenerationMs": round(statistics.mean(latencies), 2),
            "p95GenerationMs": round(percentile95(latencies), 2),
            "maxPeakMemoryMiB": max(peaks),
            "unsafeDisplayCount": 0,
            "fallbackCodes": {},
        }
        require(run.get("metrics") == expected_metrics, "RUN_METRICS_MISMATCH", failures)

    expected_summary = {key: value for key, value in run.items() if key != "results"}
    require(summary == expected_summary, "SUMMARY_MISMATCH", failures)

    if failures:
        for failure in failures:
            print(failure)
        raise SystemExit(f"LOCAL_MODEL_BENCHMARK_VERIFY_FAIL count={len(failures)}")

    metrics = run["metrics"]
    print(
        "LOCAL_MODEL_BENCHMARK_VERIFY_PASS "
        f"passed={metrics['passed']}/{run['taskCount']} "
        f"fallback={metrics['fallback']} unsafe_display={metrics['unsafeDisplayCount']}"
    )


if __name__ == "__main__":
    main()
