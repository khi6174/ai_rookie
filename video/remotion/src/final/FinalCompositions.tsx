import {Composition} from "remotion";
import {FINAL_DURATION_SECONDS, FINAL_FPS} from "./constants";
import {SafeRouteFinalSilentVideo} from "./FinalCompetitionVideo";
import {SafeRouteFinalPublicV2SilentVideo} from "./FinalPublicV2CompetitionVideo";
import {FinalPublicV2Thumbnail} from "./FinalPublicV2Thumbnail";
import {FinalThumbnail} from "./FinalThumbnail";

export const FinalCompositions = () => (
  <>
    <Composition
      id="SafeRouteFinalSilentVideo"
      component={SafeRouteFinalSilentVideo}
      durationInFrames={FINAL_DURATION_SECONDS * FINAL_FPS}
      fps={FINAL_FPS}
      width={1920}
      height={1080}
      defaultProps={{}}
    />
    <Composition
      id="SafeRouteFinalThumbnail"
      component={FinalThumbnail}
      durationInFrames={1}
      fps={FINAL_FPS}
      width={1280}
      height={720}
      defaultProps={{}}
    />
    <Composition
      id="SafeRouteFinalPublicV2SilentVideo"
      component={SafeRouteFinalPublicV2SilentVideo}
      durationInFrames={FINAL_DURATION_SECONDS * FINAL_FPS}
      fps={FINAL_FPS}
      width={1920}
      height={1080}
      defaultProps={{}}
    />
    <Composition
      id="SafeRouteFinalPublicV2Thumbnail"
      component={FinalPublicV2Thumbnail}
      durationInFrames={1}
      fps={FINAL_FPS}
      width={1280}
      height={720}
      defaultProps={{}}
    />
  </>
);
