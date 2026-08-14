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

const CaptionCard = ({caption}: {readonly caption: Caption}) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{justifyContent: "flex-end", pointerEvents: "none"}}>
      <div
        style={{
          alignSelf: "center",
          background: "rgba(4, 15, 25, 0.91)",
          border: "1px solid rgba(191, 239, 228, 0.28)",
          borderRadius: 18,
          boxShadow: "0 16px 50px rgba(0,0,0,0.3)",
          color: "#F7F4EC",
          fontFamily: '"Malgun Gothic", "Noto Sans KR", Arial, sans-serif',
          fontSize: 29,
          fontWeight: 750,
          letterSpacing: -0.5,
          lineHeight: 1.32,
          marginBottom: 18,
          maxWidth: 1120,
          opacity: interpolate(frame, [0, 8], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          padding: "15px 26px 17px",
          textAlign: "center",
          translate: `0 ${interpolate(frame, [0, 8], [12, 0], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px`,
          width: "fit-content",
        }}
      >
        {caption.text}
      </div>
    </AbsoluteFill>
  );
};

export const CaptionTrack = () => {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const {cancelRender, continueRender, delayRender} = useDelayRender();
  const [handle] = useState(() => delayRender("Loading SafeRoute captions"));

  const loadCaptions = useCallback(async () => {
    try {
      const response = await fetch(staticFile("captions.json"));
      const data = (await response.json()) as Caption[];
      setCaptions(data);
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
      {captions.map((caption, index) => {
        const from = Math.round((caption.startMs / 1000) * 30);
        const durationInFrames = Math.max(
          1,
          Math.round(((caption.endMs - caption.startMs) / 1000) * 30),
        );

        return (
          <Sequence
            key={`${caption.startMs}-${index}`}
            from={from}
            durationInFrames={durationInFrames}
            premountFor={15}
          >
            <CaptionCard caption={caption} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
