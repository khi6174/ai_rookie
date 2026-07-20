import { describe, expect, it } from "vitest";
import { createKakaoMapsScriptUrl } from "../src/adapters/maps/kakao";

describe("Kakao Maps browser SDK contract", () => {
  it("pins the official HTTPS SDK host and disables automatic initialization", () => {
    const url = new URL(createKakaoMapsScriptUrl("demo_java_script_key"));
    expect(url.origin).toBe("https://dapi.kakao.com");
    expect(url.pathname).toBe("/v2/maps/sdk.js");
    expect(url.searchParams.get("appkey")).toBe("demo_java_script_key");
    expect(url.searchParams.get("autoload")).toBe("false");
  });

  it("rejects blank or whitespace-contaminated keys", () => {
    expect(() => createKakaoMapsScriptUrl("  ")).toThrow();
    expect(() => createKakaoMapsScriptUrl("not a valid key")).toThrow();
  });
});
