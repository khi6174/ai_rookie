#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MODEL_ID = "skt/A.X-4.0-Light"
MODEL_REVISION = "ba21c20ea1b31ded1ec3e2fb432335077dc4be98"
PROMPT_VERSION = "local-structured-ko-v1.2.0"
TASK_ID = "local-smoke-admin-support-001"
SEED = 6174
MAX_INPUT_TOKENS = 4096
MAX_NEW_TOKENS = 256

FACTS = [
    {"factId": "safety-budget-remaining", "displayValue": "31/100"},
    {"factId": "time-to-breach", "displayValue": "52분"},
    {"factId": "breach-stop", "displayValue": "17번째 배송지"},
    {"factId": "confidence", "displayValue": "87%"},
]
CITATIONS = ["synthetic-safety-manual#support-protocol"]
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
        description="Run one offline A.X structured-output smoke task with strict validation."
    )
    parser.add_argument("--model-dir", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path("results"))
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def build_messages() -> list[dict[str, str]]:
    contract = {
        "role": "admin",
        "facts": FACTS,
        "citations": CITATIONS,
        "allowedAction": "지원 검토",
        "demoLabel": "합성 Demo",
    }
    return [
        {
            "role": "system",
            "content": (
                "당신은 SafeRoute AI의 한국어 설명 생성기입니다. 제공된 사실을 계산, "
                "반올림, 변경하거나 새 숫자를 만들지 마세요. 기사를 평가하거나 비난하지 "
                "마세요. 제공된 인용만 사용하세요. 응답의 첫 문자는 {, 마지막 문자는 }여야 "
                "합니다. 코드펜스와 JSON 앞뒤 설명을 쓰지 마세요. summary는 안전여유, "
                "예상 임계치 초과까지, 예상 초과 지점, 신뢰도라는 승인 용어만 사용하세요."
            ),
        },
        {
            "role": "user",
            "content": (
                "다음 합성 Demo 계약을 그대로 사용해 관리자용 한 문장 요약을 작성하세요. "
                "응답 키는 role, summary, facts, citations, allowedAction, demoLabel만 허용합니다. "
                "facts, citations, allowedAction, demoLabel은 입력을 그대로 복사하고 summary에는 "
                "네 displayValue를 문자 그대로 모두 포함하세요. 특히 31/100을 31%로 바꾸지 "
                "마세요. summary 문장 구조는 '안전여유 31/100, 예상 임계치 초과까지 52분, "
                "예상 초과 지점은 17번째 배송지, 신뢰도 87%입니다. 지원 검토가 필요합니다.'를 "
                "사용하세요. 출력은 JSON 객체만 허용합니다.\n"
                + json.dumps(contract, ensure_ascii=False, separators=(",", ":"))
            ),
        },
    ]


def validate_output(raw_output: str) -> tuple[bool, str, dict[str, Any] | None]:
    if "```" in raw_output:
        return False, "MARKDOWN_WRAPPER", None
    try:
        parsed = json.loads(raw_output)
    except json.JSONDecodeError:
        return False, "MALFORMED_JSON", None

    if not isinstance(parsed, dict) or set(parsed) != EXPECTED_KEYS:
        return False, "SCHEMA_MISMATCH", parsed if isinstance(parsed, dict) else None
    if parsed["role"] != "admin":
        return False, "ROLE_MISMATCH", parsed
    if parsed["facts"] != FACTS:
        return False, "FACT_INTEGRITY_FAILURE", parsed
    if parsed["citations"] != CITATIONS:
        return False, "CITATION_INTEGRITY_FAILURE", parsed
    if parsed["allowedAction"] != "지원 검토":
        return False, "ACTION_INTEGRITY_FAILURE", parsed
    if parsed["demoLabel"] != "합성 Demo":
        return False, "DEMO_LABEL_MISMATCH", parsed
    if not isinstance(parsed["summary"], str) or not parsed["summary"].strip():
        return False, "EMPTY_SUMMARY", parsed
    if any(value["displayValue"] not in parsed["summary"] for value in FACTS):
        return False, "DISPLAY_VALUE_OMISSION", parsed
    if any(term in raw_output for term in FORBIDDEN_TERMS):
        return False, "FORBIDDEN_LANGUAGE", parsed

    number_tokens = set(re.findall(r"\d+(?:[.,]\d+)?", raw_output))
    if not number_tokens.issubset(ALLOWED_NUMBER_TOKENS):
        return False, "NEW_NUMBER", parsed
    return True, "PASS", parsed


