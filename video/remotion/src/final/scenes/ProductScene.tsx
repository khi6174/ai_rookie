import {Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {SceneChrome} from "./SceneChrome";

export const ProductScene = ({
  index,
  kicker,
  title,
  note,
  image,
  assetFolder = "final-2026",
  fit = "cover",
}: {
  readonly index: number;
  readonly kicker: string;
  readonly title: string;
  readonly note: string;
  readonly image: string;
  readonly assetFolder?: string;
  readonly fit?: "cover" | "contain";
}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.018], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneChrome index={index} kicker={kicker} title={title} note={note}>
      <div
        style={{
          background: fit === "contain" ? "#DDE5EE" : undefined,
          height: "100%",
          width: "100%",
        }}
      >
        <Img
          src={staticFile(`${assetFolder}/${image}`)}
          style={{
            height: "100%",
            objectFit: fit,
            scale,
            width: "100%",
          }}
        />
      </div>
    </SceneChrome>
  );
};
