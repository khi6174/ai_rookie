import {Easing, interpolate, useCurrentFrame} from "remotion";
import {COLORS} from "../constants";

export const IntroScene = () => {
  const frame = useCurrentFrame();
  const rise = interpolate(frame, [0, 24], [34, 0], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(frame, [0, 18, 408, 420], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        background: COLORS.navyDeep,
        color: COLORS.white,
        height: "100%",
        opacity,
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          border: `2px solid ${COLORS.teal}`,
          borderRadius: 999,
          height: 700,
          position: "absolute",
          right: -260,
          top: -270,
          width: 700,
        }}
      />
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
          left: 118,
          position: "absolute",
          top: 184,
          translate: `0 ${rise}px`,
          width: 1450,
        }}
      >
        <div
          style={{
            color: COLORS.mint,
            fontSize: 25,
            fontWeight: 850,
            letterSpacing: 3,
          }}
        >
          LAST-MILE SAFETY OPERATIONS COPILOT
        </div>
        <div style={{fontSize: 104, fontWeight: 950, letterSpacing: -5, lineHeight: 1}}>
          SafeRoute AI
        </div>
        <div
          style={{
            color: COLORS.white,
            fontSize: 58,
            fontWeight: 850,
            letterSpacing: -2.2,
            lineHeight: 1.22,
          }}
        >
          더 빠른 길보다 먼저,
          <br />
          끝까지 안전한 계획.
        </div>
        <div
          style={{
            borderLeft: `6px solid ${COLORS.teal}`,
            color: COLORS.mint,
            fontSize: 28,
            fontWeight: 700,
            marginTop: 12,
            padding: "10px 0 10px 22px",
          }}
        >
          3분 이내 최종 서비스 시연 · 팀 안전빵
        </div>
      </main>
      <div
        style={{
          border: `1px solid ${COLORS.teal}`,
          borderRadius: 999,
          bottom: 78,
          color: COLORS.mint,
          fontSize: 20,
          fontWeight: 800,
          padding: "10px 16px",
          position: "absolute",
          right: 84,
        }}
      >
        시연 데이터 · 실제 사고확률 아님
      </div>
    </div>
  );
};
