import { defineConfig, loadEnv, type Plugin } from "vite";
import { handleKakaoDirectionsRequest } from "./server/kakao-directions-proxy.mjs";
import react from "@vitejs/plugin-react";

function kakaoDirectionsDevProxy(mode: string): Plugin {
  const environment = {
    ...loadEnv(mode, ".", ""),
  };
  return {
    name: "saferoute-kakao-directions-dev-proxy",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const incoming = request as unknown as {
          url?: string;
          method?: string;
        };
        const requestUrl = new URL(
          incoming.url ?? "/",
          "http://127.0.0.1",
        );
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
  test: {
    include: ["tests/**/*.test.ts"],
  },
}));
