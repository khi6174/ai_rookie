import {Video} from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import roleLabelTimeline from "./role-label-timeline.json";

type TimelineEntry = {
  readonly id: string;
  readonly kind: "role" | "switch";
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly eyebrow?: string;
  readonly title: string;
};

const timeline = roleLabelTimeline as readonly TimelineEntry[];

const RoleLabel = ({
  durationInFrames,
  eyebrow,
  scale,
  title,
}: {
  readonly durationInFrames: number;
  readonly eyebrow: string;
  readonly scale: number;
  readonly title: string;
}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        background: "rgba(4, 24, 39, 0.88)",
        border: `${scale}px solid rgba(255, 255, 255, 0.2)`,
        borderRadius: 14 * scale,
        boxShadow: `0 ${9 * scale}px ${24 * scale}px rgba(4, 24, 39, 0.18)`,
        fontFamily: '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
        left: 104 * scale,
        opacity: interpolate(frame, [0, 8, durationInFrames - 8, durationInFrames], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        overflow: "hidden",
        position: "absolute",
        top: 58 * scale,
        translate: interpolate(frame, [0, 10], [`-${12 * scale}px 0px`, "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      <div style={{padding: `${11 * scale}px ${17 * scale}px ${12 * scale}px ${15 * scale}px`}}>
        <div
          style={{
            color: "rgba(255,255,255,0.72)",
            fontSize: 15 * scale,
            fontWeight: 750,
            letterSpacing: -0.15 * scale,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            color: "#FFFFFF",
            fontSize: 25 * scale,
            fontWeight: 900,
            letterSpacing: -0.65 * scale,
            marginTop: 2 * scale,
          }}
        >
          {title}
        </div>
      </div>
    </div>
  );
};

const SwitchLabel = ({durationInFrames, scale, title}: {readonly durationInFrames: number; readonly scale: number; readonly title: string}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        alignItems: "center",
        background: "rgba(4, 24, 39, 0.82)",
        border: `${scale}px solid rgba(86, 211, 196, 0.55)`,
        borderRadius: 999,
        boxShadow: `0 ${8 * scale}px ${22 * scale}px rgba(4, 24, 39, 0.16)`,
        color: "#FFFFFF",
        display: "flex",
        fontFamily: '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
        fontSize: 20 * scale,
        fontWeight: 850,
        gap: 10 * scale,
        left: 104 * scale,
        opacity: interpolate(frame, [0, 7, durationInFrames - 16, durationInFrames], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        padding: `${11 * scale}px ${18 * scale}px ${11 * scale}px ${14 * scale}px`,
        position: "absolute",
        top: 58 * scale,
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: "#078C83",
          borderRadius: 999,
          display: "flex",
          height: 29 * scale,
          justifyContent: "center",
          width: 29 * scale,
        }}
      >
        →
      </div>
      {title}
    </div>
  );
};

export const FinalRoleLabelsVideo = ({sourceFile}: {readonly sourceFile: string}) => {
  const {fps, width} = useVideoConfig();
  const scale = width / 1680;

  return (
    <AbsoluteFill style={{backgroundColor: "#000000"}}>
      <Video src={staticFile(sourceFile)} objectFit="contain" style={{height: "100%", width: "100%"}} />

      {timeline.map((entry) => {
        const startFrame = Math.round(entry.startSeconds * fps);
        const endFrame = Math.round(entry.endSeconds * fps);
        const durationInFrames = endFrame - startFrame;

        return (
          <Sequence key={entry.id} from={startFrame} durationInFrames={durationInFrames} premountFor={10}>
            {entry.kind === "role" ? (
              <RoleLabel
                durationInFrames={durationInFrames}
                eyebrow={entry.eyebrow ?? ""}
                scale={scale}
                title={entry.title}
              />
            ) : (
              <SwitchLabel durationInFrames={durationInFrames} scale={scale} title={entry.title} />
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
