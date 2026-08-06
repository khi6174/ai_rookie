import { describe, expect, it } from "vitest";
import { createUpstageMockProvider } from "../src/adapters/upstage";
import {
  adaptDomesticAiBenchmarkProviderToCascade,
  adaptUpstageProviderToCascade,
} from "../src/adapters/domesticAiCascade";
import { createDomesticAiMockProvider } from "../src/evals/domesticAiBenchmark";

describe("domestic AI cascade adapters", () => {
  it("adapts A.X and K-EXAONE benchmark providers without changing usage", async () => {
    const provider = adaptDomesticAiBenchmarkProviderToCascade(
      createDomesticAiMockProvider("AX"),
    );
    expect(provider).toMatchObject({
      providerId: "AX",
      tier: "HOSTED",
      mode: "MOCK",
    });
  });

  it("adapts Upstage as a Hosted domestic explanation provider", () => {
    const provider = adaptUpstageProviderToCascade(createUpstageMockProvider());
    expect(provider).toMatchObject({
      providerId: "UPSTAGE",
      tier: "HOSTED",
      mode: "MOCK",
    });
    expect(provider.capabilities).toContain("CITATION_GROUNDED_EXPLANATION");
  });
});
