export type UpstageExplanationProxyOptions = {
  apiKey?: string;
  model?: string;
  timeoutMs?: number | string;
  fetchImplementation?: typeof fetch;
};

export function handleUpstageExplanationRequest(
  request: Request,
  options?: UpstageExplanationProxyOptions,
): Promise<Response | undefined>;
