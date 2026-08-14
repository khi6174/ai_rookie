import type {Caption} from "@remotion/captions";
import {useCallback, useEffect, useState} from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useDelayRender,
} from "remotion";
import {JUDGE_COLORS, JUDGE_FPS} from "./constants";

const CaptionCard = ({caption}: {readonly caption: Caption}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{justifyContent: "flex-end", pointerEvents: "none"}}>
      <div
        style={{
          alignSelf: "center",
          background: "rgba(4,24,39,0.94)",
          border: `2px solid ${JUDGE_COLORS.teal}`,
          borderRadius: 18,
          color: JUDGE_COLORS.white,
          fontSize: 35,
          fontWeight: 850,
          letterSpacing: -1.1,
          lineHeight: 1.35,
          marginBottom: 30,
          maxWidth: 1480,
          opacity: interpolate(frame, [0, 8], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          padding: "18px 32px 20px",
          textAlign: "center",
          translate: `0 ${interpolate(frame, [0, 8], [16, 0], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px`,
        }}
      >
        {caption.text}
      </div>
    </AbsoluteFill>
  );
};

export const SimpleCaptionTrack = () => {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const {cancelRender, continueRender, delayRender} = useDelayRender();
  const [handle] = useState(() => delayRender("Loading simple judge captions"));

  const loadCaptions = useCallback(async () => {
    try {
      const response = await fetch(staticFile("simple-judge/captions.json"));
      setCaptions((await response.json()) as Caption[]);
      continueRender(handle);
    } catch (error) {
      cancelRender(error);
    }
  }, [cancelRender, continueRender, handle]);

  useEffect(() => {
    loadCaptions();
  }, [loadCaptions]);

  if (!captions) return null;
  return (
    <AbsoluteFill>
      {captions.map((caption, index) => (
        <Sequence
          key={`${caption.startMs}-${index}`}
          from={Math.round((caption.startMs / 1000) * JUDGE_FPS)}
          durationInFrames={Math.max(1, Math.round(((caption.endMs - caption.startMs) / 1000) * JUDGE_FPS))}
          premountFor={15}
        >
          <CaptionCard caption={caption} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
