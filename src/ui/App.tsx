import { scenarioFixtures } from "../adapters/fixtures";
import { ScenarioFixtureSchema } from "../domain/contracts";
import { evaluateSafetyBudget } from "../domain/safety";
import {
  createTransferCandidate,
  evaluateIntervention,
} from "../domain/interventions";

export function App() {
  const validFixtureCount = scenarioFixtures.filter(
    (fixture) => ScenarioFixtureSchema.safeParse(fixture).success,
  ).length;
  const lockedSafetyBudgetCount = scenarioFixtures.filter(
    (fixture) =>
      evaluateSafetyBudget(fixture, fixture.couriers[0].courierId).breach.status ===
      fixture.expectedAssertions.breachStatus,
  ).length;
  const scenarioA = scenarioFixtures[0];
  const sourceCourierId = scenarioA.couriers[0].courierId;
  const recipientCourierId = scenarioA.couriers[1].courierId;
  const transferResult = (count: number) =>
    evaluateIntervention(
      scenarioA,
      createTransferCandidate(scenarioA, "decision-scenario-a-v1", {
        sourceCourierId,
        recipientCourierId,
        stopIds: scenarioA.stops.slice(-count).map((stop) => stop.stopId),
      }),
    ).feasibility.status;
  const riskTransferRegressionLocked =
    transferResult(8) === "FEASIBLE" && transferResult(12) === "INFEASIBLE";

  return (
    <main className="shell">
      <p className="eyebrow">SafeRoute AI · 결정론적 기반 검증 완료</p>
      <h1>안전을 배송계획의 하드 제약으로</h1>
      <p className="mission">
        모든 영향 기사의 미래 안전 가능영역을 검증하고, 같은 근거와 사람의
        동의·승인 아래 계획을 갱신하는 감사 가능한 운영 표준을 만듭니다.
      </p>
      <section aria-labelledby="foundation-status" className="status-card">
        <h2 id="foundation-status">결정론적 기반 상태</h2>
        <dl>
          <div>
            <dt>대표 fixture</dt>
            <dd>{validFixtureCount} / 3 유효</dd>
          </div>
          <div>
            <dt>데이터 모드</dt>
            <dd>Demo fixture</dd>
          </div>
          <div>
            <dt>Safety Budget 회귀</dt>
            <dd>{lockedSafetyBudgetCount} / 3 고정</dd>
          </div>
          <div>
            <dt>Risk Transfer Guard</dt>
            <dd>{riskTransferRegressionLocked ? "8건 허용 · 12건 차단" : "검증 필요"}</dd>
          </div>
          <div>
            <dt>다음 게이트</dt>
            <dd>순서변경·안전경로·Safe Delay</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
