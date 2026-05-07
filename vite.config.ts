import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const isGithubPages = process.env.GITHUB_ACTIONS === "true";

export default defineConfig({
  plugins: [react()],
  base: isGithubPages ? "/slipstream/" : "/",
  server: { port: 5173, host: "127.0.0.1" },
});
