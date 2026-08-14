import {AbsoluteFill, Sequence} from "remotion";
import {FINAL_FPS, FINAL_SCENES} from "./constants";
import {BoundaryScene} from "./scenes/BoundaryScene";
import {IntroScene} from "./scenes/IntroScene";
import {OutroScene} from "./scenes/OutroScene";
import {ProductScene} from "./scenes/ProductScene";
import {RiderScene} from "./scenes/RiderScene";

const sceneContent = [
  <IntroScene key="intro" />,
  <ProductScene
    key="overview"
    index={1}
    kicker="02 · CONTROL TOWER"
    title="25명의 남은 계획을 한 화면에서 봅니다"
    note="향후 60분 · 지원 우선순위 · Safety Budget · 다음 배송지"
    image="01-control-tower.png"
  />,
  <ProductScene
    key="route"
    index={2}
    kicker="03 · ROUTE FOCUS"
    title="기사별 경로와 다음 배송지를 독립적으로 추적합니다"
    note="지도 확대 상태를 유지하며, 기사별 위치·경로·배송 순서를 확인"
    image="02-courier-route.png"
  />,
  <ProductScene
    key="scenario"
    index={3}
    kicker="04 · SCENARIO PREDICTION"
    title="입력한 운영상황으로 현재 계획을 다시 예측합니다"
    note="폭염·계단 조건 → 42분 후 · 15번째 배송지 전 한계 초과 예상"
    image="09-scenario-prediction.png"
  />,
  <ProductScene
    key="support"
    index={4}
    kicker="05 · SAFE INTERVENTION"
    title="안전하지 않은 후보는 먼저 제외합니다"
    note="안전 제약 통과 후보 안에서만 휴식·순서·경로·배송 분담을 비교"
    image="03-support-comparison.png"
  />,
  <ProductScene
    key="ai"
    index={5}
    kicker="06 · EVIDENCE-GROUNDED AI"
    title="AI는 결정 근거를 설명하되 판정을 바꾸지 못합니다"
    note="Upstage 검증 설명 · A.X v2 자격 증거 · Local runtime 미활성"
    image="04-ai-evidence.png"
  />,
  <RiderScene key="riders" index={6} />,
  <ProductScene
    key="approval"
    index={7}
    kicker="08 · ADMIN APPROVAL"
    title="필수 기사 확인 뒤 관리자가 최종 승인합니다"
    note="다른 안전한 지원안 · 보류 · 결정 취소 · 승인 및 적용"
    image="07-admin-approval.png"
  />,
  <ProductScene
    key="applied"
    index={8}
    kicker="09 · ATOMIC PLAN UPDATE"
    title="승인된 지원안을 운영계획에 반영합니다"
    note="경로 · 배송순서 · ETA · 고객안내 상태를 함께 갱신"
    image="08-plan-applied.png"
  />,
  <BoundaryScene key="boundary" index={9} />,
  <OutroScene key="outro" />,
] as const;

export const SafeRouteFinalSilentVideo = () => {
  let from = 0;
  return (
    <AbsoluteFill
      style={{
        background: "#041827",
        fontFamily: '"Malgun Gothic", "Noto Sans KR", Arial, sans-serif',
      }}
    >
      {FINAL_SCENES.map((scene, index) => {
        const durationInFrames = scene.seconds * FINAL_FPS;
        const sceneFrom = from;
        from += durationInFrames;
        return (
          <Sequence
            key={scene.id}
            from={sceneFrom}
            durationInFrames={durationInFrames}
            premountFor={FINAL_FPS}
          >
            {sceneContent[index]}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
