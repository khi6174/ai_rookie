// @ts-expect-error Vitest provides the Node runtime; the browser app intentionally omits Node types.
import { readFile, stat } from "node:fs/promises";
// @ts-expect-error Vitest provides the Node runtime; the browser app intentionally omits Node types.
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("설치형 PWA 정적 계약", () => {
  it("manifest가 standalone과 192·512 아이콘을 선언한다", async () => {
    const manifest = JSON.parse(await readFile(resolve("public/manifest.webmanifest"), "utf8"));
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toContain("source=pwa");
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(["192x192", "512x512"]);
    expect((await stat(resolve("public/icons/saferoute-192.png"))).size).toBeGreaterThan(1_000);
    expect((await stat(resolve("public/icons/saferoute-512.png"))).size).toBeGreaterThan(2_000);
  });

  it("service worker가 versioned shell만 캐시하고 외부 요청을 가로채지 않는다", async () => {
    const worker = await readFile(resolve("public/sw.js"), "utf8");
    expect(worker).toContain('SHELL_VERSION = "saferoute-shell-v1.0.1"');
    expect(worker).toContain("url.origin !== self.location.origin");
    expect(worker).toContain('request.method !== "GET"');
    expect(worker).not.toMatch(/api[_-]?key|authKey|huggingface|openai/i);
  });
});
