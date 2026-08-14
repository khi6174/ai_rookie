import {Audio} from "@remotion/media";
import {
  AbsoluteFill,
  Composition,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {CaptionTrack} from "./CaptionTrack";

const FPS = 30;
const NAVY = "#071C2C";
const TEAL = "#1FAE9A";
const MINT = "#BFEFE4";
const AMBER = "#F1B44C";
const RED = "#E45A5A";
const OFF_WHITE = "#F7F4EC";

type SceneDefinition = {
  readonly seconds: number;
  readonly title: string;
  readonly kicker: string;
  readonly audio: string;
  readonly screen?: string;
  readonly crop?: string;
  readonly zoom?: number;
  readonly badge?: string;
  readonly badgeTone?: "teal" | "amber" | "red";
  readonly variant?: "intro" | "engine" | "outro";
};

const scenes: readonly SceneDefinition[] = [
  {
    seconds: 18,
    title: "빠른 길만으로는\n안전을 설명할 수 없습니다",
    kicker: "문제 정의",
    audio: "scene-01.wav",
    screen: "01-stage-opening.png",
    variant: "intro",
  },
  {
    seconds: 27,
    title: "52분 후, 17번째 배송지 전",
    kicker: "미래 임계치 초과 예측",
    audio: "scene-02.wav",
    screen: "01-stage-opening.png",
    crop: "72% 20%",
    zoom: 1.08,
    badge: "Time-to-Breach · 52분",
    badgeTone: "amber",
  },
  {
    seconds: 30,
    title: "12건 이관은 실행할 수 없습니다",
    kicker: "Risk Transfer Guard",
    audio: "scene-03.wav",
    screen: "02-risk-transfer-guard.png",
    crop: "50% 54%",
    zoom: 1.11,
    badge: "수신 기사 Safety Budget 40.6 < 기준 45",
    badgeTone: "red",
  },
  {
    seconds: 27,
    title: "안전한 후보 안에서만 비교합니다",
    kicker: "반사실적 개입 비교",
    audio: "scene-04.wav",
    screen: "01-stage-opening.png",
    crop: "77% 33%",
    zoom: 1.09,
    badge: "10분 휴식 + 8건 이관",
    badgeTone: "teal",
  },
  {
    seconds: 13,
    title: "지원받는 기사에게도\n선택권이 있습니다",
    kicker: "기사 동의",
    audio: "scene-05.wav",
    screen: "03-source-rider-consent.png",
    crop: "50% 45%",
    zoom: 1.35,
    badge: "동의 · 다른 방법 요청 · 지금은 거절",
    badgeTone: "teal",
  },
  {
    seconds: 13,
    title: "배송을 나눠 맡는 기사도\n먼저 확인합니다",
    kicker: "수신 기사 검증",
    audio: "scene-06.wav",
    screen: "04-recipient-rider-consent.png",
    crop: "50% 48%",
    zoom: 1.35,
    badge: "이관 후에도 Safety Budget 기준 통과",
    badgeTone: "teal",
  },
  {
    seconds: 27,
    title: "동의와 재검증 뒤에만\n계획을 적용합니다",
    kicker: "관리자 승인",
    audio: "scene-07.wav",
    screen: "05-admin-approval.png",
    crop: "50% 48%",
    zoom: 1.08,
    badge: "경로 · 순서 · ETA · 고객안내 동시 갱신",
    badgeTone: "teal",
  },
  {
    seconds: 17,
    title: "숫자는 엔진이,\n설명은 국내 AI가",
    kicker: "책임 경계",
    audio: "scene-08.wav",
    variant: "engine",
  },
  {
    seconds: 8,
    title: "",
    kicker: "",
    audio: "scene-09.wav",
    screen: "07-closing.png",
    variant: "outro",
  },
];

const toneColor = (tone: SceneDefinition["badgeTone"]) => {
  if (tone === "red") return RED;
  if (tone === "amber") return AMBER;
  return TEAL;
};

const Disclosure = () => (
  <div
    style={{
      alignItems: "center",
      background: "rgba(7, 28, 44, 0.86)",
      border: "1px solid rgba(191, 239, 228, 0.34)",
      borderRadius: 999,
      color: MINT,
      display: "flex",
      fontSize: 18,
      fontWeight: 700,
      gap: 8,
      padding: "9px 16px",
    }}
  >
    <span style={{color: AMBER}}>◆</span>
    합성 Demo · 실제 사고확률 아님
  </div>
);

const Progress = ({index}: {readonly index: number}) => (
  <div style={{alignItems: "center", display: "flex", gap: 8}}>
    {scenes.map((_, dotIndex) => (
      <div
        key={dotIndex}
        style={{
          background: dotIndex === index ? TEAL : "rgba(255,255,255,0.22)",
          borderRadius: 999,
          height: 7,
          width: dotIndex === index ? 34 : 7,
        }}
      />
    ))}
  </div>
);

const SceneHeader = ({
  scene,
  index,
}: {
  readonly scene: SceneDefinition;
  readonly index: number;
}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        alignItems: "flex-start",
        display: "flex",
        justifyContent: "space-between",
        left: 72,
        position: "absolute",
        right: 72,
        top: 28,
        zIndex: 5,
      }}
    >
      <div style={{display: "flex", flexDirection: "column", gap: 8}}>
        <div
          style={{
            color: TEAL,
            fontSize: 19,
            fontWeight: 800,
            letterSpacing: 2.2,
            opacity: interpolate(frame, [0, 12], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {scene.kicker.toUpperCase()}
        </div>
        <div
          style={{
            color: OFF_WHITE,
            fontSize: scene.title.length > 28 ? 44 : 52,
            fontWeight: 850,
            letterSpacing: -1.8,
            lineHeight: 1.06,
            opacity: interpolate(frame, [4, 20], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: `0 ${interpolate(frame, [4, 20], [22, 0], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}px`,
            whiteSpace: "pre-line",
          }}
        >
          {scene.title}
        </div>
      </div>
      <div style={{alignItems: "flex-end", display: "flex", flexDirection: "column", gap: 14}}>
        <Disclosure />
        <Progress index={index} />
      </div>
    </div>
  );
};

const AmbientBackground = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{background: NAVY, overflow: "hidden"}}>
      <div
        style={{
          background: "radial-gradient(circle, rgba(31,174,154,0.24), rgba(31,174,154,0) 68%)",
          borderRadius: 999,
          height: 520,
          opacity: 0.9,
          position: "absolute",
          right: -170,
          top: -170,
          translate: `${interpolate(frame, [0, 900], [0, -35], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px 0`,
          width: 520,
        }}
      />
      <div
        style={{
          background: "radial-gradient(circle, rgba(241,180,76,0.13), rgba(241,180,76,0) 70%)",
          borderRadius: 999,
          bottom: -260,
          height: 620,
          left: -220,
          position: "absolute",
          width: 620,
        }}
      />
      <div
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          inset: 0,
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent 75%)",
          position: "absolute",
        }}
      />
    </AbsoluteFill>
  );
};

