import { useEffect, useMemo, useRef, useState } from "react";
import {
  bundledDailyOperationsPackage,
} from "../adapters/fixtures/syntheticOperationsPackage";
import { createUpstageProxyProvider } from "../adapters/upstage";
import {
  generateExplanation,
} from "../application/explanations";
import {
  approveAndApplyOperationsDecision,
  createAppliedPlanCsv,
  createAuditCsv,
  createCustomerNoticeCsv,
  createDailyOperationsSnapshot,
  createOperationsExportBundle,
  createOperationsPersistedSession,
  createOperationsDecisionWorkspace,
  evaluateOperationsFleet,
  holdOperationsDecision,
  initializeOperationsDecision,
  getOrCreateOperationsWorkspaceId,
  loadOperationsPersistedSession,
  restoreOperationsPersistedSession,
  saveOperationsPersistedSession,
  type FleetEvaluation,
  type OperationsDecisionWorkspace,
} from "../application/operations";
import type { DailyOperationsPackage, DailyOperationsSnapshot } from "../domain/operations";
import { normalizeDailyOperationsInput } from "../domain/operations";
import {
  ExplanationInputSchema,
  type ExplanationResult,
} from "../domain/contracts";
import { OperationsMap } from "./OperationsMap";

type LoadState =
  | { status: "IDLE" }
  | { status: "LOADING"; message: string }
  | { status: "READY" }
  | { status: "ERROR"; message: string; details: string[] };

type FleetFilter = "SUPPORT" | "ALL" | "MONITOR" | "STABLE";
type OperationsAdminTab =
  | "DAY"
  | "SUPPORT"
  | "ROUTE"
  | "INTERVENTIONS"
  | "AUDIT";

const adminTabs: Array<{
  value: OperationsAdminTab;
  icon: string;
  label: string;
  hash: string;
  title: string;
  subtitle: string;
}> = [
  {
    value: "DAY",
    icon: "▤",
    label: "일일 운영",
    hash: "operations-day",
    title: "오늘의 운영자료를 확정합니다",
    subtitle:
      "합성 근무표·배송 작업표·경로표의 출처와 참조를 검증한 뒤 전체 기사를 같은 시각으로 계산합니다.",
  },
  {
    value: "SUPPORT",
    icon: "◈",
    label: "지원 상황",
    hash: "support-situations",
    title: "향후 60분 안에 어떤 지원이 필요한가?",
    subtitle:
      "모든 활성 기사의 Time-to-Breach와 안전지원 큐를 확인하고 검토할 결정을 선택합니다.",
  },
  {
    value: "ROUTE",
    icon: "⌖",
    label: "경로",
    hash: "route-review",
    title: "지원 결정의 경로와 도착 영향을 확인합니다",
    subtitle:
      "Kakao 지도와 구조화 대안에서 합성 위치·경로를 확인합니다. 지도는 Safety 계산을 변경하지 않습니다.",
  },
  {
    value: "INTERVENTIONS",
    icon: "⚖",
    label: "개입 검토",
    hash: "intervention-review",
    title: "안전한 개입안을 비교하고 승인합니다",
    subtitle:
      "안전 하드 제약과 Risk Transfer Guard를 통과한 후보만 기사 동의와 관리자 승인으로 진행합니다.",
  },
  {
    value: "AUDIT",
    icon: "▦",
    label: "감사·내보내기",
    hash: "audit-export",
    title: "적용 결과와 감사 근거를 확인합니다",
    subtitle:
      "불변 스냅샷, 적용 계획, 고객안내 초안과 감사 이벤트를 같은 결정 근거로 내보냅니다.",
  },
];

function adminTabFromHash(): OperationsAdminTab {
  const hash = window.location.hash.slice(1);
  return adminTabs.find((tab) => tab.hash === hash)?.value ?? "DAY";
}

const bundledDocumentTemplateUrl =
  "/templates/daily-operations-documents-2026-07-25-bundled-v1.json";

type OperationsInputSummary = {
  kind: "DOCUMENT_BUNDLE" | "NORMALIZED_PACKAGE";
  documentCount: number;
  label: string;
};

type PersistenceState =
  | { status: "CHECKING"; label: string }
  | { status: "EMPTY"; label: string }
  | { status: "SAVING"; label: string }
  | { status: "SAVED"; label: string }
  | { status: "UNAVAILABLE"; label: string };

const supportReasonLabels: Record<string, string> = {
  ALREADY_BREACHED: "현재 임계치 초과",
  FUTURE_BREACH_PREDICTED: "미래 임계치 초과 예상",
  FORECAST_SUPPORT_BAND: "계획 중 지원구간 진입",
  CURRENT_SUPPORT_BAND: "현재 지원 필요 구간",
  CAUTION_MONITORING: "주의 관찰",
  NO_SUPPORT_REQUIRED: "현재 지원 불필요",
  MISSING_REQUIRED_INPUT: "필수 입력 확인 필요",
};

const supportStateLabels: Record<string, string> = {
  BREACHED: "즉시 지원",
  SUPPORT_NEEDED: "지원 필요",
  MONITOR: "관찰",
  STABLE: "안정",
  INSUFFICIENT_DATA: "입력 확인",
};

