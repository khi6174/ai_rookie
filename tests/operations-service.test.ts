import { describe, expect, it } from "vitest";
import {
  bundledDailyOperationsDocumentBundle,
} from "../src/adapters/fixtures/syntheticOperationsDocumentBundle";
import {
  bundledDailyOperationsPackage,
  bundledSyntheticOperationsRecords,
} from "../src/adapters/fixtures/syntheticOperationsPackage";
import {
  OperationsPackageValidationError,
  createOperationsDecisionWorkspace,
  createAppliedPlanCsv,
  createAuditCsv,
  createCustomerNoticeCsv,
  createOperationsExportBundle,
  createDailyOperationsSnapshot,
  createOperationsMapCouriers,
  createOperationsRiderMapModel,
  createScenarioFixtureFromOperationsPackage,
  detectDecisionWorkspaceConflicts,
  approveAndApplyOperationsDecision,
  initializeOperationsDecision,
  respondToOperationsDecision,
  evaluateOperationsFleet,
} from "../src/application/operations";
import {
  normalizeDailyOperationsInput,
  validateDailyOperationsPackage,
  type DailyOperationsDocumentBundle,
  type DailyOperationsPackage,
} from "../src/domain/operations";

const clonePackage = (): DailyOperationsPackage =>
  structuredClone(bundledDailyOperationsPackage);
const cloneDocumentBundle = (): DailyOperationsDocumentBundle =>
  structuredClone(bundledDailyOperationsDocumentBundle);

describe("daily synthetic operations package", () => {
  it("normalizes 100 hashed source documents into the 25-courier strict package", async () => {
    expect(bundledDailyOperationsDocumentBundle.documents).toHaveLength(100);
    const result = await normalizeDailyOperationsInput(
      bundledDailyOperationsDocumentBundle,
    );
    expect(result).toMatchObject({
      status: "VALID",
      inputKind: "DOCUMENT_BUNDLE",
      documentCount: 100,
      extraction: {
        provider: "SAFEROUTE",
        mode: "DETERMINISTIC",
        validationStatus: "ACCEPTED",
        rawDocumentStored: false,
        rawOutputStored: false,
      },
    });
    if (result.status !== "VALID") throw new Error("Expected valid bundle");
    expect(result.package.records).toHaveLength(25);
    expect(result.package.packageId).toBe(
      "daily-operations-documents-2026-07-25-bundled-v1-normalized",
    );
  });

  it("fails closed when a source document is altered, missing, or detached from its record", async () => {
    const altered = cloneDocumentBundle();
    altered.documents[0].content += "\n변조된 문장";
    altered.documents.splice(4, 1);
    altered.documents.at(-1)!.parentRecordId = "synthetic-parent-unknown";

    const result = await normalizeDailyOperationsInput(altered);
    expect(result.status).toBe("INVALID");
    expect(result.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "DOCUMENT_HASH_MISMATCH",
        "DOCUMENT_MISSING",
        "DOCUMENT_REFERENCE_MISMATCH",
      ]),
    );
  });

  it("loads all 25 accepted parent records in deterministic order", () => {
    expect(bundledSyntheticOperationsRecords).toHaveLength(25);
    expect(bundledSyntheticOperationsRecords[0].parentRecordId).toBe(
      "synthetic-parent-001",
    );
    expect(bundledSyntheticOperationsRecords.at(-1)?.parentRecordId).toBe(
      "synthetic-parent-025",
    );
    expect(validateDailyOperationsPackage(bundledDailyOperationsPackage)).toMatchObject({
      status: "VALID",
      issues: [],
    });
  });

  it("creates deterministic coarse map routes for every active courier", () => {
    const couriers = createOperationsMapCouriers(
      bundledDailyOperationsPackage,
    );
    expect(couriers).toHaveLength(25);
    expect(new Set(couriers.map((item) => item.courierId)).size).toBe(25);
    const route = createOperationsRiderMapModel(
      bundledDailyOperationsPackage,
      "demo-courier-003",
    );
    expect(route.path.length).toBeGreaterThanOrEqual(3);
    expect(route).toEqual(
      createOperationsRiderMapModel(
        bundledDailyOperationsPackage,
        "demo-courier-003",
      ),
    );
  });

  it("rejects date, count, load, duplicate and PII boundary failures", () => {
    const invalid = clonePackage();
    invalid.records[0].shift.evaluatedAt = "2026-07-26T10:30:00+09:00";
    invalid.records[1].plan.remainingStopCount += 1;
    invalid.records[2].plan.remainingWeightKg += 1;
    invalid.records[3].courier.courierId =
      invalid.records[4].courier.courierId;
    invalid.records[5].courier.displayLabel = "rider@example.com";

    const result = validateDailyOperationsPackage(invalid);
    expect(result.status).toBe("INVALID");
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "DATE_MISMATCH",
        "COUNT_MISMATCH",
        "LOAD_MISMATCH",
        "DUPLICATE_ID",
        "PII_PATTERN_DETECTED",
      ]),
    );
  });

  it("projects every record into one valid multi-courier fixture", () => {
    const fixture = createScenarioFixtureFromOperationsPackage(
      bundledDailyOperationsPackage,
    );
    expect(fixture.scenario).toBe("DAILY_MULTI_COURIER_OPERATIONS");
    expect(fixture.couriers).toHaveLength(25);
    expect(fixture.workloads).toHaveLength(25);
    expect(fixture.stops.length).toBeGreaterThan(200);
    expect(
      new Set(fixture.workloads.map((workload) => workload.courierId)).size,
    ).toBe(25);
  });

  it("creates the same immutable snapshot identity for the same package", async () => {
    const first = await createDailyOperationsSnapshot(
      bundledDailyOperationsPackage,
      {
        createdAt: "2026-07-27T00:00:00.000Z",
      },
    );
    const second = await createDailyOperationsSnapshot(
      clonePackage(),
      {
        createdAt: "2026-07-27T01:00:00.000Z",
      },
    );
    expect(first.packageHash).toBe(second.packageHash);
    expect(first.snapshotId).toBe(second.snapshotId);
    expect(first.fixture).toEqual(second.fixture);
  });

  it("does not create a snapshot from an invalid package", async () => {
    const invalid = clonePackage();
    invalid.records[0].plan.remainingWeightKg += 2;
    await expect(createDailyOperationsSnapshot(invalid)).rejects.toBeInstanceOf(
      OperationsPackageValidationError,
    );
  });
});

