import type {Caption} from "@remotion/captions";
import {useCallback, useEffect, useState} from "react";
import {AbsoluteFill, Easing, interpolate, Sequence, staticFile, useCurrentFrame, useDelayRender, useVideoConfig} from "remotion";

const CaptionCard = ({text, durationInFrames}: {readonly text: string; readonly durationInFrames: number}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{alignItems: "center", justifyContent: "flex-end", paddingBottom: 52}}>
      <div style={{
        background: "rgba(4, 24, 39, 0.62)",
        border: "2px solid rgba(27, 166, 154, 0.52)",
        borderRadius: 20,
        boxShadow: "0 8px 26px rgba(0,0,0,0.22)",
        color: "#FFFFFF",
        fontFamily: '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
        fontSize: 40,
        fontWeight: 850,
        lineHeight: 1.35,
        maxWidth: 2260,
        opacity: interpolate(frame, [0, 5, durationInFrames - 5, durationInFrames], [0, 1, 1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1)}),
        padding: "17px 32px 19px",
        textAlign: "center",
      }}>{text}</div>
    </AbsoluteFill>
  );
};

export const TimedCaptionTrack = ({jsonFile}: {readonly jsonFile: string}) => {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const [handle] = useState(() => delayRender("Loading timed captions"));
  const {fps} = useVideoConfig();
  const load = useCallback(async () => {
    try {
      const response = await fetch(staticFile(jsonFile));
      if (!response.ok) throw new Error(`Caption request failed: ${response.status}`);
      setCaptions((await response.json()) as Caption[]);
      continueRender(handle);
    } catch (error) {
      cancelRender(error instanceof Error ? error : new Error(String(error)));
    }
  }, [cancelRender, continueRender, handle, jsonFile]);
  useEffect(() => { load(); }, [load]);
  if (!captions) return null;
  return <AbsoluteFill>{captions.map((caption) => {
    const from = Math.round(caption.startMs / 1000 * fps);
    const durationInFrames = Math.max(1, Math.round((caption.endMs - caption.startMs) / 1000 * fps));
    return <Sequence key={`${caption.startMs}-${caption.text}`} from={from} durationInFrames={durationInFrames} premountFor={15}>
      <CaptionCard text={caption.text} durationInFrames={durationInFrames} />
    </Sequence>;
  })}</AbsoluteFill>;
};
