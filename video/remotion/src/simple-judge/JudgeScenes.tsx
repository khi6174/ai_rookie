import type {ReactNode} from "react";
import {Easing, Img, interpolate, interpolateColors, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {JUDGE_COLORS, JUDGE_SCENE_COUNT} from "./constants";

const FadeScene = ({children, background = JUDGE_COLORS.offWhite}: {readonly children: ReactNode; readonly background?: string}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return (
    <div
      style={{
        background,
        height: "100%",
        opacity: interpolate(frame, [0, 10, durationInFrames - 10, durationInFrames], [0, 1, 1, 0], {
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      {children}
    </div>
  );
};

const StepDots = ({index}: {readonly index: number}) => (
  <div style={{alignItems: "center", display: "flex", gap: 7}}>
    {Array.from({length: JUDGE_SCENE_COUNT}).map((_, dotIndex) => (
      <div
        key={dotIndex}
        style={{
          background: dotIndex === index ? JUDGE_COLORS.mint : "rgba(255,255,255,0.28)",
          borderRadius: 999,
          height: 6,
          width: dotIndex === index ? 28 : 6,
        }}
      />
    ))}
  </div>
);

const SceneHeader = ({index, title}: {readonly index: number; readonly title: string}) => (
  <header
    style={{
      alignItems: "center",
      background: JUDGE_COLORS.navyDeep,
      borderBottom: `2px solid ${JUDGE_COLORS.teal}`,
      color: JUDGE_COLORS.white,
      display: "flex",
      height: 132,
      justifyContent: "space-between",
      left: 0,
      padding: "0 80px",
      position: "absolute",
      right: 0,
      top: 0,
      zIndex: 8,
    }}
  >
    <div style={{fontSize: 48, fontWeight: 950, letterSpacing: -2}}>{title}</div>
    <div style={{alignItems: "flex-end", display: "flex", flexDirection: "column", gap: 14}}>
      <div style={{color: JUDGE_COLORS.mint, fontSize: 18, fontWeight: 850}}>합성 시연 · 실제 사고확률 아님</div>
      <StepDots index={index} />
    </div>
  </header>
);

const Cue = ({children, show}: {readonly children: ReactNode; readonly show: boolean}) => show ? (
  <div
    style={{
      background: JUDGE_COLORS.amber,
      borderRadius: 999,
      color: JUDGE_COLORS.navyDeep,
      fontSize: 22,
      fontWeight: 950,
      padding: "12px 20px",
      position: "absolute",
      right: 78,
      top: 154,
      zIndex: 9,
    }}
  >
    연습 조작 · {children}
  </div>
) : null;

const ImageScene = ({
  index,
  title,
  asset,
  cue,
  showCues,
  fit = "cover",
  callout,
  cropTopLeft = false,
}: {
  readonly index: number;
  readonly title: string;
  readonly asset: string;
  readonly cue: string;
  readonly showCues: boolean;
  readonly fit?: "cover" | "contain";
  readonly callout?: ReactNode;
  readonly cropTopLeft?: boolean;
}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return (
    <FadeScene background={fit === "contain" ? "#DDE5EE" : JUDGE_COLORS.offWhite}>
      <Img
        src={staticFile(asset)}
        style={{
          height: "100%",
          objectFit: fit,
          scale: interpolate(frame, [0, durationInFrames], cropTopLeft ? [1.48, 1.50] : [1, 1.018], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          transformOrigin: cropTopLeft ? "top left" : "center",
          width: "100%",
        }}
      />
      <SceneHeader index={index} title={title} />
      <Cue show={showCues}>{cue}</Cue>
      {callout}
    </FadeScene>
  );
};

export const IntroScene = () => {
  const frame = useCurrentFrame();
  return (
    <FadeScene background={JUDGE_COLORS.navyDeep}>
      <div style={{left: 118, position: "absolute", top: 160, width: 1500}}>
        <div style={{color: JUDGE_COLORS.mint, fontSize: 26, fontWeight: 900, letterSpacing: 3}}>SAFEROUTE AI</div>
        <div style={{color: JUDGE_COLORS.white, fontSize: 94, fontWeight: 950, letterSpacing: -4, lineHeight: 1.08, marginTop: 18}}>
          안전 배터리가
          <br />떨어지기 전에
        </div>
        <div style={{color: JUDGE_COLORS.mint, fontSize: 37, fontWeight: 800, marginTop: 30}}>앞으로 필요한 도움을 미리 찾습니다.</div>
      </div>
      <div
        style={{
          border: `6px solid ${JUDGE_COLORS.white}`,
          borderRadius: 34,
          height: 470,
          position: "absolute",
          right: 160,
          top: 250,
          width: 250,
        }}
      >
        <div
          style={{
            background: interpolateColors(frame, [0, 300], [JUDGE_COLORS.teal, JUDGE_COLORS.amber]),
            borderRadius: 22,
            bottom: 16,
            height: interpolate(frame, [0, 300], [420, 165], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            left: 16,
            position: "absolute",
            right: 16,
          }}
        />
        <div style={{background: JUDGE_COLORS.white, borderRadius: "8px 8px 0 0", height: 32, left: 75, position: "absolute", top: -34, width: 100}} />
      </div>
      <div style={{bottom: 84, color: JUDGE_COLORS.mint, fontSize: 22, fontWeight: 850, position: "absolute", right: 82}}>합성 시연 · 실제 사고확률 아님</div>
    </FadeScene>
  );
};

export const ControlScene = ({showCues}: {readonly showCues: boolean}) => (
  <ImageScene
    index={1}
    title="실제 도로를 따라 25명이 움직입니다"
    asset="current-2026/01-control-tower-live.png"
    cue="Kakao Mobility 도로 경로 · 25명 확인"
    showCues={showCues}
    cropTopLeft
    callout={(
      <div style={{background: JUDGE_COLORS.navy, border: `3px solid ${JUDGE_COLORS.teal}`, borderRadius: 24, bottom: 130, color: JUDGE_COLORS.white, fontSize: 34, fontWeight: 950, left: 1080, padding: "24px 30px", position: "absolute", zIndex: 7}}>
        관제와 기사 앱이 같은 경로를 사용합니다
      </div>
    )}
  />
);

export const PredictionScene = ({showCues}: {readonly showCues: boolean}) => (
  <ImageScene
    index={2}
    title="날짜·시간과 업무·안전여유만 고릅니다"
    asset="current-2026/09-scenario-prediction.png"
    cue="상황 예측에서 날짜·시간 → 업무·안전여유 조정"
    showCues={showCues}
    fit="contain"
    callout={(
      <div style={{background: JUDGE_COLORS.navy, border: `3px solid ${JUDGE_COLORS.teal}`, borderRadius: 24, color: JUDGE_COLORS.white, left: 980, padding: "24px 30px", position: "absolute", top: 720, width: 730, zIndex: 7}}>
        <div style={{color: JUDGE_COLORS.mint, fontSize: 25, fontWeight: 900}}>서로 다른 별도 시뮬레이션</div>
        <div style={{fontSize: 38, fontWeight: 950, lineHeight: 1.25, marginTop: 8}}>기상 관측은 자동 · 업무 조건은 직접 설정</div>
      </div>
    )}
  />
);

export const GuardScene = ({showCues}: {readonly showCues: boolean}) => (
  <ImageScene
    index={3}
    title="안전하지 않은 선택은 먼저 막습니다"
    asset="current-2026/03-support-comparison.png"
    cue="지원 검토에서 추천안과 차단안 비교"
    showCues={showCues}
    callout={(
      <div style={{background: JUDGE_COLORS.white, border: `4px solid ${JUDGE_COLORS.red}`, borderRadius: 24, color: JUDGE_COLORS.ink, left: 930, padding: "26px 32px", position: "absolute", top: 660, width: 760, zIndex: 7}}>
        <div style={{color: JUDGE_COLORS.red, fontSize: 29, fontWeight: 950}}>순서 변경 · 안전 경로 차단</div>
        <div style={{fontSize: 36, fontWeight: 950, marginTop: 8}}>안전 기준 미달 후보는 비교에서 제외</div>
      </div>
    )}
  />
);

export const SafePlanScene = ({showCues}: {readonly showCues: boolean}) => (
  <FadeScene>
    <SceneHeader index={4} title="둘 다 안전한 방법을 고릅니다" />
    <Cue show={showCues}>추천안 15분 휴식과 배송 4건 분담 설명</Cue>
    <div style={{display: "grid", gap: 38, gridTemplateColumns: "1fr 1fr", left: 110, position: "absolute", right: 110, top: 210}}>
      <section style={{background: JUDGE_COLORS.white, border: `3px solid ${JUDGE_COLORS.teal}`, borderRadius: 28, padding: "44px 48px"}}>
        <div style={{color: JUDGE_COLORS.teal, fontSize: 25, fontWeight: 950}}>지원받는 기사</div>
        <div style={{fontSize: 58, fontWeight: 950, marginTop: 18}}>15분 휴식</div>
        <div style={{color: JUDGE_COLORS.muted, fontSize: 32, fontWeight: 800, marginTop: 28}}>남은 배송 8건 → 4건</div>
        <div style={{background: JUDGE_COLORS.mint, borderRadius: 18, color: JUDGE_COLORS.navy, fontSize: 52, fontWeight: 950, marginTop: 32, padding: "24px 28px"}}>29.8 → 32.9</div>
      </section>
      <section style={{background: JUDGE_COLORS.white, border: `3px solid ${JUDGE_COLORS.blue}`, borderRadius: 28, padding: "44px 48px"}}>
        <div style={{color: JUDGE_COLORS.blue, fontSize: 25, fontWeight: 950}}>배송을 나눠 맡는 기사</div>
        <div style={{fontSize: 58, fontWeight: 950, marginTop: 18}}>4건만 분담</div>
        <div style={{color: JUDGE_COLORS.muted, fontSize: 32, fontWeight: 800, marginTop: 28}}>추가 배송 +4건</div>
        <div style={{background: "#EEF4FF", borderRadius: 18, color: JUDGE_COLORS.navy, fontSize: 52, fontWeight: 950, marginTop: 32, padding: "24px 28px"}}>65.0 ≥ 기준 45</div>
      </section>
    </div>
  </FadeScene>
);

export const RidersScene = ({showCues}: {readonly showCues: boolean}) => (
  <FadeScene>
    <SceneHeader index={5} title="두 기사님이 먼저 확인합니다" />
    <Cue show={showCues}>원 기사 동의 → 수신 기사 동의</Cue>
    <div style={{alignItems: "center", display: "flex", gap: 82, justifyContent: "center", paddingTop: 175}}>
      {[
        ["current-2026/05-source-rider-consent.png", "지원받는 기사"],
        ["current-2026/06-recipient-rider-consent.png", "배송을 나눠 맡는 기사"],
      ].map(([asset, label]) => (
        <div key={asset} style={{alignItems: "center", display: "flex", flexDirection: "column", gap: 12}}>
          <div style={{fontSize: 28, fontWeight: 950}}>{label}</div>
          <div style={{background: JUDGE_COLORS.white, border: `3px solid ${JUDGE_COLORS.line}`, borderRadius: 28, height: 720, overflow: "hidden", width: 350}}>
            <Img src={staticFile(asset)} style={{height: "100%", objectFit: "cover", width: "100%"}} />
          </div>
        </div>
      ))}
      <div style={{background: JUDGE_COLORS.navy, border: `3px solid ${JUDGE_COLORS.teal}`, borderRadius: 28, color: JUDGE_COLORS.white, padding: "42px 46px", width: 600}}>
        <div style={{color: JUDGE_COLORS.mint, fontSize: 24, fontWeight: 900}}>컴퓨터가 대신 결정하지 않습니다</div>
        <div style={{fontSize: 44, fontWeight: 950, lineHeight: 1.35, marginTop: 18}}>동의<br />다른 방법 요청<br />지금은 거절</div>
        <div style={{borderTop: `1px solid ${JUDGE_COLORS.teal}`, fontSize: 27, fontWeight: 800, lineHeight: 1.5, marginTop: 30, paddingTop: 24}}>세 가지 모두 불이익 없는 선택입니다.</div>
      </div>
    </div>
  </FadeScene>
);

export const ApprovalScene = ({showCues}: {readonly showCues: boolean}) => (
  <ImageScene
    index={6}
    title="관리자가 마지막으로 확인합니다"
    asset="current-2026/07-admin-approval.png"
    cue="관리자 탭 → 승인 검토 → 승인 및 계획 적용"
    showCues={showCues}
    fit="contain"
  />
);

export const AppliedScene = ({showCues}: {readonly showCues: boolean}) => (
  <ImageScene
    index={7}
    title="승인한 계획을 한 번에 바꿉니다"
    asset="current-2026/08-plan-applied.png"
    cue="계획 적용 완료와 네 가지 갱신 확인"
    showCues={showCues}
    fit="contain"
    callout={(
      <div style={{background: JUDGE_COLORS.navy, border: `3px solid ${JUDGE_COLORS.teal}`, borderRadius: 24, color: JUDGE_COLORS.white, display: "grid", fontSize: 30, fontWeight: 900, gap: 18, gridTemplateColumns: "1fr 1fr", left: 965, padding: "34px 38px", position: "absolute", top: 590, width: 680, zIndex: 7}}>
        <div>✓ 경로</div><div>✓ 배송 순서</div><div>✓ 도착 시간</div><div>✓ 고객 안내</div>
      </div>
    )}
  />
);

export const OutroScene = () => (
  <FadeScene background={JUDGE_COLORS.navyDeep}>
    <div style={{alignItems: "center", color: JUDGE_COLORS.white, display: "flex", flexDirection: "column", gap: 28, height: "100%", justifyContent: "center"}}>
      <div style={{color: JUDGE_COLORS.mint, fontSize: 27, fontWeight: 900, letterSpacing: 3}}>SAFEROUTE AI</div>
      <div style={{fontSize: 78, fontWeight: 950, letterSpacing: -3, lineHeight: 1.2, textAlign: "center"}}>더 빠른 길보다 먼저,<br />끝까지 안전한 계획.</div>
      <div style={{border: `2px solid ${JUDGE_COLORS.teal}`, borderRadius: 999, color: JUDGE_COLORS.mint, fontSize: 26, fontWeight: 850, padding: "14px 24px"}}>예측 → 안전한 대안 → 동의 → 승인 → 계획 변경</div>
    </div>
  </FadeScene>
);
