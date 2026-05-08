import { app, BrowserView } from "electron";
import * as fs from "fs";
import * as path from "path";
import log from "electron-log";

export interface ThemeMetadata {
  id: string;
  name: string;
  defaults: Record<string, any>;
  schema: any[];
}

export class ThemeManager {
  private themesDir: string;
  private loadedThemes: Map<string, string> = new Map(); // id -> file content

  constructor() {
    this.themesDir = path.join(app.getPath("userData"), "themes");
    this.ensureThemesDir();
    this.deployBundledThemes();
  }

  private ensureThemesDir(): void {
    if (!fs.existsSync(this.themesDir)) {
      fs.mkdirSync(this.themesDir, { recursive: true });
      log.info(`ThemeManager: Created themes directory at ${this.themesDir}`);
    }
  }

  /**
   * Copy bundled themes from the project's themes/ directory to appdata
   * In dev: <project>/themes/
   * In packaged: <resources>/themes/
   */
  private deployBundledThemes(): void {
    const bundledDir = app.isPackaged
      ? path.join(process.resourcesPath, "themes")
      : path.join(app.getAppPath(), "themes");

    if (!fs.existsSync(bundledDir)) {
      log.info(`ThemeManager: No bundled themes dir at ${bundledDir}`);
      return;
    }

    try {
      const files = fs.readdirSync(bundledDir).filter(f => f.endsWith(".theme.js"));
      let deployed = 0;
      for (const file of files) {
        const src = path.join(bundledDir, file);
        const dst = path.join(this.themesDir, file);
        // Always overwrite with bundled version (ensures updates are applied)
        fs.copyFileSync(src, dst);
        deployed++;
      }
      if (deployed > 0) {
        log.info(`ThemeManager: Deployed ${deployed} bundled themes to ${this.themesDir}`);
      }
    } catch (e) {
      log.error("ThemeManager: Failed to deploy bundled themes", e);
    }
  }

  /**
   * Scan the themes directory for .theme.js files
   */
  public scanThemes(): string[] {
    try {
      const files = fs.readdirSync(this.themesDir);
      return files.filter(f => f.endsWith(".theme.js"));
    } catch (e) {
      log.error("ThemeManager: Failed to scan themes", e);
      return [];
    }
  }

  /**
   * Read a theme file and return its content
   */
  public readTheme(filename: string): string | null {
    try {
      const filepath = path.join(this.themesDir, filename);
      return fs.readFileSync(filepath, "utf-8");
    } catch (e) {
      log.error(`ThemeManager: Failed to read theme ${filename}`, e);
      return null;
    }
  }

  /**
   * Parse theme metadata (id, name, defaults, schema) directly from JS source.
   * Runs the theme code in a sandboxed vm context with a fake registry to capture metadata.
   */
  public parseThemeMetadata(source: string): ThemeMetadata | null {
    try {
      const vm = require("vm");
      let captured: ThemeMetadata | null = null;

      // Create a fake window.__themeRegistry that captures the register() call
      const sandbox = {
        window: {
          __themeRegistry: {
            register: (theme: any) => {
              captured = {
                id: theme.id,
                name: theme.name,
                defaults: theme.defaults || {},
                schema: (theme.schema || []).map((s: any) => {
                  // Strip functions, keep only serializable data
                  const clean: any = {};
                  for (const k of Object.keys(s)) {
                    const v = s[k];
                    if (typeof v !== "function") clean[k] = v;
                  }
                  return clean;
                })
              };
            }
          }
        },
        console: { log: () => {}, warn: () => {}, error: () => {} },
        document: null,
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: () => {},
        AudioContext: null,
        webkitAudioContext: null
      };

      const script = new vm.Script(source, { timeout: 1000 });
      script.runInNewContext(sandbox, { timeout: 1000 });

      return captured;
    } catch (e) {
      log.error("ThemeManager: Failed to parse theme metadata via vm", e);
      // Fallback: try basic regex for id/name at minimum
      try {
        const idMatch = source.match(/id:\s*["']([^"']+)["']/);
        const nameMatch = source.match(/name:\s*["']([^"']+)["']/);
        if (idMatch) {
          return { id: idMatch[1], name: nameMatch ? nameMatch[1] : idMatch[1], defaults: {}, schema: [] };
        }
      } catch {}
      return null;
    }
  }

  /**
   * Scan all themes and return their metadata (parsed from source files).
   * This does NOT require the renderer to be loaded.
   */
  public getThemesMetadata(): ThemeMetadata[] {
    const files = this.scanThemes();
    const result: ThemeMetadata[] = [];
    for (const file of files) {
      const content = this.readTheme(file);
      if (content) {
        const meta = this.parseThemeMetadata(content);
        if (meta) {
          result.push(meta);
        } else {
          log.warn(`ThemeManager: Could not parse metadata from ${file}`);
        }
      }
    }
    return result;
  }

  /**
   * Build a DEFAULT_THEME_CONFIG from all theme files' defaults.
   * Returns { [themeId]: defaults }
   */
  public buildDefaultConfig(): Record<string, Record<string, any>> {
    const metas = this.getThemesMetadata();
    const config: Record<string, Record<string, any>> = {};
    for (const meta of metas) {
      config[meta.id] = { ...meta.defaults };
    }
    return config;
  }

  /**
   * Load all theme files and inject them into the renderer
   */
  public async injectThemes(view: BrowserView): Promise<void> {
    const files = this.scanThemes();
    log.info(`ThemeManager: Found ${files.length} theme files: ${files.join(", ")}`);

    for (const file of files) {
      const content = this.readTheme(file);
      if (content) {
        try {
          await view.webContents.executeJavaScript(content);
          const id = file.replace(".theme.js", "");
          this.loadedThemes.set(id, content);
          log.info(`ThemeManager: Injected theme "${file}"`);
        } catch (e: any) {
          log.error(`ThemeManager: Failed to inject theme "${file}": ${e.message}`);
        }
      }
    }
  }

  /**
   * Get the themes directory path
   */
  public getThemesDir(): string {
    return this.themesDir;
  }

  /**
   * List loaded themes
   */
  public listLoadedThemes(): string[] {
    return Array.from(this.loadedThemes.keys());
  }
}
