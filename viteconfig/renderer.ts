import path from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { execSync } from "node:child_process";

let gitBranch: string = "";
let gitCommitHash: string = "";
try {
  gitBranch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
  gitCommitHash = execSync("git rev-parse HEAD").toString().trim();
} catch (e) {
  gitBranch = "unknown";
  gitCommitHash = "unknown";
  console.warn(" [!] Failed to get Git Info. Using 'unknown' fallbacks.");
}

// https://vitejs.dev/config
export default defineConfig({
  root: "src/renderer",
  build: {
    outDir: "../../.vite/renderer",
    rollupOptions: {
      input: {
        main_window: "src/renderer/windows/main/index.html",
        settings_window: "src/renderer/windows/settings/index.html",
        authorize_companion_window: "src/renderer/windows/authorize-companion/index.html"
      },
      output: {
        manualChunks: {
          vue: ["vue"]
        }
      }
    }
  },
  plugins: [
    vue({
      features: {
        optionsAPI: false
      }
    })
  ],
  resolve: {
    alias: {
      "~shared": path.resolve(__dirname, "../src/shared"),
      "~assets": path.resolve(__dirname, "../src/assets")
    }
  },
  define: {
    YTMD_GIT_COMMIT_HASH: JSON.stringify(gitCommitHash),
    YTMD_GIT_BRANCH: JSON.stringify(gitBranch)
  }
});
