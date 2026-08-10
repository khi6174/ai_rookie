import { useCallback, useEffect, useState } from "react";
import {
  loadIntegrationSandboxHealth,
  type IntegrationSandboxHealth,
} from "../application/operations/integrationSandboxHealth";
import "./integration-sandbox-status.css";

type LoadState =
  | { status: "LOADING" }
  | { status: "READY"; health: IntegrationSandboxHealth }
  | { status: "ERROR"; message: string };

const gates = [
  ["합성 인증·권한", "서버 전용 token과 tenant·site·actor·role을 모두 검증"],
  ["TMS Simulator", "정상·중복·역순·지연 이벤트를 공급자 독립 계약으로 재현"],
  ["계획 적용 Outbox", "동의·승인·최신 버전·Risk Transfer Guard 통과 명령만 기록"],
  ["고객안내 Outbox", "합성 수신자와 승인 템플릿만 기록하고 네트워크 발송 금지"],
  ["D1 복구", "낙관적 버전, 보존 만료, 백업 해시와 무변경 복원 검증"],
  ["운영 보호", "rate limit, Kill switch, 장애 Fallback과 감사기록"],
] as const;

export function IntegrationSandboxStatus() {
  const [state, setState] = useState<LoadState>({ status: "LOADING" });

  const refresh = useCallback(async () => {
    setState({ status: "LOADING" });
    try {
      setState({
        status: "READY",
        health: await loadIntegrationSandboxHealth(),
      });
    } catch (error) {
      setState({
        status: "ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Sandbox 상태를 확인하지 못했습니다.",
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const health = state.status === "READY" ? state.health : undefined;
  const enabled = health?.configured === true;

  return (
    <main className="integration-sandbox-status-page">
      <header className="integration-sandbox-status-hero">
        <div>
          <span className="integration-sandbox-status-kicker">
            Integration-ready · PRODUCTION_SANDBOX
          </span>
          <h1>외부 연결 전 운영 준비 상태</h1>
          <p>
            실제 TMS·인증·기사·고객 데이터 없이 계약, Outbox, 복구와 운영 보호장치를
            검증합니다. 이 화면은 실제 택배 운영이나 Live 상태를 의미하지 않습니다.
          </p>
        </div>
        <a href="/" className="integration-sandbox-status-back">관제로 돌아가기</a>
      </header>

      <section className="integration-sandbox-health" aria-labelledby="sandbox-health-title">
        <div>
          <span>공개 최소 health</span>
          <h2 id="sandbox-health-title">
            {state.status === "LOADING"
              ? "확인 중"
              : state.status === "ERROR"
                ? "확인 실패"
                : enabled
                  ? "준비됨 · 합성 운영 전용"
                  : "비활성 · 안전하게 닫힘"}
          </h2>
          <p role="status" aria-live="polite">
            {state.status === "LOADING"
              ? "서버에서 민감정보 없는 상태만 확인하고 있습니다."
              : state.status === "ERROR"
                ? state.message
                : enabled
                  ? "상세 readiness와 운영 변경에는 서버 전용 인증이 필요합니다."
                  : "완전한 Sandbox 설정이 없으므로 수신·적용·Outbox endpoint가 요청 본문을 읽기 전에 차단됩니다."}
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={state.status === "LOADING"}>
          상태 다시 확인
        </button>
      </section>

      <section className="integration-sandbox-boundaries" aria-labelledby="sandbox-boundary-title">
        <div className="integration-sandbox-section-heading">
          <span>항상 유지되는 경계</span>
          <h2 id="sandbox-boundary-title">외부 연결은 모두 꺼져 있습니다</h2>
        </div>
        <dl>
          <div><dt>실제 TMS</dt><dd>{health?.externalTmsConnected ? "연결" : "미연결"}</dd></div>
          <div><dt>실제 인증</dt><dd>{health?.actualAuthenticationConnected ? "연결" : "미연결"}</dd></div>
          <div><dt>고객 발송</dt><dd>{health?.customerNetworkDeliveryEnabled ? "활성" : "비활성"}</dd></div>
          <div><dt>실제 개인정보</dt><dd>{health?.actualPersonalDataAllowed ? "허용" : "허용 안 함"}</dd></div>
        </dl>
      </section>

      <section className="integration-sandbox-gates" aria-labelledby="sandbox-gates-title">
        <div className="integration-sandbox-section-heading">
          <span>완료 Goal</span>
          <h2 id="sandbox-gates-title">Adapter 연결 전 기술 Gate</h2>
        </div>
        <ol>
          {gates.map(([title, description]) => (
            <li key={title}>
              <strong>{title}</strong>
              <span>{description}</span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="integration-sandbox-status-footer">
        <strong>승격 조건</strong>
        <p>
          실제 원천·인증·개인정보·보존·TMS 보상 트랜잭션·고객 발송·현장 Pilot이
          별도로 승인되고 검증된 뒤에만 LIVE_PILOT로 전환합니다.
        </p>
      </footer>
    </main>
  );
}
