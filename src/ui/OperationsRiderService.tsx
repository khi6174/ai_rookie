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
import type {
  DailyOperationsPackage,
  DailyOperationsSnapshot,
} from "../domain/operations";
import { OperationsMap } from "./OperationsMap";

type RiderLoadState =
  | { status: "LOADING" }
  | { status: "READY"; baseSavedAt: string }
  | { status: "ERROR"; message: string };

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
        <span>합성 기사 검토</span>
      </header>
      <main>
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

        {operationsPackage && (
          <OperationsMap
            operationsPackage={operationsPackage}
            selectedCourierId={courierId}
            supportCourierIds={riderSupportIds}
            onSelectCourier={() => undefined}
          />
        )}

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
      </main>
    </div>
  );
}
