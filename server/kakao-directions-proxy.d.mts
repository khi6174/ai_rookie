export type KakaoDirectionsProxyOptions = {
  apiKey?: string;
  enabled?: boolean;
  fetchImplementation?: typeof fetch;
  nowIso?: () => string;
};

export function handleKakaoDirectionsRequest(
  request: Request,
  options?: KakaoDirectionsProxyOptions,
): Promise<Response>;

export const kakaoDirectionsDemoRoute: Readonly<{
  origin: { latitude: number; longitude: number };
  rest: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
}>;
