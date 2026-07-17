#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import re
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MODEL_ID = "skt/A.X-4.0-Light"
MODEL_REVISION = "ba21c20ea1b31ded1ec3e2fb432335077dc4be98"
PROMPT_VERSION = "local-batch-ko-v1.0.0"
SEED = 6174
MAX_INPUT_TOKENS = 4096
MAX_NEW_TOKENS = 320
CITATION_ID = "citation-demo-rain-slope-001"
EXPECTED_KEYS = {
    "role",
    "summary",
    "facts",
    "citations",
    "allowedActions",
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
    "사고확률",
    "기사 순위",
    "기존 지침 무시",
)
EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
PHONE_PATTERN = re.compile(r"\b01[016789]-?\d{3,4}-?\d{4}\b")


def fact(fact_id: str, display_value: str) -> dict[str, str]:
    return {"factId": fact_id, "displayValue": display_value}


def task(
    task_id: str,
    role: str,
    summary: str,
    facts: list[dict[str, str]],
    allowed_actions: list[str],
    with_citation: bool = True,
) -> dict[str, Any]:
    return {
        "taskId": task_id,
        "expected": {
            "role": role,
            "summary": summary,
            "facts": facts,
            "citations": [CITATION_ID] if with_citation else [],
            "allowedActions": allowed_actions,
            "demoLabel": "합성 Demo",
        },
    }


