import {Easing, interpolate, useCurrentFrame} from "remotion";

const COLORS = {
  navy: "#08263F",
  navyDeep: "#041827",
  teal: "#078C83",
  tealLight: "#56D3C4",
  mint: "#CFF5E8",
  amber: "#F3B647",
  offWhite: "#F7F5EF",
  white: "#FFFFFF",
  line: "#C8D7E8",
  muted: "#61798C",
} as const;

const DataCard = ({index}: {readonly index: number}) => {
  const frame = useCurrentFrame();
  const start = 12 + index * 8;

  return (
    <div
      style={{
        alignItems: "center",
        background: COLORS.white,
        border: `2px solid ${COLORS.line}`,
        borderRadius: 13,
        boxShadow: "0 9px 24px rgba(8, 38, 63, 0.1)",
        display: "flex",
        height: 56,
        justifyContent: "center",
        left: 350,
        opacity: interpolate(frame, [start, start + 7, 123, 142], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        position: "absolute",
        top: 230 + index * 68,
        translate: `${interpolate(frame, [start, 118], [0, 530], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.34, 0.05, 0.2, 1),
        })}px 0px`,
        width: 112,
      }}
    >
      <div style={{display: "flex", gap: 7}}>
        {[0, 1, 2].map((bar) => (
          <div
            key={bar}
            style={{
              background: bar === index % 3 ? COLORS.teal : COLORS.line,
              borderRadius: 3,
              height: 25 - bar * 4,
              width: 9,
            }}
          />
        ))}
      </div>
    </div>
  );
};

const Server = () => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        alignItems: "center",
        background: `linear-gradient(160deg, ${COLORS.navy} 0%, ${COLORS.navyDeep} 100%)`,
        border: `3px solid ${COLORS.tealLight}`,
        borderRadius: 34,
        boxShadow: "0 26px 70px rgba(4, 24, 39, 0.2)",
        display: "flex",
        flexDirection: "column",
        height: 390,
        justifyContent: "center",
        left: 120,
        opacity: interpolate(frame, [0, 15, 145, 174], [0, 1, 1, 0.44], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        position: "absolute",
        scale: interpolate(frame, [0, 20], [0.9, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        top: 160,
        width: 280,
      }}
    >
      <div style={{color: COLORS.mint, fontSize: 28, fontWeight: 900, letterSpacing: 2}}>NVIDIA</div>
      <div style={{color: COLORS.white, fontSize: 78, fontWeight: 950, letterSpacing: -3, marginTop: 4}}>A100</div>
      <div style={{background: "rgba(255,255,255,0.12)", borderRadius: 20, display: "flex", gap: 12, marginTop: 35, padding: "18px 22px"}}>
        {[0, 1, 2, 3].map((dot) => (
          <div
            key={dot}
            style={{
              background: dot === Math.floor(frame / 9) % 4 ? COLORS.amber : COLORS.tealLight,
              borderRadius: 999,
              height: 15,
              opacity: dot === Math.floor(frame / 9) % 4 ? 1 : 0.36,
              width: 15,
            }}
          />
        ))}
      </div>
      <div style={{color: COLORS.mint, fontSize: 23, fontWeight: 850, marginTop: 24}}>비식별 합성 설명</div>
      <div style={{color: COLORS.white, fontSize: 40, fontWeight: 950, marginTop: 3}}>1,800건</div>
    </div>
  );
};

const AxModel = () => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        left: 930,
        opacity: interpolate(frame, [42, 62], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        position: "absolute",
        top: 170,
        width: 390,
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: `radial-gradient(circle at 40% 35%, ${COLORS.tealLight}, ${COLORS.teal} 58%, ${COLORS.navy})`,
          border: `7px solid ${COLORS.white}`,
          borderRadius: 999,
          boxShadow: `0 0 0 ${interpolate(frame, [60, 90, 120], [8, 22, 8], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px rgba(86, 211, 196, 0.18), 0 28px 70px rgba(8, 38, 63, 0.2)`,
          display: "flex",
          flexDirection: "column",
          height: 285,
          justifyContent: "center",
          scale: interpolate(frame, [45, 70], [0.78, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          width: 285,
        }}
      >
        <div style={{color: COLORS.white, fontSize: 82, fontWeight: 950, letterSpacing: -5}}>A.X</div>
        <div style={{background: COLORS.amber, borderRadius: 999, color: COLORS.navyDeep, fontSize: 24, fontWeight: 950, marginTop: 12, padding: "8px 18px"}}>LoRA</div>
      </div>
      <div style={{color: COLORS.navy, fontSize: 27, fontWeight: 900, marginTop: 27}}>숫자 · 인용 · 역할별 설명</div>
    </div>
  );
};

const Role = ({label, x, delay}: {readonly label: string; readonly x: number; readonly delay: number}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        left: x,
        opacity: interpolate(frame, [delay, delay + 14], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        position: "absolute",
        top: 455,
        translate: interpolate(frame, [delay, delay + 18], ["0px 22px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        width: 150,
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: COLORS.white,
          border: `3px solid ${COLORS.teal}`,
          borderRadius: 999,
          boxShadow: "0 12px 32px rgba(8, 38, 63, 0.12)",
          display: "flex",
          height: 82,
          justifyContent: "center",
          width: 82,
        }}
      >
        <div style={{position: "relative", height: 48, width: 45}}>
          <div style={{background: COLORS.navy, borderRadius: 999, height: 18, left: 13, position: "absolute", top: 0, width: 18}} />
          <div style={{background: COLORS.navy, borderRadius: "19px 19px 7px 7px", bottom: 0, height: 26, left: 4, position: "absolute", width: 37}} />
        </div>
      </div>
      <div style={{color: COLORS.navy, fontSize: 26, fontWeight: 950, marginTop: 10}}>{label}</div>
    </div>
  );
};

