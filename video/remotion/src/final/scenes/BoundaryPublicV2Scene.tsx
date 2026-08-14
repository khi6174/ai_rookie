import {COLORS} from "../constants";
import {SceneChrome} from "./SceneChrome";

const Item = ({children}: {readonly children: string}) => (
  <div
    style={{
      alignItems: "center",
      border: `1px solid ${COLORS.line}`,
      borderRadius: 14,
      display: "flex",
      fontSize: 25,
      fontWeight: 750,
      minHeight: 58,
      padding: "10px 16px",
    }}
  >
    {children}
  </div>
);

export const BoundaryPublicV2Scene = ({index}: {readonly index: number}) => (
  <SceneChrome
    index={index}
    kicker="10 · RESPONSIBLE AI"
    title="판정은 엔진이, 설명은 국내 AI 계층이"
    note="현재 공개 서비스는 안전 템플릿 상태 · AI 장애가 수치와 판정을 바꾸지 않음"
    dark
  >
    <div
      style={{
        display: "grid",
        gap: 42,
        gridTemplateColumns: "1fr 1fr",
        left: 116,
        position: "absolute",
        right: 116,
        top: 206,
      }}
    >
      <section
        style={{
          background: COLORS.white,
          border: `2px solid ${COLORS.teal}`,
          borderRadius: 24,
          color: COLORS.ink,
          minHeight: 710,
          padding: "36px 40px",
        }}
      >
        <div style={{color: COLORS.teal, fontSize: 21, fontWeight: 900, letterSpacing: 1.8}}>
          DETERMINISTIC SAFETY ENGINE
        </div>
        <div style={{fontSize: 44, fontWeight: 950, margin: "10px 0 25px"}}>수치와 판정 소유</div>
        <div style={{display: "flex", flexDirection: "column", gap: 13}}>
          <Item>Safety Budget · Time-to-Breach</Item>
          <Item>위험 기여요인 · 결측 · 신뢰도</Item>
          <Item>Risk Transfer Guard · 실행 가능성</Item>
          <Item>후보 순위 · 승인 후 적용 상태</Item>
        </div>
        <div
          style={{
            background: COLORS.navy,
            borderRadius: 16,
            color: COLORS.mint,
            fontSize: 24,
            fontWeight: 800,
            lineHeight: 1.4,
            marginTop: 24,
            padding: "17px 20px",
          }}
        >
          안전은 ETA·비용과 교환하지 않는 하드 제약입니다.
        </div>
      </section>
      <section
        style={{
          background: COLORS.white,
          border: `2px solid ${COLORS.blue}`,
          borderRadius: 24,
          color: COLORS.ink,
          minHeight: 710,
          padding: "36px 40px",
        }}
      >
        <div style={{color: COLORS.blue, fontSize: 21, fontWeight: 900, letterSpacing: 1.8}}>
          DOMESTIC AI EVIDENCE LAYER
        </div>
        <div style={{fontSize: 44, fontWeight: 950, margin: "10px 0 25px"}}>설명과 문서 담당</div>
        <div style={{display: "flex", flexDirection: "column", gap: 13}}>
          <Item>Upstage: 검증된 사실의 역할별 설명</Item>
          <Item>A.X v2: 학습 1,800건</Item>
          <Item>Validation 300/300 · Frozen 300/300</Item>
          <Item>동일 잠금 과업 12/12 · unsafe 0</Item>
        </div>
        <div
          style={{
            background: "#EEF4FF",
            border: `1px solid ${COLORS.blue}`,
            borderRadius: 16,
            color: COLORS.blue,
            fontSize: 23,
            fontWeight: 850,
            lineHeight: 1.4,
            marginTop: 24,
            padding: "17px 20px",
          }}
        >
          현재 공개 화면은 안전 템플릿으로 설명하며, AI는 수치·추천·실행 가능성을 바꾸지 못합니다.
        </div>
      </section>
    </div>
  </SceneChrome>
);
