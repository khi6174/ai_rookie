import { describe, expect, it } from "vitest";
import {
  interpolateRiderLocationPoint,
  isValidRiderLocationPoint,
  riderLocationErrorState,
  riderLocationFromPosition,
  riderMapMarkerSizePx,
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

  it("scales the truck marker down as the map zooms out and respects narrow maps", () => {
    expect(riderMapMarkerSizePx(1, 390)).toBeGreaterThan(riderMapMarkerSizePx(3, 390));
    expect(riderMapMarkerSizePx(3, 390)).toBeGreaterThan(riderMapMarkerSizePx(7, 390));
    expect(riderMapMarkerSizePx(3, 300)).toBeLessThan(riderMapMarkerSizePx(3, 390));
    expect(riderMapMarkerSizePx(-20, 1000)).toBe(108);
    expect(riderMapMarkerSizePx(99, 100)).toBe(50);
  });

  it("interpolates only between the supplied device observations", () => {
    const from = { latitude: 37.5, longitude: 127.03 };
    const to = { latitude: 37.502, longitude: 127.034 };

    expect(interpolateRiderLocationPoint(from, to, -1)).toEqual(from);
    const midpoint = interpolateRiderLocationPoint(from, to, 0.5);
    expect(midpoint.latitude).toBeCloseTo(37.501, 9);
    expect(midpoint.longitude).toBeCloseTo(127.032, 9);
    expect(interpolateRiderLocationPoint(from, to, 2)).toEqual(to);
  });
});
