import {AbsoluteFill, Sequence} from "remotion";
import {JUDGE_COLORS, JUDGE_FPS, JUDGE_SCENES} from "./constants";
import {
  AppliedScene,
  ApprovalScene,
  ControlScene,
  GuardScene,
  IntroScene,
  OutroScene,
  PredictionScene,
  RidersScene,
  SafePlanScene,
} from "./JudgeScenes";
import {SimpleCaptionTrack} from "./SimpleCaptionTrack";

export const SafeRouteJudgeVideo = ({showCues}: {readonly showCues: boolean}) => {
  const content = [
    <IntroScene key="intro" />,
    <ControlScene key="control" showCues={showCues} />,
    <PredictionScene key="prediction" showCues={showCues} />,
    <GuardScene key="guard" showCues={showCues} />,
    <SafePlanScene key="safe-plan" showCues={showCues} />,
    <RidersScene key="riders" showCues={showCues} />,
    <ApprovalScene key="approval" showCues={showCues} />,
    <AppliedScene key="applied" showCues={showCues} />,
    <OutroScene key="outro" />,
  ] as const;

  let from = 0;
  return (
    <AbsoluteFill style={{background: JUDGE_COLORS.navyDeep, fontFamily: '"Malgun Gothic", "Noto Sans KR", Arial, sans-serif'}}>
      {JUDGE_SCENES.map((scene, index) => {
        const sceneFrom = from;
        const durationInFrames = scene.seconds * JUDGE_FPS;
        from += durationInFrames;
        return (
          <Sequence key={scene.id} from={sceneFrom} durationInFrames={durationInFrames} premountFor={JUDGE_FPS}>
            {content[index]}
          </Sequence>
        );
      })}
      <SimpleCaptionTrack />
    </AbsoluteFill>
  );
};
