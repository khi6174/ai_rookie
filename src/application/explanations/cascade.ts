import {
  ExplanationInputSchema,
  type ExplanationInput,
  type ExplanationOutput,
} from "../../domain/contracts";
import {
  ExplanationIntegrityError,
  ExplanationProviderError,
  createTemplateExplanation,
  validateExplanationOutput,
  type ExplanationFailureCode,
} from "./index";

export const domesticAiCascadeProviderIds = [
  "AX_LOCAL",
  "AX",
  "EXAONE",
  "UPSTAGE",
] as const;

export type DomesticAiCascadeProviderId =
  (typeof domesticAiCascadeProviderIds)[number];

export const domesticAiCapabilities = [
  "ROLE_EXPLANATION",
  "CITATION_GROUNDED_EXPLANATION",
  "LONG_CONTEXT_EXPLANATION",
] as const;

export type DomesticAiCapability = (typeof domesticAiCapabilities)[number];

export type DomesticAiCascadeFailureCode =
  | ExplanationFailureCode
  | "UNSUPPORTED_CAPABILITY"
  | "LOCAL_PROVIDER_NOT_QUALIFIED";

export type DomesticAiCascadeUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type DomesticAiCascadeGeneration = {
  output: unknown;
  usage?: DomesticAiCascadeUsage;
};

export type DomesticAiCascadeProvider = {
  providerId: DomesticAiCascadeProviderId;
  tier: "LOCAL" | "HOSTED";
  mode: "LIVE" | "MOCK";
  model: string;
  capabilities: readonly DomesticAiCapability[];
  generate(input: ExplanationInput): Promise<DomesticAiCascadeGeneration>;
};

export type DomesticAiCascadeAttempt = {
  sequence: number;
  providerId: DomesticAiCascadeProviderId;
  tier: DomesticAiCascadeProvider["tier"];
  mode: DomesticAiCascadeProvider["mode"];
  model: string;
  attemptedAt: string;
  latencyMs: number;
  status: "VERIFIED" | "REJECTED" | "SKIPPED";
  failureCode?: DomesticAiCascadeFailureCode;
  usage?: DomesticAiCascadeUsage;
};

export type DomesticAiCascadeResult = {
  status: "VERIFIED_LOCAL" | "VERIFIED_HOSTED" | "FALLBACK";
  data: ExplanationOutput;
  providerId: DomesticAiCascadeProviderId | "TEMPLATE";
  model: string;
  requiredCapability: DomesticAiCapability;
  receivedAt: string;
  attempts: DomesticAiCascadeAttempt[];
  validation: {
    outputSchemaValid: true;
    numericFactsValid: true;
    citationsValid: true;
    rolePolicyValid: true;
  };
};

const validation = {
  outputSchemaValid: true,
  numericFactsValid: true,
  citationsValid: true,
  rolePolicyValid: true,
} as const;

const failureCode = (error: unknown): DomesticAiCascadeFailureCode => {
  if (
    error instanceof ExplanationProviderError ||
    error instanceof ExplanationIntegrityError
  ) {
    return error.code;
  }
  return "UNKNOWN";
};

const defaultRequiredCapability = (
  input: ExplanationInput,
): DomesticAiCapability =>
  input.allowedCitations.length > 0
    ? "CITATION_GROUNDED_EXPLANATION"
    : "ROLE_EXPLANATION";

const assertProviderContract = (
  localProvider: DomesticAiCascadeProvider | undefined,
  hostedProviders: readonly DomesticAiCascadeProvider[],
) => {
  if (localProvider) {
    if (
      localProvider.providerId !== "AX_LOCAL" ||
      localProvider.tier !== "LOCAL"
    ) {
      throw new Error("The primary local provider must be AX_LOCAL at LOCAL tier");
    }
  }
  if (
    hostedProviders.some(
      (provider) =>
        provider.tier !== "HOSTED" || provider.providerId === "AX_LOCAL",
    )
  ) {
    throw new Error("Escalation providers must be domestic Hosted providers");
  }
  const providerIds = [
    ...(localProvider ? [localProvider.providerId] : []),
    ...hostedProviders.map((provider) => provider.providerId),
  ];
  if (new Set(providerIds).size !== providerIds.length) {
    throw new Error("Cascade provider IDs must be unique");
  }
};

export async function runDomesticAiExplanationCascade({
  input,
  localProvider,
  hostedProviders,
  requiredCapability = defaultRequiredCapability(input),
  receivedAt,
  now = () => new Date(),
  monotonicNow = () => performance.now(),
}: {
  input: ExplanationInput;
  localProvider?: DomesticAiCascadeProvider;
  hostedProviders: readonly DomesticAiCascadeProvider[];
  requiredCapability?: DomesticAiCapability;
  receivedAt: string;
  now?: () => Date;
  monotonicNow?: () => number;
}): Promise<DomesticAiCascadeResult> {
  const validatedInput = ExplanationInputSchema.parse(input);
  assertProviderContract(localProvider, hostedProviders);
  const providers = [
    ...(localProvider ? [localProvider] : []),
    ...hostedProviders,
  ];
  const attempts: DomesticAiCascadeAttempt[] = [];

  if (!localProvider) {
    attempts.push({
      sequence: 1,
      providerId: "AX_LOCAL",
      tier: "LOCAL",
      mode: "MOCK",
      model: "not-qualified",
      attemptedAt: now().toISOString(),
      latencyMs: 0,
      status: "SKIPPED",
      failureCode: "LOCAL_PROVIDER_NOT_QUALIFIED",
    });
  }

  for (const provider of providers) {
    const sequence = attempts.length + 1;
    const attemptedAt = now().toISOString();
    if (!provider.capabilities.includes(requiredCapability)) {
      attempts.push({
        sequence,
        providerId: provider.providerId,
        tier: provider.tier,
        mode: provider.mode,
        model: provider.model,
        attemptedAt,
        latencyMs: 0,
        status: "SKIPPED",
        failureCode: "UNSUPPORTED_CAPABILITY",
      });
      continue;
    }

    const startedAt = monotonicNow();
    let usage: DomesticAiCascadeUsage | undefined;
    try {
      const generation = await provider.generate(validatedInput);
      usage = generation.usage;
      const data = validateExplanationOutput(validatedInput, generation.output);
      attempts.push({
        sequence,
        providerId: provider.providerId,
        tier: provider.tier,
        mode: provider.mode,
        model: provider.model,
        attemptedAt,
        latencyMs: Math.max(0, Math.round(monotonicNow() - startedAt)),
        status: "VERIFIED",
        usage,
      });
      return {
        status:
          provider.tier === "LOCAL" ? "VERIFIED_LOCAL" : "VERIFIED_HOSTED",
        data,
        providerId: provider.providerId,
        model: provider.model,
        requiredCapability,
        receivedAt,
        attempts,
        validation,
      };
    } catch (error) {
      attempts.push({
        sequence,
        providerId: provider.providerId,
        tier: provider.tier,
        mode: provider.mode,
        model: provider.model,
        attemptedAt,
        latencyMs: Math.max(0, Math.round(monotonicNow() - startedAt)),
        status: "REJECTED",
        failureCode: failureCode(error),
        usage,
      });
    }
  }

  return {
    status: "FALLBACK",
    data: createTemplateExplanation(validatedInput),
    providerId: "TEMPLATE",
    model: "deterministic-template-v1",
    requiredCapability,
    receivedAt,
    attempts,
    validation,
  };
}
