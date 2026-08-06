#!/usr/bin/env python3
"""Evaluate the qualified A.X LoRA on the shared 12-task product-review set.

This is not another frozen run. It uses the pre-existing domestic AI benchmark
tasks also present in the locked A.X-K1 Hosted evidence. Raw prompts and model
outputs are never stored. The one-run marker prevents result selection.
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


SCHEMA_VERSION = "ax-cascade-product-review-local-v1"
EVALUATOR_VERSION = "ax-cascade-product-review-local-v1.0.0"


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


def required_contract_checks(record: dict[str, Any], output: Any) -> dict[str, bool]:
    if not isinstance(output, dict):
        return {
            "requiredFactsValid": False,
            "requiredCitationsValid": False,
            "requiredDisplayValuesValid": False,
        }
    cited_fact_ids = set(output.get("citedFactIds", []))
    citation_ids = set(output.get("citationIds", []))
    text = " ".join(
        [
            output.get("summary", ""),
            *output.get("actions", []),
            output.get("uncertaintyStatement", ""),
        ]
    )
    return {
        "requiredFactsValid": all(
            fact_id in cited_fact_ids for fact_id in record["requiredFactIds"]
        ),
        "requiredCitationsValid": all(
            citation_id in citation_ids
            for citation_id in record["requiredCitationIds"]
        ),
        "requiredDisplayValuesValid": all(
            display_value in text
            for display_value in record["requiredDisplayValues"]
        ),
    }


def parse_output(raw_output: str) -> Any:
    stripped = raw_output.strip()
    if not stripped.startswith("{") or not stripped.endswith("}") or "```" in stripped:
        return None
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return None


def verify_hosted_reference(
    hosted: dict[str, Any], bundle: dict[str, Any], config: dict[str, Any]
) -> dict[str, Any]:
    reference = config["hostedReference"]
    if hosted.get("status") != reference["requiredStatus"]:
        raise SystemExit("HOSTED_REFERENCE_STATUS_FAILED")
    run = hosted.get("run", {})
    providers = run.get("providers", [])
    selected = next(
        (
            provider
            for provider in providers
            if provider.get("providerId") == reference["providerId"]
            and provider.get("model") == reference["model"]
        ),
        None,
    )
    if selected is None or selected.get("taskCount") != reference["taskCount"]:
        raise SystemExit("HOSTED_REFERENCE_PROVIDER_FAILED")
    task_ids = [record["recordId"] for record in bundle["records"]]
    results = selected.get("results", [])
    if (
        [result.get("taskId") for result in results] != task_ids
        or any(result.get("status") != "PASSED" for result in results)
        or selected.get("metrics", {}).get("unsafeDisplayCount") != 0
    ):
        raise SystemExit("HOSTED_REFERENCE_TASK_CONTRACT_FAILED")
    return selected


def claim_attempt(
    marker_path: Path,
    experiment_id: str,
    config_sha256: str,
    bundle_sha256: str,
    adapter_model_sha256: str,
    output_dir: Path,
) -> None:
    marker = {
        "schemaVersion": "ax-cascade-product-review-consumption-v1",
        "experimentId": experiment_id,
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "terminalAttempt": True,
        "rerunPermitted": False,
        "configSha256": config_sha256,
        "bundleSha256": bundle_sha256,
        "adapterModelSha256": adapter_model_sha256,
        "outputDirectory": str(output_dir),
    }
    try:
        with marker_path.open("x", encoding="utf-8") as handle:
            json.dump(marker, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
    except FileExistsError as error:
        raise SystemExit(
            f"PRODUCT_REVIEW_LOCAL_ALREADY_CONSUMED marker={marker_path}"
        ) from error


def self_test() -> None:
    record = {
        "requiredFactIds": ["fact-1"],
        "requiredCitationIds": ["citation-1"],
        "requiredDisplayValues": ["47.2"],
    }
    output = {
        "summary": "안전여유는 47.2입니다.",
        "actions": [],
        "citedFactIds": ["fact-1"],
        "citationIds": ["citation-1"],
    }
    checks = required_contract_checks(record, output)
    if not all(checks.values()):
        raise SystemExit("SELF_TEST_VALID_CONTRACT_REJECTED")
    for key, changed in (
        ("requiredFactsValid", {**output, "citedFactIds": []}),
        ("requiredCitationsValid", {**output, "citationIds": []}),
        ("requiredDisplayValuesValid", {**output, "summary": "안전여유입니다."}),
    ):
        if required_contract_checks(record, changed)[key]:
            raise SystemExit(f"SELF_TEST_INVALID_CONTRACT_ACCEPTED key={key}")
    print("AX_CASCADE_PRODUCT_REVIEW_LOCAL_SELF_TEST_PASS cases=4")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--config", default="config/ax-cascade-product-review-v1.json"
    )
    parser.add_argument("--model-dir")
    parser.add_argument("--adapter-dir")
    parser.add_argument("--training-summary")
    parser.add_argument("--output-dir")
    parser.add_argument("--execute-qualification-run", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.execute_qualification_run:
        raise SystemExit("PRODUCT_REVIEW_REQUIRES_EXECUTE_QUALIFICATION_RUN")
    if not all([args.model_dir, args.adapter_dir, args.training_summary, args.output_dir]):
        raise SystemExit("PRODUCT_REVIEW_REQUIRES_MODEL_ADAPTER_TRAINING_AND_OUTPUT")

    root = Path.cwd().resolve()
    validation = load_validation_module(root)
    config_path = validation.resolve_under(root, args.config)
    config = validation.load_json(config_path)
    config_sha256 = validation.sha256_file(config_path)
    if (
        config.get("status") != "LOCKED_NOT_RUN"
        or config.get("productIntegrationApproved") is not False
        or config.get("localGate", {}).get("evaluationRunLimit") != 1
    ):
        raise SystemExit("PRODUCT_REVIEW_CONFIG_BOUNDARY_FAILED")
    training_config_path = validation.resolve_under(
        root, config["trainingConfigPath"]
    )
    if validation.sha256_file(training_config_path) != config["trainingConfigSha256"]:
        raise SystemExit("TRAINING_CONFIG_HASH_MISMATCH")
    training_config = validation.load_json(training_config_path)
    bundle_path = validation.resolve_under(root, config["bundlePath"])
    if validation.sha256_file(bundle_path) != config["bundleSha256"]:
        raise SystemExit("PRODUCT_REVIEW_BUNDLE_HASH_MISMATCH")
    bundle = validation.load_json(bundle_path)
    if (
        bundle.get("status") != "LOCKED_NOT_RUN"
        or bundle.get("taskCount") != config["localGate"]["taskCount"]
        or any(record.get("split") != "product-review" for record in bundle["records"])
    ):
        raise SystemExit("PRODUCT_REVIEW_BUNDLE_CONTRACT_FAILED")

    evidence_path = validation.resolve_under(root, config["qualificationEvidencePath"])
    if validation.sha256_file(evidence_path) != config["qualificationEvidenceSha256"]:
        raise SystemExit("QUALIFICATION_EVIDENCE_HASH_MISMATCH")
    evidence = validation.load_json(evidence_path)
    if (
        evidence.get("status") != "VERIFIED"
        or evidence.get("productIntegrationApproved") is not False
        or evidence.get("frozen", {}).get("status") != "FROZEN_GATE_PASS"
        or evidence.get("frozen", {}).get("rerunPermitted") is not False
    ):
        raise SystemExit("QUALIFICATION_EVIDENCE_BOUNDARY_FAILED")
    frozen_summary_path = validation.resolve_under(root, config["frozenSummaryPath"])
    if (
        validation.sha256_file(frozen_summary_path)
        != evidence["evidenceHashes"]["frozenSummary"]
    ):
        raise SystemExit("FROZEN_SUMMARY_HASH_MISMATCH")
    frozen_summary = validation.load_json(frozen_summary_path)

    hosted_path = validation.resolve_under(root, config["hostedReference"]["path"])
    if validation.sha256_file(hosted_path) != config["hostedReference"]["sha256"]:
        raise SystemExit("HOSTED_REFERENCE_HASH_MISMATCH")
    hosted_provider = verify_hosted_reference(
        validation.load_json(hosted_path), bundle, config
    )
    if (
        hosted_provider.get("providerMode") != "LIVE"
        or hosted_provider.get("promptVersion") != bundle["promptVersion"]
        or hosted_provider.get("metrics", {}).get("firstAttemptPassRate") != 1
    ):
        raise SystemExit("HOSTED_REFERENCE_QUALIFICATION_FAILED")

    model_dir = Path(args.model_dir).resolve()
    adapter_dir = Path(args.adapter_dir).resolve()
    training_summary_path = Path(args.training_summary).resolve()
    output_dir = Path(args.output_dir).resolve()
    if not model_dir.is_dir() or not adapter_dir.is_dir():
        raise SystemExit("MODEL_OR_ADAPTER_DIRECTORY_NOT_FOUND")
    if output_dir.exists() and any(output_dir.iterdir()):
        raise SystemExit("OUTPUT_DIRECTORY_MUST_BE_NEW_OR_EMPTY")
    output_dir.mkdir(parents=True, exist_ok=True)
    training_summary = validation.load_json(training_summary_path)
    if (
        training_summary.get("status") != "TRAINED_NOT_QUALIFIED"
        or validation.sha256_file(training_summary_path)
        != evidence["evidenceHashes"]["trainingSummary"]
        or training_summary.get("frozenRecordsRead") != 0
    ):
        raise SystemExit("TRAINING_SUMMARY_BOUNDARY_FAILED")

    training_module = validation.load_training_module(root)
    model_manifest = validation.load_json(
        validation.resolve_under(root, training_config["baseModel"]["manifestPath"])
    )
    training_module.verify_model_snapshot(model_dir, model_manifest)
    adapter_files = validation.adapter_manifest(adapter_dir)
    if adapter_files != frozen_summary["adapter"]:
        raise SystemExit("ADAPTER_MANIFEST_MISMATCH")
    adapter_model = next(
        (
            item
            for item in adapter_files["files"]
            if item["path"] == "adapter_model.safetensors"
        ),
        None,
    )
    if adapter_model is None:
        raise SystemExit("ADAPTER_MODEL_MISSING")

    try:
        import torch
        from peft import PeftModel
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError as error:
        raise SystemExit(
            f"PRODUCT_REVIEW_DEPENDENCY_MISSING module={error.name}"
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
        training_summary_path.parent / config["consumptionMarkerFilename"]
    )
    claim_attempt(
        marker_path,
        config["experimentId"],
        config_sha256,
        config["bundleSha256"],
        adapter_model["sha256"],
        output_dir,
    )
    print(f"PRODUCT_REVIEW_LOCAL_ATTEMPT_CLAIMED marker={marker_path}", flush=True)

    results_path = output_dir / "local-only-results.jsonl"
    results: list[dict[str, Any]] = []
    started_at = time.time()
    torch.cuda.reset_peak_memory_stats()
    with results_path.open("x", encoding="utf-8") as results_handle:
        for index, record in enumerate(bundle["records"], start=1):
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
                    max_new_tokens=int(config["generation"]["maxNewTokens"]),
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
            required_checks = required_contract_checks(record, parse_output(raw_output))
            failure_codes = list(checks["failureCodes"])
            for key, code in (
                ("requiredFactsValid", "REQUIRED_FACT_OMISSION"),
                ("requiredCitationsValid", "REQUIRED_CITATION_OMISSION"),
                ("requiredDisplayValuesValid", "DISPLAY_VALUE_OMISSION"),
            ):
                if not required_checks[key] and code not in failure_codes:
                    failure_codes.append(code)
            verified = checks["schemaValid"] and all(
                checks[key] is True
                for key in (
                    "numericIntegrityValid",
                    "citationIntegrityValid",
                    "rolePolicyValid",
                    "injectionIsolationValid",
                )
            ) and all(required_checks.values())
            result = {
                "taskId": record["recordId"],
                "role": record["role"],
                "containsUntrustedInstruction": record[
                    "containsUntrustedInstruction"
                ],
                "status": "PASSED" if verified else "SAFE_FALLBACK",
                **{key: value for key, value in checks.items() if key != "failureCodes"},
                **required_checks,
                "failureCodes": failure_codes,
                "outputSha256": validation.sha256_text(raw_output),
                "promptTokens": int(encoded["input_ids"].shape[1]),
                "completionTokens": int(generated_ids.shape[0]),
                "generationMs": (time.perf_counter() - generation_started) * 1000,
                "unsafeDisplayCount": 0,
            }
            results.append(result)
            results_handle.write(json.dumps(result, ensure_ascii=False) + "\n")
            results_handle.flush()
            print(
                f"PRODUCT_REVIEW_LOCAL_PROGRESS completed={index}/{len(bundle['records'])} "
                f"passed={sum(item['status'] == 'PASSED' for item in results)}",
                flush=True,
            )

    schema_valid = [item for item in results if item["schemaValid"]]
    injection = [item for item in results if item["containsUntrustedInstruction"]]
    rate = validation.rate
    metrics = {
        "passed": sum(item["status"] == "PASSED" for item in results),
        "safeFallback": sum(item["status"] == "SAFE_FALLBACK" for item in results),
        "schemaPassRate": rate(len(schema_valid), len(results)),
        "numericIntegrityRateAmongSchemaValid": rate(
            sum(item["numericIntegrityValid"] is True for item in schema_valid),
            len(schema_valid),
        ),
        "citationIntegrityRateAmongSchemaValid": rate(
            sum(item["citationIntegrityValid"] is True for item in schema_valid),
            len(schema_valid),
        ),
        "rolePolicyRateAmongSchemaValid": rate(
            sum(item["rolePolicyValid"] is True for item in schema_valid),
            len(schema_valid),
        ),
        "injectionIsolationRate": rate(
            sum(item["injectionIsolationValid"] is True for item in injection),
            len(injection),
        ),
        "requiredFactRate": rate(
            sum(item["requiredFactsValid"] is True for item in results), len(results)
        ),
        "requiredCitationRate": rate(
            sum(item["requiredCitationsValid"] is True for item in results),
            len(results),
        ),
        "requiredDisplayValueRate": rate(
            sum(item["requiredDisplayValuesValid"] is True for item in results),
            len(results),
        ),
        "exactContractMatchRate": rate(
            sum(item["exactContractMatch"] is True for item in results), len(results)
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
        "unsafeDisplayCount": 0,
        "failureCodes": {},
    }
    for code in (code for result in results for code in result["failureCodes"]):
        metrics["failureCodes"][code] = metrics["failureCodes"].get(code, 0) + 1
    gate = config["localGate"]
    passed = (
        metrics["passed"] == gate["taskCount"]
        and metrics["schemaPassRate"] >= gate["schemaPassRateMinimum"]
        and metrics["numericIntegrityRateAmongSchemaValid"]
        >= gate["numericIntegrityRateMinimum"]
        and metrics["citationIntegrityRateAmongSchemaValid"]
        >= gate["citationIntegrityRateMinimum"]
        and metrics["rolePolicyRateAmongSchemaValid"]
        >= gate["rolePolicyRateMinimum"]
        and metrics["injectionIsolationRate"]
        >= gate["injectionIsolationRateMinimum"]
        and metrics["requiredFactRate"] >= gate["requiredFactRateMinimum"]
        and metrics["requiredCitationRate"]
        >= gate["requiredCitationRateMinimum"]
        and metrics["requiredDisplayValueRate"]
        >= gate["requiredDisplayValueRateMinimum"]
        and metrics["unsafeDisplayCount"] <= gate["unsafeDisplayCountMaximum"]
    )
    summary = {
        "schemaVersion": SCHEMA_VERSION,
        "evaluatorVersion": EVALUATOR_VERSION,
        "status": "LOCAL_COMPARISON_PASS" if passed else "LOCAL_COMPARISON_FAIL",
        "experimentId": config["experimentId"],
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "taskSuite": bundle["sourceTaskSuite"],
        "taskCount": len(results),
        "bundleSha256": config["bundleSha256"],
        "configSha256": config_sha256,
        "qualificationEvidenceSha256": config["qualificationEvidenceSha256"],
        "trainingSummarySha256": validation.sha256_file(training_summary_path),
        "adapter": adapter_files,
        "hostedReference": {
            "providerId": hosted_provider["providerId"],
            "model": hosted_provider["model"],
            "evidenceSha256": config["hostedReference"]["sha256"],
            "taskCount": hosted_provider["taskCount"],
            "passed": hosted_provider["metrics"]["passed"],
            "unsafeDisplayCount": hosted_provider["metrics"]["unsafeDisplayCount"],
        },
        "comparisonRecordsRead": len(results),
        "frozenRecordsRead": 0,
        "evaluationAttempts": 1,
        "rerunPermitted": False,
        "generation": config["generation"],
        "metrics": {
            **metrics,
            "evaluationSeconds": time.time() - started_at,
            "peakCudaMemoryMiB": torch.cuda.max_memory_allocated()
            / (1024 * 1024),
        },
        "qualificationGate": gate,
        "privacy": {
            "promptStored": False,
            "rawOutputStored": False,
            "actualPersonalDataCount": 0,
        },
        "productIntegrationApproved": False,
        "nextGate": "assemble-independent-cascade-comparison",
        "trainingDevice": {
            "name": device_name,
            "totalMemoryMiB": device_memory_bytes / (1024 * 1024),
        },
    }
    summary_path = output_dir / "local-only-summary.json"
    with summary_path.open("x", encoding="utf-8") as handle:
        json.dump(summary, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(
        f"AX_CASCADE_PRODUCT_REVIEW_{summary['status']} "
        f"passed={metrics['passed']}/{len(results)} "
        f"fallback={metrics['safeFallback']} unsafe=0 frozenRead=0 rerun=false",
        flush=True,
    )
    print(f"SUMMARY={summary_path}", flush=True)


if __name__ == "__main__":
    main()
