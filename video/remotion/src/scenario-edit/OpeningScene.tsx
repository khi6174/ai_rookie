import {Easing, interpolate, useCurrentFrame} from "remotion";

const fadeWindow = (frame: number, points: [number, number, number, number]) =>
  interpolate(frame, points, [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

export const OpeningScene = () => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        background: "radial-gradient(circle at 50% 46%, #0D3A55 0%, #041827 58%, #020E17 100%)",
        color: "#FFFFFF",
        fontFamily: '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
        height: "100%",
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      <svg
        aria-hidden="true"
        height="1080"
        viewBox="0 0 2520 1080"
        width="2520"
        style={{left: 0, opacity: 0.48, position: "absolute", top: 0}}
      >
        <path
          d="M-120 790 C 340 690, 520 820, 790 590 S 1310 340, 1550 560 S 2020 840, 2680 350"
          fill="none"
          stroke="#1BA69A"
          strokeDasharray="24 18"
          strokeDashoffset={interpolate(frame, [0, 225], [0, -420], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
          strokeLinecap="round"
          strokeWidth="7"
        />
        <circle cx="790" cy="590" fill="#CFF5E8" r="13" />
        <circle cx="1550" cy="560" fill="#CFF5E8" r="13" />
        <circle cx="2145" cy="697" fill="#CFF5E8" r="13" />
      </svg>

      <div
        style={{
          color: "#CFF5E8",
          fontSize: 25,
          fontWeight: 900,
          left: 100,
          letterSpacing: 3.2,
          position: "absolute",
          top: 72,
        }}
      >
        SAFEROUTE AI · SAFETY OPERATIONS COPILOT
      </div>

      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: "0 120px",
          position: "relative",
          textAlign: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            fontSize: 104,
            fontWeight: 950,
            letterSpacing: -4.8,
            opacity: fadeWindow(frame, [0, 12, 66, 78]),
            position: "absolute",
            translate: interpolate(frame, [0, 18], ["0px 28px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          더 빠른 길만으로 충분할까요?
        </div>

        <div
          style={{
            fontSize: 86,
            fontWeight: 950,
            letterSpacing: -3.8,
            lineHeight: 1.22,
            opacity: fadeWindow(frame, [68, 82, 151, 165]),
            position: "absolute",
            translate: interpolate(frame, [68, 88], ["0px 28px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          남은 배송계획의 안전을
          <br />
          먼저 확인합니다.
        </div>

        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            gap: 24,
            opacity: interpolate(frame, [154, 171], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            position: "absolute",
            scale: interpolate(frame, [154, 177], [0.96, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div style={{color: "#CFF5E8", fontSize: 31, fontWeight: 900, letterSpacing: 4.5}}>
            SAFEROUTE AI
          </div>
          <div style={{fontSize: 96, fontWeight: 950, letterSpacing: -4.2}}>
            끝까지 안전한 계획
          </div>
          <div
            style={{
              border: "2px solid #1BA69A",
              borderRadius: 999,
              color: "#CFF5E8",
              fontSize: 31,
              fontWeight: 850,
              padding: "14px 26px",
            }}
          >
            예측 → 설명 → 기사 동의 → 관리자 승인 → 계획 갱신
          </div>
        </div>
      </div>

    </div>
  );
};
