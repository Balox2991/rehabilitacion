import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Motor de tracking de la Fase 1 (JS puro). Se reutiliza tal cual; ver docs/FASE-3-WEB.md.
      "@engine": fileURLToPath(new URL("../tracking-prototype/src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    fs: { allow: [".."] }, // permite servir el motor, que vive en apps/tracking-prototype
    proxy: {
      "/api": { target: "http://localhost:3001", rewrite: (p) => p.replace(/^\/api/, "") },
    },
  },
});
