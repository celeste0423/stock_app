import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/static/vite/",
  plugins: [react()],
  build: {
    outDir: "static/vite",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/static/vite/static": {
        target: "http://127.0.0.1:8124",
        rewrite: (path) => path.replace(/^\/static\/vite/, ""),
      },
      "/static/vite/vendor": {
        target: "http://127.0.0.1:8124",
        rewrite: (path) => path.replace(/^\/static\/vite/, ""),
      },
      "/api": "http://127.0.0.1:8124",
    },
  },
});
