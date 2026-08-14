import {Video} from "@remotion/media";
import {AbsoluteFill, staticFile} from "remotion";

export const FinalDimmedVideo = ({dimmingOpacity, sourceFile}: {readonly dimmingOpacity: number; readonly sourceFile: string}) => (
  <AbsoluteFill style={{backgroundColor: "#000000"}}>
    <Video src={staticFile(sourceFile)} objectFit="contain" style={{height: "100%", width: "100%"}} />
    <AbsoluteFill style={{backgroundColor: "#000000", opacity: dimmingOpacity}} />
  </AbsoluteFill>
);
