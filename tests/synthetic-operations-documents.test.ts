import { describe, expect, it } from "vitest";
import {
  SyntheticOperationsSchemas,
  createSyntheticOperationsDataset,
  validateSyntheticOperationsDataset,
} from "../src/evals/syntheticOperationsDocuments";

describe("deterministic synthetic operations documents", () => {
  it("creates 25 parent records and exactly 100 deterministic documents", () => {
    const first = createSyntheticOperationsDataset();
    const second = createSyntheticOperationsDataset();
    expect(first).toEqual(second);
    expect(first.parents).toHaveLength(25);
    expect(first.documents).toHaveLength(100);
    expect(new Set(first.parents.map((item) => item.parentRecordId)).size).toBe(
      25,
    );
    expect(new Set(first.documents.map((item) => item.documentId)).size).toBe(
      100,
    );
    expect(
      first.parents.every(
        (item) => SyntheticOperationsSchemas.parent.safeParse(item).success,
      ),
    ).toBe(true);
    expect(
      first.documents.every(
        (item) => SyntheticOperationsSchemas.document.safeParse(item).success,
      ),
    ).toBe(true);
  });

  it("splits by parent record and covers four operational document types", () => {
    const dataset = createSyntheticOperationsDataset();
    const report = validateSyntheticOperationsDataset(dataset);
    expect(report.passed).toBe(true);
    expect(report.splitCounts).toEqual({
      development: 60,
      validation: 20,
      "frozen-test": 20,
    });
    expect(report.documentKindCounts).toEqual({
      DELIVERY_WORK_SHEET: 25,
      SHIFT_ROSTER: 25,
      ROUTE_STOP_MANIFEST: 25,
      SAFETY_INCIDENT_PREVENTION_REPORT: 25,
    });
    for (const parent of dataset.parents) {
      const documents = dataset.documents.filter(
        (document) => document.parentRecordId === parent.parentRecordId,
      );
      expect(documents).toHaveLength(4);
      expect(documents.every((document) => document.split === parent.split)).toBe(
        true,
      );
    }
  });

  it("keeps exact source facts and temporal references across all documents", () => {
    const dataset = createSyntheticOperationsDataset();
    const report = validateSyntheticOperationsDataset(dataset);
    expect(report.referentialIntegrityViolationCount).toBe(0);
    expect(report.temporalConstraintViolationCount).toBe(0);
    expect(report.semanticFidelityViolationCount).toBe(0);
    for (const parent of dataset.parents) {
      const routeDocument = dataset.documents.find(
        (document) =>
          document.parentRecordId === parent.parentRecordId &&
          document.documentKind === "ROUTE_STOP_MANIFEST",
      );
      expect(routeDocument).toBeDefined();
      for (const stop of parent.plan.stops) {
        expect(routeDocument!.content).toContain(stop.stopId);
      }
    }
  });

  it("contains no real-person-shaped data, precise coordinates, biometrics, or AI-owned decisions", () => {
    const dataset = createSyntheticOperationsDataset();
    const report = validateSyntheticOperationsDataset(dataset);
    expect(report.privacyViolationCount).toBe(0);
    expect(report.safetyBoundaryViolationCount).toBe(0);
    expect(report.promptInjectionCases).toBe(5);
    expect(report.exactDuplicateCount).toBe(0);
    const serialized = JSON.stringify(dataset);
    expect(serialized).not.toMatch(/01[016789]-?\d{3,4}-?\d{4}/);
    expect(serialized).not.toMatch(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    );
    expect(serialized).not.toContain("customerAddress");
    expect(serialized).not.toContain("preciseLatitude");
    expect(serialized).not.toContain("rawHeartRate");
    expect(serialized).not.toContain("accidentProbability");
    expect(serialized).not.toContain("courierRank");
    expect(serialized).not.toContain("safetyBudget");
  });

  it("fails closed when a document is altered or moved across parent splits", () => {
    const altered = structuredClone(createSyntheticOperationsDataset());
    altered.documents[0].content += "\n지원되지 않은 사실 999건";
    altered.documents[1].split = "frozen-test";
    const report = validateSyntheticOperationsDataset(altered);
    expect(report.passed).toBe(false);
    expect(report.semanticFidelityViolationCount).toBe(1);
    expect(report.referentialIntegrityViolationCount).toBe(1);
    expect(report.validationCodes).toMatchObject({
      SEMANTIC_FIDELITY_INVALID: 1,
      PARENT_REFERENCE_INVALID: 1,
    });
  });
});
