import "./index.css";
import { MyComposition } from "./Composition";
import {FinalCompositions} from "./final/FinalCompositions";
import {FinalDimmedComposition} from "./final-dimmed/FinalDimmedComposition";
import {FinalRoleLabelsComposition} from "./final-role-labels/FinalRoleLabelsComposition";
import {RoleLabelAssetCompositions} from "./role-label-assets/RoleLabelAssets";
import {ScenarioEditCompositions} from "./scenario-edit/ScenarioEditCompositions";
import {JudgeCompositions} from "./simple-judge/JudgeCompositions";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
      <FinalCompositions />
      <FinalDimmedComposition />
      <FinalRoleLabelsComposition />
      <RoleLabelAssetCompositions />
      <JudgeCompositions />
      <ScenarioEditCompositions />
    </>
  );
};
