import {Easing, interpolate, Sequence, useCurrentFrame} from "remotion";

export type RoleOverlay = {
  readonly kind: "role" | "switch";
  readonly from: number;
  readonly durationInFrames: number;
  readonly context?: string;
  readonly title: string;
};

const RoleCard = ({context, title, durationInFrames}: Omit<RoleOverlay, "kind" | "from">) => {
  const frame = useCurrentFrame();
  return <div style={{
    background: "rgba(4, 24, 39, 0.88)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 14,
    boxShadow: "0 9px 24px rgba(4,24,39,0.18)",
    color: "white",
    fontFamily: '"Malgun Gothic", sans-serif',
    left: 104,
    opacity: interpolate(frame, [0, 8, durationInFrames - 8, durationInFrames], [0, 1, 1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1)}),
    padding: "11px 17px 12px 15px",
    position: "absolute",
    top: 58,
    translate: interpolate(frame, [0, 10], ["-12px 0px", "0px 0px"], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1)}),
  }}>
    {context ? <div style={{color: "rgba(255,255,255,0.72)", fontSize: 15, fontWeight: 750}}>{context}</div> : null}
    <div style={{fontSize: 25, fontWeight: 900, marginTop: 2}}>{title}</div>
  </div>;
};

const SwitchCard = ({title, durationInFrames}: Omit<RoleOverlay, "kind" | "from">) => {
  const frame = useCurrentFrame();
  return <div style={{
    alignItems: "center",
    background: "rgba(4,24,39,0.82)",
    border: "1px solid rgba(86,211,196,0.55)",
    borderRadius: 999,
    color: "white",
    display: "flex",
    fontFamily: '"Malgun Gothic", sans-serif',
    fontSize: 20,
    fontWeight: 850,
    gap: 10,
    left: 104,
    opacity: interpolate(frame, [0, 7, durationInFrames - 7, durationInFrames], [0, 1, 1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}),
    padding: "11px 18px 11px 14px",
    position: "absolute",
    top: 58,
  }}><span>→</span>{title}</div>;
};

export const RoleOverlayTrack = ({items}: {readonly items: readonly RoleOverlay[]}) => <>{items.map((item) => (
  <Sequence key={`${item.from}-${item.title}`} from={item.from} durationInFrames={item.durationInFrames} premountFor={10}>
    {item.kind === "role"
      ? <RoleCard context={item.context} title={item.title} durationInFrames={item.durationInFrames} />
      : <SwitchCard context={item.context} title={item.title} durationInFrames={item.durationInFrames} />}
  </Sequence>
))}</>;
