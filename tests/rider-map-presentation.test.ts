import { describe, expect, it } from "vitest";
import { riderProfiles } from "../src/application/riderProfileRepository";
import {
  riderMapMarkerScale,
  riderRoutePosition,
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
});
