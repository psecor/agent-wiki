import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The app is hosted at /wiki/ in production (Apache reverse proxy →
// Express on 127.0.0.1:3045, both prefixed). Vite's `base` makes the
// generated asset URLs already include the prefix.
//
// In dev (`npm run dev`), the dev server proxies /wiki/api and /wiki/auth
// to the running service so cookies/sessions work the same way.
export default defineConfig({
  base: "/wiki/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/wiki/api": "http://127.0.0.1:3045",
      "/wiki/auth": "http://127.0.0.1:3045",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
