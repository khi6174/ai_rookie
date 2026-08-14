import {interpolate, useCurrentFrame} from "remotion";
import {COLORS} from "../constants";

export const OutroScene = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, 168, 180], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        alignItems: "center",
        background: COLORS.navyDeep,
        color: COLORS.white,
        display: "flex",
        flexDirection: "column",
        gap: 22,
        height: "100%",
        justifyContent: "center",
        opacity,
        width: "100%",
      }}
    >
      <div style={{color: COLORS.mint, fontSize: 24, fontWeight: 850, letterSpacing: 2.8}}>
        SAFEROUTE AI
      </div>
      <div style={{fontSize: 74, fontWeight: 950, letterSpacing: -3, textAlign: "center"}}>
        예측하고, 설명하고, 동의받고, 적용합니다.
      </div>
      <div
        style={{
          border: `2px solid ${COLORS.teal}`,
          borderRadius: 999,
          color: COLORS.mint,
          fontSize: 28,
          fontWeight: 800,
          marginTop: 20,
          padding: "14px 24px",
        }}
      >
        더 빠른 길보다 먼저, 끝까지 안전한 계획.
      </div>
    </div>
  );
};
