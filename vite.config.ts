import { defineConfig, loadEnv, type Plugin } from "vite";
import bundledSyntheticOperationsDocument from "./public/templates/daily-operations-documents-2026-07-25-bundled-v1.json";
import { handleKakaoDirectionsRequest } from "./server/kakao-directions-proxy.mjs";
import {
  createMemoryOperationsSessionStore,
  handleOperationsSessionRequest,
} from "./server/operations-session-store.mjs";
import {
  createMemoryRiderProfileStore,
  handleRiderProfileRequest,
} from "./server/rider-profile-store.mjs";
import { handleUpstageExplanationRequest } from "./server/upstage-explanation-proxy.mjs";
import {
  createMemorySyntheticOperationsStore,
  handleSyntheticOperationsRequest,
} from "./server/synthetic-operations-store.mjs";
import react from "@vitejs/plugin-react";

async function readIncomingBody(
  request: AsyncIterable<Uint8Array | string>,
) {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes =
      typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    chunks.push(bytes);
    length += bytes.byteLength;
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function kakaoDirectionsDevProxy(mode: string): Plugin {
  const environment = {
    ...loadEnv(mode, ".", ""),
  };
  const operationsSessionStore = createMemoryOperationsSessionStore();
  const riderProfileStore = createMemoryRiderProfileStore();
  const syntheticOperationsStore = createMemorySyntheticOperationsStore(
    bundledSyntheticOperationsDocument,
  );
  return {
    name: "saferoute-kakao-directions-dev-proxy",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const incoming = request as unknown as {
          url?: string;
          method?: string;
          headers: Record<string, string | string[] | undefined>;
        };
        const requestUrl = new URL(
          incoming.url ?? "/",
          "http://127.0.0.1",
        );
        const method = incoming.method ?? "GET";
        const body =
          method === "PUT" || method === "POST"
            ? await readIncomingBody(
                request as unknown as AsyncIterable<Uint8Array | string>,
              )
            : undefined;
        const riderProfileResponse = await handleRiderProfileRequest(
          new Request(requestUrl, { method }),
          { memoryStore: riderProfileStore },
        );
        if (riderProfileResponse) {
          response.statusCode = riderProfileResponse.status;
          riderProfileResponse.headers.forEach((value, name) => {
            response.setHeader(name, value);
          });
          response.end(await riderProfileResponse.text());
          return;
        }
        const syntheticOperationsResponse =
          await handleSyntheticOperationsRequest(
            new Request(requestUrl, { method }),
            { memoryStore: syntheticOperationsStore },
          );
        if (syntheticOperationsResponse) {
          response.statusCode = syntheticOperationsResponse.status;
          syntheticOperationsResponse.headers.forEach((value, name) => {
            response.setHeader(name, value);
          });
          response.end(await syntheticOperationsResponse.text());
          return;
        }
        const operationsResponse = await handleOperationsSessionRequest(
          new Request(requestUrl, {
            method,
            headers: {
              "content-type":
                String(incoming.headers["content-type"] ?? "application/json"),
              ...(incoming.headers["x-saferoute-base-saved-at"]
                ? {
                    "x-saferoute-base-saved-at": String(
                      incoming.headers["x-saferoute-base-saved-at"],
                    ),
                  }
                : {}),
              ...(incoming.headers["if-none-match"]
                ? {
                    "if-none-match": String(
                      incoming.headers["if-none-match"],
                    ),
                  }
                : {}),
            },
            body,
          }),
          { memoryStore: operationsSessionStore },
        );
        if (operationsResponse) {
          response.statusCode = operationsResponse.status;
          operationsResponse.headers.forEach((value, name) => {
            response.setHeader(name, value);
          });
          response.end(await operationsResponse.text());
          return;
        }
        const upstageResponse = await handleUpstageExplanationRequest(
          new Request(requestUrl, {
            method,
            headers: {
              "content-type":
                String(incoming.headers["content-type"] ?? "application/json"),
              ...(incoming.headers["x-saferoute-base-saved-at"]
                ? {
                    "x-saferoute-base-saved-at": String(
                      incoming.headers["x-saferoute-base-saved-at"],
                    ),
                  }
                : {}),
            },
            body,
          }),
          {
            apiKey: environment.UPSTAGE_API_KEY,
            model: environment.UPSTAGE_MODEL,
            timeoutMs: environment.UPSTAGE_TIMEOUT_MS,
          },
        );
        if (upstageResponse) {
          response.statusCode = upstageResponse.status;
          upstageResponse.headers.forEach((value, name) => {
            response.setHeader(name, value);
          });
          response.end(await upstageResponse.text());
          return;
        }
        if (requestUrl.pathname !== "/api/kakao-directions") {
          next();
          return;
        }
        const proxyResponse = await handleKakaoDirectionsRequest(
          new Request(requestUrl, { method: incoming.method ?? "GET" }),
          {
            apiKey: environment.KAKAO_MOBILITY_REST_API_KEY,
            enabled:
              mode !== "test" &&
              environment.KAKAO_DIRECTIONS_ENABLED !== "false",
          },
        );
        response.statusCode = proxyResponse.status;
        proxyResponse.headers.forEach((value, name) => {
          response.setHeader(name, value);
        });
        response.end(await proxyResponse.text());
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), kakaoDirectionsDevProxy(mode)],
  build: {
    modulePreload: false,
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
}));
