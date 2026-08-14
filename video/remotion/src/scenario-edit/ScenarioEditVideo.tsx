import {Video} from "@remotion/media";
import {AbsoluteFill, Sequence, staticFile} from "remotion";
import {OutroScene} from "../final/scenes/OutroScene";
import {OpeningScene} from "./OpeningScene";
import {ScenarioCaptionTrack} from "./ScenarioCaptionTrack";
import {TechnicalEvidenceScene} from "./TechnicalEvidenceScene";

const videoStyle: React.CSSProperties = {
  height: "100%",
  width: "100%",
};

export const ScenarioEditVideo = () => (
  <AbsoluteFill style={{backgroundColor: "#041827"}}>
    <Sequence name="오프닝" durationInFrames={225} premountFor={30}>
      <OpeningScene />
    </Sequence>
    <Video
      name="시나리오 1 · 문제 제시"
      src={staticFile("scenario-clips/scenario-01.mp4")}
      from={225}
      durationInFrames={356}
      objectFit="cover"
      style={videoStyle}
    />
    <Video
      name="시나리오 2 · 기사 선택"
      src={staticFile("scenario-clips/scenario-02.mp4")}
      from={581}
      durationInFrames={394}
      objectFit="cover"
      style={videoStyle}
    />
    <Video
      name="시나리오 3 · 지원안 비교"
      src={staticFile("scenario-clips/scenario-03.mp4")}
      from={975}
      durationInFrames={526}
      objectFit="cover"
      style={videoStyle}
    />
    <Video
      name="시나리오 4 · 4건 분담"
      src={staticFile("scenario-clips/scenario-04.mp4")}
      from={1501}
      durationInFrames={486}
      objectFit="cover"
      style={videoStyle}
    />
    <Video
      name="시나리오 5 · AI 근거"
      src={staticFile("scenario-clips/scenario-05.mp4")}
      from={1987}
      durationInFrames={456}
      objectFit="cover"
      style={videoStyle}
    />
    <Video
      name="시나리오 6 · 지원 기사 동의"
      src={staticFile("scenario-clips/scenario-06.mp4")}
      from={2443}
      durationInFrames={518}
      objectFit="cover"
      style={videoStyle}
    />
    <Video
      name="시나리오 7 · 분담 기사 동의"
      src={staticFile("scenario-clips/scenario-07.mp4")}
      from={2961}
      durationInFrames={515}
      objectFit="cover"
      style={videoStyle}
    />
    <Video
      name="시나리오 8 · 관리자 승인"
      src={staticFile("scenario-clips/scenario-08.mp4")}
      from={3476}
      durationInFrames={370}
      objectFit="cover"
      style={videoStyle}
    />
    <Video
      name="시나리오 9 · 계획 적용"
      src={staticFile("scenario-clips/scenario-09.mp4")}
      from={3846}
      durationInFrames={214}
      objectFit="cover"
      style={videoStyle}
    />
    <Video
      name="시나리오 10 · 상황 예측"
      src={staticFile("scenario-clips/scenario-10.mp4")}
      from={4060}
      durationInFrames={797}
      objectFit="cover"
      style={videoStyle}
    />
    <ScenarioCaptionTrack />
    <Sequence name="기술 근거 · A100와 국내 AI" from={4857} durationInFrames={345} premountFor={30}>
      <TechnicalEvidenceScene />
    </Sequence>
    <Sequence name="엔딩" from={5202} durationInFrames={180} premountFor={30}>
      <OutroScene />
    </Sequence>
  </AbsoluteFill>
);