def run_self_test() -> None:
    valid = {
        "role": "admin",
        "summary": "안전여유 31/100, 52분 뒤 17번째 배송지, 신뢰도 87%를 함께 확인했습니다.",
        "facts": FACTS,
        "citations": CITATIONS,
        "allowedAction": "지원 검토",
        "demoLabel": "합성 Demo",
    }
    ok, code, _ = validate_output(json.dumps(valid, ensure_ascii=False))
    if not ok or code != "PASS":
        raise AssertionError(f"valid fixture rejected: {code}")

    invalid = dict(valid)
    invalid["summary"] = valid["summary"] + " 99점"
    ok, code, _ = validate_output(json.dumps(invalid, ensure_ascii=False))
    if ok or code != "NEW_NUMBER":
        raise AssertionError(f"new-number fixture not rejected: {code}")

    fenced = f"```json\n{json.dumps(valid, ensure_ascii=False)}\n```"
    ok, code, _ = validate_output(fenced)
    if ok or code != "MARKDOWN_WRAPPER":
        raise AssertionError(f"markdown wrapper not rejected: {code}")

    forbidden = dict(valid)
    forbidden["summary"] = (
        "안전여유 31/100, 침해까지 52분, 차단 지점은 17번째 배송지, 신뢰도 87%입니다."
    )
    ok, code, _ = validate_output(json.dumps(forbidden, ensure_ascii=False))
    if ok or code != "FORBIDDEN_LANGUAGE":
        raise AssertionError(f"forbidden-language fixture not rejected: {code}")
    print("LOCAL_MODEL_SMOKE_SELF_TEST_PASS cases=4")


def main() -> None:
    args = parse_args()
    if args.self_test:
        run_self_test()
        return
    if args.model_dir is None:
        raise SystemExit("--model-dir is required unless --self-test is used")

    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    if not torch.cuda.is_available():
        raise SystemExit("CUDA_NOT_AVAILABLE")

    torch.manual_seed(SEED)
    torch.cuda.manual_seed_all(SEED)
    torch.cuda.reset_peak_memory_stats()

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

    encoded = tokenizer.apply_chat_template(
        build_messages(),
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    ).to("cuda:0")
    input_ids = encoded["input_ids"]
    attention_mask = encoded["attention_mask"]
    input_tokens = int(input_ids.shape[-1])
    if input_tokens > MAX_INPUT_TOKENS:
        raise SystemExit(f"INPUT_TOKEN_LIMIT_EXCEEDED actual={input_tokens}")

    generation_started = time.perf_counter()
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
    generation_ms = (time.perf_counter() - generation_started) * 1000

    generated_ids = output_ids[0, input_tokens:]
    output_tokens = int(generated_ids.shape[-1])
    raw_output = tokenizer.decode(generated_ids, skip_special_tokens=True).strip()
    valid, validation_code, parsed = validate_output(raw_output)
    peak_memory_mib = torch.cuda.max_memory_allocated() / 1024**2
    output_sha256 = hashlib.sha256(raw_output.encode("utf-8")).hexdigest()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    captured_at = datetime.now(timezone.utc).isoformat()
    row = {
        "taskId": TASK_ID,
        "modelId": MODEL_ID,
        "revision": MODEL_REVISION,
        "promptVersion": PROMPT_VERSION,
        "seed": SEED,
        "status": "passed" if valid else "safe-fallback",
        "validationCode": validation_code,
        "loadMs": round(load_ms, 2),
        "generationMs": round(generation_ms, 2),
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "peakMemoryMiB": round(peak_memory_mib, 2),
        "outputSha256": output_sha256,
        "displayApproved": valid,
    }
    csv_path = args.output_dir / "local-model-smoke.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=list(row))
        writer.writeheader()
        writer.writerow(row)

    detail = {
        "schemaVersion": "local-model-smoke-v1",
        "capturedAt": captured_at,
        **row,
        "rawOutput": raw_output,
        "validatedOutput": parsed if valid else None,
        "fallbackOutput": None
        if valid
        else {
            "role": "admin",
            "summary": "합성 Demo 사실을 자동 설명으로 검증하지 못했습니다. 제공된 수치와 근거를 직접 확인해 주세요.",
            "facts": FACTS,
            "citations": CITATIONS,
            "allowedAction": "지원 검토",
            "demoLabel": "합성 Demo",
        },
    }
    json_path = args.output_dir / "local-model-smoke.json"
    json_path.write_text(
        json.dumps(detail, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    if valid:
        print(
            "LOCAL_MODEL_SMOKE_PASS "
            f"generation_ms={row['generationMs']} peak_memory_mib={row['peakMemoryMiB']}"
        )
    else:
        print(
            "LOCAL_MODEL_SMOKE_SAFE_FALLBACK "
            f"code={validation_code} output_sha256={output_sha256}"
        )
    print(f"result_json={json_path}")
    print(f"result_csv={csv_path}")


if __name__ == "__main__":
    main()
