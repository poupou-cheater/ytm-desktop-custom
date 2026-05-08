import { app, BrowserWindow, BrowserView, ipcMain, session } from "electron";
import log from "electron-log";
import { ExtensionManager } from "./ExtensionManager";
import { DownloadManager } from "./DownloadManager";
import { ThemeManager } from "./ThemeManager";

export class UltimateCoreManager {
  private mainWindow: BrowserWindow;
  private ytmView: BrowserView;
  public extensionManager: ExtensionManager;
  public downloadManager: DownloadManager;
  public themeManager: ThemeManager;

  constructor(window: BrowserWindow, view: BrowserView) {
    this.mainWindow = window;
    this.ytmView = view;

    this.extensionManager = new ExtensionManager();
    this.downloadManager = new DownloadManager();
    this.themeManager = new ThemeManager();
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

  /**
   * Inject external theme files into the renderer after page loads
   */
  public async injectThemes(): Promise<void> {
    if (this.ytmView && this.ytmView.webContents) {
      await this.themeManager.injectThemes(this.ytmView);
      log.info("UltimateCoreManager: External themes injected");
    }
  }

  /**
   * Get all theme file contents for IPC-based injection
   */
  public getThemeFiles(): { filename: string; content: string }[] {
    const files = this.themeManager.scanThemes();
    const result: { filename: string; content: string }[] = [];
    for (const file of files) {
      const content = this.themeManager.readTheme(file);
      if (content) {
        result.push({ filename: file, content });
      }
    }
    log.info(`UltimateCoreManager: Read ${result.length} theme files: ${result.map(f => f.filename).join(", ")}`);
    return result;
  }

  private setupOptimizations(): void {
    // GPU & rendering optimizations
    app.commandLine.appendSwitch("disable-renderer-backgrounding");
    app.commandLine.appendSwitch("disable-audio-output-resampler");
    app.commandLine.appendSwitch("enable-gpu-rasterization");
    app.commandLine.appendSwitch("enable-zero-copy");
    app.commandLine.appendSwitch("enable-features", "VaapiVideoDecoder,CanvasOopRasterization");
    app.commandLine.appendSwitch("disable-features", "UseChromeOSDirectVideoDecoder");
    // V8 memory tuning
    app.commandLine.appendSwitch("js-flags", "--expose-gc --max-old-space-size=256 --optimize-for-size");

    this.mainWindow.on("blur", () => {
      if (this.ytmView) {
        try { this.ytmView.webContents.send("ultimate:app-state", { state: "background" }); } catch {}
      }
      this.doGC();
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
      this.doGC();
      // Clear renderer caches on minimize to free memory
      if (this.ytmView && this.ytmView.webContents) {
        try { this.ytmView.webContents.session.clearCache(); } catch {}
      }
    });

    // Periodic GC — lightweight, no process spawning
    setInterval(() => this.doGC(), 30000);

    log.info("UltimateCoreManager: Memory optimizer active (pure JS, no PowerShell)");
  }

  private doGC(): void {
    if (global.gc) global.gc();
  }

  private setupAdBlocker(): void {
    const partition = app.isPackaged ? "persist:ytmview" : "persist:ytmview-dev";
    const ses = session.fromPartition(partition);

    const adPatterns = [
      /\/pagead\//,
      /\/api\/stats\/ads/,
      /\/pcs\/activeview/,
      /doubleclick\.net/,
      /googlesyndication\.com/,
      /googleadservices\.com/,
      /\/get_midroll_/,
      /\/youtubei\/v1\/player\/ad_break/,
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

    ipcMain.handle("ultimate:open-extension-options", async (_event, id: string) => {
      return this.extensionManager.openExtensionOptions(id);
    });

    // Themes — all metadata comes from the .theme.js files themselves
    ipcMain.handle("ultimate:scan-themes", async () => {
      return this.themeManager.getThemesMetadata();
    });

    ipcMain.handle("ultimate:get-default-theme-config", async () => {
      return this.themeManager.buildDefaultConfig();
    });

    ipcMain.handle("ultimate:get-themes-dir", async () => {
      return this.themeManager.getThemesDir();
    });

    ipcMain.handle("ultimate:open-themes-dir", async () => {
      const { shell } = require("electron");
      return shell.openPath(this.themeManager.getThemesDir());
    });
  }

  public destroy(): void {
    this.downloadManager.destroy();
  }
}
