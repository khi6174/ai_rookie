export const JUDGE_FPS = 30;
export const JUDGE_DURATION_SECONDS = 170;

export const JUDGE_COLORS = {
  navy: "#08263F",
  navyDeep: "#041827",
  teal: "#078C83",
  mint: "#CFF5E8",
  blue: "#2864ED",
  amber: "#E88400",
  red: "#C7362F",
  offWhite: "#F7F5EF",
  white: "#FFFFFF",
  ink: "#102A43",
  muted: "#5A7186",
  line: "#C8D7E8",
} as const;

export const JUDGE_SCENES = [
  {id: "intro", seconds: 13},
  {id: "control", seconds: 15},
  {id: "prediction", seconds: 25},
  {id: "guard", seconds: 28},
  {id: "safe-plan", seconds: 22},
  {id: "riders", seconds: 25},
  {id: "approval", seconds: 20},
  {id: "applied", seconds: 14},
  {id: "outro", seconds: 8},
] as const;

export const JUDGE_SCENE_COUNT = JUDGE_SCENES.length;