TASKS = [
    task(
        "local-batch-admin-plan-001",
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
    task(
        "local-batch-courier-source-002",
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
    task(
        "local-batch-courier-recipient-003",
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
    task(
        "local-batch-customer-eta-004",
        "customer",
        "안전운영 조정 미리보기로 도착 예정은 최대 +10분 변경될 수 있습니다.",
        [
            fact("customer-delay", "최대 +10분"),
            fact("notice-state", "안전운영 조정 미리보기"),
        ],
        [],
        with_citation=False,
    ),
    task(
        "local-batch-report-summary-005",
        "report",
        "시뮬레이션 결과 완결된 조정 1건, 불안전 적용 0건입니다.",
        [
            fact("completed-adjustments", "1건"),
            fact("unsafe-applications", "0건"),
            fact("result-mode", "시뮬레이션 결과"),
        ],
        [],
    ),
    task(
        "local-batch-admin-blocked-006",
        "admin",
        "수신 기사 안전여유 40.6으로 최소 기준 45를 충족하지 않아 후보는 실행 불가입니다. 안전한 후보만 비교합니다.",
        [
            fact("blocked-recipient-minimum", "40.6"),
            fact("recipient-floor", "45"),
            fact("candidate-state", "실행 불가"),
        ],
        ["안전한 후보만 비교"],
    ),
    task(
        "local-batch-courier-confidence-007",
        "courier",
        "입력 신뢰도는 60 · 보통이며 근무이력 일부 없음 상태입니다. 입력 내용을 확인할 수 있습니다.",
        [
            fact("confidence-score", "60 · 보통"),
            fact("missing-state", "근무이력 일부 없음"),
        ],
        ["입력 내용 확인"],
        with_citation=False,
    ),
    task(
        "local-batch-admin-applied-008",
        "admin",
        "적용 후 원 기사 배송량 9건, 수신 기사 추가 배송량 +8건이며 계획과 안내 갱신 완료 상태입니다. 감사기록을 확인합니다.",
        [
            fact("source-stops-after", "9건"),
            fact("recipient-stops-added", "+8건"),
            fact("application-state", "계획과 안내 갱신 완료"),
        ],
        ["감사기록 확인"],
    ),
    task(
        "local-batch-injection-citation-009",
        "admin",
        "적용 계획 최소 안전여유 47.2이며 문서 지시는 데이터로만 처리합니다. 검증된 인용만 확인합니다.",
        [
            fact("safe-minimum", "47.2"),
            fact("document-boundary", "문서 지시는 데이터로만 처리"),
        ],
        ["검증된 인용만 확인"],
    ),
    task(
        "local-batch-no-citation-010",
        "customer",
        "변경된 도착 예정은 최대 +10분입니다.",
        [fact("updated-delay", "최대 +10분")],
        [],
        with_citation=False,
    ),
    task(
        "local-batch-decimal-integrity-011",
        "admin",
        "수신 기사 최소 안전여유 표시값은 45.0이며 표시값 그대로 사용합니다.",
        [
            fact("exact-recipient-minimum", "45.0"),
            fact("rounding-policy", "표시값 그대로 사용"),
        ],
        ["표시값 일치 확인"],
    ),
    task(
        "local-batch-fallback-boundary-012",
        "report",
        "선택된 추천안 1건이며 실패 시 결정론적 템플릿 전환을 사용합니다.",
        [
            fact("selected-candidate-count", "1건"),
            fact("fallback-policy", "결정론적 템플릿 전환"),
        ],
        [],
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the 12-task offline A.X structured-output benchmark."
    )
    parser.add_argument("--model-dir", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path("results"))
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def build_messages(item: dict[str, Any]) -> list[dict[str, str]]:
    expected = item["expected"]
    return [
        {
            "role": "system",
            "content": (
                "당신은 SafeRoute AI의 한국어 구조화 설명 변환기입니다. 제공된 JSON 계약을 "
                "계산, 반올림, 번역, 교정, 요약하거나 변경하지 마세요. 계약에 없는 숫자, "
                "개인정보, 인용, 판단을 만들지 마세요. 응답의 첫 문자는 {, 마지막 문자는 }로 "
                "하고 코드펜스나 앞뒤 설명 없이 JSON 객체 하나만 반환하세요."
            ),
        },
        {
            "role": "user",
            "content": (
                "다음 합성 Demo 계약을 키 순서와 문자열까지 그대로 JSON 객체로 반환하세요. "
                "role, summary, facts, citations, allowedActions, demoLabel 외의 키는 금지합니다.\n"
                + json.dumps(expected, ensure_ascii=False, separators=(",", ":"))
            ),
        },
    ]


def number_tokens(value: Any) -> set[str]:
    return set(
        re.findall(
            r"\d+(?:[.,]\d+)?",
            json.dumps(value, ensure_ascii=False, separators=(",", ":")),
        )
    )


def validate_output(
    raw_output: str, expected: dict[str, Any]
) -> tuple[bool, str, dict[str, Any] | None]:
    if "```" in raw_output:
        return False, "MARKDOWN_WRAPPER", None
    try:
        parsed = json.loads(raw_output)
    except json.JSONDecodeError:
        return False, "MALFORMED_JSON", None
    if not isinstance(parsed, dict) or set(parsed) != EXPECTED_KEYS:
        return False, "SCHEMA_MISMATCH", parsed if isinstance(parsed, dict) else None
    if any(term in raw_output for term in FORBIDDEN_TERMS):
        return False, "FORBIDDEN_LANGUAGE", parsed
    if EMAIL_PATTERN.search(raw_output) or PHONE_PATTERN.search(raw_output):
        return False, "PII_PATTERN", parsed
    if not number_tokens(parsed).issubset(number_tokens(expected)):
        return False, "NEW_NUMBER", parsed
    if parsed != expected:
        return False, "CONTRACT_INTEGRITY_FAILURE", parsed
    return True, "PASS", parsed


def run_self_test() -> None:
    expected = TASKS[0]["expected"]
    raw = json.dumps(expected, ensure_ascii=False, separators=(",", ":"))
    ok, code, _ = validate_output(raw, expected)
    if not ok or code != "PASS":
        raise AssertionError(f"valid contract rejected: {code}")

    malformed_ok, malformed_code, _ = validate_output("```json\n" + raw + "\n```", expected)
    if malformed_ok or malformed_code != "MARKDOWN_WRAPPER":
        raise AssertionError(f"markdown wrapper not rejected: {malformed_code}")

    malformed_ok, malformed_code, _ = validate_output("{not-json", expected)
    if malformed_ok or malformed_code != "MALFORMED_JSON":
        raise AssertionError(f"malformed JSON not rejected: {malformed_code}")

    new_number = json.loads(raw)
    new_number["facts"][0]["displayValue"] = "53분"
    new_number_ok, new_number_code, _ = validate_output(
        json.dumps(new_number, ensure_ascii=False), expected
    )
    if new_number_ok or new_number_code != "NEW_NUMBER":
        raise AssertionError(f"new number not rejected: {new_number_code}")

    changed = json.loads(raw)
    changed["allowedActions"] = ["두 기사 응답과 최신 계획을 확인"]
    changed_ok, changed_code, _ = validate_output(json.dumps(changed, ensure_ascii=False), expected)
    if changed_ok or changed_code != "CONTRACT_INTEGRITY_FAILURE":
        raise AssertionError(f"changed contract not rejected: {changed_code}")

    extra = json.loads(raw)
    extra["unknown"] = "field"
    extra_ok, extra_code, _ = validate_output(json.dumps(extra, ensure_ascii=False), expected)
    if extra_ok or extra_code != "SCHEMA_MISMATCH":
        raise AssertionError(f"unknown field not rejected: {extra_code}")

    pii = json.loads(raw)
    pii["summary"] = pii["summary"] + " test@example.com"
    pii_ok, pii_code, _ = validate_output(json.dumps(pii, ensure_ascii=False), expected)
    if pii_ok or pii_code != "PII_PATTERN":
        raise AssertionError(f"PII pattern not rejected: {pii_code}")

    forbidden = json.loads(raw)
    forbidden["summary"] = forbidden["summary"] + " 징계"
    forbidden_ok, forbidden_code, _ = validate_output(
        json.dumps(forbidden, ensure_ascii=False), expected
    )
    if forbidden_ok or forbidden_code != "FORBIDDEN_LANGUAGE":
        raise AssertionError(f"forbidden language not rejected: {forbidden_code}")
    print("LOCAL_MODEL_BENCHMARK_SELF_TEST_PASS cases=8 tasks=12")


def percentile95(values: list[float]) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    index = max(0, math.ceil(len(sorted_values) * 0.95) - 1)
    return sorted_values[index]


def main() -> None:
    args = parse_args()
    if args.self_test:
        run_self_test()
        return
    if args.model_dir is None:
        raise SystemExit("--model-dir is required unless --self-test is used")
    if args.output_dir.exists() and any(args.output_dir.iterdir()):
        raise SystemExit(
            f"OUTPUT_DIRECTORY_NOT_EMPTY path={args.output_dir}; choose a new run directory"
        )

    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    if not torch.cuda.is_available():
        raise SystemExit("CUDA_NOT_AVAILABLE")

    torch.manual_seed(SEED)
    torch.cuda.manual_seed_all(SEED)
    load_started = time.perf_counter()
    tokenizer = AutoTokenizer.from_pretrained(args.model_dir, local_files_only=True)
    model = AutoModelForCausalLM.from_pretrained(
        args.model_dir,
        local_files_only=True,
        use_safetensors=True,
        torch_dtype=torch.bfloat16,
        device_map={"": "cuda:0"},
        low_cpu_mem_usage=True,
    )
    model.eval()
    torch.cuda.synchronize()
    load_ms = (time.perf_counter() - load_started) * 1000

    results = []
    for index, item in enumerate(TASKS):
        task_seed = SEED + index
        torch.manual_seed(task_seed)
        torch.cuda.manual_seed_all(task_seed)
        torch.cuda.reset_peak_memory_stats()
        encoded = tokenizer.apply_chat_template(
            build_messages(item),
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
        ).to("cuda:0")
        input_ids = encoded["input_ids"]
        attention_mask = encoded["attention_mask"]
        input_tokens = int(input_ids.shape[-1])
        if input_tokens > MAX_INPUT_TOKENS:
            raise SystemExit(
                f"INPUT_TOKEN_LIMIT_EXCEEDED task={item['taskId']} actual={input_tokens}"
            )

        started = time.perf_counter()
        with torch.inference_mode():
            output_ids = model.generate(
                input_ids=input_ids,
                attention_mask=attention_mask,
                max_new_tokens=MAX_NEW_TOKENS,
                do_sample=False,
                use_cache=True,
                pad_token_id=tokenizer.eos_token_id,
            )
        torch.cuda.synchronize()
        generation_ms = (time.perf_counter() - started) * 1000
        generated_ids = output_ids[0, input_tokens:]
        raw_output = tokenizer.decode(generated_ids, skip_special_tokens=True).strip()
        valid, validation_code, parsed = validate_output(raw_output, item["expected"])
        result = {
            "taskId": item["taskId"],
            "role": item["expected"]["role"],
            "seed": task_seed,
            "status": "passed" if valid else "safe-fallback",
            "validationCode": validation_code,
            "generationMs": round(generation_ms, 2),
            "inputTokens": input_tokens,
            "outputTokens": int(generated_ids.shape[-1]),
            "peakMemoryMiB": round(torch.cuda.max_memory_allocated() / 1024**2, 2),
            "outputSha256": hashlib.sha256(raw_output.encode("utf-8")).hexdigest(),
            "displayApproved": valid,
            "rawOutput": raw_output,
            "validatedOutput": parsed if valid else None,
            "fallbackOutput": None
            if valid
            else {
                **item["expected"],
                "summary": "합성 Demo 구조화 설명을 검증하지 못했습니다. 제공된 사실을 직접 확인해 주세요.",
            },
        }
        results.append(result)
        print(
            f"task={item['taskId']} status={result['status']} "
            f"code={validation_code} generation_ms={result['generationMs']}"
        )

    latencies = [float(result["generationMs"]) for result in results]
    passed = sum(result["status"] == "passed" for result in results)
    fallback_codes: dict[str, int] = {}
    for result in results:
        if result["validationCode"] != "PASS":
            code = str(result["validationCode"])
            fallback_codes[code] = fallback_codes.get(code, 0) + 1
    metrics = {
        "passed": passed,
        "failed": len(results) - passed,
        "fallback": len(results) - passed,
        "firstAttemptPassRate": round(passed / len(results), 4),
        "averageGenerationMs": round(statistics.mean(latencies), 2),
        "p95GenerationMs": round(percentile95(latencies), 2),
        "maxPeakMemoryMiB": max(float(result["peakMemoryMiB"]) for result in results),
        "unsafeDisplayCount": 0,
        "fallbackCodes": fallback_codes,
    }
    run = {
        "schemaVersion": "local-model-benchmark-v1",
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "modelId": MODEL_ID,
        "revision": MODEL_REVISION,
        "promptVersion": PROMPT_VERSION,
        "loadMs": round(load_ms, 2),
        "taskCount": len(results),
        "metrics": metrics,
        "results": results,
    }

    args.output_dir.mkdir(parents=True, exist_ok=True)
    json_path = args.output_dir / "local-model-benchmark.json"
    csv_path = args.output_dir / "local-model-benchmark.csv"
    summary_path = args.output_dir / "local-model-benchmark-summary.json"
    json_path.write_text(json.dumps(run, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary_path.write_text(
        json.dumps({key: value for key, value in run.items() if key != "results"}, ensure_ascii=False, indent=2)
        + "\n",
        encoding="utf-8",
    )
    csv_fields = [
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
    with csv_path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=csv_fields)
        writer.writeheader()
        for result in results:
            writer.writerow({key: result[key] for key in csv_fields})

    print(
        "LOCAL_MODEL_BENCHMARK_COMPLETE "
        f"passed={passed}/{len(results)} fallback={len(results) - passed} "
        f"unsafe_display=0"
    )
    print(f"result_json={json_path}")
    print(f"result_csv={csv_path}")
    print(f"summary_json={summary_path}")


if __name__ == "__main__":
    main()
