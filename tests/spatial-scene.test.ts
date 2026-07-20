import { describe, expect, it } from "vitest";
import { multiRegionMapFixture } from "../src/adapters/fixtures";
import {
  createDecisionSpatialScene,
  createFixtureMapAdapter,
  validateSpatialSceneAgainstMapModel,
} from "../src/adapters/maps";
import { DecisionSpatialSceneSchema } from "../src/domain/contracts";

describe("G5-A deterministic decision spatial scene", () => {
  const decision = multiRegionMapFixture.decisions[0];
  const scene = createDecisionSpatialScene(
    multiRegionMapFixture,
    decision.decisionId,
  );
  const adapter = createFixtureMapAdapter(multiRegionMapFixture);
  const model = adapter.getModel(
    adapter.selectionForDecision(decision.decisionId),
  );

  it("reproduces the same validated JSON and SHA-256", async () => {
    const repeated = createDecisionSpatialScene(
      multiRegionMapFixture,
      decision.decisionId,
    );
    const serialize = (value: unknown) => JSON.stringify(value);
    const hash = async (value: unknown) => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(serialize(value)),
      );
      return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    };
    expect(repeated).toEqual(scene);
    expect(await hash(repeated)).toBe(await hash(scene));
    expect(DecisionSpatialSceneSchema.parse(scene)).toEqual(scene);
  });

  it("matches the 2D decision, plan, route, and route-point order exactly", () => {
    expect(validateSpatialSceneAgainstMapModel(scene, model)).toEqual({
      valid: true,
    });
    expect(scene.decisionId).toBe(model.selectedDecision?.decisionId);
    expect(scene.planId).toBe(model.selection.planId);
    expect(scene.routeId).toBe(model.routes[0].routeId);
    expect(scene.samples.map((sample) => sample.point)).toEqual(
      model.routes[0].geographicPoints,
    );
  });

  it("keeps approved Safety display facts deterministic and AI-independent", () => {
    expect(scene.decisionFacts).toEqual({
      timeToBreachMinutes: 52,
      breachStopOrdinal: 17,
      baselineMinimumBudget: 29.9,
      adjustedMinimumBudget: 47.2,
      restMinutes: 10,
      transferStopCount: 8,
      etaChangeMinutes: 8,
      riskFactors: ["RAIN", "SLOPE", "CONTINUOUS_WORK"],
    });
    expect(scene.dataMode).toBe("DEMO");
    expect(
      scene.provenance.every(
        (record) => record.kind === "MOCK" && record.isDemo,
      ),
    ).toBe(true);
  });

  it("blocks a scene outside decision scope", () => {
    expect(validateSpatialSceneAgainstMapModel(scene, adapter.getModel())).toEqual({
      valid: false,
      code: "NOT_DECISION_SCOPE",
    });
  });

  it("blocks identifier and route-point mismatches", () => {
    expect(
      validateSpatialSceneAgainstMapModel(
        { ...scene, routeId: "other-route" },
        model,
      ),
    ).toEqual({ valid: false, code: "IDENTIFIER_MISMATCH" });
    const movedScene = {
      ...scene,
      samples: scene.samples.map((sample, index) =>
        index === 1
          ? {
              ...sample,
              point: {
                ...sample.point,
                latitude: sample.point.latitude + 0.001,
              },
            }
          : sample,
      ),
    };
    expect(validateSpatialSceneAgainstMapModel(movedScene, model)).toEqual({
      valid: false,
      code: "ROUTE_POINT_MISMATCH",
    });
  });

  it("rejects non-monotonic distance and a missing breach marker", () => {
    const nonMonotonic = {
      ...scene,
      samples: scene.samples.map((sample, index) =>
        index === 2 ? { ...sample, distanceFromStartMeters: 700 } : sample,
      ),
    };
    expect(DecisionSpatialSceneSchema.safeParse(nonMonotonic).success).toBe(false);
    const noBreach = {
      ...scene,
      samples: scene.samples.map((sample) =>
        sample.segmentKind === "BREACH_POINT"
          ? { ...sample, segmentKind: "NORMAL" as const }
          : sample,
      ),
    };
    expect(DecisionSpatialSceneSchema.safeParse(noBreach).success).toBe(false);
  });

  it("rejects Live provenance and a non-improving intervention", () => {
    const liveProvenance = {
      ...scene.provenance[0],
      kind: "LIVE" as const,
      isDemo: false,
    };
    expect(
      DecisionSpatialSceneSchema.safeParse({
        ...scene,
        provenance: [liveProvenance],
      }).success,
    ).toBe(false);
    expect(
      DecisionSpatialSceneSchema.safeParse({
        ...scene,
        decisionFacts: {
          ...scene.decisionFacts,
          adjustedMinimumBudget: scene.decisionFacts.baselineMinimumBudget,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects unknown decisions instead of inventing spatial facts", () => {
    expect(() =>
      createDecisionSpatialScene(multiRegionMapFixture, "unknown-decision"),
    ).toThrow("Unknown spatial decision");
  });
});
