// @ts-expect-error Vitest provides Node fs; the browser app intentionally omits Node types.
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";

describe("Integration-ready Sandbox 배포 경계", () => {
  let workerBuilder = "";
  let environmentExample = "";
  let migration = "";

  beforeAll(async () => {
    [workerBuilder, environmentExample, migration] = await Promise.all([
      readFile("scripts/build-sites-worker.mjs", "utf8"),
      readFile(".env.example", "utf8"),
      readFile(".openai/drizzle/0006_integration_sandbox.sql", "utf8"),
    ]);
  });

  it("keeps the Sandbox disabled without complete server-only settings", () => {
    expect(environmentExample).toContain("INTEGRATION_SANDBOX_ENABLED=false");
    expect(environmentExample).toContain("INTEGRATION_SANDBOX_SERVICE_TOKEN=");
    expect(environmentExample).not.toContain("VITE_INTEGRATION_SANDBOX_SERVICE_TOKEN");
    expect(workerBuilder).toContain(
      'enabled: env.INTEGRATION_SANDBOX_ENABLED === "true"',
    );
    expect(workerBuilder).not.toContain("VITE_INTEGRATION_SANDBOX_SERVICE_TOKEN");
  });

  it("packages the server handler and D1 optimistic state migration", () => {
    expect(workerBuilder).toContain("handleIntegrationSandboxRequest");
    expect(workerBuilder).toContain("integration-sandbox-store.mjs");
    expect(migration).toContain("integration_sandbox_state");
    expect(migration).toContain("revision INTEGER NOT NULL");
  });

  it("adds security headers without granting camera or microphone access", () => {
    expect(workerBuilder).toContain('"Cross-Origin-Opener-Policy": "same-origin"');
    expect(workerBuilder).toContain(
      '"Permissions-Policy": "camera=(), microphone=(), geolocation=(self)"',
    );
    expect(workerBuilder).toContain('"Strict-Transport-Security"');
    expect(workerBuilder).toContain('"X-Content-Type-Options": "nosniff"');
  });
});
