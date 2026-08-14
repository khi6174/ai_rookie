import {Composition} from "remotion";
import {FinalDimmedVideo} from "./FinalDimmedVideo";

export const FinalDimmedComposition = () => (
  <Composition
    id="SafeRouteFinalDimmed1080"
    component={FinalDimmedVideo}
    durationInFrames={5382}
    fps={30}
    width={2520}
    height={1080}
    defaultProps={{dimmingOpacity: 0.08, sourceFile: "final-dimmed/source.mp4"}}
  />
);
