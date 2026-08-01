import { useEffect, useMemo, useRef, useState } from "react";
import {
  createOperationsPersistedSession,
  getOrCreateOperationsWorkspaceId,
  loadOperationsPersistedSession,
  respondToOperationsDecision,
  restoreOperationsPersistedSession,
  saveOperationsPersistedSession,
  type FleetEvaluation,
  type OperationsDecisionWorkspace,
} from "../application/operations";
import { publishDemoRiderDangerSignal } from "../application/demoRiderDangerSignal";
import type {
  DailyOperationsPackage,
  DailyOperationsSnapshot,
} from "../domain/operations";
import { OperationsMap } from "./OperationsMap";

type RiderLoadState =
  | { status: "LOADING" }
  | { status: "READY"; baseSavedAt: string }
  | { status: "ERROR"; message: string };

type OperationsRiderTab = "ROUTE" | "SUPPORT" | "PROFILE";

const riderTabs: Array<{
  value: OperationsRiderTab;
  icon: string;
  label: string;
}> = [
  { value: "ROUTE", icon: "🚚", label: "운행" },
  { value: "SUPPORT", icon: "◈", label: "안전지원" },
  { value: "PROFILE", icon: "●", label: "내 정보" },
];

function actionLabel(type: string) {
  return {
    REST: "휴식",
    TRANSFER_STOPS: "물량이관",
    REORDER_STOPS: "배송순서 조정",
    SAFER_ROUTE: "안전경로",
    SAFE_DELAY: "안전지연",
  }[type] ?? type;
}

