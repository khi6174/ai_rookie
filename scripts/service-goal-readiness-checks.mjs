export function evaluateDeployedServiceEvidence(deployed) {
  return (
    deployed.status === "LIVE_PASS" &&
    deployed.networkRequestPerformed === true &&
    deployed.storage === "D1" &&
    deployed.restored === true &&
    deployed.conflictProtected === true &&
    deployed.upstageExplanationLive === true &&
    deployed.publicReviewManifestVerified === true &&
    deployed.actualPersonalDataCount === 0
  );
}