describe("fleet-wide safety evaluation", () => {
  it("evaluates all active couriers and derives a selectable support queue", async () => {
    const snapshot = await createDailyOperationsSnapshot(
      bundledDailyOperationsPackage,
      {
        createdAt: "2026-07-27T00:00:00.000Z",
      },
    );
    const fleet = evaluateOperationsFleet(snapshot);

    expect(fleet.courierCount).toBe(25);
    expect(fleet.evaluations).toHaveLength(25);
    expect(fleet.supportDecisionCount).toBeGreaterThan(1);
    expect(fleet.supportQueue).toHaveLength(fleet.supportDecisionCount);
    expect(
      new Set(fleet.supportQueue.map((item) => item.decisionId)).size,
    ).toBe(fleet.supportDecisionCount);
    expect(
      fleet.supportQueue.every(
        (item, index) =>
          item.queuePosition === index + 1 &&
          item.snapshotId === snapshot.snapshotId,
      ),
    ).toBe(true);
  });

  it("changes only from validated input rather than the wall-clock date", async () => {
    const originalSnapshot = await createDailyOperationsSnapshot(
      bundledDailyOperationsPackage,
      {
        createdAt: "2026-07-27T00:00:00.000Z",
      },
    );
    const changedPackage = clonePackage();
    changedPackage.packageId = "daily-operations-2026-07-25-changed-v1";
    changedPackage.records[0].shift.continuousWorkMinutes += 30;
    const changedSnapshot = await createDailyOperationsSnapshot(
      changedPackage,
      {
        createdAt: "2026-07-27T00:00:00.000Z",
      },
    );
    const originalFleet = evaluateOperationsFleet(originalSnapshot);
    const changedFleet = evaluateOperationsFleet(changedSnapshot);
    const originalByCourier = new Map(
      originalFleet.evaluations.map((item) => [item.courierId, item]),
    );

    expect(changedSnapshot.packageHash).not.toBe(
      originalSnapshot.packageHash,
    );
    expect(
      changedFleet.evaluations.find(
        (item) => item.courierId === "demo-courier-001",
      )?.safety.currentBudget,
    ).toBeLessThan(
      originalByCourier.get("demo-courier-001")?.safety.currentBudget ?? 0,
    );
    expect(
      changedFleet.evaluations.find(
        (item) => item.courierId === "demo-courier-002",
      )?.safety.currentBudget,
    ).toBe(originalByCourier.get("demo-courier-002")?.safety.currentBudget);
  });
});

