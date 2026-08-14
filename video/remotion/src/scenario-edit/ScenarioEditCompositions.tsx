import {Composition} from "remotion";
import {ScenarioEditVideo} from "./ScenarioEditVideo";

export const ScenarioEditCompositions = () => (
  <Composition
    id="SafeRouteScenarioEditReview"
    component={ScenarioEditVideo}
    durationInFrames={5382}
    fps={30}
    width={2520}
    height={1080}
    defaultProps={{}}
  />
);
