import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Base path for GitHub Pages: https://<user>.github.io/stamak/
// Override at build time: BASE=/ npm run build  (for root deploy / custom domain).
const base = process.env.BASE ?? "/stamak/";

const uiCatalogRoot = path.resolve(__dirname, "../packages/ui-catalog");

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@ui-catalog\/core$/, replacement: path.join(uiCatalogRoot, "index.ts") },
      { find: /^@ui-catalog\/core\/styles\/(.*)$/, replacement: path.join(uiCatalogRoot, "core/styles/$1") },
      { find: /^@ui-catalog\/core\/(.*)$/, replacement: path.join(uiCatalogRoot, "core/$1") },
    ],
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, ".."), uiCatalogRoot],
    },
  },
});
