import {Easing, interpolate, useCurrentFrame} from "remotion";

export const TwoStepTechScene = ({
  firstLine,
  secondLine,
  switchFrame,
}: {
  readonly firstLine: string;
  readonly secondLine: string;
  readonly switchFrame: number;
}) => {
  const frame = useCurrentFrame();
  const fade = (start: number, end: number) => interpolate(frame, [start, start + 12, end - 12, end], [0, 1, 1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1)});
  return <div style={{background: "linear-gradient(135deg,#F7F5EF,#EAF5F2)", color: "#08263F", fontFamily: '"Malgun Gothic", sans-serif', height: "100%", position: "relative", width: "100%"}}>
    <div style={{left: "8%", opacity: fade(0, switchFrame + 12), position: "absolute", top: "18%"}}>
      <div style={{background: "#041827", borderRadius: 28, color: "white", fontSize: 52, fontWeight: 900, padding: "50px 70px"}}>SOURCE → MODEL</div>
    </div>
    <div style={{opacity: fade(10, switchFrame), position: "absolute", textAlign: "center", top: "72%", width: "100%"}}>
      <div style={{fontSize: 42, fontWeight: 900}}>{firstLine}</div>
    </div>
    <div style={{left: "56%", opacity: fade(switchFrame, switchFrame * 2), position: "absolute", top: "18%"}}>
      <div style={{background: "white", border: "3px solid #56D3C4", borderRadius: 28, fontSize: 52, fontWeight: 900, padding: "50px 70px"}}>VERIFIED RESULT → AUDIENCES</div>
    </div>
    <div style={{opacity: fade(switchFrame + 8, switchFrame * 2), position: "absolute", textAlign: "center", top: "72%", width: "100%"}}>
      <div style={{fontSize: 42, fontWeight: 900}}>{secondLine}</div>
    </div>
  </div>;
};
