import { describe, expect, it } from "vitest";
import {
  createDashboardCameraFrameKey,
  createDashboardMarkerLayout,
  updateDashboardMarkerAnchors,
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
      groupId: "courier-c",
      groupSize: 1,
      anchorMapX: 80,
      anchorMapY: 80,
      anchorLatitude: undefined,
      anchorLongitude: undefined,
      offsetColumn: 0,
      offsetRow: 0,
    });
  });

  it("keeps slots stable while moving every courier on its own route anchor", () => {
    const base = createDashboardMarkerLayout([
      { id: "courier-a", mapX: 10, mapY: 10 },
      { id: "courier-b", mapX: 11, mapY: 11 },
    ]);
    const moved = updateDashboardMarkerAnchors(base, [
      { id: "courier-a", mapX: 20, mapY: 30, latitude: 37.5, longitude: 127 },
      { id: "courier-b", mapX: 22, mapY: 32, latitude: 37.7, longitude: 127.2 },
    ]);

    expect(moved.get("courier-a")).toMatchObject({
      groupId: "courier-a",
      anchorMapX: 20,
      anchorMapY: 30,
      anchorLatitude: 37.5,
      anchorLongitude: 127,
      offsetColumn: -0.5,
    });
    expect(moved.get("courier-b")).toMatchObject({
      groupId: "courier-a",
      anchorMapX: 22,
      anchorMapY: 32,
      anchorLatitude: 37.7,
      anchorLongitude: 127.2,
      offsetColumn: 0.5,
    });
    expect(moved.get("courier-a")?.anchorMapX).not.toBe(
      moved.get("courier-b")?.anchorMapX,
    );
  });

  it("uses an explicit hub key to keep crossing routes in stable groups", () => {
    const layout = createDashboardMarkerLayout([
      { id: "north-a", mapX: 10, mapY: 10, groupKey: "north" },
      { id: "north-b", mapX: 80, mapY: 80, groupKey: "north" },
      { id: "south-a", mapX: 11, mapY: 11, groupKey: "south" },
    ]);

    expect(layout.get("north-a")?.groupId).toBe("north-a");
    expect(layout.get("north-b")?.groupId).toBe("north-a");
    expect(layout.get("south-a")?.groupSize).toBe(1);
  });
});
