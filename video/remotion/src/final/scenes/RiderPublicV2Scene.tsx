import {Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {COLORS} from "../constants";
import {SceneChrome} from "./SceneChrome";

const SourcePhone = () => (
  <div style={{alignItems: "center", display: "flex", flexDirection: "column", gap: 12}}>
    <div style={{color: COLORS.ink, fontSize: 23, fontWeight: 850}}>지원받는 기사</div>
    <div
      style={{
        background: COLORS.white,
        border: `2px solid ${COLORS.line}`,
        borderRadius: 28,
        height: 700,
        overflow: "hidden",
        width: 324,
      }}
    >
      <Img
        src={staticFile("final-2026-public-v2/05-source-rider-consent-public.png")}
        style={{height: "100%", objectFit: "cover", width: "100%"}}
      />
    </div>
  </div>
);

const RecipientCard = () => (
  <div style={{alignItems: "center", display: "flex", flexDirection: "column", gap: 12}}>
    <div style={{color: COLORS.ink, fontSize: 23, fontWeight: 850}}>배송을 나눠 맡는 기사</div>
    <div
      style={{
        background: COLORS.white,
        border: `2px solid ${COLORS.line}`,
        borderRadius: 28,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 22,
        height: 700,
        padding: "34px 28px",
        width: 324,
      }}
    >
      <div style={{color: COLORS.blue, fontSize: 20, fontWeight: 900}}>배송 4건 수신</div>
      <div style={{fontSize: 31, fontWeight: 950, lineHeight: 1.3}}>
        가까운 배송 4건을
        <br />
        이어받을까요?
      </div>
      <div style={{color: COLORS.muted, fontSize: 18, fontWeight: 700, lineHeight: 1.5}}>
        조정 후에도 내 안전기준을 지키는지 전체 계획을 다시 계산했습니다.
      </div>
      <div
        style={{
          border: `1px solid ${COLORS.line}`,
          borderRadius: 16,
          display: "grid",
          gap: 16,
          padding: "20px",
        }}
      >
        <div style={{fontSize: 18, fontWeight: 750}}>남은 배송 8건 → 12건</div>
        <div style={{fontSize: 18, fontWeight: 750}}>예상 종료 약 16분 연장</div>
        <div style={{color: COLORS.teal, fontSize: 21, fontWeight: 950}}>
          이관 후 최소 64.9
        </div>
        <div style={{color: COLORS.teal, fontSize: 18, fontWeight: 850}}>기준선 45 통과</div>
      </div>
      <div
        style={{
          border: `2px solid ${COLORS.blue}`,
          borderRadius: 14,
          color: COLORS.blue,
          fontSize: 20,
          fontWeight: 900,
          marginTop: "auto",
          padding: "16px 12px",
          textAlign: "center",
        }}
      >
        이 조정에 동의
      </div>
      <div style={{color: COLORS.muted, fontSize: 16, fontWeight: 700, textAlign: "center"}}>
        다른 방법 요청 · 지금은 거절
      </div>
    </div>
  </div>
);

export const RiderPublicV2Scene = ({index}: {readonly index: number}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const drift = interpolate(frame, [0, durationInFrames], [10, -10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneChrome
      index={index}
      kicker="07 · HUMAN IN THE LOOP"
      title="양쪽 기사 모두 먼저 확인합니다"
      note="동의 · 다른 방법 요청 · 지금은 거절 — 수신 기사도 기준선 45를 통과"
    >
      <div
        style={{
          alignItems: "center",
          background: COLORS.offWhite,
          display: "flex",
          gap: 104,
          height: "100%",
          justifyContent: "center",
          paddingTop: 132,
          translate: `${drift}px 0`,
        }}
      >
        <SourcePhone />
        <div
          style={{
            background: COLORS.navy,
            border: `2px solid ${COLORS.teal}`,
            borderRadius: 24,
            color: COLORS.white,
            display: "flex",
            flexDirection: "column",
            gap: 24,
            padding: "34px 42px",
            width: 480,
          }}
        >
          <div style={{color: COLORS.mint, fontSize: 20, fontWeight: 850}}>같은 결정 ID</div>
          <div style={{fontSize: 38, fontWeight: 900, lineHeight: 1.25}}>
            한 사람의 위험을
            <br />
            다른 사람에게 넘기지 않습니다.
          </div>
          <div style={{borderTop: `1px solid ${COLORS.teal}`, paddingTop: 20}}>
            <div style={{fontSize: 24, fontWeight: 750, lineHeight: 1.45}}>
              수신 기사도 이관 후 Safety Budget 기준을 다시 통과해야 합니다.
            </div>
          </div>
        </div>
        <RecipientCard />
      </div>
    </SceneChrome>
  );
};
