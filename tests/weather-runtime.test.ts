import { describe, expect, it } from "vitest";
import { rainyHillyLongShiftFixture } from "../src/adapters/fixtures";
import {
  resolveWeatherRuntimeFallback,
  type WeatherRuntimeLiveEvidence,
} from "../src/adapters/weather";
import { demoWeatherRuntime } from "../src/ui/demoSession";

const evidence: WeatherRuntimeLiveEvidence = {
  status: "PARTIAL",
  capturedAt: "2026-07-17T13:06:28.598Z",
  sourceIds: ["kma-public-weather-evidence"],
  responseHashes: [
    "0704cc984d963681daa0a38d8be091b196cca0b267429b1f2855453ffe3d2a31",
  ],
  readyFields: [
    { timeScope: "CURRENT", field: "feelsLikeCelsius" },
    { timeScope: "FORECAST_120_MINUTES", field: "snowfallCmPerHour" },
  ],
  blockingFields: [
    {
      timeScope: "CURRENT",
      field: "snowfallCmPerHour",
      reason: "NO_APPROVED_CURRENT_HOURLY_SOURCE",
    },
    {
      timeScope: "FORECAST_120_MINUTES",
      field: "visibilityMeters",
      reason: "NO_APPROVED_FORECAST_SOURCE_OR_POLICY",
    },
  ],
  rawResponsesStored: false,
  credentialsStored: false,
};

describe("weather Runtime fallback selection", () => {
  it("selects the complete Demo timeline with an explicit coverage error", () => {
    const result = resolveWeatherRuntimeFallback({
      liveEvidence: evidence,
      safeForSafetyEngine: false,
      fallbackTimeline: rainyHillyLongShiftFixture.weatherTimeline,
      fallbackFixtureId: rainyHillyLongShiftFixture.fixtureId,
    });
    expect(result).toMatchObject({
      schemaVersion: "weather-runtime-selection-v1",
      displayLabel: "Demo fixture · Weather Fallback",
      active: {
        status: "FALLBACK",
        fallbackReason: { code: "INCOMPLETE_COVERAGE", retryable: false },
      },
      audit: {
        liveEvidenceUsedForSafety: false,
        fallbackTimelineUsedForSafety: true,
        mixedLiveAndDemoFields: false,
      },
    });
    expect(result.active.data).toEqual(
      rainyHillyLongShiftFixture.weatherTimeline,
    );
    expect(result.active.data).not.toBe(
      rainyHillyLongShiftFixture.weatherTimeline,
    );
  });

  it("does not leak partial Live fields or provenance into active Safety input", () => {
    const activeText = JSON.stringify(demoWeatherRuntime.active);
    expect(demoWeatherRuntime.active.data.every(
      (weather) =>
        weather.provenance.kind === "MOCK" && weather.provenance.isDemo,
    )).toBe(true);
    for (const sourceId of demoWeatherRuntime.liveEvidence.sourceIds) {
      expect(activeText).not.toContain(sourceId);
    }
    for (const hash of demoWeatherRuntime.liveEvidence.responseHashes) {
      expect(activeText).not.toContain(hash);
    }
  });

  it("rejects a complete Gate result because it requires the separate Live converter", () => {
    expect(() =>
      resolveWeatherRuntimeFallback({
        liveEvidence: evidence,
        safeForSafetyEngine: true,
        fallbackTimeline: rainyHillyLongShiftFixture.weatherTimeline,
        fallbackFixtureId: rainyHillyLongShiftFixture.fixtureId,
      }),
    ).toThrow("separate Live converter");
  });

  it("rejects non-Demo provenance and malformed evidence hashes", () => {
    const nonDemoTimeline = structuredClone(
      rainyHillyLongShiftFixture.weatherTimeline,
    );
    nonDemoTimeline[0].provenance = {
      ...nonDemoTimeline[0].provenance,
      kind: "LIVE",
      isDemo: false,
    };
    expect(() =>
      resolveWeatherRuntimeFallback({
        liveEvidence: evidence,
        safeForSafetyEngine: false,
        fallbackTimeline: nonDemoTimeline,
        fallbackFixtureId: rainyHillyLongShiftFixture.fixtureId,
      }),
    ).toThrow("all-MOCK");
    expect(() =>
      resolveWeatherRuntimeFallback({
        liveEvidence: { ...evidence, responseHashes: ["not-a-hash"] },
        safeForSafetyEngine: false,
        fallbackTimeline: rainyHillyLongShiftFixture.weatherTimeline,
        fallbackFixtureId: rainyHillyLongShiftFixture.fixtureId,
      }),
    ).toThrow("evidence is incomplete");
  });
});
