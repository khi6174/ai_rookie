import type { ExplanationProvider } from "../application/explanations";
import type {
  DomesticAiCapability,
  DomesticAiCascadeProvider,
} from "../application/explanations/cascade";
import type { DomesticAiBenchmarkProvider } from "../evals/domesticAiProvider";

const explanationCapabilities = [
  "ROLE_EXPLANATION",
  "CITATION_GROUNDED_EXPLANATION",
] as const satisfies readonly DomesticAiCapability[];

export function adaptDomesticAiBenchmarkProviderToCascade(
  provider: DomesticAiBenchmarkProvider,
  capabilities: readonly DomesticAiCapability[] = explanationCapabilities,
): DomesticAiCascadeProvider {
  return {
    providerId: provider.providerId,
    tier: "HOSTED",
    mode: provider.mode,
    model: provider.model,
    capabilities,
    generate: provider.generate,
  };
}

export function adaptUpstageProviderToCascade(
  provider: ExplanationProvider,
  capabilities: readonly DomesticAiCapability[] = explanationCapabilities,
): DomesticAiCascadeProvider {
  return {
    providerId: "UPSTAGE",
    tier: "HOSTED",
    mode: provider.mode,
    model: provider.model,
    capabilities,
    generate: async (input) => ({ output: await provider.generate(input) }),
  };
}
