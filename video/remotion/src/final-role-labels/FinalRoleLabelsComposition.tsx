import {Composition} from "remotion";
import {FinalRoleLabelsVideo} from "./FinalRoleLabelsVideo";

export const FinalRoleLabelsComposition = () => (
  <>
    <Composition
      id="SafeRouteFinalRoleLabels"
      component={FinalRoleLabelsVideo}
      durationInFrames={5382}
      fps={30}
      width={1680}
      height={720}
      defaultProps={{sourceFile: "final-role-labels/최종 영상.mp4"}}
    />
    <Composition
      id="SafeRouteFinalRoleLabels1080"
      component={FinalRoleLabelsVideo}
      durationInFrames={5382}
      fps={30}
      width={2520}
      height={1080}
      defaultProps={{sourceFile: "final-role-labels-1080/source.mp4"}}
    />
  </>
);
