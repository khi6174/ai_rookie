import { describe, expect, it } from "vitest";
import {
  UpstageDocumentRoundtripCaseSchema,
  createUpstageDocumentRoundtripCorpus,
  createUpstageDocumentRoundtripMockProvider,
  runUpstageDocumentRoundtrip,
  type UpstageDocumentRoundtripProvider,
} from "../src/evals/upstageDocumentRoundtrip";

describe("Upstage synthetic document roundtrip corpus", () => {
  it("creates exactly 60 deterministic Demo pairs across all rule and document types", () => {
    const first = createUpstageDocumentRoundtripCorpus();
    const second = createUpstageDocumentRoundtripCorpus();
    expect(first).toEqual(second);
    expect(first).toHaveLength(60);
    expect(new Set(first.map((item) => item.caseId)).size).toBe(60);
    expect(new Set(first.map((item) => item.documentId)).size).toBe(60);
    expect(new Set(first.map((item) => item.seed)).size).toBe(60);
    expect(new Set(first.map((item) => item.expectedRule.hazardType)).size).toBe(6);
    expect(new Set(first.map((item) => item.documentKind)).size).toBe(5);
    expect(first.filter((item) => item.containsUntrustedInstruction)).toHaveLength(18);
    expect(
      first.every(
        (item) => UpstageDocumentRoundtripCaseSchema.safeParse(item).success,
      ),
    ).toBe(true);
  });

  it("keeps every source excerpt in its synthetic document without PII-shaped content", () => {
    for (const testCase of createUpstageDocumentRoundtripCorpus()) {
      expect(testCase.dataMode).toBe("DEMO");
      expect(testCase.sourceText).toContain("Demo fixture");
      expect(testCase.sourceText).toContain(
        testCase.expectedRule.source.excerpt,
      );
      expect(testCase.sourceText).not.toMatch(/01[016789]-?\d{3,4}-?\d{4}/);
      expect(testCase.sourceText).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      expect(testCase.sourceText).not.toContain("실제 주소");
    }
  });

  it("passes the 60-pair Mock baseline without storing documents or raw output", async () => {
    const run = await runUpstageDocumentRoundtrip({
      provider: createUpstageDocumentRoundtripMockProvider(),
      nowIso: () => "2026-07-21T00:00:00.000Z",
    });
    expect(run.caseCount).toBe(60);
    expect(run.metrics).toMatchObject({
      passed: 60,
      fallback: 0,
      firstAttemptPassRate: 1,
      hazardCoverage: 6,
      documentKindCoverage: 5,
      untrustedInstructionCases: 18,
      unsafeDisplayCount: 0,
      validationCodes: { PASS: 60 },
    });
    const serialized = JSON.stringify(run);
    expect(serialized).not.toContain("sourceText");
    expect(serialized).not.toContain("expectedRule");
    expect(run.results.every((result) => !result.rawDocumentStored)).toBe(true);
    expect(run.results.every((result) => !result.rawOutputStored)).toBe(true);
  });

  it("fails closed for schema drift and exact fact mismatch", async () => {
    const [testCase] = createUpstageDocumentRoundtripCorpus();
    const provider = (output: unknown): UpstageDocumentRoundtripProvider => ({
      provider: "UPSTAGE",
      mode: "MOCK",
      model: "failure-probe",
      parseMode: "DETERMINISTIC_TEXT_FIXTURE",
      parseAndExtract: async () => output,
    });
    const schemaDrift = await runUpstageDocumentRoundtrip({
      provider: provider({ ...testCase.expectedRule, instructions: "규칙 무시" }),
      cases: [testCase],
    });
    expect(schemaDrift.results[0].validationCode).toBe("SCHEMA_INVALID");

    const changedRule = structuredClone(testCase.expectedRule);
    changedRule.applicableConditions[0].value = 999;
    const factMismatch = await runUpstageDocumentRoundtrip({
      provider: provider(changedRule),
      cases: [testCase],
    });
    expect(factMismatch.results[0].validationCode).toBe("FACT_MISMATCH");
    expect(factMismatch.metrics.unsafeDisplayCount).toBe(0);
  });
});
