export const interventionConfig = {
  metadata: {
    policyVersion: "intervention-v1.0.0",
    generatorVersion: "intervention-generator-v1.0.0",
    status: "approved",
  },
  riskTransferGuard: {
    recipientMinimumBudget: 45,
    maximumRecipientBudgetDrop: 15,
  },
  scoring: {
    safetyGain: 0.5,
    delayCost: 0.15,
    customerImpact: 0.1,
    fairnessPenalty: 0.15,
    operationalComplexity: 0.1,
    tieTolerance: 0.5,
  },
  complexity: {
    rest: 10,
    transferHandoff: 30,
    additionalCourier: 15,
    bundle: 10,
  },
} as const;
