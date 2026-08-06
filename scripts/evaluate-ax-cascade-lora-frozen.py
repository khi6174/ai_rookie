#!/usr/bin/env python3
"""Run the terminal one-time frozen Gate for the SafeRoute A.X LoRA.

The script claims an immutable consumption marker before it hashes or opens the
frozen split. Any started attempt consumes the single-run allowance, including
an interrupted or failed attempt. Prompts and raw model outputs are never saved.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "a100-cascade-lora-frozen-evaluation-v1"
EVALUATOR_VERSION = "ax-cascade-lora-frozen-v1.0.0"


def number_at_least(value: Any, minimum: float) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and value >= minimum
    )


def number_at_most(value: Any, maximum: float) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and value <= maximum
    )


def load_validation_module(root: Path) -> Any:
    script_path = root / "scripts" / "evaluate-ax-cascade-lora.py"
    spec = importlib.util.spec_from_file_location(
        "cascade_lora_validation", script_path
    )
    if spec is None or spec.loader is None:
        raise SystemExit("VALIDATION_MODULE_LOAD_FAILED")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validation_summary_eligible(
    summary: dict[str, Any],
    training_config: dict[str, Any],
    frozen_config: dict[str, Any],
    training_config_sha256: str,
    training_summary_sha256: str,
    adapter: dict[str, Any],
) -> bool:
    metrics = summary.get("metrics", {})
    gate = frozen_config["validationGate"]
    return (
        summary.get("schemaVersion") == "a100-cascade-lora-validation-v1"
        and summary.get("status") == gate["requiredStatus"]
        and summary.get("experimentId") == frozen_config["experimentId"]
        and summary.get("datasetVersion")
        == training_config["dataset"]["version"]
        and summary.get("datasetManifestSha256")
        == training_config["dataset"]["manifestSha256"]
        and summary.get("trainingConfigSha256") == training_config_sha256
        and summary.get("trainingSummarySha256") == training_summary_sha256
        and summary.get("adapter") == adapter
        and summary.get("taskCount")
        == training_config["dataset"]["validationRecords"]
        and summary.get("frozenRecordsRead")
        == gate["requiredFrozenRecordsRead"]
        and summary.get("productIntegrationApproved") is False
        and summary.get("nextGate") == "single-frozen-evaluation"
        and number_at_least(
            metrics.get("schemaPassRate"), gate["schemaPassRateMinimum"]
        )
        and number_at_least(
            metrics.get("numericIntegrityRateAmongSchemaValid"),
            gate["numericIntegrityRateMinimum"],
        )
        and number_at_least(
            metrics.get("citationIntegrityRateAmongSchemaValid"),
            gate["citationIntegrityRateMinimum"],
        )
        and number_at_least(
            metrics.get("rolePolicyRateAmongSchemaValid"),
            gate["rolePolicyRateMinimum"],
        )
        and number_at_least(
            metrics.get("injectionIsolationRate"),
            gate["injectionIsolationRateMinimum"],
        )
        and number_at_most(
            metrics.get("unsafeDisplayCount"), gate["unsafeDisplayCountMaximum"]
        )
    )


def claim_terminal_attempt(
    marker_path: Path,
    experiment_id: str,
    validation_summary_sha256: str,
    frozen_config_sha256: str,
    output_dir: Path,
) -> None:
    claim = {
        "schemaVersion": "a100-cascade-lora-frozen-consumption-v1",
        "experimentId": experiment_id,
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "terminalAttempt": True,
        "rerunPermitted": False,
        "validationSummarySha256": validation_summary_sha256,
        "frozenConfigSha256": frozen_config_sha256,
        "outputDirectory": str(output_dir),
    }
    try:
        with marker_path.open("x", encoding="utf-8") as handle:
            json.dump(claim, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
    except FileExistsError as error:
        raise SystemExit(
            f"FROZEN_EVALUATION_ALREADY_CONSUMED marker={marker_path}"
        ) from error


def self_test() -> None:
    training_config = {
        "dataset": {
            "version": "dataset-v1",
            "manifestSha256": "manifest-hash",
            "validationRecords": 200,
        }
    }
    frozen_config = {
        "experimentId": "experiment-v1",
        "validationGate": {
            "requiredStatus": "VALIDATION_GATE_PASS",
            "schemaPassRateMinimum": 0.98,
            "numericIntegrityRateMinimum": 1.0,
            "citationIntegrityRateMinimum": 1.0,
            "rolePolicyRateMinimum": 1.0,
            "injectionIsolationRateMinimum": 1.0,
            "unsafeDisplayCountMaximum": 0,
            "requiredFrozenRecordsRead": 0,
        },
    }
    adapter = {"fileCount": 1, "totalBytes": 4, "files": []}
    summary = {
        "schemaVersion": "a100-cascade-lora-validation-v1",
        "status": "VALIDATION_GATE_PASS",
        "experimentId": "experiment-v1",
        "datasetVersion": "dataset-v1",
        "datasetManifestSha256": "manifest-hash",
        "trainingConfigSha256": "config-hash",
        "trainingSummarySha256": "training-hash",
        "adapter": adapter,
        "taskCount": 200,
        "frozenRecordsRead": 0,
        "productIntegrationApproved": False,
        "nextGate": "single-frozen-evaluation",
        "metrics": {
            "schemaPassRate": 1.0,
            "numericIntegrityRateAmongSchemaValid": 1.0,
            "citationIntegrityRateAmongSchemaValid": 1.0,
            "rolePolicyRateAmongSchemaValid": 1.0,
            "injectionIsolationRate": 1.0,
            "unsafeDisplayCount": 0,
        },
    }
    if not validation_summary_eligible(
        summary,
        training_config,
        frozen_config,
        "config-hash",
        "training-hash",
        adapter,
    ):
        raise SystemExit("SELF_TEST_ELIGIBLE_SUMMARY_REJECTED")
    for field, invalid_value in (
        ("status", "VALIDATION_GATE_FAIL"),
        ("frozenRecordsRead", 1),
        ("adapter", {"fileCount": 2}),
    ):
        changed = {**summary, field: invalid_value}
        if validation_summary_eligible(
            changed,
            training_config,
            frozen_config,
            "config-hash",
            "training-hash",
            adapter,
        ):
            raise SystemExit(f"SELF_TEST_INVALID_SUMMARY_ACCEPTED field={field}")
    print("A100_CASCADE_LORA_FROZEN_SELF_TEST_PASS cases=4")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--frozen-config", default="config/a100-cascade-lora-frozen-v1.json"
    )
    parser.add_argument("--model-dir")
    parser.add_argument("--adapter-dir")
    parser.add_argument("--training-summary")
    parser.add_argument("--validation-summary")
    parser.add_argument("--output-dir")
    parser.add_argument("--execute-terminal-attempt", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.execute_terminal_attempt:
        raise SystemExit("FROZEN_EVALUATION_REQUIRES_EXECUTE_TERMINAL_ATTEMPT")
    if not all(
        [
            args.model_dir,
            args.adapter_dir,
            args.training_summary,
            args.validation_summary,
            args.output_dir,
        ]
    ):
        raise SystemExit(
            "FROZEN_EVALUATION_REQUIRES_MODEL_ADAPTER_TRAINING_VALIDATION_AND_OUTPUT"
        )

    root = Path.cwd().resolve()
    validation = load_validation_module(root)
    frozen_config_path = validation.resolve_under(root, args.frozen_config)
    frozen_config = validation.load_json(frozen_config_path)
    training_config_path = validation.resolve_under(
        root, frozen_config["trainingConfigPath"]
    )
    training_config_sha256 = validation.sha256_file(training_config_path)
    if training_config_sha256 != frozen_config["trainingConfigSha256"]:
        raise SystemExit("LOCKED_TRAINING_CONFIG_HASH_MISMATCH")
    training_config = validation.load_json(training_config_path)
    if training_config["experimentId"] != frozen_config["experimentId"]:
        raise SystemExit("EXPERIMENT_ID_MISMATCH")
    if frozen_config["frozenGate"]["evaluationRunLimit"] != 1:
        raise SystemExit("FROZEN_RUN_LIMIT_MUST_EQUAL_ONE")
    if frozen_config.get("productIntegrationApproved") is not False:
        raise SystemExit("PRODUCT_INTEGRATION_MUST_REMAIN_UNAPPROVED")

    manifest_path = validation.resolve_under(
        root, training_config["dataset"]["manifestPath"]
    )
    if (
        validation.sha256_file(manifest_path)
        != training_config["dataset"]["manifestSha256"]
    ):
        raise SystemExit("DATASET_MANIFEST_HASH_MISMATCH")
    dataset_manifest = validation.load_json(manifest_path)
    frozen_entry = next(
        (
            item
            for item in dataset_manifest["files"]
            if item["split"] == "frozen-test"
        ),
        None,
    )
    if frozen_entry is None:
        raise SystemExit("FROZEN_MANIFEST_ENTRY_MISSING")

    model_dir = Path(args.model_dir).resolve()
    adapter_dir = Path(args.adapter_dir).resolve()
    training_summary_path = Path(args.training_summary).resolve()
    validation_summary_path = Path(args.validation_summary).resolve()
    output_dir = Path(args.output_dir).resolve()
    if not model_dir.is_dir() or not adapter_dir.is_dir():
        raise SystemExit("MODEL_OR_ADAPTER_DIRECTORY_NOT_FOUND")
    if output_dir.exists() and any(output_dir.iterdir()):
        raise SystemExit("OUTPUT_DIRECTORY_MUST_BE_NEW_OR_EMPTY")
    output_dir.mkdir(parents=True, exist_ok=True)

    training_summary = validation.load_json(training_summary_path)
    if (
        training_summary.get("status") != "TRAINED_NOT_QUALIFIED"
        or training_summary.get("frozenRecordsRead") != 0
        or training_summary.get("datasetManifestSha256")
        != training_config["dataset"]["manifestSha256"]
        or training_summary.get("productIntegrationApproved") is not False
    ):
        raise SystemExit("TRAINING_SUMMARY_BOUNDARY_FAILED")
    adapter_files = validation.adapter_manifest(adapter_dir)
    validation_summary = validation.load_json(validation_summary_path)
    training_summary_sha256 = validation.sha256_file(training_summary_path)
    if not validation_summary_eligible(
        validation_summary,
        training_config,
        frozen_config,
        training_config_sha256,
        training_summary_sha256,
        adapter_files,
    ):
        raise SystemExit("VALIDATION_GATE_EVIDENCE_FAILED")

    training_module = validation.load_training_module(root)
    model_manifest = validation.load_json(
        validation.resolve_under(root, training_config["baseModel"]["manifestPath"])
    )
    training_module.verify_model_snapshot(model_dir, model_manifest)

    try:
        import torch
        from peft import PeftModel
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError as error:
        raise SystemExit(
            f"FROZEN_EVALUATION_DEPENDENCY_MISSING module={error.name}"
        ) from error
    if not torch.cuda.is_available() or not torch.cuda.is_bf16_supported():
        raise SystemExit("A100_BF16_RUNTIME_REQUIRED")
    device_name = torch.cuda.get_device_name(0)
    device_memory_bytes = torch.cuda.get_device_properties(0).total_memory
    if "A100" not in device_name.upper() or device_memory_bytes < 75 * 1024**3:
        raise SystemExit("A100_80GB_REQUIRED")

    tokenizer = AutoTokenizer.from_pretrained(adapter_dir, local_files_only=True)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    base_model = AutoModelForCausalLM.from_pretrained(
        model_dir,
        local_files_only=True,
        use_safetensors=True,
        torch_dtype=torch.bfloat16,
        device_map={"": "cuda:0"},
        low_cpu_mem_usage=True,
    )
    model = PeftModel.from_pretrained(base_model, adapter_dir, is_trainable=False)
    model.eval()

    marker_path = (
        training_summary_path.parent
        / frozen_config["consumptionMarkerFilename"]
    )
    validation_summary_sha256 = validation.sha256_file(validation_summary_path)
    frozen_config_sha256 = validation.sha256_file(frozen_config_path)
    claim_terminal_attempt(
        marker_path,
        frozen_config["experimentId"],
        validation_summary_sha256,
        frozen_config_sha256,
        output_dir,
    )
    print(f"FROZEN_TERMINAL_ATTEMPT_CLAIMED marker={marker_path}", flush=True)

    # No code above this point hashes or opens the frozen split. Once claimed,
    # any failure is terminal and must not be retried for this experiment.
    frozen_path = validation.resolve_under(
        root, training_config["dataset"]["frozenSplit"]
    )
    if validation.sha256_file(frozen_path) != frozen_entry["sha256"]:
        raise SystemExit("FROZEN_FILE_HASH_MISMATCH_TERMINAL_NO_RERUN")
    frozen_records = validation.load_jsonl(
        frozen_path, training_config["dataset"]["frozenRecords"]
    )
    if any(record.get("split") != "frozen-test" for record in frozen_records):
        raise SystemExit("NON_FROZEN_RECORD_DETECTED_TERMINAL_NO_RERUN")

    results_path = output_dir / "frozen-results.jsonl"
    results: list[dict[str, Any]] = []
    started_at = time.time()
    torch.cuda.reset_peak_memory_stats()
    with results_path.open("x", encoding="utf-8") as results_handle:
        for index, record in enumerate(frozen_records, start=1):
            seed = int(record["seed"])
            torch.manual_seed(seed)
            torch.cuda.manual_seed_all(seed)
            prefix = tokenizer.apply_chat_template(
                training_module.prompt_messages(record),
                tokenize=False,
                add_generation_prompt=True,
            )
            encoded = tokenizer(
                prefix,
                return_tensors="pt",
                truncation=True,
                max_length=int(training_config["training"]["maxSequenceLength"]),
                add_special_tokens=False,
            ).to("cuda:0")
            generation_started = time.perf_counter()
            with torch.inference_mode():
                generated = model.generate(
                    **encoded,
                    do_sample=False,
                    max_new_tokens=int(frozen_config["generation"]["maxNewTokens"]),
                    pad_token_id=tokenizer.pad_token_id,
                    eos_token_id=tokenizer.eos_token_id,
                )
            torch.cuda.synchronize()
            generated_ids = generated[0, encoded["input_ids"].shape[1] :]
            raw_output = tokenizer.decode(
                generated_ids,
                skip_special_tokens=True,
                clean_up_tokenization_spaces=False,
            )
            checks = validation.parse_and_validate(record, raw_output)
            verified = checks["schemaValid"] and all(
                checks[key] is True
                for key in (
                    "numericIntegrityValid",
                    "citationIntegrityValid",
                    "rolePolicyValid",
                    "injectionIsolationValid",
                )
            )
            result = {
                "recordId": record["recordId"],
                "parentRecordId": record["parentRecordId"],
                "role": record["role"],
                "scenarioFamily": record["scenarioFamily"],
                "containsUntrustedInstruction": record[
                    "containsUntrustedInstruction"
                ],
                "status": "VERIFIED" if verified else "SAFE_FALLBACK",
                **checks,
                "outputSha256": validation.sha256_text(raw_output),
                "promptTokens": int(encoded["input_ids"].shape[1]),
                "completionTokens": int(generated_ids.shape[0]),
                "generationMs": (time.perf_counter() - generation_started) * 1000,
                "unsafeDisplayCount": 0,
            }
            results.append(result)
            results_handle.write(json.dumps(result, ensure_ascii=False) + "\n")
            results_handle.flush()
            if index % 10 == 0 or index == len(frozen_records):
                print(
                    f"FROZEN_PROGRESS completed={index}/{len(frozen_records)} "
                    f"verified={sum(item['status'] == 'VERIFIED' for item in results)}",
                    flush=True,
                )

    schema_valid_results = [item for item in results if item["schemaValid"]]
    injection_results = [
        item for item in results if item["containsUntrustedInstruction"]
    ]
    schema_rate = validation.rate(len(schema_valid_results), len(results))
    numeric_rate = validation.rate(
        sum(item["numericIntegrityValid"] is True for item in schema_valid_results),
        len(schema_valid_results),
    )
    citation_rate = validation.rate(
        sum(item["citationIntegrityValid"] is True for item in schema_valid_results),
        len(schema_valid_results),
    )
    role_policy_rate = validation.rate(
        sum(item["rolePolicyValid"] is True for item in schema_valid_results),
        len(schema_valid_results),
    )
    injection_rate = validation.rate(
        sum(item["injectionIsolationValid"] is True for item in injection_results),
        len(injection_results),
    )
    unsafe_display_count = sum(item["unsafeDisplayCount"] for item in results)
    gate = frozen_config["frozenGate"]
    qualification_passed = (
        schema_rate >= gate["schemaPassRateMinimum"]
        and numeric_rate >= gate["numericIntegrityRateMinimum"]
        and citation_rate >= gate["citationIntegrityRateMinimum"]
        and role_policy_rate >= gate["rolePolicyRateMinimum"]
        and injection_rate >= gate["injectionIsolationRateMinimum"]
        and unsafe_display_count <= gate["unsafeDisplayCountMaximum"]
    )
    failure_codes: dict[str, int] = {}
    for code in (code for item in results for code in item["failureCodes"]):
        failure_codes[code] = failure_codes.get(code, 0) + 1
    finished_at = time.time()
    summary = {
        "schemaVersion": SCHEMA_VERSION,
        "evaluatorVersion": EVALUATOR_VERSION,
        "status": "FROZEN_GATE_PASS" if qualification_passed else "FROZEN_GATE_FAIL",
        "experimentId": frozen_config["experimentId"],
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "baseModel": training_config["baseModel"],
        "datasetVersion": training_config["dataset"]["version"],
        "datasetManifestSha256": training_config["dataset"]["manifestSha256"],
        "frozenFileSha256": frozen_entry["sha256"],
        "trainingConfigSha256": training_config_sha256,
        "frozenConfigSha256": frozen_config_sha256,
        "trainingSummarySha256": training_summary_sha256,
        "validationSummarySha256": validation_summary_sha256,
        "adapter": adapter_files,
        "taskCount": len(results),
        "frozenRecordsRead": len(frozen_records),
        "frozenEvaluationAttempts": 1,
        "rerunPermitted": False,
        "generation": frozen_config["generation"],
        "metrics": {
            "verified": sum(item["status"] == "VERIFIED" for item in results),
            "safeFallback": sum(
                item["status"] == "SAFE_FALLBACK" for item in results
            ),
            "schemaPassRate": schema_rate,
            "numericIntegrityRateAmongSchemaValid": numeric_rate,
            "citationIntegrityRateAmongSchemaValid": citation_rate,
            "rolePolicyRateAmongSchemaValid": role_policy_rate,
            "injectionIsolationRate": injection_rate,
            "exactContractMatchRate": validation.rate(
                sum(item["exactContractMatch"] for item in results), len(results)
            ),
            "generationLatencyMsP50": statistics.median(
                item["generationMs"] for item in results
            ),
            "generationLatencyMsP95": sorted(
                item["generationMs"] for item in results
            )[max(0, math.ceil(len(results) * 0.95) - 1)],
            "promptTokensTotal": sum(item["promptTokens"] for item in results),
            "completionTokensTotal": sum(
                item["completionTokens"] for item in results
            ),
            "unsafeDisplayCount": unsafe_display_count,
            "failureCodes": failure_codes,
            "evaluationSeconds": finished_at - started_at,
            "peakCudaMemoryMiB": torch.cuda.max_memory_allocated()
            / (1024 * 1024),
        },
        "qualificationGate": gate,
        "productIntegrationApproved": False,
        "nextGate": (
            "independent-cascade-comparison-and-product-review"
            if qualification_passed
            else "new-version-required-no-rerun"
        ),
        "privacy": {
            "promptStored": False,
            "rawOutputStored": False,
            "actualPersonalDataCount": 0,
        },
        "trainingDevice": {
            "name": device_name,
            "totalMemoryMiB": device_memory_bytes / (1024 * 1024),
        },
    }
    summary_path = output_dir / "frozen-summary.json"
    with summary_path.open("x", encoding="utf-8") as handle:
        json.dump(summary, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(
        f"A100_CASCADE_LORA_{summary['status']} "
        f"verified={summary['metrics']['verified']}/{summary['taskCount']} "
        f"schema={schema_rate:.4f} numeric={numeric_rate:.4f} "
        f"citation={citation_rate:.4f} role={role_policy_rate:.4f} "
        f"injection={injection_rate:.4f} unsafe={unsafe_display_count} "
        f"frozenRead={len(frozen_records)} rerun=false",
        flush=True,
    )
    print(f"SUMMARY={summary_path}", flush=True)


if __name__ == "__main__":
    main()
