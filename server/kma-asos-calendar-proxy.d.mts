export type KmaAsosCalendarProxyOptions = {
  apiKey?: string;
  enabled?: boolean;
  endpointUrl?: string;
  fetchImplementation?: typeof fetch;
  nowIso?: () => string;
};

export function handleKmaAsosCalendarRequest(
  request: Request,
  options?: KmaAsosCalendarProxyOptions,
): Promise<Response | undefined>;

export const kmaAsosCalendarConfig: Readonly<{
  endpointUrl: string;
  stationId: string;
  maximumDays: number;
}>;