const decisionStatusLabels: Record<string, string> = {
  RIDER_RESPONSE_PENDING: "기사 응답 대기",
  RIDER_CONSENTED: "기사 동의 완료",
  MODIFICATION_REQUESTED: "기사 수정 요청",
  RIDER_DECLINED: "기사 거절 · 다른 대안 필요",
  ADMIN_APPROVAL_REQUIRED: "관리자 승인 대기",
  ADMIN_HELD: "관리자 보류",
  REVALIDATION_REQUIRED: "최신 계획 재검증 필요",
  APPLY_FAILED: "적용 실패 · 기존 계획 유지",
  NOTICE_RECORDED: "계획·안내 갱신 완료",
};

function interventionLabel(type: string) {
  return {
    REST: "휴식",
    TRANSFER_STOPS: "물량이관",
    REORDER_STOPS: "순서변경",
    SAFER_ROUTE: "안전경로",
    SAFE_DELAY: "Safe Delay",
  }[type] ?? type;
}

function formatBudget(value: number | undefined) {
  return value === undefined ? "—" : value.toFixed(1);
}

function formatEvaluatedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function OperationsService() {
  const [adminTab, setAdminTab] =
    useState<OperationsAdminTab>(adminTabFromHash);
  const [operationsPackage, setOperationsPackage] =
    useState<DailyOperationsPackage>(bundledDailyOperationsPackage);
  const [inputSummary, setInputSummary] = useState<OperationsInputSummary>({
    kind: "DOCUMENT_BUNDLE",
    documentCount: 100,
    label: "SafeRoute 결정론 추출 · 검증 통과",
  });
  const [snapshot, setSnapshot] =
    useState<DailyOperationsSnapshot | null>(null);
  const [fleet, setFleet] = useState<FleetEvaluation | null>(null);
  const [workspace, setWorkspace] =
    useState<OperationsDecisionWorkspace | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "IDLE" });
  const [filter, setFilter] = useState<FleetFilter>("SUPPORT");
  const [selectedDecisionId, setSelectedDecisionId] = useState<string>();
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string>();
  const [explanations, setExplanations] = useState<
    Record<string, ExplanationResult>
  >({});
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [persistenceState, setPersistenceState] =
    useState<PersistenceState>({
      status: "CHECKING",
      label: "저장 상태 확인 중",
    });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const restoreCompleteRef = useRef(false);
  const skipNextPersistenceRef = useRef(false);
  const persistenceBaseSavedAtRef = useRef<string | undefined>(
    undefined,
  );
  const activeTab =
    adminTabs.find((tab) => tab.value === adminTab) ?? adminTabs[0];

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const nextWorkspaceId = getOrCreateOperationsWorkspaceId(
        window.localStorage,
      );
      setWorkspaceId(nextWorkspaceId);
      const result = await loadOperationsPersistedSession(nextWorkspaceId);
      if (cancelled) return;
      if (result.status === "LOADED") {
        const restored = await restoreOperationsPersistedSession(
          result.session,
        );
        if (cancelled) return;
        skipNextPersistenceRef.current = true;
        setOperationsPackage(restored.operationsPackage);
        setInputSummary({
          kind: "NORMALIZED_PACKAGE",
          documentCount: 0,
          label: "저장된 strict 정규화 패키지",
        });
        setSnapshot(restored.snapshot);
        setFleet(restored.fleet);
        setWorkspace(restored.workspace);
        persistenceBaseSavedAtRef.current = result.updatedAt;
        setLoadState({ status: "READY" });
        setPersistenceState({
          status: "SAVED",
          label:
            result.storage === "D1"
              ? "서비스 저장소에서 복구됨"
              : "개발 저장소에서 복구됨",
        });
      } else if (result.status === "EMPTY") {
        persistenceBaseSavedAtRef.current = undefined;
        setPersistenceState({
          status: "EMPTY",
          label: "새 합성 workspace",
        });
      } else {
        setPersistenceState({
          status: "UNAVAILABLE",
          label:
            "message" in result
              ? result.message
              : "저장된 운영 세션을 확인하지 못했습니다.",
        });
      }
      restoreCompleteRef.current = true;
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !restoreCompleteRef.current ||
      !workspaceId ||
      !snapshot ||
      !fleet ||
      !workspace
    ) {
      return;
    }
    if (skipNextPersistenceRef.current) {
      skipNextPersistenceRef.current = false;
      return;
    }
    setPersistenceState({
      status: "SAVING",
      label: "운영 상태 저장 중",
    });
    const timer = window.setTimeout(() => {
      const persist = async () => {
        const session = createOperationsPersistedSession({
            workspaceId,
            operationsPackage,
            snapshot,
            fleet,
            workspace,
          });
        const result = await saveOperationsPersistedSession(
          session,
          {
            baseSavedAt: persistenceBaseSavedAtRef.current,
          },
        );
        if (result.status === "SAVED") {
          persistenceBaseSavedAtRef.current = result.updatedAt;
        }
        setPersistenceState(
          result.status === "SAVED"
            ? {
                status: "SAVED",
                label:
                  result.storage === "D1"
                    ? "서비스 저장소에 저장됨"
                    : "개발 저장소에 저장됨",
              }
            : {
                status: "UNAVAILABLE",
                label: result.status === "CONFLICT"
                  ? "다른 화면의 변경 있음 · 새로고침 필요"
                  : "message" in result
                    ? result.message
                    : "운영 상태를 저장하지 못했습니다.",
              },
        );
      };
      void persist();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    fleet,
    operationsPackage,
    snapshot,
    workspace,
    workspaceId,
  ]);

  const evaluationByCourier = useMemo(
    () =>
      new Map(
        fleet?.evaluations.map((evaluation) => [
          evaluation.courierId,
          evaluation,
        ]) ?? [],
      ),
    [fleet],
  );
  const visibleEvaluations = useMemo(() => {
    if (!fleet) return [];
    if (filter === "ALL") return fleet.evaluations;
    if (filter === "SUPPORT") {
      return fleet.evaluations.filter((evaluation) =>
        ["BREACHED", "SUPPORT_NEEDED"].includes(evaluation.supportState),
      );
    }
    return fleet.evaluations.filter(
      (evaluation) => evaluation.supportState === filter,
    );
  }, [filter, fleet]);
  const selectedArtifacts = workspace?.decisions.find(
    (artifacts) => artifacts.decision.decisionId === selectedDecisionId,
  );
  const selectedQueueItem = fleet?.supportQueue.find(
    (item) => item.decisionId === selectedDecisionId,
  );
  const supportCourierIds = useMemo(
    () =>
      new Set(
        fleet?.supportQueue.map((item) => item.courierId) ?? [],
      ),
    [fleet],
  );

  const selectAdminTab = (
    tab: OperationsAdminTab,
    focusPanel = false,
  ) => {
    const nextTab = adminTabs.find((item) => item.value === tab);
    setAdminTab(tab);
    if (nextTab) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#${nextTab.hash}`,
      );
    }
    if (focusPanel) {
      window.requestAnimationFrame(() => {
        document
          .getElementById(`operations-panel-${tab.toLowerCase()}`)
          ?.focus();
      });
    }
  };

  const calculateOperationsDay = async () => {
    setLoadState({
      status: "LOADING",
      message: `${operationsPackage.records.length}명 입력을 검증하고 전체 계획을 계산하고 있습니다.`,
    });
    setSnapshot(null);
    setFleet(null);
    setWorkspace(null);
    setSelectedDecisionId(undefined);
    try {
      const nextSnapshot = await createDailyOperationsSnapshot(
        operationsPackage,
      );
      const nextFleet = evaluateOperationsFleet(nextSnapshot);
      const nextWorkspace = createOperationsDecisionWorkspace(
        nextSnapshot,
        nextFleet,
      );
      setSnapshot(nextSnapshot);
      setFleet(nextFleet);
      setWorkspace(nextWorkspace);
      setLoadState({ status: "READY" });
      selectAdminTab("SUPPORT", true);
    } catch (error) {
      const details =
        typeof error === "object" &&
        error !== null &&
        "issues" in error &&
        Array.isArray(error.issues)
          ? error.issues.map((item) =>
              typeof item === "object" &&
              item !== null &&
              "message" in item
                ? String(item.message)
                : String(item),
            )
          : [];
      setLoadState({
        status: "ERROR",
        message: "운영 입력을 확정하지 못했습니다.",
        details,
      });
    }
  };

  const openDecision = (decisionId: string) => {
    if (!snapshot || !fleet || !workspace) return;
    setSelectedDecisionId(decisionId);
    setActionMessage(undefined);
    selectAdminTab("INTERVENTIONS", true);
    if (
      workspace.decisions.some(
        (artifacts) => artifacts.decision.decisionId === decisionId,
      )
    ) {
      return;
    }
    setPersistenceState({
      status: "SAVING",
      label: "운영 상태 저장 중",
    });
    setDecisionLoading(true);
    window.setTimeout(() => {
      setWorkspace((current) =>
        current
          ? initializeOperationsDecision(
              current,
              snapshot,
              fleet,
              decisionId,
            )
          : current,
      );
      setDecisionLoading(false);
    }, 0);
  };

  const holdDecision = () => {
    if (!workspace || !selectedDecisionId) return;
    try {
      setWorkspace(holdOperationsDecision(workspace, selectedDecisionId));
      setActionMessage("관리자가 결정을 보류했습니다. 현재 계획은 유지됩니다.");
    } catch {
      setActionMessage("현재 상태에서는 결정을 보류할 수 없습니다.");
    }
  };

  const refreshOperationsState = async () => {
    if (!workspaceId) return;
    setDecisionLoading(true);
    try {
      const result = await loadOperationsPersistedSession(workspaceId);
      if (result.status !== "LOADED") {
        setActionMessage(
          "최신 운영 상태를 불러오지 못했습니다. 현재 화면의 계획은 변경하지 않습니다.",
        );
        return;
      }
      const restored = await restoreOperationsPersistedSession(
        result.session,
      );
      skipNextPersistenceRef.current = true;
      persistenceBaseSavedAtRef.current = result.updatedAt;
      setOperationsPackage(restored.operationsPackage);
      setSnapshot(restored.snapshot);
      setFleet(restored.fleet);
      setWorkspace(restored.workspace);
      setActionMessage(
        "기사 응답을 포함한 최신 운영 상태를 다시 불러왔습니다.",
      );
      setPersistenceState({
        status: "SAVED",
        label:
          result.storage === "D1"
            ? "서비스 저장소에서 복구됨"
            : "개발 저장소에서 복구됨",
      });
    } finally {
      setDecisionLoading(false);
    }
  };

  const explainDecision = async () => {
    if (!selectedArtifacts) return;
    const sourceImpact =
      selectedArtifacts.selectedEvaluation.courierImpacts.find(
        (impact) => impact.role === "SOURCE",
      );
    const currentBudget = selectedArtifacts.queueItem.currentBudget;
    const minimumAfter = sourceImpact?.candidateMinimumBudget;
    if (minimumAfter === undefined) return;
    const input = ExplanationInputSchema.parse({
      requestId: `operations-explanation-${selectedArtifacts.decision.decisionId}`,
      role: "ADMIN",
      language: "ko",
      dataMode: "DEMO",
      numericFacts: [
        {
          factId: "current-budget",
          label: "현재 안전여유",
          value: currentBudget,
          unit: "budget_points",
          displayValue: formatBudget(currentBudget),
        },
        {
          factId: "candidate-minimum-budget",
          label: "조정 후 최저 안전여유",
          value: minimumAfter,
          unit: "budget_points",
          displayValue: formatBudget(minimumAfter),
        },
        {
          factId: "eta-delta",
          label: "ETA 변화",
          value: selectedArtifacts.selectedEvaluation.etaDeltaMinutes,
          unit: "minutes",
          displayValue: `${selectedArtifacts.selectedEvaluation.etaDeltaMinutes}분`,
        },
      ],
      stateFacts: [
        {
          factId: "decision-status",
          label: "결정 상태",
          value:
            decisionStatusLabels[selectedArtifacts.decision.status] ??
            selectedArtifacts.decision.status,
        },
        {
          factId: "selected-intervention",
          label: "선택 개입",
          value: selectedArtifacts.selectedCandidate.actions
            .map((action) => interventionLabel(action.type))
            .join(" + "),
        },
        {
          factId: "confidence",
          label: "신뢰도",
          value: selectedArtifacts.queueItem.confidence,
        },
      ],
      allowedCitations: [],
      allowedActions: [
        "기사 동의 상태 확인",
        "관리자 승인 전 최신 계획 재검증",
      ],
      prohibitedTopics: ["기사 평가", "징계", "순위", "사고확률"],
    });
    setExplanationLoading(true);
    try {
      const result = await generateExplanation({
        input,
        provider: createUpstageProxyProvider(),
        receivedAt: new Date().toISOString(),
      });
      setExplanations((current) => ({
        ...current,
        [selectedArtifacts.decision.decisionId]: result,
      }));
    } finally {
      setExplanationLoading(false);
    }
  };

  const approveDecision = () => {
    if (!workspace || !selectedDecisionId) return;
    setDecisionLoading(true);
    window.setTimeout(() => {
      try {
        const result = approveAndApplyOperationsDecision(
          workspace,
          selectedDecisionId,
        );
        setWorkspace(result.workspace);
        setActionMessage(
          result.status === "APPLIED" || result.status === "ALREADY_APPLIED"
            ? "최신 계획 재검증을 통과해 경로·순서·ETA와 고객안내 초안이 함께 갱신되었습니다."
            : result.status === "REVALIDATION_REQUIRED"
              ? "다른 결정으로 계획이 바뀌어 새 계산과 기사 재동의가 필요합니다."
              : "계획 적용에 실패해 기존 계획을 유지합니다.",
        );
      } catch {
        setActionMessage("승인 조건을 충족하지 못했습니다. 기사 동의와 최신 계획을 확인해 주세요.");
      } finally {
        setDecisionLoading(false);
      }
    }, 0);
  };

  const onPackageFile = async (file: File | undefined) => {
    if (!file) return;
    setLoadState({
      status: "LOADING",
      message: "합성 운영 문서와 추출 결과를 교차 검증하고 있습니다.",
    });
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const result = await normalizeDailyOperationsInput(parsed);
      if (result.status !== "VALID") {
        setLoadState({
          status: "ERROR",
          message: "업로드한 운영 입력에 수정이 필요한 항목이 있습니다.",
          details: result.issues.map((issue) => issue.message),
        });
        return;
      }
      setOperationsPackage({
        ...result.package,
        source: "USER_UPLOADED",
      });
      setInputSummary({
        kind: result.inputKind,
        documentCount: result.documentCount,
        label:
          result.inputKind === "DOCUMENT_BUNDLE"
            ? `${result.extraction?.provider ?? "검증 계층"} ${result.extraction?.mode ?? "검증"} · strict 추출 통과`
            : "strict 정규화 패키지",
      });
      setSnapshot(null);
      setFleet(null);
      setWorkspace(null);
      setSelectedDecisionId(undefined);
      setLoadState({ status: "IDLE" });
    } catch {
      setLoadState({
        status: "ERROR",
        message: "운영 입력 JSON을 읽지 못했습니다.",
        details: [
          "다운로드한 SafeRoute 합성 문서 번들 또는 정규화 패키지를 사용해 주세요.",
        ],
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const downloadPackage = () => {
    downloadText(
      `${operationsPackage.packageId}.json`,
      JSON.stringify(operationsPackage, null, 2),
      "application/json",
    );
  };

  const downloadText = (
    filename: string,
    content: string,
    contentType: string,
  ) => {
    const blob = new Blob([content], {
      type: `${contentType};charset=utf-8`,
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadOperationsExport = (
    kind: "PLAN" | "NOTICE_CSV" | "AUDIT_CSV" | "AUDIT_JSON",
  ) => {
    if (!snapshot || !fleet || !workspace) return;
    if (kind === "PLAN") {
      downloadText(
        `saferoute-${snapshot.operationDate}-applied-plan.csv`,
        createAppliedPlanCsv(snapshot, workspace),
        "text/csv",
      );
      return;
    }
    if (kind === "NOTICE_CSV") {
      downloadText(
        `saferoute-${snapshot.operationDate}-customer-notice-drafts.csv`,
        createCustomerNoticeCsv(snapshot, workspace),
        "text/csv",
      );
      return;
    }
    if (kind === "AUDIT_CSV") {
      downloadText(
        `saferoute-${snapshot.operationDate}-audit.csv`,
        createAuditCsv(snapshot, workspace),
        "text/csv",
      );
      return;
    }
    downloadText(
      `saferoute-${snapshot.operationDate}-operations.json`,
      JSON.stringify(
        createOperationsExportBundle(snapshot, fleet, workspace),
        null,
        2,
      ),
      "application/json",
    );
  };

  const selectedExplanation = selectedArtifacts
    ? explanations[selectedArtifacts.decision.decisionId]
    : undefined;

  return (
    <div className="operations-shell">
      <a className="skip-link" href="#operations-main">
        본문으로 건너뛰기
      </a>
      <aside className="operations-sidebar" aria-label="SafeRoute 서비스 메뉴">
        <a className="operations-brand" href="/operations">
          <span aria-hidden="true">SR</span>
          <span>
            <strong>SafeRoute AI</strong>
            <small>합성 운영 서비스</small>
          </span>
        </a>
        <nav role="tablist" aria-label="관리자 운영 화면">
          {adminTabs.map((tab) => (
            <button
              key={tab.value}
              id={`operations-tab-${tab.value.toLowerCase()}`}
              type="button"
              role="tab"
              aria-selected={adminTab === tab.value}
              aria-controls={`operations-panel-${tab.value.toLowerCase()}`}
              className={adminTab === tab.value ? "active" : undefined}
              onClick={() => selectAdminTab(tab.value)}
              onKeyDown={(event) => {
                if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
                  return;
                }
                event.preventDefault();
                const currentIndex = adminTabs.findIndex(
                  (item) => item.value === tab.value,
                );
                const nextIndex =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? adminTabs.length - 1
                      : event.key === "ArrowUp"
                        ? (currentIndex - 1 + adminTabs.length) %
                          adminTabs.length
                        : (currentIndex + 1) % adminTabs.length;
                const nextTab = adminTabs[nextIndex];
                selectAdminTab(nextTab.value);
                window.requestAnimationFrame(() => {
                  document
                    .getElementById(
                      `operations-tab-${nextTab.value.toLowerCase()}`,
                    )
                    ?.focus();
                });
              }}
            >
              <span aria-hidden="true">{tab.icon}</span> {tab.label}
            </button>
          ))}
        </nav>
        <div className="operations-boundary">
          <strong>합성 운영 모드</strong>
          <p>실제 기사·고객·GPS 데이터는 포함하지 않습니다.</p>
        </div>
        <a className="operations-demo-link" href="/">
          기존 P0 데모 열기
        </a>
      </aside>

      <main id="operations-main" className="operations-main" tabIndex={-1}>
        <header className="operations-header">
          <div>
            <p className="operations-kicker">PAID PILOT READY · SYNTHETIC OPERATIONS</p>
            <h1>{activeTab.title}</h1>
            <p>{activeTab.subtitle}</p>
          </div>
          <div className="operations-header-actions">
            <span
              className={`operations-persistence state-${persistenceState.status.toLowerCase()}`}
              role="status"
              title={workspaceId}
            >
              <span aria-hidden="true">
                {persistenceState.status === "SAVED"
                  ? "✓"
                  : persistenceState.status === "UNAVAILABLE"
                    ? "!"
                    : "•"}
              </span>
              {persistenceState.label}
            </span>
            <span className="operations-mode">
              <span aria-hidden="true">◇</span> SYNTHETIC · MOCK
            </span>
            <button type="button" className="button button-neutral" onClick={downloadPackage}>
              정규화 패키지 내려받기
            </button>
            <a
              className="button button-neutral"
              href={bundledDocumentTemplateUrl}
              download="daily-operations-documents-2026-07-25-bundled-v1.json"
            >
              합성 문서 번들 내려받기
            </a>
          </div>
        </header>

        {adminTab === "DAY" && (
          <div
            id="operations-panel-day"
            className="operations-tab-panel"
            role="tabpanel"
            aria-labelledby="operations-tab-day"
            tabIndex={-1}
          >
        <section id="operations-day" className="operations-import-card">
          <div>
            <p className="operations-section-label">일일 운영 입력</p>
            <h2>{operationsPackage.operationDate} 운영 패키지</h2>
            <ul>
              <li>활성 기사 {operationsPackage.records.length}명</li>
              <li>허브 {new Set(operationsPackage.records.map((record) => record.hub.hubId)).size}곳</li>
              <li>남은 배송 {operationsPackage.records.reduce((total, record) => total + record.plan.remainingStopCount, 0)}건</li>
              <li>
                입력{" "}
                {inputSummary.kind === "DOCUMENT_BUNDLE"
                  ? `합성 문서 ${inputSummary.documentCount}개`
                  : "정규화 패키지"}
              </li>
              <li>추출 상태 {inputSummary.label}</li>
              <li>출처 {operationsPackage.source === "BUNDLED_SAMPLE" ? "검증된 번들 샘플" : "사용자 업로드"}</li>
            </ul>
          </div>
          <div className="operations-import-actions">
            <input
              ref={fileInputRef}
              id="operations-package-file"
              className="visually-hidden"
              type="file"
              accept="application/json,.json"
              aria-label="합성 운영 문서 번들 또는 정규화 패키지 선택"
              onChange={(event) => void onPackageFile(event.currentTarget.files?.[0])}
            />
            <label className="button button-neutral" htmlFor="operations-package-file">
              문서 번들·JSON 선택
            </label>
            <button
              type="button"
              className="button button-primary"
              disabled={loadState.status === "LOADING"}
              onClick={() => void calculateOperationsDay()}
            >
              {loadState.status === "LOADING" ? "전체 계산 중…" : "운영일 확정·전체 계산"}
            </button>
          </div>
        </section>

        {loadState.status === "LOADING" && (
          <div className="operations-notice" role="status">
            <span className="operations-spinner" aria-hidden="true" />
            {loadState.message}
          </div>
        )}
        {loadState.status === "ERROR" && (
          <div className="operations-notice error" role="alert">
            <strong>{loadState.message}</strong>
            {loadState.details.length > 0 && (
              <ul>
                {loadState.details.slice(0, 8).map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
          </div>
        )}
            {snapshot && fleet && workspace && (
              <section className="operations-day-ready" aria-label="운영일 확정 결과">
                <div>
                  <p className="operations-section-label">운영일 확정 완료</p>
                  <h2>{fleet.courierCount}명 전체 평가 · 지원 결정 {fleet.supportDecisionCount}건</h2>
                  <p>
                    불변 스냅샷 {snapshot.snapshotVersion}이 저장되었습니다.
                    지원 상황에서 우선순위와 Time-to-Breach를 확인하세요.
                  </p>
                </div>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => selectAdminTab("SUPPORT", true)}
                >
                  지원 상황 보기
                </button>
              </section>
            )}
          </div>
        )}

        {adminTab !== "DAY" && (!snapshot || !fleet || !workspace) && (
          <section
            id={`operations-panel-${adminTab.toLowerCase()}`}
            className="operations-tab-empty"
            role="tabpanel"
            aria-labelledby={`operations-tab-${adminTab.toLowerCase()}`}
            tabIndex={-1}
          >
            <span aria-hidden="true">▤</span>
            <h2>먼저 오늘의 운영자료를 확정해 주세요</h2>
            <p>
              운영 스냅샷이 만들어진 뒤 지원 상황·경로·개입·감사 화면을
              같은 데이터로 연결합니다.
            </p>
            <button
              type="button"
              className="button button-primary"
              onClick={() => selectAdminTab("DAY", true)}
            >
              일일 운영으로 이동
            </button>
          </section>
        )}

        {snapshot && fleet && workspace && adminTab !== "DAY" && (
          <div
            id={`operations-panel-${adminTab.toLowerCase()}`}
            className="operations-tab-panel"
            role="tabpanel"
            aria-labelledby={`operations-tab-${adminTab.toLowerCase()}`}
            tabIndex={-1}
          >
            {adminTab === "SUPPORT" && (
            <section className="operations-summary" aria-label="전체 기사 평가 요약">
              <article>
                <span>평가 완료</span>
                <strong>{fleet.courierCount}명</strong>
                <small>누락 없이 전체 계산</small>
              </article>
              <article className="support">
                <span>지원 필요</span>
                <strong>{fleet.supportDecisionCount}건</strong>
                <small>각각 독립된 decision</small>
              </article>
              <article>
                <span>관찰</span>
                <strong>{fleet.monitorCount}명</strong>
                <small>계획 변경 없이 모니터링</small>
              </article>
              <article>
                <span>운영 스냅샷</span>
                <strong>{snapshot.snapshotVersion}</strong>
                <small>{formatEvaluatedAt(snapshot.evaluatedAt)}</small>
              </article>
            </section>
            )}

            {adminTab === "ROUTE" && (
            <OperationsMap
              operationsPackage={operationsPackage}
              selectedCourierId={selectedQueueItem?.courierId}
              supportCourierIds={supportCourierIds}
              onSelectCourier={(courierId) => {
                const queueItem = fleet.supportQueue.find(
                  (item) => item.courierId === courierId,
                );
                if (queueItem) openDecision(queueItem.decisionId);
              }}
            />
            )}

            {(adminTab === "SUPPORT" || adminTab === "INTERVENTIONS") && (
            <section
              id="support-workspace"
              className={`operations-workspace tab-${adminTab.toLowerCase()}`}
            >
              <div className="operations-fleet-panel">
                <div className="operations-panel-header">
                  <div>
                    <p className="operations-section-label">전체 기사</p>
                    <h2>안전지원 큐</h2>
                  </div>
                  <div className="operations-filter" aria-label="기사 상태 필터">
                    {(["SUPPORT", "ALL", "MONITOR", "STABLE"] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={filter === item ? "active" : ""}
                        aria-pressed={filter === item}
                        onClick={() => setFilter(item)}
                      >
                        {item === "SUPPORT"
                          ? "지원"
                          : item === "ALL"
                            ? "전체"
                            : item === "MONITOR"
                              ? "관찰"
                              : "안정"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="operations-courier-list">
                  {visibleEvaluations.map((evaluation) => {
                    const queueItem = fleet.supportQueue.find(
                      (item) => item.courierId === evaluation.courierId,
                    );
                    const selected = queueItem?.decisionId === selectedDecisionId;
                    return (
                      <button
                        key={evaluation.courierId}
                        type="button"
                        className={`operations-courier-row state-${evaluation.supportState.toLowerCase()} ${selected ? "selected" : ""}`}
                        disabled={!queueItem}
                        onClick={() => queueItem && openDecision(queueItem.decisionId)}
                      >
                        <span className="operations-queue-position">
                          {queueItem ? queueItem.queuePosition : "—"}
                        </span>
                        <span className="operations-courier-name">
                          <strong>{evaluation.courierId}</strong>
                          <small>{supportReasonLabels[evaluation.supportReason]}</small>
                        </span>
                        <span className="operations-budget">
                          <small>현재 / 계획 최저</small>
                          <strong>
                            {formatBudget(evaluation.safety.currentBudget)} /{" "}
                            {formatBudget(evaluation.safety.minimumForecastBudget)}
                          </strong>
                        </span>
                        <span className="operations-state-label">
                          {supportStateLabels[evaluation.supportState]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="operations-decision-panel">
                {!selectedDecisionId && (
                  <div className="operations-empty-decision">
                    <span aria-hidden="true">◈</span>
                    <h2>지원 건을 선택하세요</h2>
                    <p>
                      한 명의 고정 데모가 아니라 입력에서 생성된 모든 지원 건을
                      독립적으로 확인할 수 있습니다.
                    </p>
                  </div>
                )}
                {selectedDecisionId && decisionLoading && (
                  <div className="operations-empty-decision" role="status">
                    <span className="operations-spinner" aria-hidden="true" />
                    <h2>개입 후보를 전체 계획으로 재계산 중입니다</h2>
                  </div>
                )}
                {selectedArtifacts && !decisionLoading && (
                  <>
                    <div className="operations-panel-header">
                      <div>
                        <p className="operations-section-label">선택된 지원 결정</p>
                        <h2>{selectedArtifacts.queueItem.courierId}</h2>
                        <code>{selectedArtifacts.decision.decisionId}</code>
                      </div>
                      <span className="operations-status-pill">
                        {decisionStatusLabels[selectedArtifacts.decision.status] ??
                          selectedArtifacts.decision.status}
                      </span>
                    </div>
                    <div className="operations-decision-metrics">
                      <div>
                        <span>현재 안전여유</span>
                        <strong>{formatBudget(selectedArtifacts.queueItem.currentBudget)}</strong>
                      </div>
                      <div>
                        <span>계획 최저</span>
                        <strong>
                          {formatBudget(
                            evaluationByCourier.get(
                              selectedArtifacts.queueItem.courierId,
                            )?.safety.minimumForecastBudget,
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>신뢰도</span>
                        <strong>{selectedArtifacts.queueItem.confidence}</strong>
                      </div>
                    </div>
                    <div className="operations-candidate-list">
                      {selectedArtifacts.evaluations.map((evaluation) => {
                        const candidate = selectedArtifacts.candidates.find(
                          (item) => item.candidateId === evaluation.candidateId,
                        );
                        if (!candidate) return null;
                        const isSelected =
                          candidate.candidateId ===
                          selectedArtifacts.selectedCandidate.candidateId;
                        return (
                          <article
                            key={candidate.candidateId}
                            className={isSelected ? "recommended" : ""}
                          >
                            <div>
                              <strong>
                                {candidate.actions
                                  .map((action) => interventionLabel(action.type))
                                  .join(" + ")}
                              </strong>
                              {isSelected && <span>추천</span>}
                            </div>
                            <dl>
                              <div>
                                <dt>실행 가능</dt>
                                <dd>
                                  {evaluation.feasibility.status === "FEASIBLE"
                                    ? "가능"
                                    : "불가"}
                                </dd>
                              </div>
                              <div>
                                <dt>조정 후 최저</dt>
                                <dd>
                                  {formatBudget(
                                    evaluation.courierImpacts.find(
                                      (impact) => impact.role === "SOURCE",
                                    )?.candidateMinimumBudget,
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt>ETA 변화</dt>
                                <dd>{evaluation.etaDeltaMinutes}분</dd>
                              </div>
                            </dl>
                          </article>
                        );
                      })}
                    </div>
                    <section
                      className="operations-ai-explanation"
                      aria-labelledby="operations-ai-heading"
                    >
                      <div>
                        <p className="operations-section-label">AI 설명 계층</p>
                        <h3 id="operations-ai-heading">검증된 근거 설명</h3>
                      </div>
                      {!selectedExplanation && (
                        <button
                          type="button"
                          className="button button-neutral button-small"
                          disabled={explanationLoading}
                          onClick={() => void explainDecision()}
                        >
                          {explanationLoading
                            ? "Upstage 확인 중…"
                            : "Upstage 근거 설명 생성"}
                        </button>
                      )}
                      {selectedExplanation && (
                        <>
                          <span
                            className={`operations-ai-status ${
                              selectedExplanation.status === "FALLBACK"
                                ? "is-fallback"
                                : "is-live"
                            }`}
                          >
                            {selectedExplanation.status === "FALLBACK"
                              ? `Fallback 템플릿 · ${selectedExplanation.fallbackReason.code}`
                              : selectedExplanation.status === "LIVE"
                                ? "Upstage Live · 스키마 검증 통과"
                                : "Upstage Mock · 스키마 검증 통과"}
                          </span>
                          <p>{selectedExplanation.data.summary}</p>
                          <small>
                            AI는 수치·추천·실행 가능 여부를 계산하거나 변경하지
                            않으며, 허용된 결정 사실만 설명합니다.
                          </small>
                        </>
                      )}
                    </section>
                    <div className="operations-next-step">
                      {actionMessage && (
                        <p className="operations-action-message" role="status">
                          {actionMessage}
                        </p>
                      )}
                      {selectedArtifacts.decision.status ===
                        "RIDER_RESPONSE_PENDING" && (
                        <>
                          <strong>영향 기사 응답</strong>
                          <p>
                            같은 decision ID와 근거를 확인한 뒤 각 기사가 직접
                            응답합니다.
                          </p>
                          <div className="operations-consent-list">
                            {selectedArtifacts.decision.consentRequirements
                              .filter((requirement) => requirement.required)
                              .map((requirement) => (
                                <div key={requirement.courierId}>
                                  <span>
                                    <strong>{requirement.courierId}</strong>
                                    <small>
                                      {requirement.status === "PENDING"
                                        ? "응답 대기"
                                        : requirement.status}
                                    </small>
                                  </span>
                                  {requirement.status === "PENDING" && (
                                    <span>
                                      {persistenceState.status === "SAVED" ? (
                                        <a
                                          className="button button-primary button-small"
                                          href={
                                            workspaceId
                                              ? `/operations/rider?workspace=${encodeURIComponent(
                                                  workspaceId,
                                                )}&decision=${encodeURIComponent(
                                                  selectedArtifacts.decision.decisionId,
                                                )}&courier=${encodeURIComponent(
                                                  requirement.courierId,
                                                )}`
                                              : "#"
                                          }
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          기사 화면 열기
                                        </a>
                                      ) : (
                                        <span className="operations-rider-link-pending">
                                          저장 후 기사 화면 활성화
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        className="button button-neutral button-small"
                                        onClick={() =>
                                          void refreshOperationsState()
                                        }
                                      >
                                        최신 응답 불러오기
                                      </button>
                                    </span>
                                  )}
                                </div>
                              ))}
                          </div>
                        </>
                      )}
                      {selectedArtifacts.decision.status ===
                        "ADMIN_APPROVAL_REQUIRED" && (
                        <>
                          <strong>관리자 최종 확인</strong>
                          <p>
                            승인 직전에 현재 운영 스냅샷과 영향 기사 계획을 다시
                            계산합니다.
                          </p>
                          <div className="operations-admin-actions">
                            <button
                              type="button"
                              className="button button-primary"
                              onClick={approveDecision}
                            >
                              재검증 후 승인·적용
                            </button>
                            <button
                              type="button"
                              className="button button-neutral"
                              onClick={holdDecision}
                            >
                              보류
                            </button>
                          </div>
                        </>
                      )}
                      {selectedArtifacts.decision.status ===
                        "NOTICE_RECORDED" && (
                        <>
                          <strong>결정 완료</strong>
                          <p>
                            변경 계획과 ETA가 적용되고 고객안내 초안 및 감사
                            이벤트가 기록되었습니다.
                          </p>
                          <ul className="operations-completion-list">
                            <li>적용 계획 {selectedArtifacts.decision.appliedPlanVersion}</li>
                            <li>고객안내 초안 {selectedArtifacts.decision.customerNoticeIds.length}건</li>
                            <li>감사 이벤트 {selectedArtifacts.decision.events.length}건</li>
                          </ul>
                          <div className="operations-notice-drafts">
                            {selectedArtifacts.decision.customerNoticeIds
                              .map(
                                (noticeId) =>
                                  workspace.store.customerNoticeDrafts[
                                    noticeId
                                  ],
                              )
                              .filter((draft) => draft !== undefined)
                              .slice(0, 3)
                              .map((draft) => (
                                <p key={draft.noticeId}>
                                  <strong>발송 안 함 · 초안</strong>{" "}
                                  {draft.message}
                                </p>
                              ))}
                          </div>
                        </>
                      )}
                      {[
                        "MODIFICATION_REQUESTED",
                        "RIDER_DECLINED",
                        "ADMIN_HELD",
                        "REVALIDATION_REQUIRED",
                        "APPLY_FAILED",
                      ].includes(selectedArtifacts.decision.status) && (
                        <>
                          <strong>현재 계획 유지</strong>
                          <p>
                            승인·적용 조건을 충족하지 않아 기존 계획은 변경되지
                            않았습니다. 새 대안 계산은 다음 서비스 단계에서
                            시작합니다.
                          </p>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>
            )}

            {adminTab === "AUDIT" && (
            <section id="operations-evidence" className="operations-evidence">
              <div>
                <p className="operations-section-label">감사 가능한 입력</p>
                <h2>운영 스냅샷 근거</h2>
              </div>
              <dl>
                <div>
                  <dt>Snapshot ID</dt>
                  <dd>{snapshot.snapshotId}</dd>
                </div>
                <div>
                  <dt>Package SHA-256</dt>
                  <dd>{snapshot.packageHash}</dd>
                </div>
                <div>
                  <dt>데이터 모드</dt>
                  <dd>SYNTHETIC · MOCK</dd>
                </div>
                <div>
                  <dt>원문 보존</dt>
                  <dd>없음 · 정규화 입력만 메모리 처리</dd>
                </div>
              </dl>
              <div className="operations-export-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => downloadOperationsExport("PLAN")}
                >
                  적용 계획 CSV
                </button>
                <button
                  type="button"
                  className="button button-neutral"
                  onClick={() => downloadOperationsExport("NOTICE_CSV")}
                >
                  고객안내 초안 CSV
                </button>
                <button
                  type="button"
                  className="button button-neutral"
                  onClick={() => downloadOperationsExport("AUDIT_CSV")}
                >
                  감사 이벤트 CSV
                </button>
                <button
                  type="button"
                  className="button button-neutral"
                  onClick={() => downloadOperationsExport("AUDIT_JSON")}
                >
                  운영 증거 JSON
                </button>
              </div>
            </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
