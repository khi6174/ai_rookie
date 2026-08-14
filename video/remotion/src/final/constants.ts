export const FINAL_FPS = 30;
export const FINAL_DURATION_SECONDS = 176;

export const COLORS = {
  navy: "#08263F",
  navyDeep: "#041827",
  blue: "#2864ED",
  teal: "#078C83",
  mint: "#CFF5E8",
  amber: "#E88400",
  offWhite: "#F7F5EF",
  white: "#FFFFFF",
  ink: "#08263F",
  line: "#C8D7E8",
  muted: "#5A7186",
} as const;

export const FINAL_SCENES = [
  {id: "intro", seconds: 14},
  {id: "overview", seconds: 20},
  {id: "route", seconds: 18},
  {id: "scenario", seconds: 20},
  {id: "support", seconds: 24},
  {id: "ai", seconds: 16},
  {id: "riders", seconds: 20},
  {id: "approval", seconds: 12},
  {id: "applied", seconds: 10},
  {id: "boundary", seconds: 16},
  {id: "outro", seconds: 6},
] as const;

export const SCENE_COUNT = FINAL_SCENES.length;
