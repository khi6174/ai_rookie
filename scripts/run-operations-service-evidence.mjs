import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

const root = resolve(".");
const server = await createServer({
  root,
  appType: "custom",
  server: { middlewareMode: true },
  logLevel: "error",
});
try {
  const fixtures = await server.ssrLoadModule(
    "/src/adapters/fixtures/syntheticOperationsPackage.ts",
  );
  const operations = await server.ssrLoadModule(
    "/src/application/operations/index.ts",
  );
  const operationsPackage = fixtures.bundledDailyOperationsPackage;
  const snapshot = await operations.createDailyOperationsSnapshot(
    operationsPackage,
    { createdAt: "2026-07-27T04:00:00.000Z" },
  );
  const fleet = operations.evaluateOperationsFleet(snapshot);
  let workspace = operations.createOperationsDecisionWorkspace(
    snapshot,
    fleet,
  );
  for (const queueItem of fleet.supportQueue) {
    workspace = operations.initializeOperationsDecision(
      workspace,
      snapshot,
      fleet,
      queueItem.decisionId,
    );
  }
  const transferSelections = Object.fromEntries(
    workspace.decisions.flatMap((item) => {
      const transfer = item.candidates.find((candidate) =>
        candidate.actions.some(
          (action) => action.type === "TRANSFER_STOPS",
        ),
      );
      return transfer
        ? [[item.decision.decisionId, transfer.candidateId]]
        : [];
    }),
  );
  const conflicts = operations.detectDecisionWorkspaceConflicts(
    workspace,
    transferSelections,
  );
  const first = workspace.decisions[0];
  let completedWorkspace = operations.createOperationsDecisionWorkspace(
    snapshot,
    fleet,
  );
  completedWorkspace = operations.initializeOperationsDecision(
    completedWorkspace,
    snapshot,
    fleet,
    first.decision.decisionId,
  );
  for (const requirement of first.decision.consentRequirements.filter(
    (item) => item.required,
  )) {
    completedWorkspace = operations.respondToOperationsDecision(
      completedWorkspace,
      {
        decisionId: first.decision.decisionId,
        courierId: requirement.courierId,
        response: "CONSENTED",
      },
    );
  }
  const applied = operations.approveAndApplyOperationsDecision(
    completedWorkspace,
    first.decision.decisionId,
  );
  const exportBundle = operations.createOperationsExportBundle(
    snapshot,
    fleet,
    applied.workspace,
  );
  const result = {
    schemaVersion: "operations-service-evidence-v1",
    dataMode: "SYNTHETIC",
    capturedAt: new Date().toISOString(),
    packageId: operationsPackage.packageId,
    packageHash: snapshot.packageHash,
    snapshotId: snapshot.snapshotId,
    activeCourierCount: fleet.courierCount,
    remainingStopCount: snapshot.fixture.stops.length,
    supportDecisionCount: fleet.supportDecisionCount,
    monitorCount: fleet.monitorCount,
    stableCount: fleet.stableCount,
    initializedDecisionCount: workspace.decisions.length,
    unsafeRecommendedCount: workspace.decisions.filter(
      (item) =>
        item.selectedEvaluation.feasibility.status !== "FEASIBLE",
    ).length,
    conflictCount: conflicts.length,
    completedDecisionStatus:
      applied.workspace.decisions.find(
        (item) => item.decision.decisionId === first.decision.decisionId,
      )?.decision.status,
    recordedCustomerNoticeCount:
      applied.workspace.decisions.find(
        (item) => item.decision.decisionId === first.decision.decisionId,
      )?.decision.customerNoticeIds.length ?? 0,
    applyStatus: applied.status,
    pendingCustomerNoticeCount: Object.values(
      applied.workspace.store.pendingCustomerNoticeIds,
    ).flat().length,
    exportDecisionCount: exportBundle.decisions.length,
    exportSha256: createHash("sha256")
      .update(JSON.stringify(exportBundle))
      .digest("hex"),
  };
  const passed =
    result.activeCourierCount === 25 &&
    result.supportDecisionCount > 1 &&
    result.initializedDecisionCount === result.supportDecisionCount &&
    result.unsafeRecommendedCount === 0 &&
    result.conflictCount > 0 &&
    result.applyStatus === "APPLIED" &&
    result.completedDecisionStatus === "NOTICE_RECORDED" &&
    result.recordedCustomerNoticeCount > 0;
  const output = { ...result, status: passed ? "PASSED" : "FAILED" };
  const outputDirectory = resolve(root, "artifacts/evals");
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = resolve(
    outputDirectory,
    "operations-service-evidence.json",
  );
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(
    `Operations service evidence: ${output.status} couriers=${output.activeCourierCount} decisions=${output.supportDecisionCount} conflicts=${output.conflictCount}`,
  );
  console.log(`JSON: ${outputPath}`);
  if (!passed) process.exitCode = 1;
} finally {
  await server.close();
}
