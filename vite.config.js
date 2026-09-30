import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.VITE_API_TARGET || "http://127.0.0.1:3000";

export default defineConfig({
  root: "src/client",
  publicDir: "public",
  plugins: [react()],
  build: {
    outDir: "../../public",
    emptyOutDir: true,
    assetsDir: "_app",
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": API_TARGET,
      "/health": API_TARGET,
      "/app": API_TARGET,
    },
  },
});
