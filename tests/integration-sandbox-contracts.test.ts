import { describe, expect, it } from "vitest";
import {
  createIntegrationSandboxCustomerNotice,
  createIntegrationSandboxPlanCommand,
  createIntegrationSandboxTmsBatch,
} from "../src/application/operations/createIntegrationSandboxScenario";
import {
  SandboxCustomerNoticeCommandSchema,
  SandboxPlanApplyCommandSchema,
  SandboxPrincipalSchema,
  SandboxTmsEventBatchSchema,
  findSandboxForbiddenFields,
} from "../src/domain/operations/integrationSandbox";

const scenario = {
  tenantId: "sandbox-tenant-alpha",
  siteId: "sandbox-site-seoul",
  scenarioId: "sandbox-scenario-normal-001",
  seed: 17,
  startedAt: "2026-08-10T09:00:00+09:00",
  courierCount: 25,
  tick: 4,
  kind: "NORMAL" as const,
};

describe("Integration-ready Sandbox 계약", () => {
  it("accepts only explicit synthetic principals and roles", () => {
    expect(SandboxPrincipalSchema.parse({
      schemaVersion: "integration-sandbox-principal-v1",
      dataMode: "PRODUCTION_SANDBOX",
      tenantId: "sandbox-tenant-alpha",
      siteId: "sandbox-site-seoul",
      actorId: "sandbox-actor-admin-001",
      role: "TENANT_ADMIN",
    }).dataMode).toBe("PRODUCTION_SANDBOX");
    expect(() => SandboxPrincipalSchema.parse({
      schemaVersion: "integration-sandbox-principal-v1",
      dataMode: "LIVE_PILOT",
      tenantId: "sandbox-tenant-alpha",
      siteId: "sandbox-site-seoul",
      actorId: "sandbox-actor-admin-001",
      role: "TENANT_ADMIN",
    })).toThrow();
  });

  it("generates the same strict TMS batch for the same seed and tick", () => {
    const first = createIntegrationSandboxTmsBatch(scenario);
    const second = createIntegrationSandboxTmsBatch(scenario);
    expect(second).toEqual(first);
    expect(first.events).toHaveLength(25);
    expect(SandboxTmsEventBatchSchema.parse(first)).toEqual(first);
  });

  it("rejects duplicate and out-of-order simulator scenarios", () => {
    expect(() => createIntegrationSandboxTmsBatch({
      ...scenario,
      kind: "DUPLICATE_RETRY",
    })).toThrow();
    expect(() => createIntegrationSandboxTmsBatch({
      ...scenario,
      kind: "OUT_OF_ORDER",
    })).toThrow();
  });

  it("requires consent, approved safety proof and a monotonic plan version", () => {
    const command = createIntegrationSandboxPlanCommand();
    expect(SandboxPlanApplyCommandSchema.parse(command)).toEqual(command);
    expect(() => createIntegrationSandboxPlanCommand({
      change: { ...command.change, nextPlanVersion: 4 },
    })).toThrow();
    expect(() => SandboxPlanApplyCommandSchema.parse({
      ...command,
      consentProofs: [],
    })).toThrow();
    expect(() => SandboxPlanApplyCommandSchema.parse({
      ...command,
      safetyProof: { ...command.safetyProof, riskTransferGuard: "FAILED" },
    })).toThrow();
  });

  it("keeps customer delivery in a non-network synthetic outbox", () => {
    const notice = createIntegrationSandboxCustomerNotice();
    expect(SandboxCustomerNoticeCommandSchema.parse(notice)).toEqual(notice);
    expect(() => SandboxCustomerNoticeCommandSchema.parse({
      ...notice,
      networkDelivery: true,
    })).toThrow();
  });

  it("detects forbidden personal and precise-location fields recursively", () => {
    expect(findSandboxForbiddenFields({
      payload: { contact: { phone: "010-0000-0000" }, GPS: { lat: 37.5 } },
    })).toEqual([
      "payload.contact.phone",
      "payload.GPS",
      "payload.GPS.lat",
    ]);
  });
});
