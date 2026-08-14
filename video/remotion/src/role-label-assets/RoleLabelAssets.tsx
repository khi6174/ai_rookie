import {AbsoluteFill, Still} from "remotion";

const SCALE = 1.5;
const FONT_FAMILY = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

const AssetCanvas = ({children}: {readonly children: React.ReactNode}) => (
  <AbsoluteFill style={{alignItems: "center", backgroundColor: "transparent", display: "flex", justifyContent: "center"}}>
    {children}
  </AbsoluteFill>
);

const RoleLabelAsset = ({eyebrow, title}: {readonly eyebrow: string; readonly title: string}) => (
  <AssetCanvas>
    <div
      style={{
        background: "rgba(4, 24, 39, 0.88)",
        border: `${SCALE}px solid rgba(255, 255, 255, 0.2)`,
        borderRadius: 14 * SCALE,
        boxShadow: `0 ${9 * SCALE}px ${24 * SCALE}px rgba(4, 24, 39, 0.18)`,
        fontFamily: FONT_FAMILY,
        overflow: "hidden",
        padding: `${11 * SCALE}px ${17 * SCALE}px ${12 * SCALE}px ${15 * SCALE}px`,
      }}
    >
      <div
        style={{
          color: "rgba(255,255,255,0.72)",
          fontSize: 15 * SCALE,
          fontWeight: 750,
          letterSpacing: -0.15 * SCALE,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          color: "#FFFFFF",
          fontSize: 25 * SCALE,
          fontWeight: 900,
          letterSpacing: -0.65 * SCALE,
          marginTop: 2 * SCALE,
        }}
      >
        {title}
      </div>
    </div>
  </AssetCanvas>
);

const SwitchLabelAsset = () => (
  <AssetCanvas>
    <div
      style={{
        alignItems: "center",
        background: "rgba(4, 24, 39, 0.82)",
        border: `${SCALE}px solid rgba(86, 211, 196, 0.55)`,
        borderRadius: 999,
        boxShadow: `0 ${8 * SCALE}px ${22 * SCALE}px rgba(4, 24, 39, 0.16)`,
        color: "#FFFFFF",
        display: "flex",
        fontFamily: FONT_FAMILY,
        fontSize: 20 * SCALE,
        fontWeight: 850,
        gap: 10 * SCALE,
        padding: `${11 * SCALE}px ${18 * SCALE}px ${11 * SCALE}px ${14 * SCALE}px`,
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: "#078C83",
          borderRadius: 999,
          display: "flex",
          height: 29 * SCALE,
          justifyContent: "center",
          width: 29 * SCALE,
        }}
      >
        →
      </div>
      다른 기사 앱으로 전환
    </div>
  </AssetCanvas>
);

export const RoleLabelAssetCompositions = () => (
  <>
    <Still
      id="RoleLabelImSehun"
      component={RoleLabelAsset}
      width={480}
      height={260}
      defaultProps={{eyebrow: "지원이 필요한 기사", title: "임세훈 기사 화면"}}
    />
    <Still id="RoleLabelAppSwitch" component={SwitchLabelAsset} width={620} height={200} />
    <Still
      id="RoleLabelAnJaemin"
      component={RoleLabelAsset}
      width={480}
      height={260}
      defaultProps={{eyebrow: "배송을 나눠 맡는 기사", title: "안재민 기사 화면"}}
    />
  </>
);
