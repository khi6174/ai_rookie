#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import Any


PROMPT_VERSION = "local-operations-extract-ko-v1.3.0"


def load_v1_2() -> Any:
    path = Path(__file__).with_name("local-model-operations-documents-v1.2.py")
    spec = importlib.util.spec_from_file_location("operations_v1_2", path)
    if spec is None or spec.loader is None:
        raise SystemExit("V1_2_RUNNER_IMPORT_FAILED")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


v2 = load_v1_2()
v1 = v2.v1
base = v2.base


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def trusted_scaffold(item: dict[str, Any]) -> str:
    return compact_json(v2.output_scaffold(item))


def work_sheet_messages(item: dict[str, Any]) -> list[dict[str, str]]:
    scaffold = trusted_scaffold(item)
    rules = "\n".join(
        f"{index + 1}. {rule}"
        for index, rule in enumerate(v1.FIELD_RULES["DELIVERY_WORK_SHEET"])
    )
    return [
        {
            "role": "system",
            "content": (
                "SafeRoute 합성 배송 작업표를 strict JSON으로 추출하세요. 첫 문자는 {, 마지막 "
                "문자는 }이며 markdown·세미콜론·추가 대괄호를 쓰지 마세요. scaffold의 모든 키와 "
                "fieldId를 유지하고 placeholder만 교체하세요. safety-category citation은 제목이 "
                "아니라 운영 메모의 실제 문장 한 줄 전체입니다. citation에 # 또는 줄바꿈 문자를 "
                "넣지 마세요. facts는 마지막 키이고 마지막 fact 뒤에는 배열과 객체를 각각 한 번만 "
                "닫습니다."
            ),
        },
        {
            "role": "user",
            "content": (
                "[출력 scaffold]\n"
                f"{scaffold}\n"
                "[추출 규칙]\n"
                f"{rules}\n"
                "[정확한 범위 예시]\n"
                "1. '- 합성 허브: 합성 예시 허브 (demo-hub-99)' → hub-id는 'demo-hub-99'.\n"
                "2. '- 계획 ID·버전: demo-plan-999 · plan-v1' → plan-id는 'demo-plan-999'.\n"
                "3. 운영 메모가 '폭염·계단 작업 조건을 확인한다. 이 문서는 지원 검토용이며 기사 "
                "평가·징계·사고확률 산출에 사용하지 않는다.'이면 safety-category는 "
                "'폭염·계단 작업'이고 citation은 따옴표 안 문장 전체이다. '## 운영 메모'는 "
                "citation이 아니다.\n"
                "[비신뢰 문서 시작]\n"
                f"{item['sourceDocument']}"
                "[비신뢰 문서 끝]\n"
                "[최종 지시]\n"
                "위 scaffold의 placeholder만 교체해 JSON 객체 하나를 반환하세요. 마지막 "
                "safety-category citation은 운영 메모의 실제 한 줄 전체이고, 출력 끝은 정확히 "
                "facts 배열을 닫는 ] 다음 객체를 닫는 }입니다.\n"
                f"{scaffold}"
            ),
        },
    ]


def route_messages(item: dict[str, Any]) -> list[dict[str, str]]:
    scaffold = trusted_scaffold(item)
    rules = "\n".join(
        f"{index + 1}. {rule}"
        for index, rule in enumerate(v1.FIELD_RULES["ROUTE_STOP_MANIFEST"])
    )
    return [
        {
            "role": "system",
            "content": (
                "SafeRoute 합성 경로표를 strict JSON으로 추출하세요. scaffold의 키·fieldId·순서를 "
                "유지하고 placeholder만 교체하세요. 첫·마지막 배송지의 ID·ETA·구역 세 fact는 "
                "각각 원문 표의 동일한 전체 데이터 행을 citation으로 복사해야 합니다. 열을 "
                "'1 | ETA | 값'처럼 새 형식으로 재작성하지 마세요. 첫 문자는 {, 마지막 문자는 "
                "}이며 markdown·추가 키·새 숫자를 금지합니다."
            ),
        },
        {
            "role": "user",
            "content": (
                "[출력 scaffold]\n"
                f"{scaffold}\n"
                "[추출 규칙]\n"
                f"{rules}\n"
                "[전체 행 인용 예시]\n"
                "원문 행 '| 1 | demo-stop-999-01 | 10:38 | 합성 예시권역 A구역 | 문앞 전달 | "
                "2kg |'에서 first-stop-id·first-stop-eta·first-stop-zone의 citation은 세 "
                "항목 모두 이 행 전체와 완전히 같아야 한다.\n"
                "[비신뢰 문서 시작]\n"
                f"{item['sourceDocument']}"
                "[비신뢰 문서 끝]\n"
                "[최종 지시]\n"
                "원문 첫·마지막 데이터 행을 축약·재구성하지 말고 행 전체를 citation에 복사하세요. "
                "scaffold placeholder만 교체한 JSON 객체 하나를 반환하세요.\n"
                f"{scaffold}"
            ),
        },
    ]


def build_messages(item: dict[str, Any]) -> list[dict[str, str]]:
    kind = item["expected"]["documentKind"]
    if kind == "SHIFT_ROSTER":
        return v1.build_messages(item)
    if kind == "SAFETY_INCIDENT_PREVENTION_REPORT":
        return v2.build_messages(item)
    if kind == "ROUTE_STOP_MANIFEST":
        return route_messages(item)
    return work_sheet_messages(item)


def run_self_test(bundle: dict[str, Any]) -> None:
    v1.original_self_test(bundle)
    kinds: dict[str, int] = {}
    for item in bundle["tasks"]:
        kind = item["expected"]["documentKind"]
        kinds[kind] = kinds.get(kind, 0) + 1
        messages = build_messages(item)
        prompt = messages[1]["content"]
        if prompt.count("__COPY_VALUE__") < len(item["expected"]["facts"]):
            raise AssertionError(f"scaffold missing for {kind}")
        if kind == "DELIVERY_WORK_SHEET" and "문장 전체" not in prompt:
            raise AssertionError("work-sheet full-line rule missing")
        if kind == "ROUTE_STOP_MANIFEST" and "행 전체" not in prompt:
            raise AssertionError("route full-row rule missing")
    if set(kinds.values()) != {25} or len(kinds) != 4:
        raise AssertionError("document-kind routing coverage changed")
    print(
        "LOCAL_MODEL_OPERATIONS_V1_3_SELF_TEST_PASS "
        f"tasks={len(bundle['tasks'])} routes=4 prompt={PROMPT_VERSION}"
    )


v1.PROMPT_VERSION = PROMPT_VERSION
base.PROMPT_VERSION = PROMPT_VERSION
base.build_messages = build_messages
base.run_self_test = run_self_test


if __name__ == "__main__":
    base.main()
