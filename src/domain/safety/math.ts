import { safetyModelConfig } from "./config";

export const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

export const continuousWorkFactor = (minutes: number) =>
  clamp(
    (minutes - safetyModelConfig.normalization.continuousWorkFreeMinutes) /
      safetyModelConfig.normalization.continuousWorkRangeMinutes,
  );

export const shiftDurationFactor = (minutes: number) =>
  clamp(
    (minutes - safetyModelConfig.normalization.shiftFreeMinutes) /
      safetyModelConfig.normalization.shiftRangeMinutes,
  );

export const recoveryForRest = (
  restMinutes: number,
  quality: keyof typeof safetyModelConfig.recovery.qualityFactors = "UNKNOWN",
) => {
  const effectiveMinutes = clamp(
    restMinutes - safetyModelConfig.recovery.freeMinutes,
    0,
    safetyModelConfig.recovery.effectiveMinutesCap,
  );
  return (
    effectiveMinutes *
    safetyModelConfig.recovery.pointsPerEffectiveMinute *
    safetyModelConfig.recovery.qualityFactors[quality]
  );
};

export const roundForStorage = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