export function OperationsRiderService() {
  const [riderTab, setRiderTab] =
    useState<OperationsRiderTab>("SUPPORT");
  const query = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const requestedWorkspaceId =
    query.get("workspace") ??
    getOrCreateOperationsWorkspaceId(window.localStorage);
  const decisionId = query.get("decision") ?? "";
  const courierId = query.get("courier") ?? "";
  const [operationsPackage, setOperationsPackage] =
    useState<DailyOperationsPackage>();
  const [snapshot, setSnapshot] = useState<DailyOperationsSnapshot>();
  const [fleet, setFleet] = useState<FleetEvaluation>();
  const [workspace, setWorkspace] =
    useState<OperationsDecisionWorkspace>();
  const [loadState, setLoadState] = useState<RiderLoadState>({
    status: "LOADING",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [dangerDemoMessage, setDangerDemoMessage] = useState<string>();
  const baseSavedAtRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!decisionId || !courierId) {
        setLoadState({
          status: "ERROR",
          message: "기사 검토 링크에 decision과 courier 정보가 없습니다.",
        });
        return;
      }
      const result = await loadOperationsPersistedSession(
        requestedWorkspaceId,
      );
      if (cancelled) return;
      if (result.status !== "LOADED") {
        setLoadState({
          status: "ERROR",
          message:
            "최신 합성 운영 결정을 불러오지 못했습니다. 관리자에게 링크 갱신을 요청하세요.",
        });
        return;
      }
      try {
        const restored = await restoreOperationsPersistedSession(
          result.session,
        );
        const artifacts = restored.workspace.decisions.find(
          (item) => item.decision.decisionId === decisionId,
        );
        const requirement = artifacts?.decision.consentRequirements.find(
          (item) => item.courierId === courierId && item.required,
        );
        if (!artifacts || !requirement) {
          throw new Error("이 기사에게 요청된 결정이 아닙니다.");
        }
        baseSavedAtRef.current = result.updatedAt;
        setOperationsPackage(restored.operationsPackage);
        setSnapshot(restored.snapshot);
        setFleet(restored.fleet);
        setWorkspace(restored.workspace);
        setLoadState({
          status: "READY",
          baseSavedAt: result.updatedAt,
        });
      } catch (error) {
        setLoadState({
          status: "ERROR",
          message:
            error instanceof Error
              ? error.message
              : "기사 검토 계약을 확인하지 못했습니다.",
        });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [courierId, decisionId, requestedWorkspaceId]);

  const artifacts = workspace?.decisions.find(
    (item) => item.decision.decisionId === decisionId,
  );
  const requirement = artifacts?.decision.consentRequirements.find(
    (item) => item.courierId === courierId,
  );
  const courierImpact = artifacts?.selectedEvaluation.courierImpacts.find(
    (impact) => impact.courierId === courierId,
  );
  const riderSupportIds = useMemo(
    () => new Set([courierId]),
    [courierId],
  );
  const selectRiderTab = (
    tab: OperationsRiderTab,
    focusPanel = false,
  ) => {
    setRiderTab(tab);
    if (focusPanel) {
      window.requestAnimationFrame(() => {
        document
          .getElementById(
            `operations-rider-panel-${tab.toLowerCase()}`,
          )
          ?.focus();
      });
    }
  };

  const respond = async (
    response: "CONSENTED" | "MODIFICATION_REQUESTED" | "DECLINED",
  ) => {
    if (
      !operationsPackage ||
      !snapshot ||
      !fleet ||
      !workspace ||
      !requirement ||
      requirement.status !== "PENDING"
    ) {
      return;
    }
    setSaving(true);
    setMessage(undefined);
    try {
      const nextWorkspace = respondToOperationsDecision(workspace, {
        decisionId,
        courierId,
        response,
      });
      const session = createOperationsPersistedSession({
        workspaceId: requestedWorkspaceId,
        operationsPackage,
        snapshot,
        fleet,
        workspace: nextWorkspace,
      });
      const saved = await saveOperationsPersistedSession(session, {
        baseSavedAt: baseSavedAtRef.current,
      });
      if (saved.status !== "SAVED") {
        setMessage(
          saved.status === "CONFLICT"
            ? "다른 응답이 먼저 저장되었습니다. 화면을 새로고침해 최신 결정을 확인하세요."
            : "응답을 저장하지 못했습니다. 현재 계획은 변경되지 않았습니다.",
        );
        return;
      }
      baseSavedAtRef.current = saved.updatedAt;
      setWorkspace(nextWorkspace);
      setMessage(
        response === "CONSENTED"
          ? "동의가 안전하게 기록되었습니다. 관리자 승인 전에는 계획이 변경되지 않습니다."
          : response === "MODIFICATION_REQUESTED"
            ? "수정 요청이 기록되었습니다. 현재 계획을 유지합니다."
            : "거절이 기록되었습니다. 불이익 없이 현재 계획을 유지합니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const sendDangerDemoSignal = () => {
    let storage: Storage | undefined;
    try {
      storage = window.localStorage;
    } catch {
      storage = undefined;
    }
    const result = publishDemoRiderDangerSignal({
      courierId: "R-022",
      storage,
      eventTarget: window,
    });
    setDangerDemoMessage(
      result.persisted
        ? "관제 화면에 합성 위험 신호를 보냈습니다."
        : "브라우저 저장소가 차단되어 신호를 보존하지 못했습니다.",
    );
  };

  if (loadState.status === "LOADING") {
    return (
      <main className="operations-rider-loading" aria-busy="true">
        <span className="operations-spinner" aria-hidden="true" />
        기사 검토 결정을 불러오는 중입니다.
      </main>
    );
  }
  if (loadState.status === "ERROR" || !artifacts || !requirement) {
    return (
      <main className="operations-rider-error">
        <strong>결정을 열 수 없습니다</strong>
        <p>
          {loadState.status === "ERROR"
            ? loadState.message
            : "요청된 결정을 찾지 못했습니다."}
        </p>
        <a href="/operations">관리자 운영 화면으로 돌아가기</a>
      </main>
    );
  }

  return (
    <div className="operations-rider-shell">
      <header className="operations-rider-header">
        <a href="/operations" aria-label="SafeRoute 관리자 운영 화면">
          <span aria-hidden="true">SR</span>
          <strong>SafeRoute AI</strong>
        </a>
        <span>
          {riderTab === "ROUTE"
            ? "오늘의 운행"
            : riderTab === "SUPPORT"
              ? "합성 기사 검토"
              : "Demo 계정"}
        </span>
      </header>
      <main>
        {riderTab === "ROUTE" && (
          <div
            id="operations-rider-panel-route"
            className="operations-rider-tab-panel"
            role="tabpanel"
            aria-labelledby="operations-rider-tab-route"
            tabIndex={-1}
          >
            <section className="operations-rider-hero is-route">
              <p>합성 운행 · {courierId}</p>
              <h1>다음 배송과 안전지원 경로를 확인하세요</h1>
              <span>{decisionId}</span>
            </section>

            <section className="operations-rider-route-summary">
              <div>
                <span>현재 결정</span>
                <strong>
                  {requirement.status === "PENDING"
                    ? "안전지원 확인 필요"
                    : "응답 기록 완료"}
                </strong>
              </div>
              <button
                type="button"
                className="button button-primary"
                onClick={() => selectRiderTab("SUPPORT", true)}
              >
                안전지원 검토하기
              </button>
            </section>

            <section
              className="operations-rider-danger-demo"
              aria-labelledby="operations-rider-danger-demo-title"
            >
              <div>
                <span>합성 예시 / 실제 신고 아님</span>
                <strong id="operations-rider-danger-demo-title">
                  매우 위험한 상태 감지
                </strong>
                <p>합성 위험 신호를 관제로 보냅니다.</p>
              </div>
              <button
                type="button"
                className="operations-rider-danger-demo-button"
                onClick={sendDangerDemoSignal}
              >
                응급 상황 감지 예시
              </button>
              {dangerDemoMessage && (
                <p className="operations-rider-danger-demo-status" role="status">
                  {dangerDemoMessage}
                  {dangerDemoMessage.startsWith("관제") && (
                    <a href="/dashboard-demo">대시보드에서 확인</a>
                  )}
                </p>
              )}
            </section>

            {operationsPackage && (
              <OperationsMap
                operationsPackage={operationsPackage}
                selectedCourierId={courierId}
                supportCourierIds={riderSupportIds}
                onSelectCourier={() => undefined}
              />
            )}
          </div>
        )}

        {riderTab === "SUPPORT" && (
          <div
            id="operations-rider-panel-support"
            className="operations-rider-tab-panel"
            role="tabpanel"
            aria-labelledby="operations-rider-tab-support"
            tabIndex={-1}
          >
        <section className="operations-rider-hero">
          <p>정차 후 확인 · {courierId}</p>
          <h1>이 안전지원안을 확인해 주세요</h1>
          <span>{decisionId}</span>
        </section>

        <section className="operations-rider-summary" aria-label="조정안 요약">
          <div>
            <span>제안 조치</span>
            <strong>
              {artifacts.selectedCandidate.actions
                .map((action) => actionLabel(action.type))
                .join(" + ")}
            </strong>
          </div>
          <div>
            <span>내 조정 전 최저</span>
            <strong>
              {courierImpact?.baselineMinimumBudget.toFixed(1) ?? "—"}
            </strong>
          </div>
          <div>
            <span>내 조정 후 최저</span>
            <strong>
              {courierImpact?.candidateMinimumBudget.toFixed(1) ?? "—"}
            </strong>
          </div>
          <div>
            <span>ETA 변화</span>
            <strong>{artifacts.selectedEvaluation.etaDeltaMinutes}분</strong>
          </div>
        </section>

        <section className="operations-rider-rights">
          <strong>응답 전 확인</strong>
          <ul>
            <li>동의 전에는 배송계획이 바뀌지 않습니다.</li>
            <li>수정 요청이나 거절을 선택해도 불이익을 의미하지 않습니다.</li>
            <li>관리자 승인 직전에 최신 계획을 다시 검증합니다.</li>
          </ul>
        </section>

        <section className="operations-rider-response">
          <span>
            현재 응답{" "}
            <strong>
              {requirement.status === "PENDING"
                ? "대기"
                : requirement.status}
            </strong>
          </span>
          {message && <p role="status">{message}</p>}
          {requirement.status === "PENDING" ? (
            <div>
              <button
                type="button"
                className="button button-primary"
                disabled={saving}
                onClick={() => void respond("CONSENTED")}
              >
                이 조정안에 동의
              </button>
              <button
                type="button"
                className="button button-neutral"
                disabled={saving}
                onClick={() => void respond("MODIFICATION_REQUESTED")}
              >
                수정 요청
              </button>
              <button
                type="button"
                className="button button-quiet"
                disabled={saving}
                onClick={() => void respond("DECLINED")}
              >
                거절하고 현재 계획 유지
              </button>
            </div>
          ) : (
            <a href="/operations">
              응답 완료 · 관리자 운영 화면으로 돌아가기
            </a>
          )}
        </section>
          </div>
        )}

        {riderTab === "PROFILE" && (
          <div
            id="operations-rider-panel-profile"
            className="operations-rider-tab-panel"
            role="tabpanel"
            aria-labelledby="operations-rider-tab-profile"
            tabIndex={-1}
          >
            <section className="operations-rider-hero is-profile">
              <p>합성 Demo 계정</p>
              <h1>내 정보와 데이터 경계를 확인합니다</h1>
              <span>{courierId}</span>
            </section>
            <section className="operations-rider-profile-card">
              <dl>
                <div>
                  <dt>기사 ID</dt>
                  <dd>{courierId}</dd>
                </div>
                <div>
                  <dt>현재 응답</dt>
                  <dd>
                    {requirement.status === "PENDING"
                      ? "안전지원 검토 대기"
                      : requirement.status}
                  </dd>
                </div>
                <div>
                  <dt>데이터 모드</dt>
                  <dd>SYNTHETIC · 실제 개인정보 없음</dd>
                </div>
                <div>
                  <dt>결정 권리</dt>
                  <dd>동의 · 수정 요청 · 거절</dd>
                </div>
              </dl>
              <p>
                이 화면은 실제 위치·생체정보·배송기사 개인정보를 수집하지
                않습니다. 응답은 현재 합성 decision에만 연결됩니다.
              </p>
              <a href="/operations">관리자 운영 화면으로 돌아가기</a>
            </section>
          </div>
        )}
      </main>
      <nav
        className="operations-rider-tab-bar"
        role="tablist"
        aria-label="기사 주요 화면"
      >
        {riderTabs.map((tab) => (
          <button
            key={tab.value}
            id={`operations-rider-tab-${tab.value.toLowerCase()}`}
            type="button"
            role="tab"
            aria-selected={riderTab === tab.value}
            aria-controls={`operations-rider-panel-${tab.value.toLowerCase()}`}
            className={riderTab === tab.value ? "active" : undefined}
            onClick={() => selectRiderTab(tab.value)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                return;
              }
              event.preventDefault();
              const currentIndex = riderTabs.findIndex(
                (item) => item.value === tab.value,
              );
              const nextIndex =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? riderTabs.length - 1
                    : event.key === "ArrowLeft"
                      ? (currentIndex - 1 + riderTabs.length) %
                        riderTabs.length
                      : (currentIndex + 1) % riderTabs.length;
              const nextTab = riderTabs[nextIndex];
              selectRiderTab(nextTab.value);
              window.requestAnimationFrame(() => {
                document
                  .getElementById(
                    `operations-rider-tab-${nextTab.value.toLowerCase()}`,
                  )
                  ?.focus();
              });
            }}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
