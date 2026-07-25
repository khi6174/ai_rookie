import { describe, expect, it } from "vitest";
import {
  createA100OperationsBenchmarkBundle,
  validateA100OperationsBenchmarkBundle,
} from "../src/evals/a100OperationsDocuments";

describe("A100 operations document bundle", () => {
  it("freezes 100 synthetic tasks across development, validation and frozen test", () => {
    const bundle = createA100OperationsBenchmarkBundle();
    const validation = validateA100OperationsBenchmarkBundle(bundle);
    expect(validation).toMatchObject({
      passed: true,
      taskCount: 100,
      splitCounts: { development: 60, validation: 20, "frozen-test": 20 },
      documentKindCounts: {
        DELIVERY_WORK_SHEET: 25,
        SHIFT_ROSTER: 25,
        ROUTE_STOP_MANIFEST: 25,
        SAFETY_INCIDENT_PREVENTION_REPORT: 25,
      },
      promptInjectionCases: 5,
      citationViolationCount: 0,
      exactContractViolationCount: 0,
    });
  });

  it("keeps every expected value inside its exact source citation", () => {
    const bundle = createA100OperationsBenchmarkBundle();
    for (const task of bundle.tasks) {
      for (const fact of task.expected.facts) {
        expect(task.sourceDocument).toContain(fact.citation);
        expect(fact.citation).toContain(fact.displayValue);
      }
      expect(task.sourceDocument).not.toMatch(
        /(?:010-\d{4}-\d{4}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
      );
    }
  });

  it("is deterministic and detects a mutated frozen contract", () => {
    const first = createA100OperationsBenchmarkBundle();
    const second = createA100OperationsBenchmarkBundle();
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));

    const mutated = structuredClone(first);
    const frozenTask = mutated.tasks.find(
      (task) => task.expected.split === "frozen-test",
    );
    expect(frozenTask).toBeDefined();
    frozenTask!.expected.facts[0].displayValue = "변조값";
    const validation = validateA100OperationsBenchmarkBundle(mutated);
    expect(validation.passed).toBe(false);
    expect(validation.validationCodes).toHaveProperty(
      "CITATION_CONTRACT_INVALID",
    );
    expect(validation.validationCodes).toHaveProperty("EXACT_CONTRACT_MISMATCH");
  });
});
