import type {ReactNode} from "react";
import {Easing, interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {COLORS, SCENE_COUNT} from "../constants";

export const SceneChrome = ({
  index,
  kicker,
  title,
  note,
  children,
  dark = false,
}: {
  readonly index: number;
  readonly kicker: string;
  readonly title: string;
  readonly note: string;
  readonly children: ReactNode;
  readonly dark?: boolean;
}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const opacity = interpolate(
    frame,
    [0, 12, durationInFrames - 10, durationInFrames],
    [0, 1, 1, 0],
    {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <div
      style={{
        background: dark ? COLORS.navyDeep : COLORS.offWhite,
        color: dark ? COLORS.white : COLORS.ink,
        height: "100%",
        opacity,
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      {children}
      <header
        style={{
          alignItems: "center",
          background: COLORS.navyDeep,
          borderBottom: `2px solid ${COLORS.teal}`,
          color: COLORS.white,
          display: "flex",
          height: 148,
          justifyContent: "space-between",
          left: 0,
          padding: "0 80px",
          position: "absolute",
          right: 0,
          top: 0,
          zIndex: 4,
        }}
      >
        <div style={{display: "flex", flexDirection: "column", gap: 8}}>
          <div
            style={{
              color: COLORS.mint,
              fontSize: 19,
              fontWeight: 850,
              letterSpacing: 2.2,
            }}
          >
            {kicker}
          </div>
          <div
            style={{
              fontSize: 46,
              fontWeight: 900,
              letterSpacing: -1.7,
              lineHeight: 1.05,
            }}
          >
            {title}
          </div>
        </div>
        <div style={{alignItems: "flex-end", display: "flex", flexDirection: "column", gap: 13}}>
          <div
            style={{
              border: `1px solid ${COLORS.teal}`,
              borderRadius: 999,
              color: COLORS.mint,
              fontSize: 17,
              fontWeight: 800,
              padding: "8px 14px",
            }}
          >
            시연 데이터 · 실제 사고확률 아님
          </div>
          <div style={{alignItems: "center", display: "flex", gap: 8}}>
            {Array.from({length: SCENE_COUNT}).map((_, dotIndex) => (
              <div
                key={dotIndex}
                style={{
                  background: dotIndex === index ? COLORS.mint : "rgba(255,255,255,0.28)",
                  borderRadius: 999,
                  height: 6,
                  width: dotIndex === index ? 28 : 6,
                }}
              />
            ))}
          </div>
        </div>
      </header>
      <div
        style={{
          alignItems: "center",
          background: dark ? COLORS.navyDeep : "rgba(255,255,255,0.96)",
          border: `1px solid ${dark ? COLORS.teal : COLORS.line}`,
          borderRadius: 999,
          bottom: 28,
          color: dark ? COLORS.mint : COLORS.ink,
          display: "flex",
          fontSize: 22,
          fontWeight: 750,
          left: 80,
          minHeight: 54,
          padding: "10px 20px",
          position: "absolute",
          zIndex: 4,
        }}
      >
        {note}
      </div>
    </div>
  );
};
