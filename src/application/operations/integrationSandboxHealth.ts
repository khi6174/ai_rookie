import { z } from "zod";

export const IntegrationSandboxHealthSchema = z
  .object({
    schemaVersion: z.literal("integration-sandbox-health-v1"),
    status: z.enum(["READY", "DISABLED"]),
    dataMode: z.literal("PRODUCTION_SANDBOX"),
    configured: z.boolean(),
    externalTmsConnected: z.literal(false),
    actualAuthenticationConnected: z.literal(false),
    customerNetworkDeliveryEnabled: z.literal(false),
    actualPersonalDataAllowed: z.literal(false),
  })
  .strict();

export type IntegrationSandboxHealth = z.infer<
  typeof IntegrationSandboxHealthSchema
>;

export async function loadIntegrationSandboxHealth(
  fetcher: typeof fetch = fetch,
): Promise<IntegrationSandboxHealth> {
  const response = await fetcher("/api/integration-sandbox/health", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Integration Sandbox health를 확인하지 못했습니다.");
  }
  return IntegrationSandboxHealthSchema.parse(await response.json());
}
