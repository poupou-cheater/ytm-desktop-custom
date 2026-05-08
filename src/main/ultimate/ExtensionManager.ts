import { app, session, BrowserWindow } from "electron";
import * as fs from "fs";
import * as path from "path";
import log from "electron-log";
import { UltimateExtensionInfo } from "../../shared/store/schema";

export class ExtensionManager {
  private extensions: Map<string, UltimateExtensionInfo> = new Map();
  private configPath: string;
  private partition: string;

  constructor() {
    this.partition = app.isPackaged ? "persist:ytmview" : "persist:ytmview-dev";
    this.configPath = path.join(app.getPath("userData"), "ultimate-extensions.json");
    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
        if (Array.isArray(data)) {
          for (const ext of data) {
            this.extensions.set(ext.id, ext);
          }
        }
      }
    } catch (e) {
      log.error("ExtensionManager: Failed to load config", e);
    }
  }

  private saveConfig(): void {
    try {
      const data = Array.from(this.extensions.values());
      fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      log.error("ExtensionManager: Failed to save config", e);
    }
  }

  public async loadExtension(extPath: string): Promise<{ success: boolean; error?: string; extension?: UltimateExtensionInfo }> {
    try {
      const manifestPath = path.join(extPath, "manifest.json");
      if (!fs.existsSync(manifestPath)) {
        return { success: false, error: "manifest.json not found in the selected folder" };
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      const ses = session.fromPartition(this.partition);

      let loadedExt: Electron.Extension;
      if (typeof (ses as any).extensions?.loadExtension === "function") {
        loadedExt = await (ses as any).extensions.loadExtension(extPath, { allowFileAccess: true });
      } else {
        loadedExt = await ses.loadExtension(extPath, { allowFileAccess: true });
      }

      const optionsPage = manifest.options_ui?.page || manifest.options_page || manifest.action?.default_popup || manifest.browser_action?.default_popup || null;
      const optionsUrl = optionsPage ? `chrome-extension://${loadedExt.id}/${optionsPage}` : null;

      const info: UltimateExtensionInfo = {
        id: loadedExt.id,
        name: manifest.name || loadedExt.name || "Unknown",
        version: manifest.version || "0.0.0",
        path: extPath,
        enabled: true,
        optionsUrl
      };

      this.extensions.set(info.id, info);
      this.saveConfig();
      log.info(`ExtensionManager: Loaded extension "${info.name}" (${info.id})`);
      return { success: true, extension: info };
    } catch (e) {
      const err = e as Error;
      log.error("ExtensionManager: Failed to load extension", err);
      return { success: false, error: err.message };
    }
  }

  public async removeExtension(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const ses = session.fromPartition(this.partition);
      if (typeof (ses as any).extensions?.removeExtension === "function") {
        (ses as any).extensions.removeExtension(id);
      } else if (typeof (ses as any).removeExtension === "function") {
        (ses as any).removeExtension(id);
      }
      this.extensions.delete(id);
      this.saveConfig();
      log.info(`ExtensionManager: Removed extension ${id}`);
      return { success: true };
    } catch (e) {
      const err = e as Error;
      return { success: false, error: err.message };
    }
  }

  public listExtensions(): UltimateExtensionInfo[] {
    return Array.from(this.extensions.values());
  }

  public async loadSavedExtensions(): Promise<void> {
    const ses = session.fromPartition(this.partition);
    let dirty = false;
    for (const [id, ext] of this.extensions) {
      if (!ext.enabled) continue;
      try {
        if (fs.existsSync(ext.path)) {
          let loadedExt: Electron.Extension;
          if (typeof (ses as any).extensions?.loadExtension === "function") {
            loadedExt = await (ses as any).extensions.loadExtension(ext.path, { allowFileAccess: true });
          } else {
            loadedExt = await ses.loadExtension(ext.path, { allowFileAccess: true });
          }
          // Re-read manifest to populate optionsUrl for older saved entries
          if (!ext.optionsUrl) {
            const manifestPath = path.join(ext.path, "manifest.json");
            if (fs.existsSync(manifestPath)) {
              const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
              const optionsPage = manifest.options_ui?.page || manifest.options_page || manifest.action?.default_popup || manifest.browser_action?.default_popup || null;
              if (optionsPage) {
                ext.optionsUrl = `chrome-extension://${loadedExt.id}/${optionsPage}`;
                dirty = true;
              }
            }
          }
          log.info(`ExtensionManager: Auto-loaded saved extension "${ext.name}"`);
        } else {
          log.warn(`ExtensionManager: Extension path no longer exists: ${ext.path}`);
          this.extensions.delete(id);
          dirty = true;
        }
      } catch (e) {
        log.error(`ExtensionManager: Failed to auto-load extension "${ext.name}"`, e);
      }
    }
    if (dirty) this.saveConfig();
  }

  public async enableExtension(id: string): Promise<{ success: boolean; error?: string }> {
    const ext = this.extensions.get(id);
    if (!ext) return { success: false, error: "Extension not found" };
    try {
      const ses = session.fromPartition(this.partition);
      if (fs.existsSync(ext.path)) {
        if (typeof (ses as any).extensions?.loadExtension === "function") {
          await (ses as any).extensions.loadExtension(ext.path, { allowFileAccess: true });
        } else {
          await ses.loadExtension(ext.path, { allowFileAccess: true });
        }
      }
      ext.enabled = true;
      this.saveConfig();
      log.info(`ExtensionManager: Enabled extension "${ext.name}" (live)`);
      return { success: true };
    } catch (e) {
      const err = e as Error;
      log.error(`ExtensionManager: Failed to enable extension "${ext.name}"`, err);
      return { success: false, error: err.message };
    }
  }

  public async disableExtension(id: string): Promise<{ success: boolean; error?: string }> {
    const ext = this.extensions.get(id);
    if (!ext) return { success: false, error: "Extension not found" };
    try {
      const ses = session.fromPartition(this.partition);
      if (typeof (ses as any).extensions?.removeExtension === "function") {
        (ses as any).extensions.removeExtension(id);
      } else if (typeof (ses as any).removeExtension === "function") {
        (ses as any).removeExtension(id);
      }
      ext.enabled = false;
      this.saveConfig();
      log.info(`ExtensionManager: Disabled extension "${ext.name}" (live)`);
      return { success: true };
    } catch (e) {
      const err = e as Error;
      log.error(`ExtensionManager: Failed to disable extension "${ext.name}"`, err);
      ext.enabled = false;
      this.saveConfig();
      return { success: true }; // Still mark as disabled
    }
  }

  public openExtensionOptions(id: string): { success: boolean; error?: string } {
    const ext = this.extensions.get(id);
    if (!ext) return { success: false, error: "Extension not found" };
    if (!ext.optionsUrl) return { success: false, error: "This extension has no options page" };

    const optWin = new BrowserWindow({
      width: 800,
      height: 600,
      title: `${ext.name} — Settings`,
      webPreferences: {
        partition: this.partition
      }
    });
    optWin.loadURL(ext.optionsUrl);
    return { success: true };
  }
}
