import type { ExplanationInput } from "../../domain/contracts";
import {
  ExplanationProviderError,
  type ExplanationFailureCode,
  type ExplanationProvider,
} from "../../application/explanations";

type ProxyEnvelope = {
  status?: "LIVE";
  provider?: "UPSTAGE";
  output?: unknown;
  code?: ExplanationFailureCode | "NOT_CONFIGURED";
};

const supportedFailureCodes = new Set<ExplanationFailureCode>([
  "NETWORK_ERROR",
  "TIMEOUT",
  "UNAUTHORIZED",
  "RATE_LIMITED",
  "MALFORMED_RESPONSE",
  "SCHEMA_VALIDATION_FAILED",
  "UNSUPPORTED_NUMERIC_CLAIM",
  "INVALID_CITATION",
  "PROHIBITED_CONTENT",
  "ROLE_MISMATCH",
  "DATA_MODE_MISMATCH",
  "UNKNOWN",
]);

export function createUpstageProxyProvider(
  options: {
    endpoint?: string;
    modelLabel?: string;
    fetchImplementation?: typeof fetch;
  } = {},
): ExplanationProvider {
  const endpoint = options.endpoint ?? "/api/upstage-explanation";
  const fetchImplementation = options.fetchImplementation ?? fetch;
  return {
    provider: "UPSTAGE",
    mode: "LIVE",
    model: options.modelLabel ?? "server-configured-upstage",
    async generate(input: ExplanationInput) {
      let response: Response;
      try {
        response = await fetchImplementation(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
      } catch {
        throw new ExplanationProviderError("NETWORK_ERROR");
      }
      let body: ProxyEnvelope;
      try {
        body = (await response.json()) as ProxyEnvelope;
      } catch {
        throw new ExplanationProviderError("MALFORMED_RESPONSE");
      }
      if (!response.ok) {
        const code: ExplanationFailureCode =
          body.code === "NOT_CONFIGURED"
            ? "UNAUTHORIZED"
            : body.code &&
                supportedFailureCodes.has(
                  body.code as ExplanationFailureCode,
                )
              ? (body.code as ExplanationFailureCode)
              : "UNKNOWN";
        throw new ExplanationProviderError(code);
      }
      if (
        body.status !== "LIVE" ||
        body.provider !== "UPSTAGE" ||
        body.output === undefined
      ) {
        throw new ExplanationProviderError("MALFORMED_RESPONSE");
      }
      return body.output;
    },
  };
}
