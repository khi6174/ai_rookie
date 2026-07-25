#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any


PROMPT_VERSION = "local-operations-extract-ko-v1.4.0"


def load_v1_3() -> Any:
    path = Path(__file__).with_name("local-model-operations-documents-v1.3.py")
    spec = importlib.util.spec_from_file_location("operations_v1_3", path)
    if spec is None or spec.loader is None:
        raise SystemExit("V1_3_RUNNER_IMPORT_FAILED")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


v3 = load_v1_3()
v2 = v3.v2
v1 = v3.v1
base = v3.base


SELECTED_PROMPT_SOURCE = {
    "DELIVERY_WORK_SHEET": "v1.3",
    "SHIFT_ROSTER": "v1.1",
    "ROUTE_STOP_MANIFEST": "v1.1",
    "SAFETY_INCIDENT_PREVENTION_REPORT": "v1.2",
}


def build_messages(item: dict[str, Any]) -> list[dict[str, str]]:
    kind = item["expected"]["documentKind"]
    if kind == "DELIVERY_WORK_SHEET":
        return v3.work_sheet_messages(item)
    if kind in {"SHIFT_ROSTER", "ROUTE_STOP_MANIFEST"}:
        return v1.build_messages(item)
    return v2.build_messages(item)


def run_self_test(bundle: dict[str, Any]) -> None:
    v1.original_self_test(bundle)
    counts = {kind: 0 for kind in SELECTED_PROMPT_SOURCE}
    for item in bundle["tasks"]:
        kind = item["expected"]["documentKind"]
        counts[kind] += 1
        actual = build_messages(item)
        if kind == "DELIVERY_WORK_SHEET":
            expected = v3.work_sheet_messages(item)
        elif kind in {"SHIFT_ROSTER", "ROUTE_STOP_MANIFEST"}:
            expected = v1.build_messages(item)
        else:
            expected = v2.build_messages(item)
        if actual != expected:
            raise AssertionError(f"prompt router changed {kind}")
    if set(counts.values()) != {25}:
        raise AssertionError(f"prompt routing coverage invalid: {counts}")
    print(
        "LOCAL_MODEL_OPERATIONS_V1_4_SELF_TEST_PASS "
        f"tasks={len(bundle['tasks'])} routes={SELECTED_PROMPT_SOURCE} "
        f"prompt={PROMPT_VERSION}"
    )


v1.PROMPT_VERSION = PROMPT_VERSION
base.PROMPT_VERSION = PROMPT_VERSION
base.build_messages = build_messages
base.run_self_test = run_self_test


if __name__ == "__main__":
    base.main()
