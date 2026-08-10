export type DashboardMarkerPoint = {
  id: string;
  mapX: number;
  mapY: number;
  groupKey?: string;
  latitude?: number;
  longitude?: number;
};

export type DashboardMarkerLayout = {
  id: string;
  groupId: string;
  groupSize: number;
  anchorMapX: number;
  anchorMapY: number;
  anchorLatitude?: number;
  anchorLongitude?: number;
  offsetColumn: number;
  offsetRow: number;
};

export type DashboardMapFocusMode = "FLEET" | "COURIER";

const overlapThresholdX = 4.5;
const overlapThresholdY = 6;
const maximumColumns = 3;

export function createDashboardCameraFrameKey(
  mapReadyVersion: number,
  focusMode: DashboardMapFocusMode,
  selectedId: string,
) {
  return focusMode === "COURIER"
    ? `${mapReadyVersion}:COURIER:${selectedId}`
    : `${mapReadyVersion}:FLEET`;
}

function overlaps(
  left: DashboardMarkerPoint,
  right: DashboardMarkerPoint,
) {
  if (left.groupKey !== undefined || right.groupKey !== undefined) {
    return left.groupKey !== undefined && left.groupKey === right.groupKey;
  }
  return (
    Math.abs(left.mapX - right.mapX) <= overlapThresholdX &&
    Math.abs(left.mapY - right.mapY) <= overlapThresholdY
  );
}

/**
 * Keeps the route coordinate authoritative while assigning a small, deterministic
 * screen-space offset to markers whose hit areas would otherwise cover each other.
 */
export function createDashboardMarkerLayout(
  points: DashboardMarkerPoint[],
): Map<string, DashboardMarkerLayout> {
  const ordered = [...points].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const unassigned = new Set(ordered.map((point) => point.id));
  const byId = new Map(ordered.map((point) => [point.id, point]));
  const layout = new Map<string, DashboardMarkerLayout>();

  for (const seed of ordered) {
    if (!unassigned.has(seed.id)) continue;
    const group: DashboardMarkerPoint[] = [];
    const queue = [seed];
    unassigned.delete(seed.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      group.push(current);
      for (const candidateId of [...unassigned]) {
        const candidate = byId.get(candidateId)!;
        if (!overlaps(current, candidate)) continue;
        unassigned.delete(candidateId);
        queue.push(candidate);
      }
    }

    const rowCount = Math.ceil(group.length / maximumColumns);
    const groupId = group[0].id;
    group.forEach((point, index) => {
      const row = Math.floor(index / maximumColumns);
      const rowStart = row * maximumColumns;
      const columnsInRow = Math.min(
        maximumColumns,
        group.length - rowStart,
      );
      const column = index - rowStart;
      layout.set(point.id, {
        id: point.id,
        groupId,
        groupSize: group.length,
        anchorMapX: point.mapX,
        anchorMapY: point.mapY,
        anchorLatitude: point.latitude,
        anchorLongitude: point.longitude,
        offsetColumn: column - (columnsInRow - 1) / 2,
        offsetRow: row - (rowCount - 1) / 2,
      });
    });
  }

  return layout;
}

export function updateDashboardMarkerAnchors(
  layout: Map<string, DashboardMarkerLayout>,
  points: DashboardMarkerPoint[],
): Map<string, DashboardMarkerLayout> {
  const pointsById = new Map(points.map((point) => [point.id, point]));

  return new Map(
    [...layout.entries()].map(([id, item]) => {
      const point = pointsById.get(id);
      if (!point) return [id, item];
      return [id, {
        ...item,
        anchorMapX: point.mapX,
        anchorMapY: point.mapY,
        anchorLatitude: point.latitude,
        anchorLongitude: point.longitude,
      }];
    }),
  );
}
