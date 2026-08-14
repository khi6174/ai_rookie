import {Composition} from "remotion";
import {JUDGE_DURATION_SECONDS, JUDGE_FPS} from "./constants";
import {SafeRouteJudgeVideo} from "./SafeRouteJudgeVideo";

export const JudgeCompositions = () => (
  <>
    <Composition
      id="SafeRouteCurrentRehearsal"
      component={SafeRouteJudgeVideo}
      durationInFrames={JUDGE_DURATION_SECONDS * JUDGE_FPS}
      fps={JUDGE_FPS}
      width={1920}
      height={1080}
      defaultProps={{showCues: true}}
    />
    <Composition
      id="SafeRouteCurrentSilent"
      component={SafeRouteJudgeVideo}
      durationInFrames={JUDGE_DURATION_SECONDS * JUDGE_FPS}
      fps={JUDGE_FPS}
      width={1920}
      height={1080}
      defaultProps={{showCues: false}}
    />
  </>
);
