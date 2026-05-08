import { app, BrowserView, ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs";
import { execFile, ChildProcess } from "child_process";
import log from "electron-log";

export class DownloadManager {
  private ytmView: BrowserView | null = null;
  private activeDownloads: Map<string, ChildProcess> = new Map();
  private ytDlpPath: string;

  constructor() {
    this.ytDlpPath = this.findYtDlp();
    this.setupIPC();
  }

  public setView(view: BrowserView): void {
    this.ytmView = view;
  }

  private findYtDlp(): string {
    const candidates = [
      path.join(app.getPath("userData"), "yt-dlp.exe"),
      path.join(app.getPath("userData"), "yt-dlp"),
      "yt-dlp"
    ];
    for (const c of candidates) {
      try {
        if (c === "yt-dlp" || fs.existsSync(c)) return c;
      } catch { /* ignore */ }
    }
    return "yt-dlp";
  }

  private setupIPC(): void {
    ipcMain.handle("ultimate:download-track", async (_event, url: string, destPath: string, format: string) => {
      return this.downloadTrack(url, destPath, format || "mp3");
    });

    ipcMain.handle("ultimate:cancel-download", async (_event, url: string) => {
      return this.cancelDownload(url);
    });

    ipcMain.handle("ultimate:get-download-status", async () => {
      return {
        activeCount: this.activeDownloads.size,
        ytDlpPath: this.ytDlpPath
      };
    });
  }

  private async downloadTrack(url: string, destPath: string, format: string): Promise<{ success: boolean; error?: string }> {
    if (this.activeDownloads.has(url)) {
      return { success: false, error: "Download already in progress for this URL" };
    }

    try {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }

      const outputTemplate = path.join(destPath, "%(title)s.%(ext)s");
      const args = [
        url,
        "-f", "bestaudio",
        "-x",
        "--audio-format", format,
        "--audio-quality", "0",
        "-o", outputTemplate,
        "--newline",
        "--no-warnings"
      ];

      return new Promise<{ success: boolean; error?: string }>((resolve) => {
        const child = execFile(this.ytDlpPath, args, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
          this.activeDownloads.delete(url);

          if (error) {
            if ((error as any).killed) {
              this.sendProgress(url, { status: "cancelled", percent: 0 });
              resolve({ success: false, error: "Download cancelled" });
            } else {
              this.sendProgress(url, { status: "error", percent: 0, error: error.message });
              resolve({ success: false, error: error.message });
            }
            return;
          }

          this.sendProgress(url, { status: "complete", percent: 100 });
          resolve({ success: true });
        });

        this.activeDownloads.set(url, child);

        if (child.stdout) {
          let lastPercent = 0;
          child.stdout.on("data", (data: Buffer) => {
            const line = data.toString();
            const match = line.match(/(\d+\.?\d*)%/);
            if (match) {
              const percent = parseFloat(match[1]);
              if (percent - lastPercent >= 1) {
                lastPercent = percent;
                this.sendProgress(url, { status: "downloading", percent });
              }
            }
          });
        }

        if (child.stderr) {
          child.stderr.on("data", (data: Buffer) => {
            log.warn("yt-dlp stderr:", data.toString().trim());
          });
        }
      });
    } catch (e) {
      const err = e as Error;
      log.error("DownloadManager: Download failed", err);
      return { success: false, error: err.message };
    }
  }

  private cancelDownload(url: string): { success: boolean } {
    const child = this.activeDownloads.get(url);
    if (child) {
      child.kill("SIGTERM");
      this.activeDownloads.delete(url);
      return { success: true };
    }
    return { success: false };
  }

  private sendProgress(url: string, data: { status: string; percent: number; error?: string }): void {
    if (this.ytmView) {
      try {
        this.ytmView.webContents.send("ultimate:download-progress", { url, ...data });
      } catch { /* view might be destroyed */ }
    }
  }

  public destroy(): void {
    for (const [url, child] of this.activeDownloads) {
      child.kill("SIGTERM");
    }
    this.activeDownloads.clear();
  }
}
