import { describe, expect, it } from "vitest";
import {
  createDashboardCameraFrameKey,
  createDashboardMarkerLayout,
} from "../src/application/dashboardMarkerLayout";

describe("dashboard marker layout", () => {
  it("does not request a new fleet camera frame when only selection changes", () => {
    expect(createDashboardCameraFrameKey(1, "FLEET", "courier-a")).toBe(
      createDashboardCameraFrameKey(1, "FLEET", "courier-b"),
    );
    expect(createDashboardCameraFrameKey(1, "COURIER", "courier-a")).not.toBe(
      createDashboardCameraFrameKey(1, "COURIER", "courier-b"),
    );
  });

  it("separates a dense group into rows of at most three markers", () => {
    const layout = createDashboardMarkerLayout(
      Array.from({ length: 9 }, (_, index) => ({
        id: `courier-${String(index + 1).padStart(2, "0")}`,
        mapX: 50,
        mapY: 50,
      })),
    );

    expect(layout.size).toBe(9);
    const occupied = new Set(
      [...layout.values()].map(
        (item) => `${item.offsetColumn}:${item.offsetRow}`,
      ),
    );
    expect(occupied.size).toBe(9);
    for (const row of new Set([...layout.values()].map((item) => item.offsetRow))) {
      expect(
        [...layout.values()].filter((item) => item.offsetRow === row),
      ).toHaveLength(3);
    }
  });

  it("keeps isolated markers centered and returns stable offsets", () => {
    const points = [
      { id: "courier-b", mapX: 10, mapY: 10 },
      { id: "courier-a", mapX: 11, mapY: 11 },
      { id: "courier-c", mapX: 80, mapY: 80 },
    ];

    const first = createDashboardMarkerLayout(points);
    const second = createDashboardMarkerLayout([...points].reverse());

    expect([...first.entries()]).toEqual([...second.entries()]);
    expect(first.get("courier-c")).toEqual({
      id: "courier-c",
      groupSize: 1,
      anchorMapX: 80,
      anchorMapY: 80,
      anchorLatitude: undefined,
      anchorLongitude: undefined,
      offsetColumn: 0,
      offsetRow: 0,
    });
  });
});
