import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: {
        // In development the React app talks to FastAPI through this proxy,
        // so no CORS configuration is needed locally.
        "/api": { target: env.VITE_PROXY_TARGET || "http://127.0.0.1:8000", changeOrigin: true },
      },
    },
  };
});
