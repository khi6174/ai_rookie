import { describe, expect, it } from "vitest";
import {
  SyntheticCascadeTrainingSchemas,
  createSyntheticCascadeTrainingDataset,
  validateSyntheticCascadeTrainingDataset,
} from "../src/evals/syntheticCascadeTrainingDataset";

describe("synthetic Cascade explanation training dataset", () => {
  it("creates 400 deterministic parents and 1,600 role-scoped records", () => {
    const first = createSyntheticCascadeTrainingDataset();
    const second = createSyntheticCascadeTrainingDataset();
    expect(first).toEqual(second);
    expect(first.parents).toHaveLength(400);
    expect(first.records).toHaveLength(1_600);
    expect(new Set(first.parents.map((parent) => parent.parentRecordId)).size).toBe(
      400,
    );
    expect(new Set(first.records.map((record) => record.recordId)).size).toBe(
      1_600,
    );
    expect(
      first.records.every(
        (record) => SyntheticCascadeTrainingSchemas.record.safeParse(record).success,
      ),
    ).toBe(true);
  });

  it("splits by parent and keeps every role inside the same split", () => {
    const dataset = createSyntheticCascadeTrainingDataset();
    const report = validateSyntheticCascadeTrainingDataset(dataset);
    expect(report.passed).toBe(true);
    expect(report.parentSplitCounts).toEqual({
      train: 300,
      validation: 50,
      "frozen-test": 50,
    });
    expect(report.splitCounts).toEqual({
      train: 1_200,
      validation: 200,
      "frozen-test": 200,
    });
    expect(report.roleCounts).toEqual({
      COURIER: 400,
      ADMIN: 400,
      CUSTOMER: 400,
      REPORT: 400,
    });
    expect(report.splitLeakageCount).toBe(0);
  });

  it("validates numeric integrity, privacy, injection and coverage contracts", () => {
    const report = validateSyntheticCascadeTrainingDataset(
      createSyntheticCascadeTrainingDataset(),
    );
    expect(report.outputIntegrityViolationCount).toBe(0);
    expect(report.privacyViolationCount).toBe(0);
    expect(report.exactDuplicateCount).toBe(0);
    expect(report.promptInjectionCases).toBe(150);
    expect(report.scenarioCounts).toEqual({
      RAIN_TRAFFIC: 50,
      HEAT_STAIRS: 50,
      LOW_VISIBILITY: 50,
      API_PARTIAL: 50,
      TRANSFER_GUARD: 50,
      CONSENT_WAIT: 50,
      STALE_DATA: 50,
      PROMPT_INJECTION: 50,
    });
  });

  it("keeps customer records free of courier decisions and citations", () => {
    const dataset = createSyntheticCascadeTrainingDataset();
    const customerRecords = dataset.records.filter(
      (record) => record.role === "CUSTOMER",
    );
    expect(customerRecords).toHaveLength(400);
    for (const record of customerRecords) {
      expect(record.input.allowedCitations).toEqual([]);
      expect(record.input.allowedActions).toEqual([]);
      expect(JSON.stringify(record.input)).not.toContain("기사 응답");
      expect(JSON.stringify(record.input)).not.toContain("배송 분담");
    }
  });

  it("fails closed when output numbers change or a role crosses parent splits", () => {
    const dataset = structuredClone(createSyntheticCascadeTrainingDataset());
    dataset.records[0].expectedOutput.summary += " 지원 점수 999";
    dataset.records[1].split = "frozen-test";
    const report = validateSyntheticCascadeTrainingDataset(dataset);
    expect(report.passed).toBe(false);
    expect(report.outputIntegrityViolationCount).toBe(1);
    expect(report.splitLeakageCount).toBe(1);
    expect(report.validationCodes).toMatchObject({
      OUTPUT_INTEGRITY_INVALID: 1,
      PARENT_SPLIT_LEAKAGE: 1,
    });
  });
});
