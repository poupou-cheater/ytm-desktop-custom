import { execSync } from "node:child_process";
import { defineConfig } from "vite";

let gitBranch: string = "";
try {
  gitBranch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
} catch (e) {
  gitBranch = "unknown";
  console.warn(" [!] Failed to get Git Info for main process. Using 'unknown' fallback.");
}

// HEAD is used for production builds as they check out version tags in a detached HEAD state
const devBuild = gitBranch !== "HEAD" && process.env.NODE_ENV === "development";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    outDir: ".vite/main",
    rollupOptions: {
      external: ["bufferutil", "utf-8-validate", "discord-rpc", "yt-dlp-exec"]
    }
  },
  define: {
    YTMD_DISABLE_UPDATES: devBuild,
    YTMD_UPDATE_FEED_OWNER: process.env.YTMD_UPDATE_FEED_OWNER ? `'${process.env.YTMD_UPDATE_FEED_OWNER}'` : "'ytmdesktop'",
    YTMD_UPDATE_FEED_REPOSITORY: process.env.YTMD_UPDATE_FEED_REPOSITORY ? `'${process.env.YTMD_UPDATE_FEED_REPOSITORY}'` : "'ytmdesktop'"
  }
});
