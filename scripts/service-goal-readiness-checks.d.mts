export type DeployedServiceEvidence = {
  status?: string;
  networkRequestPerformed?: boolean;
  storage?: string;
  restored?: boolean;
  conflictProtected?: boolean;
  upstageExplanationLive?: boolean;
  publicReviewManifestVerified?: boolean;
  actualPersonalDataCount?: number;
};

export function evaluateDeployedServiceEvidence(
  deployed: DeployedServiceEvidence,
): boolean;
