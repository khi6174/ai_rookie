import { describe, expect, it } from "vitest";
import { riderProfiles } from "../src/application/riderProfileRepository";
import {
  riderMapMarkerScale,
  riderRoutePolyline,
  riderRoutePosition,
  riderRoutePositionAtProgress,
} from "../src/application/riderMapPresentation";

describe("shared rider map presentation", () => {
  it("returns the same road position for the rider app and dashboard inputs", () => {
    const movementSecond = 1_785_544_400;

    for (const profile of riderProfiles) {
      const riderPoint = riderRoutePosition(profile, movementSecond);
      const dashboardPoint = riderRoutePosition({
        courierId: profile.courierId,
        areaCode: profile.areaCode,
        mapX: profile.mapX,
        mapY: profile.mapY,
      }, movementSecond);

      expect(dashboardPoint).toEqual(riderPoint);
      expect(riderPoint.latitude).toBeGreaterThanOrEqual(37.46);
      expect(riderPoint.latitude).toBeLessThanOrEqual(37.525);
      expect(riderPoint.longitude).toBeGreaterThanOrEqual(127.018);
      expect(riderPoint.longitude).toBeLessThanOrEqual(127.108);
    }
  });

  it("changes marker representation at street, district and overview scales", () => {
    expect(riderMapMarkerScale(1)).toBe("STREET");
    expect(riderMapMarkerScale(3)).toBe("STREET");
    expect(riderMapMarkerScale(4)).toBe("DISTRICT");
    expect(riderMapMarkerScale(5)).toBe("DISTRICT");
    expect(riderMapMarkerScale(6)).toBe("OVERVIEW");
    expect(riderMapMarkerScale(12)).toBe("OVERVIEW");
  });

  it("moves an unknown synthetic area on a deterministic short route", () => {
    const profile = {
      courierId: "demo-courier-001",
      areaCode: "합성 북부권역 A구역",
      mapX: 52,
      mapY: 48,
    };
    const first = riderRoutePosition(profile, 1_785_544_400);
    const next = riderRoutePosition(profile, 1_785_544_401);
    expect(next).not.toEqual(first);
    expect(riderRoutePosition(profile, 1_785_544_401)).toEqual(next);
  });

  it("moves synthetic operations couriers through multi-point road polylines", () => {
    const profile = {
      courierId: "demo-courier-001",
      areaCode: "합성 북부권역 A구역",
      mapX: 52,
      mapY: 48,
    };
    const route = riderRoutePolyline(profile);
    const quarter = riderRoutePositionAtProgress(profile, 0.25);
    const middle = riderRoutePositionAtProgress(profile, 0.5);

    expect(route.length).toBeGreaterThanOrEqual(4);
    expect(quarter).not.toEqual(middle);
    expect(route).toEqual(riderRoutePolyline(profile));
    expect(quarter.latitude).toBeGreaterThanOrEqual(37.46);
    expect(quarter.longitude).toBeLessThanOrEqual(127.108);
  });
});
