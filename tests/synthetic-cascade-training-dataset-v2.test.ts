import { describe, expect, it } from "vitest";
import {
  SyntheticCascadeTrainingV2Schemas,
  createSyntheticCascadeTrainingDatasetV2,
  validateSyntheticCascadeTrainingDatasetV2,
} from "../src/evals/syntheticCascadeTrainingDatasetV2";

describe("synthetic Cascade v2 contract-hardening dataset", () => {
  it("creates 600 new parents and 2,400 deterministic role records", () => {
    const first = createSyntheticCascadeTrainingDatasetV2();
    const second = createSyntheticCascadeTrainingDatasetV2();
    expect(first).toEqual(second);
    expect(first.parents).toHaveLength(600);
    expect(first.records).toHaveLength(2_400);
    expect(new Set(first.parents.map((parent) => parent.parentRecordId)).size).toBe(
      600,
    );
    expect(
      first.records.every(
        (record) =>
          SyntheticCascadeTrainingV2Schemas.record.safeParse(record).success,
      ),
    ).toBe(true);
  });

  it("keeps parent splits isolated at 1,800/300/300 records", () => {
    const report = validateSyntheticCascadeTrainingDatasetV2(
      createSyntheticCascadeTrainingDatasetV2(),
    );
    expect(report.passed).toBe(true);
    expect(report.parentSplitCounts).toEqual({
      train: 450,
      validation: 75,
      "frozen-test": 75,
    });
    expect(report.splitCounts).toEqual({
      train: 1_800,
      validation: 300,
      "frozen-test": 300,
    });
    expect(report.splitLeakageCount).toBe(0);
  });

  it("balances ten scenarios and six contract profiles", () => {
    const report = validateSyntheticCascadeTrainingDatasetV2(
      createSyntheticCascadeTrainingDatasetV2(),
    );
    expect(Object.values(report.scenarioCounts)).toEqual(Array(10).fill(60));
    expect(Object.values(report.contractProfileCounts)).toEqual(
      Array(6).fill(100),
    );
    expect(report.promptInjectionCases).toBe(360);
    expect(report.numericDisplayAnchors).toBeGreaterThan(7_000);
    expect(report.citationAnchors).toBeGreaterThan(1_800);
  });

  it("fully anchors display values and citations without prior outputs", () => {
    const dataset = createSyntheticCascadeTrainingDatasetV2();
    const report = validateSyntheticCascadeTrainingDatasetV2(dataset);
    expect(report.displayCoverageViolationCount).toBe(0);
    expect(report.citationCoverageViolationCount).toBe(0);
    expect(report.contaminationBoundaryViolationCount).toBe(0);
    expect(report.outputIntegrityViolationCount).toBe(0);
    expect(report.exactDuplicateCount).toBe(0);
    expect(
      dataset.records.every(
        (record) =>
          record.sourceDatasetCount === 0 &&
          record.sourceEvaluationOutputCount === 0,
      ),
    ).toBe(true);
  });

  it("keeps customer records free of citations, actions and courier decisions", () => {
    const customerRecords = createSyntheticCascadeTrainingDatasetV2().records.filter(
      (record) => record.role === "CUSTOMER",
    );
    expect(customerRecords).toHaveLength(600);
    for (const record of customerRecords) {
      expect(record.input.allowedCitations).toEqual([]);
      expect(record.input.allowedActions).toEqual([]);
      expect(JSON.stringify(record.input)).not.toContain("기사 응답");
      expect(JSON.stringify(record.input)).not.toContain("배송 분담");
    }
  });

  it("fails closed on display omission, prior-output reuse and split leakage", () => {
    const dataset = structuredClone(createSyntheticCascadeTrainingDatasetV2());
    dataset.records[0].expectedOutput.summary = "표시값이 누락된 합성 출력입니다.";
    (dataset.records[1] as { sourceEvaluationOutputCount: number }).sourceEvaluationOutputCount = 1;
    dataset.records[2].split = "frozen-test";
    const report = validateSyntheticCascadeTrainingDatasetV2(dataset);
    expect(report.passed).toBe(false);
    expect(report.displayCoverageViolationCount).toBeGreaterThan(0);
    expect(report.contaminationBoundaryViolationCount).toBe(1);
    expect(report.splitLeakageCount).toBe(1);
    expect(report.validationCodes).toMatchObject({
      DISPLAY_VALUE_COVERAGE_INVALID: 1,
      PRIOR_DATA_OR_EVALUATION_REUSE_DETECTED: 1,
      PARENT_SPLIT_LEAKAGE: 1,
    });
  });
});
