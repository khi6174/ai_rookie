import { describe, expect, it } from "vitest";
import { bundledDailyOperationsPackage } from "../src/adapters/fixtures/syntheticOperationsPackage";
import {
  createDailyOperationsSnapshot,
  createOperationsDecisionWorkspace,
  createOperationsPersistedSession,
  evaluateOperationsFleet,
  restoreOperationsPersistedSession,
} from "../src/application/operations";
import {
  createMemoryOperationsSessionStore,
  handleOperationsSessionRequest,
} from "../server/operations-session-store.mjs";

async function persistedSession() {
  const snapshot = await createDailyOperationsSnapshot(
    bundledDailyOperationsPackage,
    { createdAt: "2026-07-27T00:00:00.000Z" },
  );
  const fleet = evaluateOperationsFleet(snapshot);
  const workspace = createOperationsDecisionWorkspace(snapshot, fleet);
  return createOperationsPersistedSession({
    workspaceId:
      "operations-workspace-11111111-1111-4111-8111-111111111111",
    savedAt: "2026-07-27T01:00:00.000Z",
    operationsPackage: bundledDailyOperationsPackage,
    snapshot,
    fleet,
    workspace,
  });
}

describe("operations session persistence boundary", () => {
  it("saves and restores a strict synthetic session in the local adapter", async () => {
    const store = createMemoryOperationsSessionStore();
    const session = await persistedSession();
    expect(
      new TextEncoder().encode(JSON.stringify(session)).byteLength,
    ).toBeLessThan(2_000_000);
    const url = `http://localhost/api/operations/sessions/${session.workspaceId}`;
    const saved = await handleOperationsSessionRequest(
      new Request(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session),
      }),
      { memoryStore: store },
    );
    expect(saved?.status).toBe(200);

    const loaded = await handleOperationsSessionRequest(
      new Request(url),
      { memoryStore: store },
    );
    expect(loaded?.status).toBe(200);
    const body = (await loaded?.json()) as {
      session: typeof session;
      storage: string;
    };
    expect(body.storage).toBe("MEMORY_DEV");
    expect(body.session.snapshotIdentity.snapshotId).toBe(
      session.snapshotIdentity.snapshotId,
    );
    expect(body.session.workspace.supportQueue.length).toBeGreaterThan(1);
    const restored = await restoreOperationsPersistedSession(body.session);
    expect(restored.snapshot.snapshotId).toBe(
      session.snapshotIdentity.snapshotId,
    );
    expect(restored.fleet.evaluations).toHaveLength(25);

    const staleWrite = await handleOperationsSessionRequest(
      new Request(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-SafeRoute-Base-Saved-At": "2026-07-27T00:00:00.000Z",
        },
        body: JSON.stringify({
          ...session,
          savedAt: "2026-07-27T02:00:00.000Z",
        }),
      }),
      { memoryStore: store },
    );
    expect(staleWrite?.status).toBe(409);
    expect(await staleWrite?.text()).toContain("최신 상태");
  });

  it("rejects invalid workspace ids and non-synthetic or PII payloads", async () => {
    const store = createMemoryOperationsSessionStore();
    const invalidId = await handleOperationsSessionRequest(
      new Request(
        "http://localhost/api/operations/sessions/not-a-workspace",
      ),
      { memoryStore: store },
    );
    expect(invalidId?.status).toBe(400);

    const session = await persistedSession();
    const withPii = structuredClone(session);
    withPii.operationsPackage.records[0].courier.displayLabel =
      "010-1234-5678";
    const response = await handleOperationsSessionRequest(
      new Request(
        `http://localhost/api/operations/sessions/${session.workspaceId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(withPii),
        },
      ),
      { memoryStore: store },
    );
    expect(response?.status).toBe(400);
    expect(await response?.text()).toContain(
      "휴대전화번호",
    );
  });
});
