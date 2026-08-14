import {AbsoluteFill, Sequence} from "remotion";
import {FINAL_FPS, FINAL_SCENES} from "./constants";
import {IntroScene} from "./scenes/IntroScene";
import {OutroScene} from "./scenes/OutroScene";
import {ProductScene} from "./scenes/ProductScene";
import {BoundaryPublicV2Scene} from "./scenes/BoundaryPublicV2Scene";
import {RiderPublicV2Scene} from "./scenes/RiderPublicV2Scene";
import {AppliedPublicV2Scene} from "./scenes/AppliedPublicV2Scene";

const folder = "final-2026-public-v2";

const sceneContent = [
  <IntroScene key="intro" />,
  <ProductScene
    key="overview"
    index={1}
    kicker="02 · CURRENT PUBLIC SERVICE"
    title="D1에 저장된 기사 25명을 한 화면에서 봅니다"
    note="현재 공개 배포본 · D1 운영 상태 · 향후 60분 지원 우선순위"
    image="01-control-tower-public.png"
    assetFolder={folder}
  />,
  <ProductScene
    key="route"
    index={2}
    kicker="03 · KAKAO ROUTE FOCUS"
    title="Kakao 지도에서 기사별 위치와 경로를 확인합니다"
    note="기사별 배송구역 · 현재 경로 · 다음 배송지 · 독립적인 이동"
    image="02-courier-route-public.png"
    assetFolder={folder}
  />,
  <ProductScene
    key="scenario"
    index={3}
    kicker="04 · SCENARIO PREDICTION"
    title="입력한 운영상황으로 현재 계획을 예측합니다"
    note="폭염·계단 조건 · Safety Budget · Time-to-Breach · 안전 제약 통과안"
    image="09-scenario-prediction-public.png"
    assetFolder={folder}
  />,
  <ProductScene
    key="support"
    index={4}
    kicker="05 · SAFE INTERVENTION"
    title="안전하지 않은 후보는 먼저 제외합니다"
    note="안전 제약을 통과한 후보 안에서만 휴식·순서·경로·배송 분담을 비교"
    image="03-support-comparison-public.png"
    assetFolder={folder}
  />,
  <ProductScene
    key="ai"
    index={5}
    kicker="06 · SAFE AI FALLBACK"
    title="AI 응답이 없어도 판정과 운영 흐름은 유지됩니다"
    note="현재 공개 상태: 안전 템플릿 · A.X v2는 자격 검증 증거 · Local runtime 미활성"
    image="04-ai-evidence-public.png"
    assetFolder={folder}
  />,
  <RiderPublicV2Scene key="riders" index={6} />,
  <ProductScene
    key="approval"
    index={7}
    kicker="08 · ADMIN APPROVAL"
    title="필수 기사 확인 뒤 관리자가 최종 승인합니다"
    note="관리자 승인 전 최신 계획을 다시 검증 · 이관 후 최소 64.9 / 기준 45 통과"
    image="07-admin-approval-public.png"
    assetFolder={folder}
    fit="contain"
  />,
  <AppliedPublicV2Scene key="applied" index={8} />,
  <BoundaryPublicV2Scene key="boundary" index={9} />,
  <OutroScene key="outro" />,
] as const;

export const SafeRouteFinalPublicV2SilentVideo = () => {
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
