import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.SKILL_PROXY_TARGET_HTTP?.trim();
  const proxyWsTarget = env.SKILL_PROXY_TARGET_WS?.trim() || proxyTarget;
  const proxyCookie = env.SKILL_PROXY_COOKIE?.trim() || "userId=1";

  return {
    plugins: [react()],
    test: {
      environment: "node",
      include: ["tests/**/*.spec.ts"]
    },
    server: {
      port: 5173,
      proxy:
        proxyTarget && proxyWsTarget
          ? {
              "/api": {
                target: proxyTarget,
                changeOrigin: true,
                secure: false,
                configure: (proxy) => {
                  proxy.on("proxyReq", (proxyReq) => {
                    proxyReq.setHeader("Cookie", proxyCookie);
                  });
                }
              },
              "/ws/skill/stream": {
                target: proxyWsTarget,
                ws: true,
                changeOrigin: true,
                secure: false,
                configure: (proxy) => {
                  proxy.on("proxyReqWs", (proxyReq) => {
                    proxyReq.setHeader("Cookie", proxyCookie);
                  });
                }
              }
            }
          : undefined
    }
  };
});
