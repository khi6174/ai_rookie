import {Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {COLORS} from "../constants";
import {SceneChrome} from "./SceneChrome";

const Phone = ({image, label}: {readonly image: string; readonly label: string}) => (
  <div style={{alignItems: "center", display: "flex", flexDirection: "column", gap: 12}}>
    <div style={{color: COLORS.ink, fontSize: 23, fontWeight: 850}}>{label}</div>
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
        src={staticFile(`final-2026/${image}`)}
        style={{height: "100%", objectFit: "cover", width: "100%"}}
      />
    </div>
  </div>
);

export const RiderScene = ({index}: {readonly index: number}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const drift = interpolate(frame, [0, durationInFrames], [12, -12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneChrome
      index={index}
      kicker="06 · HUMAN IN THE LOOP"
      title="두 기사 모두 먼저 확인합니다"
      note="동의 · 다른 방법 요청 · 지금은 거절 — 불이익 없이 선택"
    >
      <div
        style={{
          alignItems: "center",
          background: COLORS.offWhite,
          display: "flex",
          gap: 108,
          height: "100%",
          justifyContent: "center",
          paddingTop: 132,
          translate: `${drift}px 0`,
        }}
      >
        <Phone image="05-source-rider-consent.png" label="지원받는 기사" />
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
              이관 후 수신 기사도 Safety Budget 기준을 다시 통과해야 합니다.
            </div>
          </div>
        </div>
        <Phone image="06-recipient-rider-consent.png" label="배송을 나눠 맡는 기사" />
      </div>
    </SceneChrome>
  );
};