const Solar = () => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        left: 1580,
        opacity: interpolate(frame, [140, 168], [0.18, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        position: "absolute",
        top: 120,
        width: 800,
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: `linear-gradient(145deg, ${COLORS.white}, #E8F8F4)`,
          border: `3px solid ${COLORS.tealLight}`,
          borderRadius: 42,
          boxShadow: "0 26px 68px rgba(8, 38, 63, 0.13)",
          display: "flex",
          flexDirection: "column",
          height: 270,
          justifyContent: "center",
          margin: "0 auto",
          scale: interpolate(frame, [145, 178], [0.84, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          width: 440,
        }}
      >
        <div style={{color: COLORS.teal, fontSize: 27, fontWeight: 900, letterSpacing: 1.4}}>UPSTAGE</div>
        <div style={{color: COLORS.navy, fontSize: 66, fontWeight: 950, letterSpacing: -3, marginTop: 5}}>Solar</div>
        <div style={{alignItems: "center", display: "flex", gap: 9, marginTop: 22}}>
          {[0, 1, 2].map((line) => (
            <div key={line} style={{background: line === 1 ? COLORS.teal : COLORS.line, borderRadius: 999, height: 9, width: line === 1 ? 92 : 54}} />
          ))}
        </div>
      </div>

      <svg height="150" style={{left: 0, overflow: "visible", position: "absolute", top: 265, width: 800}} viewBox="0 0 800 150">
        <path d="M400 0 L400 55 M400 55 L120 115 M400 55 L400 115 M400 55 L680 115" fill="none" opacity="0.48" stroke={COLORS.teal} strokeLinecap="round" strokeWidth="5" />
      </svg>
      <Role delay={180} label="관리자" x={45} />
      <Role delay={195} label="기사" x={325} />
      <Role delay={210} label="고객" x={605} />
    </div>
  );
};

const NarrationLine = ({children, phase}: {readonly children: string; readonly phase: "first" | "second"}) => {
  const frame = useCurrentFrame();
  const isFirst = phase === "first";

  return (
    <div
      style={{
        alignItems: "center",
        bottom: 68,
        color: COLORS.navyDeep,
        display: "flex",
        flexDirection: "column",
        fontSize: 41,
        fontWeight: 950,
        height: 130,
        justifyContent: "center",
        left: 118,
        letterSpacing: -1.4,
        opacity: isFirst
          ? interpolate(frame, [18, 35, 140, 158], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          : interpolate(frame, [160, 180], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
        position: "absolute",
        textAlign: "center",
        translate: isFirst
          ? interpolate(frame, [18, 38, 142, 160], ["0px 28px", "0px 0px", "0px 0px", "0px -24px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            })
          : interpolate(frame, [160, 182], ["0px 28px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
        width: 2284,
      }}
    >
      <div>{children}</div>
      <div
        style={{
          background: isFirst ? COLORS.teal : COLORS.amber,
          borderRadius: 999,
          height: 7,
          marginTop: 20,
          width: interpolate(
            frame,
            isFirst ? [35, 68] : [178, 212],
            [0, isFirst ? 390 : 300],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            },
          ),
        }}
      />
    </div>
  );
};

export const TechnicalEvidenceScene = () => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        background: `radial-gradient(circle at 50% 18%, #FFFFFF 0%, ${COLORS.offWhite} 52%, #E7F3F0 100%)`,
        color: COLORS.navy,
        fontFamily: '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
        height: "100%",
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          background: `linear-gradient(90deg, transparent, ${COLORS.tealLight}, transparent)`,
          height: 3,
          left: 380,
          opacity: 0.44,
          position: "absolute",
          top: 354,
          width: 590,
        }}
      />
      <Server />
      {[0, 1, 2, 3].map((index) => <DataCard index={index} key={index} />)}
      <AxModel />

      <div
        style={{
          background: `linear-gradient(90deg, ${COLORS.teal}, ${COLORS.tealLight})`,
          borderRadius: 999,
          height: 6,
          left: 1260,
          opacity: interpolate(frame, [145, 170], [0, 0.8], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          position: "absolute",
          top: 355,
          width: interpolate(frame, [145, 188], [0, 455], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          style={{
            background: COLORS.amber,
            borderRadius: 999,
            height: 16,
            left: 1295,
            opacity: interpolate(frame, [154 + index * 7, 172 + index * 7, 214], [0, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            position: "absolute",
            top: 350,
            translate: `${interpolate(frame, [154 + index * 7, 214 + index * 7], [0, 390], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}px 0px`,
            width: 16,
          }}
        />
      ))}
      <Solar />

      <NarrationLine phase="first">A100으로 A.X에 비식별 합성 설명 1,800건을 LoRA 학습해 숫자와 인용을 지키는 역할별 설명을 강화했습니다.</NarrationLine>
      <NarrationLine phase="second">Upstage Solar는 검증된 근거로 관리자·기사·고객 안내 문장을 생성합니다.</NarrationLine>
    </div>
  );
};
