import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base path for GitHub Pages: https://<user>.github.io/stamak/
// Override at build time: BASE=/ npm run build  (for root deploy / custom domain).
const base = process.env.BASE ?? "/stamak/";

export default defineConfig({
  base,
  plugins: [react()],
});
