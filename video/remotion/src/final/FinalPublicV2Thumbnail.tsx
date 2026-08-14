import {AbsoluteFill, Img, staticFile} from "remotion";
import {COLORS} from "./constants";

export const FinalPublicV2Thumbnail = () => (
  <AbsoluteFill
    style={{
      background: COLORS.navyDeep,
      fontFamily: '"Malgun Gothic", "Noto Sans KR", Arial, sans-serif',
      overflow: "hidden",
    }}
  >
    <Img
      src={staticFile("final-2026-public-v2/01-control-tower-public.png")}
      style={{height: "100%", objectFit: "cover", width: "100%"}}
    />
    <div
      style={{
        background: "rgba(4,24,39,0.94)",
        borderRight: `4px solid ${COLORS.teal}`,
        bottom: 0,
        color: COLORS.white,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        left: 0,
        padding: "56px 64px",
        position: "absolute",
        top: 0,
        width: 720,
      }}
    >
      <div style={{color: COLORS.mint, fontSize: 24, fontWeight: 900, letterSpacing: 2.4}}>
        CURRENT PUBLIC SERVICE · D1 · KAKAO MAP
      </div>
      <div style={{fontSize: 84, fontWeight: 950, letterSpacing: -4, marginTop: 20}}>
        SafeRoute AI
      </div>
      <div style={{fontSize: 40, fontWeight: 850, lineHeight: 1.3, marginTop: 18}}>
        더 빠른 길보다 먼저,
        <br />
        끝까지 안전한 계획.
      </div>
      <div
        style={{
          alignSelf: "flex-start",
          border: `2px solid ${COLORS.teal}`,
          borderRadius: 999,
          color: COLORS.mint,
          fontSize: 24,
          fontWeight: 850,
          marginTop: 34,
          padding: "12px 18px",
        }}
      >
        현재 공개 서비스 · 3분 시연
      </div>
    </div>
  </AbsoluteFill>
);