const ProductFrame = ({
  scene,
  index,
}: {
  readonly scene: SceneDefinition;
  readonly index: number;
}) => {
  const frame = useCurrentFrame();
  const durationInFrames = scene.seconds * FPS;
  const exitStart = Math.max(0, durationInFrames - 12);
  const tone = toneColor(scene.badgeTone);

  return (
    <div
      style={{
        background: "rgba(247,244,236,0.97)",
        border: "1px solid rgba(191,239,228,0.26)",
        borderRadius: 24,
        boxShadow: "0 30px 80px rgba(0,0,0,0.34)",
        height: scene.title.includes("\n") ? 459 : 505,
        left: index === 4 || index === 5 ? 230 : 86,
        opacity: interpolate(frame, [8, 24, exitStart, durationInFrames], [0, 1, 1, 0], {
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        overflow: "hidden",
        position: "absolute",
        top: scene.title.includes("\n") ? 190 : 144,
        translate: `0 ${interpolate(frame, [8, 24], [28, 0], {
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}px`,
        width: index === 4 || index === 5 ? 820 : 1108,
      }}
    >
      <Img
        src={staticFile(`screens/${scene.screen}`)}
        style={{
          height: "100%",
          objectFit: "cover",
          objectPosition: scene.crop ?? "50% 50%",
          scale: interpolate(
            frame,
            [0, durationInFrames],
            [scene.zoom ?? 1, (scene.zoom ?? 1) + 0.035],
            {
              easing: Easing.bezier(0.45, 0, 0.55, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          ),
          width: "100%",
        }}
      />
      {scene.badge ? (
        <div
          style={{
            alignItems: "center",
            background: "rgba(7,28,44,0.94)",
            border: `2px solid ${tone}`,
            borderRadius: 16,
            boxShadow: "0 16px 40px rgba(0,0,0,0.28)",
            color: OFF_WHITE,
            display: "flex",
            fontSize: 27,
            fontWeight: 850,
            gap: 12,
            left: 24,
            maxWidth: 760,
            padding: "15px 20px",
            position: "absolute",
            top: 22,
          }}
        >
          <span
            style={{
              background: tone,
              borderRadius: 999,
              boxShadow: `0 0 ${10 + Math.abs(Math.sin(frame / 8)) * 12}px ${tone}`,
              height: 13,
              width: 13,
            }}
          />
          {scene.badge}
        </div>
      ) : null}
    </div>
  );
};

const IntroScene = ({scene, index}: {readonly scene: SceneDefinition; readonly index: number}) => {
  const frame = useCurrentFrame();
  const durationInFrames = scene.seconds * FPS;

  return (
    <AbsoluteFill style={{color: OFF_WHITE}}>
      <AmbientBackground />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          left: 74,
          position: "absolute",
          top: 100,
          width: 470,
          zIndex: 4,
        }}
      >
        <div
          style={{
            color: TEAL,
            fontSize: 21,
            fontWeight: 850,
            letterSpacing: 2.4,
          }}
        >
          LAST-MILE SAFETY OPERATIONS COPILOT
        </div>
        <div
          style={{
            fontSize: 65,
            fontWeight: 900,
            letterSpacing: -3,
            lineHeight: 1.05,
            opacity: interpolate(frame, [0, 22], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: `0 ${interpolate(frame, [0, 22], [28, 0], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}px`,
            whiteSpace: "pre-line",
          }}
        >
          {scene.title}
        </div>
        <div style={{color: MINT, fontSize: 30, fontWeight: 650, lineHeight: 1.35}}>
          남은 배송계획을 끝까지 수행해도 안전한지 먼저 묻습니다.
        </div>
      </div>
      <div style={{position: "absolute", right: 64, top: 34}}>
        <Disclosure />
      </div>
      <div
        style={{
          background: OFF_WHITE,
          border: "1px solid rgba(191,239,228,0.36)",
          borderRadius: 24,
          boxShadow: "0 30px 90px rgba(0,0,0,0.4)",
          height: 360,
          opacity: interpolate(frame, [55, 82], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          overflow: "hidden",
          position: "absolute",
          right: 62,
          top: 178,
          translate: `${interpolate(frame, [55, 82], [70, 0], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px 0`,
          width: 640,
        }}
      >
        <Img
          src={staticFile("screens/01-stage-opening.png")}
          style={{
            height: "100%",
            objectFit: "cover",
            scale: interpolate(frame, [55, durationInFrames], [1.05, 1.09], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            width: "100%",
          }}
        />
      </div>
      <div style={{bottom: 26, left: 74, position: "absolute"}}>
        <Progress index={index} />
      </div>
    </AbsoluteFill>
  );
};

const EngineBoundaryScene = ({
  scene,
  index,
}: {
  readonly scene: SceneDefinition;
  readonly index: number;
}) => {
  const frame = useCurrentFrame();
  const flow = ["초과 시점", "원인", "개입 비교", "동의·승인", "계획 갱신"];

  return (
    <AbsoluteFill style={{color: OFF_WHITE}}>
      <AmbientBackground />
      <SceneHeader scene={scene} index={index} />
      <div
        style={{
          display: "grid",
          gap: 28,
          gridTemplateColumns: "1fr 94px 1fr",
          left: 78,
          position: "absolute",
          right: 78,
          top: 188,
        }}
      >
        <div
          style={{
            background: "rgba(14,51,71,0.93)",
            border: "1px solid rgba(191,239,228,0.22)",
            borderRadius: 26,
            display: "flex",
            flexDirection: "column",
            minHeight: 390,
            padding: "34px 36px",
          }}
        >
          <div style={{color: TEAL, fontSize: 22, fontWeight: 900, letterSpacing: 1.8}}>
            DETERMINISTIC ENGINE
          </div>
          <div style={{fontSize: 42, fontWeight: 900, marginTop: 12}}>판정과 수치</div>
          <div style={{display: "flex", flexDirection: "column", gap: 14, marginTop: 24}}>
            {flow.map((item, flowIndex) => (
              <div
                key={item}
                style={{
                  alignItems: "center",
                  background:
                    frame >= 18 + flowIndex * 10 ? "rgba(31,174,154,0.18)" : "rgba(255,255,255,0.045)",
                  border: "1px solid rgba(191,239,228,0.16)",
                  borderRadius: 14,
                  display: "flex",
                  fontSize: 27,
                  fontWeight: 760,
                  gap: 14,
                  opacity: interpolate(frame, [12 + flowIndex * 9, 25 + flowIndex * 9], [0, 1], {
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                  padding: "12px 16px",
                }}
              >
                <span style={{color: TEAL}}>✓</span>
                {item}
              </div>
            ))}
          </div>
        </div>
        <div style={{alignItems: "center", display: "flex", flexDirection: "column", justifyContent: "center"}}>
          <div
            style={{
              background: AMBER,
              borderRadius: 999,
              color: NAVY,
              fontSize: 34,
              fontWeight: 950,
              height: 72,
              lineHeight: "72px",
              textAlign: "center",
              width: 72,
            }}
          >
            🔒
          </div>
          <div
            style={{
              background: "linear-gradient(to bottom, rgba(241,180,76,0.9), rgba(241,180,76,0.08))",
              height: 230,
              marginTop: 14,
              width: 3,
            }}
          />
          <div style={{color: AMBER, fontSize: 18, fontWeight: 850, marginTop: 8, textAlign: "center"}}>
            AI가 판정을
            <br />
            덮어쓰지 않음
          </div>
        </div>
        <div
          style={{
            background: "rgba(247,244,236,0.96)",
            borderRadius: 26,
            color: NAVY,
            display: "flex",
            flexDirection: "column",
            minHeight: 390,
            padding: "34px 36px",
          }}
        >
          <div style={{color: "#087D70", fontSize: 22, fontWeight: 900, letterSpacing: 1.8}}>
            DOMESTIC AI · UPSTAGE
          </div>
          <div style={{fontSize: 42, fontWeight: 900, marginTop: 12}}>설명과 문서</div>
          <div style={{color: "#294B5E", fontSize: 27, fontWeight: 650, lineHeight: 1.5, marginTop: 26}}>
            검증된 JSON과 인용문만 사용해
            <br />
            관리자·기사·고객에게
            <br />
            역할별 언어로 설명합니다.
          </div>
          <div
            style={{
              background: "rgba(31,174,154,0.13)",
              border: "1px solid rgba(31,174,154,0.45)",
              borderRadius: 16,
              color: "#087D70",
              fontSize: 24,
              fontWeight: 850,
              lineHeight: 1.35,
              marginTop: 26,
              padding: "16px 18px",
            }}
          >
            수치 생성 금지 · 추천 변경 금지
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const OutroScene = ({index}: {readonly index: number}) => {
  const frame = useCurrentFrame();
  const durationInFrames = scenes[index].seconds * FPS;

  return (
    <AbsoluteFill style={{background: NAVY}}>
      <Img
        src={staticFile("screens/07-closing.png")}
        style={{
          height: "100%",
          objectFit: "cover",
          opacity: interpolate(frame, [0, 14, durationInFrames - 12, durationInFrames], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [0, durationInFrames], [1.025, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          width: "100%",
        }}
      />
      <div style={{bottom: 28, left: 72, position: "absolute"}}>
        <Progress index={index} />
      </div>
    </AbsoluteFill>
  );
};

const StandardScene = ({
  scene,
  index,
}: {
  readonly scene: SceneDefinition;
  readonly index: number;
}) => (
  <AbsoluteFill style={{color: OFF_WHITE}}>
    <AmbientBackground />
    <SceneHeader scene={scene} index={index} />
    <ProductFrame scene={scene} index={index} />
  </AbsoluteFill>
);

const Scene = ({
  scene,
  index,
}: {
  readonly scene: SceneDefinition;
  readonly index: number;
}) => {
  if (scene.variant === "intro") return <IntroScene scene={scene} index={index} />;
  if (scene.variant === "engine") return <EngineBoundaryScene scene={scene} index={index} />;
  if (scene.variant === "outro") return <OutroScene index={index} />;
  return <StandardScene scene={scene} index={index} />;
};

export const SafeRouteCompetitionVideo = () => {
  let startFrame = 0;

  return (
    <AbsoluteFill style={{background: NAVY, fontFamily: '"Malgun Gothic", "Noto Sans KR", Arial, sans-serif'}}>
      {scenes.map((scene, index) => {
        const sceneStart = startFrame;
        const durationInFrames = scene.seconds * FPS;
        startFrame += durationInFrames;

        return (
          <Sequence
            key={scene.audio}
            from={sceneStart}
            durationInFrames={durationInFrames}
            premountFor={FPS}
          >
            <Scene scene={scene} index={index} />
            <Audio src={staticFile(`audio/${scene.audio}`)} />
          </Sequence>
        );
      })}
      <CaptionTrack />
    </AbsoluteFill>
  );
};

export const SafeRouteThumbnail = () => (
  <AbsoluteFill
    style={{
      alignItems: "center",
      background: NAVY,
      color: OFF_WHITE,
      display: "flex",
      fontFamily: '"Malgun Gothic", "Noto Sans KR", Arial, sans-serif',
      justifyContent: "center",
    }}
  >
    <AmbientBackground />
    <div style={{display: "flex", flexDirection: "column", gap: 18, position: "relative", width: 1080}}>
      <div style={{color: TEAL, fontSize: 26, fontWeight: 900, letterSpacing: 2.5}}>
        LAST-MILE SAFETY OPERATIONS COPILOT
      </div>
      <div style={{fontSize: 88, fontWeight: 950, letterSpacing: -4}}>SafeRoute AI</div>
      <div style={{color: MINT, fontSize: 42, fontWeight: 720}}>
        더 빠른 길보다 먼저, 끝까지 안전한 계획.
      </div>
      <div
        style={{
          alignSelf: "flex-start",
          background: "rgba(31,174,154,0.16)",
          border: `2px solid ${TEAL}`,
          borderRadius: 16,
          color: OFF_WHITE,
          fontSize: 28,
          fontWeight: 850,
          marginTop: 18,
          padding: "16px 22px",
        }}
      >
        52분 후 · 17번째 배송지 전 · 지금 지원이 필요합니다
      </div>
    </div>
  </AbsoluteFill>
);

export const MyComposition = () => (
  <>
    <Composition
      id="SafeRouteCompetitionVideo"
      component={SafeRouteCompetitionVideo}
      durationInFrames={5400}
      fps={30}
      width={1280}
      height={720}
      defaultProps={{}}
    />
    <Composition
      id="SafeRouteThumbnail"
      component={SafeRouteThumbnail}
      durationInFrames={1}
      fps={30}
      width={1280}
      height={720}
      defaultProps={{}}
    />
  </>
);