describe("multi-decision operations workspace", () => {
  it("keeps every support item selectable and initializes decisions on demand", async () => {
    const snapshot = await createDailyOperationsSnapshot(
      bundledDailyOperationsPackage,
      {
        createdAt: "2026-07-27T00:00:00.000Z",
      },
    );
    const fleet = evaluateOperationsFleet(snapshot);
    const emptyWorkspace = createOperationsDecisionWorkspace(snapshot, fleet);
    const workspace = initializeOperationsDecision(
      emptyWorkspace,
      snapshot,
      fleet,
      fleet.supportQueue[0].decisionId,
    );

    expect(emptyWorkspace.supportQueue).toHaveLength(
      fleet.supportDecisionCount,
    );
    expect(emptyWorkspace.decisions).toHaveLength(0);
    expect(workspace.decisions).toHaveLength(1);
    expect(
      workspace.decisions.every(
        (item) =>
          item.decision.status === "RIDER_RESPONSE_PENDING" &&
          item.candidates.length >= 4 &&
          item.selectedEvaluation.feasibility.status === "FEASIBLE" &&
          item.decision.decisionId === item.queueItem.decisionId,
      ),
    ).toBe(true);
  });

  it("detects two open transfer decisions that would use the same recipient", async () => {
    const snapshot = await createDailyOperationsSnapshot(
      bundledDailyOperationsPackage,
      {
        createdAt: "2026-07-27T00:00:00.000Z",
      },
    );
    const fleet = evaluateOperationsFleet(snapshot);
    let workspace = createOperationsDecisionWorkspace(snapshot, fleet);
    for (const queueItem of fleet.supportQueue.slice(0, 2)) {
      workspace = initializeOperationsDecision(
        workspace,
        snapshot,
        fleet,
        queueItem.decisionId,
      );
    }
    const transferSelections = workspace.decisions
      .map((artifacts) => ({
        decisionId: artifacts.decision.decisionId,
        candidate: artifacts.candidates.find((candidate) =>
          candidate.actions.some(
            (action) => action.type === "TRANSFER_STOPS",
          ),
        ),
      }))
      .filter(
        (
          item,
        ): item is {
          decisionId: string;
          candidate: NonNullable<typeof item.candidate>;
        } => item.candidate !== undefined,
      )
      .slice(0, 2);
    expect(transferSelections).toHaveLength(2);
    const candidateSelections = Object.fromEntries(
      transferSelections.map((item) => [
        item.decisionId,
        item.candidate.candidateId,
      ]),
    );

    const conflicts = detectDecisionWorkspaceConflicts(
      workspace,
      candidateSelections,
    ).filter((conflict) =>
      transferSelections.every((item) =>
        conflict.decisionIds.includes(item.decisionId),
      ),
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reasonCodes).toContain(
      "AFFECTED_COURIER_OVERLAP",
    );
    expect(conflicts[0].sharedCourierIds).toContain("demo-courier-001");
  });

  it("completes consent, approval, revalidation, atomic apply and notice recording", async () => {
    const snapshot = await createDailyOperationsSnapshot(
      bundledDailyOperationsPackage,
      {
        createdAt: "2026-07-27T00:00:00.000Z",
      },
    );
    const fleet = evaluateOperationsFleet(snapshot);
    const decisionId = fleet.supportQueue[0].decisionId;
    let workspace = initializeOperationsDecision(
      createOperationsDecisionWorkspace(snapshot, fleet),
      snapshot,
      fleet,
      decisionId,
    );
    const initial = workspace.decisions[0];
    const baselineVersion = workspace.store.activePlan.workloads.find(
      (workload) => workload.planId === initial.decision.baselinePlanId,
    )?.planVersion;

    for (const requirement of initial.decision.consentRequirements.filter(
      (item) => item.required,
    )) {
      workspace = respondToOperationsDecision(workspace, {
        decisionId,
        courierId: requirement.courierId,
        response: "CONSENTED",
      });
    }
    expect(workspace.decisions[0].decision.status).toBe(
      "ADMIN_APPROVAL_REQUIRED",
    );

    const applied = approveAndApplyOperationsDecision(
      workspace,
      decisionId,
    );
    expect(applied.status).toBe("APPLIED");
    const completed = applied.workspace.decisions[0].decision;
    expect(completed.status).toBe("NOTICE_RECORDED");
    expect(completed.customerNoticeIds.length).toBeGreaterThan(0);
    const noticeDrafts = completed.customerNoticeIds.map(
      (noticeId) => applied.workspace.store.customerNoticeDrafts[noticeId],
    );
    expect(noticeDrafts).toHaveLength(
      applied.workspace.store.activePlan.stops.filter(
        (stop) => stop.planId === completed.baselinePlanId,
      ).length,
    );
    expect(
      noticeDrafts.every(
        (draft) =>
          draft?.deliveryStatus === "PREVIEW_ONLY" &&
          draft.actualDeliverySent === false &&
          draft.generationMode === "TEMPLATE" &&
          draft.message.includes("실제 메시지는 발송되지 않습니다."),
      ),
    ).toBe(true);
    expect(
      applied.workspace.store.activePlan.workloads.find(
        (workload) => workload.planId === completed.baselinePlanId,
      )?.planVersion,
    ).not.toBe(baselineVersion);

    const planCsv = createAppliedPlanCsv(snapshot, applied.workspace);
    const auditCsv = createAuditCsv(snapshot, applied.workspace);
    const noticeCsv = createCustomerNoticeCsv(snapshot, applied.workspace);
    const bundle = createOperationsExportBundle(
      snapshot,
      fleet,
      applied.workspace,
      "2026-07-27T02:00:00.000Z",
    );
    expect(planCsv.split("\r\n")).toHaveLength(
      applied.workspace.store.activePlan.stops.length + 1,
    );
    expect(planCsv).toContain(completed.appliedPlanVersion ?? "");
    expect(auditCsv).toContain("PLAN_APPLIED_ATOMICALLY");
    expect(noticeCsv).toContain("PREVIEW_ONLY");
    expect(noticeCsv).toContain("actual_delivery_sent");
    expect(bundle.summary).toMatchObject({
      courierCount: 25,
      completedDecisionCount: 1,
    });
    expect(bundle.customerNotices).toHaveLength(
      completed.customerNoticeIds.length,
    );
    const exportedDecision = bundle.decisions.find(
      (decision) => decision.decisionId === completed.decisionId,
    );
    expect(exportedDecision?.comparison).toMatchObject({
      adjustedBreachStatus: "NO_BREACH_IN_HORIZON",
      breachOutcome: applied.workspace.decisions.find(
        (artifacts) => artifacts.decision.decisionId === completed.decisionId,
      )?.selectedEvaluation.breachOutcome,
    });
    expect(
      exportedDecision?.comparison.adjustedMinimumSafetyBudget ?? 0,
    ).toBeGreaterThan(
      exportedDecision?.comparison.baselineMinimumSafetyBudget ?? 100,
    );
    expect(
      noticeDrafts.every((draft) => {
        const appliedStop = applied.workspace.store.activePlan.stops.find(
          (stop) => stop.stopId === draft?.stopId,
        );
        const appliedWorkload =
          applied.workspace.store.activePlan.workloads.find(
            (workload) => workload.planId === appliedStop?.planId,
          );
        return (
          draft !== undefined &&
          appliedStop !== undefined &&
          draft.updatedEta === appliedStop.expectedArrivalAt &&
          draft.appliedPlanVersion === appliedWorkload?.planVersion
        );
      }),
    ).toBe(true);
    expect(JSON.stringify(bundle)).not.toMatch(
      /01[016789][-\s]?\d{3,4}[-\s]?\d{4}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/,
    );
  });
});
