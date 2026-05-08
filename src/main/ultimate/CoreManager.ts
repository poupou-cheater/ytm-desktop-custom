import { app, BrowserWindow, BrowserView, ipcMain, session } from "electron";
import log from "electron-log";
import { ExtensionManager } from "./ExtensionManager";
import { DownloadManager } from "./DownloadManager";
import { ThemeConfig } from "../../shared/store/schema";

const DEFAULT_THEME_CONFIG: ThemeConfig = {
  starry: { topColor: "#000000", bottomColor: "#142b44", starCount: 300, shootingStarCount: 4, showShootingStars: true, animationSpeed: 1.0 },
  "audio-reactive": { bassSensitivity: 1.5, colors: ["#ff0055", "#0044ff", "#ffcc00"], shape: "bars" },
  liquid: { colors: ["#ff0055", "#0044ff", "#ffcc00"], speed: 1.0, blurIntensity: 40 },
  lofi: { weather: "rain", intensity: 1.0, forceTimeOfDay: "auto" },
  "retro-crt": { scanlineOpacity: 0.3, glitchIntensity: 0.05, distortion: 0.0 },
  vortex: { speed: 1.0, color: "#00ffff", cameraRotation: 0.0 }
};

export { DEFAULT_THEME_CONFIG };

export class UltimateCoreManager {
  private mainWindow: BrowserWindow;
  private ytmView: BrowserView;
  public extensionManager: ExtensionManager;
  public downloadManager: DownloadManager;

  constructor(window: BrowserWindow, view: BrowserView) {
    this.mainWindow = window;
    this.ytmView = view;

    this.extensionManager = new ExtensionManager();
    this.downloadManager = new DownloadManager();
    this.downloadManager.setView(view);

    this.setupOptimizations();
    this.setupIPC();
    this.setupAdBlocker();

    // Extensions are pre-loaded in index.ts BEFORE createYTMView()
    // No need to load them again here

    // Debug: check if content scripts injected after page loads
    setTimeout(() => {
      const partition = app.isPackaged ? "persist:ytmview" : "persist:ytmview-dev";
      const ses = session.fromPartition(partition);
      const loadedExts = ses.getAllExtensions();
      log.info(`UltimateCoreManager: Session has ${loadedExts.length} extensions loaded: ${loadedExts.map(e => e.name).join(", ")}`);

      if (this.ytmView && this.ytmView.webContents) {
        this.ytmView.webContents.executeJavaScript(`
          (function() {
            var oneko = document.getElementById("oneko");
            var scripts = document.querySelectorAll("script[src*='chrome-extension']");
            return {
              nekoExists: !!oneko,
              nekoStyle: oneko ? oneko.style.cssText : "N/A",
              extScripts: scripts.length,
              bodyChildren: document.body.children.length
            };
          })()
        `).then((result: any) => {
          log.info("UltimateCoreManager: Extension check:", JSON.stringify(result));
        }).catch((e: Error) => {
          log.error("UltimateCoreManager: Extension check failed:", e.message);
        });
      }
    }, 10000);

    log.info("UltimateCoreManager: Initialized");
  }

  private setupOptimizations(): void {
    app.commandLine.appendSwitch("disable-renderer-backgrounding");
    app.commandLine.appendSwitch("disable-audio-output-resampler");
    app.commandLine.appendSwitch("enable-gpu-rasterization");
    app.commandLine.appendSwitch("enable-zero-copy");

    this.mainWindow.on("blur", () => {
      if (this.ytmView) {
        try { this.ytmView.webContents.send("ultimate:app-state", { state: "background" }); } catch {}
      }
      if (global.gc) global.gc();
    });

    this.mainWindow.on("focus", () => {
      if (this.ytmView) {
        try { this.ytmView.webContents.send("ultimate:app-state", { state: "foreground" }); } catch {}
      }
    });

    this.mainWindow.on("minimize", () => {
      if (this.ytmView) {
        try { this.ytmView.webContents.send("ultimate:app-state", { state: "minimized" }); } catch {}
      }
    });
  }

  private setupAdBlocker(): void {
    const partition = app.isPackaged ? "persist:ytmview" : "persist:ytmview-dev";
    const ses = session.fromPartition(partition);

    const adPatterns = [
      /\/pagead\//,
      /\/ptracking\?/,
      /\/api\/stats\/ads/,
      /\/ads\/watch\//,
      /\/pcs\/activeview/,
      /\/pagead\/adview/,
      /doubleclick\.net/,
      /googlesyndication\.com/,
      /googleadservices\.com/,
      /\/get_midroll_/,
      /\/ad_break/,
      /\/api\/stats\/qoe\?.*adformat/,
      /\/youtubei\/v1\/player\/ad_break/,
      /\/generate_204\?.*ad/,
      /\.googlevideo\.com\/.*&ctier=L&/,
      /&ad_type=/,
      /\/log_interaction\?.*ad/,
    ];

    ses.webRequest.onBeforeRequest({ urls: ["*://*.youtube.com/*", "*://*.googlevideo.com/*", "*://*.doubleclick.net/*", "*://*.googlesyndication.com/*", "*://*.googleadservices.com/*"] }, (details, callback) => {
      const url = details.url;
      for (const pattern of adPatterns) {
        if (pattern.test(url)) {
          callback({ cancel: true });
          return;
        }
      }
      callback({});
    });

    log.info("UltimateCoreManager: Ad blocker active");
  }

  private setupIPC(): void {
    ipcMain.handle("ultimate:list-extensions", async () => {
      return this.extensionManager.listExtensions();
    });

    ipcMain.handle("ultimate:load-extension", async (_event, extPath: string) => {
      return this.extensionManager.loadExtension(extPath);
    });

    ipcMain.handle("ultimate:remove-extension", async (_event, id: string) => {
      return this.extensionManager.removeExtension(id);
    });

    // Live toggle: actually loads/unloads the extension in real-time
    ipcMain.handle("ultimate:toggle-extension", async (_event, id: string, enabled: boolean) => {
      if (enabled) {
        return this.extensionManager.enableExtension(id);
      } else {
        return this.extensionManager.disableExtension(id);
      }
    });

    ipcMain.handle("ultimate:get-default-theme-config", async () => {
      return DEFAULT_THEME_CONFIG;
    });

    ipcMain.handle("ultimate:open-extension-options", async (_event, id: string) => {
      return this.extensionManager.openExtensionOptions(id);
    });
  }

  public destroy(): void {
    this.downloadManager.destroy();
  }
}
