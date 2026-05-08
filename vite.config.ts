import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const isGithubPages = process.env.GITHUB_ACTIONS === "true";

export default defineConfig({
  plugins: [react()],
  base: isGithubPages ? "/slipstream/" : "/",
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: {
      // Forward /api/* to the Vercel dev server when running locally with `vercel dev`
      // Without vercel dev, you can also run: npx ts-node api/strava-token.ts
      // This proxy only activates when VITE_STRAVA_CLIENT_ID is set
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
