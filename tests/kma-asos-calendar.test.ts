import { describe, expect, it } from "vitest";
import {
  KmaAsosCalendarError,
  KmaAsosCalendarSchema,
  fetchKmaAsosCalendar,
} from "../src/adapters/weather";
import {
  handleKmaAsosCalendarRequest,
  kmaAsosCalendarConfig,
} from "../server/kma-asos-calendar-proxy.mjs";

const columns = [
  "TM", "STN", "WD", "WS", "GST_WD", "GST_WS", "GST_TM", "PA", "PS", "PT",
  "PR", "TA", "TD", "HM", "PV", "RN", "RN_DAY", "RN_INT", "SD_HR3", "SD_DAY",
  "SD_TOT", "WC", "WP", "WW", "CA_TOT", "CA_MID", "CH_MIN", "CT", "CT_TOP", "CT_MID",
  "CT_LOW", "VS", "SS", "SI", "ST_GD", "TS", "TE_005", "TE_01", "TE_02", "TE_03",
  "ST_SEA", "WH", "BF", "IR", "IX",
];

function row(time: string, values: Record<string, number | string>) {
  const tokens = Object.fromEntries(columns.map((name) => [name, "-9"]));
  Object.assign(tokens, { TM: time, STN: "108" }, values);
  return columns.map((name) => tokens[name]).join(" ");
}

const providerText = [
  "# KMA ASOS fixture",
  `# ${columns.join(" ")}`,
  row("202607120000", { TA: 27.2, HM: 80, RN: 0, RN_INT: 0, VS: 1200, WS: 2.2 }),
  row("202608112300", { TA: 29.1, HM: 84, RN: 4.5, RN_INT: 4.5, VS: 800, WS: 5.1 }),
].join("\n");

describe("KMA ASOS 31-day calendar boundary", () => {
  it("requests only Seoul station 108 and parses hourly context without approving Safety input", async () => {
    let providerUrl = "";
    const response = await handleKmaAsosCalendarRequest(
      new Request("https://demo.example/api/kma-asos-calendar"),
      {
        apiKey: "test-key-not-real",
        nowIso: () => "2026-08-12T03:00:00.000Z",
        fetchImplementation: async (input) => {
          providerUrl = String(input);
          return new Response(providerText, { status: 200 });
        },
      },
    );
    expect(response?.status).toBe(200);
    const result = KmaAsosCalendarSchema.parse(await response!.json());
    expect(result.range).toEqual({
      startDate: "2026-07-12",
      endDate: "2026-08-11",
      dayCount: 31,
    });
    expect(result.days.at(-1)?.points[0]).toMatchObject({
      airTemperatureCelsius: 29.1,
      rainfallMmPerHour: 4.5,
      visibilityMeters: 8_000,
      windSpeedMetersPerSecond: 5.1,
    });
    expect(result.safetyEngineInputApproved).toBe(false);
    expect(result.rawResponseStored).toBe(false);
    const requested = new URL(providerUrl);
    expect(requested.origin + requested.pathname).toBe(kmaAsosCalendarConfig.endpointUrl);
    expect(requested.searchParams.get("tm1")).toBe("202607120000");
    expect(requested.searchParams.get("tm2")).toBe("202608112300");
    expect(requested.searchParams.get("stn")).toBe("108");
  });

  it("exposes missing API utilization approval as a typed fallback", async () => {
    const response = await handleKmaAsosCalendarRequest(
      new Request("https://demo.example/api/kma-asos-calendar"),
      {
        apiKey: "test-key-not-real",
        nowIso: () => "2026-08-12T03:00:00.000Z",
        fetchImplementation: async () => new Response("permission required", { status: 403 }),
      },
    );
    expect(response?.status).toBe(503);
    expect(await response!.json()).toMatchObject({
      status: "FALLBACK",
      code: "PERMISSION_REQUIRED",
      safetyEngineInputApproved: false,
    });
  });

  it("validates the same-origin browser response and rejects fallback states", async () => {
    const liveResponse = await handleKmaAsosCalendarRequest(
      new Request("https://demo.example/api/kma-asos-calendar"),
      {
        apiKey: "test-key-not-real",
        nowIso: () => "2026-08-12T03:00:00.000Z",
        fetchImplementation: async () => new Response(providerText, { status: 200 }),
      },
    );
    const body = await liveResponse!.text();
    await expect(fetchKmaAsosCalendar({
      fetchImplementation: async () => new Response(body, { status: 200 }),
    })).resolves.toMatchObject({ provider: "KMA_API_HUB_ASOS" });
    await expect(fetchKmaAsosCalendar({
      fetchImplementation: async () => new Response(JSON.stringify({
        schemaVersion: "kma-asos-calendar-v1",
        status: "FALLBACK",
        code: "PERMISSION_REQUIRED",
        isDemo: true,
        safetyEngineInputApproved: false,
      }), { status: 503 }),
    })).rejects.toEqual(new KmaAsosCalendarError("PERMISSION_REQUIRED"));
  });
});
