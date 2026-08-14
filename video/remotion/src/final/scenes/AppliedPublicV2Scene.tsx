import {Img, staticFile} from "remotion";
import {COLORS} from "../constants";
import {SceneChrome} from "./SceneChrome";

export const AppliedPublicV2Scene = ({index}: {readonly index: number}) => (
  <SceneChrome
    index={index}
    kicker="09 · ATOMIC PLAN UPDATE"
    title="승인된 지원안을 운영계획에 반영합니다"
    note="경로 · 배송순서 · ETA · 고객안내 상태를 함께 갱신"
  >
    <div
      style={{
        alignItems: "center",
        display: "grid",
        gap: 96,
        gridTemplateColumns: "420px 1fr",
        left: 170,
        position: "absolute",
        right: 170,
        top: 172,
      }}
    >
      <div
        style={{
          background: COLORS.white,
          border: `2px solid ${COLORS.line}`,
          borderRadius: 26,
          height: 820,
          overflow: "hidden",
          width: 379,
        }}
      >
        <Img
          src={staticFile("final-2026-public-v2/08-plan-applied-public.png")}
          style={{height: "100%", objectFit: "cover", width: "100%"}}
        />
      </div>
      <div
        style={{
          background: COLORS.navy,
          border: `2px solid ${COLORS.teal}`,
          borderRadius: 28,
          color: COLORS.white,
          display: "flex",
          flexDirection: "column",
          gap: 28,
          padding: "52px 56px",
        }}
      >
        <div style={{color: COLORS.mint, fontSize: 23, fontWeight: 900, letterSpacing: 2}}>
          PLAN APPLIED
        </div>
        <div style={{fontSize: 54, fontWeight: 950, lineHeight: 1.22}}>운영계획 갱신 완료</div>
        <div
          style={{
            borderTop: `1px solid ${COLORS.teal}`,
            fontSize: 31,
            fontWeight: 800,
            lineHeight: 1.55,
            paddingTop: 28,
          }}
        >
          경로 / 배송순서 / ETA / 고객 안내 상태를 갱신했습니다.
        </div>
        <div
          style={{
            background: COLORS.white,
            borderRadius: 16,
            color: COLORS.ink,
            display: "grid",
            fontSize: 22,
            fontWeight: 800,
            gap: 14,
            gridTemplateColumns: "1fr 1fr",
            marginTop: 8,
            padding: "24px 26px",
          }}
        >
          <div>✓ 경로 갱신</div>
          <div>✓ 배송순서 갱신</div>
          <div>✓ ETA 갱신</div>
          <div>✓ 고객안내 준비</div>
        </div>
      </div>
    </div>
  </SceneChrome>
);
