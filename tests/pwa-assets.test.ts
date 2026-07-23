// @ts-expect-error Vitest provides the Node runtime; the browser app intentionally omits Node types.
import { readFile, stat } from "node:fs/promises";
// @ts-expect-error Vitest provides the Node runtime; the browser app intentionally omits Node types.
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("설치형 PWA 정적 계약", () => {
  it("manifest가 standalone과 192·512 아이콘을 선언한다", async () => {
    const manifest = JSON.parse(await readFile(resolve("public/manifest.webmanifest"), "utf8"));
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toContain("source=pwa");
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(["192x192", "512x512"]);
    expect((await stat(resolve("public/icons/saferoute-192.png"))).size).toBeGreaterThan(1_000);
    expect((await stat(resolve("public/icons/saferoute-512.png"))).size).toBeGreaterThan(2_000);
  });

  it("service worker가 versioned shell만 캐시하고 사람 평가 자극은 캐시하지 않는다", async () => {
    const worker = await readFile(resolve("public/sw.js"), "utf8");
    expect(worker).toContain('SHELL_VERSION = "saferoute-shell-v1.0.5"');
    expect(worker).toContain("url.origin !== self.location.origin");
    expect(worker).toContain('request.method !== "GET"');
    expect(worker).toContain('"/tools/g5-spatial-review/"');
    expect(worker).toContain('"/tools/rider-reference-review/"');
    expect(worker).toContain('"/artifacts/evals/screenshots/g5-"');
    expect(worker).toContain('"/artifacts/evals/screenshots/rider-"');
    expect(worker).toContain('fetch(request, { cache: "no-store" })');
    expect(worker.indexOf("isHumanReviewResource(url)")).toBeLessThan(
      worker.indexOf('request.mode === "navigate"'),
    );
    expect(worker).not.toMatch(/api[_-]?key|authKey|huggingface|openai/i);
  });

  it("사람 평가 스크립트와 고정 자극을 실제 fetch에서 no-store로 우회한다", async () => {
    const worker = await readFile(resolve("public/sw.js"), "utf8");
    const handlers = new Map<string, (event: {
      request: {
        method: string;
        url: string;
        mode: string;
        destination: string;
      };
      respondWith: (response: Promise<Response>) => void;
    }) => void>();
    const open = vi.fn(() => {
      throw new Error("Human review resources must not open the shell cache.");
    });
    const fetchFresh = vi.fn(async () => new Response("fresh"));
    const serviceWorker = {
      location: { origin: "https://saferoute.example" },
      addEventListener: (
        type: string,
        handler: (event: {
          request: {
            method: string;
            url: string;
            mode: string;
            destination: string;
          };
          respondWith: (response: Promise<Response>) => void;
        }) => void,
      ) => handlers.set(type, handler),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    };
    const cacheStorage = {
      open,
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true),
    };

    new Function("self", "caches", "fetch", "Response", "URL", worker)(
      serviceWorker,
      cacheStorage,
      fetchFresh,
      Response,
      URL,
    );

    const fetchHandler = handlers.get("fetch");
    expect(fetchHandler).toBeDefined();

    for (const path of [
      "/tools/g5-spatial-review/app.js",
      "/artifacts/evals/screenshots/g5-round4-admin-decision-2d-1280x720.png",
    ]) {
      let responsePromise: Promise<Response> | undefined;
      fetchHandler?.({
        request: {
          method: "GET",
          url: `https://saferoute.example${path}`,
          mode: "cors",
          destination: path.endsWith(".js") ? "script" : "image",
        },
        respondWith: (response) => {
          responsePromise = response;
        },
      });
      expect(responsePromise).toBeDefined();
      expect(await responsePromise).toBeInstanceOf(Response);
    }

    expect(fetchFresh).toHaveBeenCalledTimes(2);
    expect(fetchFresh).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        url: "https://saferoute.example/tools/g5-spatial-review/app.js",
      }),
      { cache: "no-store" },
    );
    expect(open).not.toHaveBeenCalled();
  });
});
