#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any


def load_base() -> Any:
    path = Path(__file__).with_name("verify-local-model-operations-documents.py")
    spec = importlib.util.spec_from_file_location("verify_operations_v1_0", path)
    if spec is None or spec.loader is None:
        raise SystemExit("BASE_VERIFIER_IMPORT_FAILED")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_base()
base.PROMPT_VERSION = "local-operations-extract-ko-v1.2.0"


if __name__ == "__main__":
    base.main()
