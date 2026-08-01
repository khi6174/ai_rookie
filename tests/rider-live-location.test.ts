import { describe, expect, it } from "vitest";
import {
  isValidRiderLocationPoint,
  riderLocationErrorState,
  riderLocationFromPosition,
} from "../src/application/riderLiveLocation";

describe("rider device location boundary", () => {
  it("accepts a finite browser position without adding persistence fields", () => {
    const state = riderLocationFromPosition({
      coords: {
        latitude: 37.50091,
        longitude: 127.03642,
        accuracy: 8.4,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: Date.parse("2026-08-01T01:21:00.000Z"),
    });

    expect(state).toEqual({
      status: "CURRENT",
      point: { latitude: 37.50091, longitude: 127.03642 },
      accuracyMeters: 8.4,
      capturedAt: "2026-08-01T01:21:00.000Z",
    });
    expect(Object.keys(state)).not.toContain("courierId");
    expect(Object.keys(state)).not.toContain("history");
  });

  it("rejects invalid coordinates and distinguishes permission denial", () => {
    expect(isValidRiderLocationPoint({ latitude: 91, longitude: 127 })).toBe(false);
    expect(riderLocationErrorState(1)).toEqual({ status: "PERMISSION_DENIED" });
    expect(riderLocationErrorState(2)).toEqual({ status: "UNAVAILABLE" });
    expect(riderLocationErrorState(3)).toEqual({ status: "ERROR" });
  });
});
