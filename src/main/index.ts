import {
  app,
  autoUpdater,
  BrowserView,
  BrowserWindow,
  clipboard,
  crashReporter,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  MenuItemConstructorOptions,
  nativeImage,
  nativeTheme,
  safeStorage,
  screen,
  session,
  shell,
  Tray
} from "electron";
import Conf from "conf";
import log from "electron-log";
import path from "path";
import fs from "fs/promises";
import electronSquirrelStartup from "electron-squirrel-startup";

import { UltimateCoreManager } from "./ultimate/CoreManager";
import { ExtensionManager } from "./ultimate/ExtensionManager";
import MemoryStore from "./memory-store";
import playerStateStore, { PlayerState, VideoState } from "./player-state-store";
import { MemoryStoreSchema, StoreSchema, TrayIconStyle } from "../shared/store/schema";

import CompanionServer from "./integrations/companion-server";
import CustomCSS from "./integrations/custom-css";
import DiscordPresence from "./integrations/discord-presence";
import LastFM from "./integrations/last-fm";
import NowPlayingNotifications from "./integrations/notifications";
import VolumeRatio from "./integrations/volume-ratio";

declare const ALL_WINDOWS_VITE_DEV_SERVER_URL: string;
declare const YTMD_DISABLE_UPDATES: boolean;
declare const YTMD_UPDATE_FEED_OWNER: string;
declare const YTMD_UPDATE_FEED_REPOSITORY: string;

const assetFolder = path.join(process.env.NODE_ENV === "development" ? path.join(app.getAppPath(), "src/assets") : process.resourcesPath);
const isDarwin = process.platform === "darwin";

let applicationExited = false;
let applicationQuitting = false;
let appUpdateAvailable = false;
let appUpdateDownloaded = false;
let appLaunchUpdateCheck = true;

let stateSaverInterval: NodeJS.Timeout | null = null;

crashReporter.start({ uploadToServer: false });

log.transports.console.format = "[{processType}][{level}]{text}";
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}][{processType}][{level}]{text}";
log.eventLogger.format = "Electron event {eventSource}#{eventName} observed";

const isSpamLogMessage = (data: unknown): boolean => typeof data === "string" && /third-party cookie will be blocked\./i.test(data);
log.hooks.push((message, transport) => {
  if (transport !== log.transports.file) return message;
  if (message?.data?.[0] && isSpamLogMessage(message.data[0])) return false;
  message.data = message.data.map(data => {
    if (typeof data === "string") return data.replaceAll(/(?<=((https|http):\/\/)?.{1,64}(\..{1,64})?\..{1,64}\/)([\S]+)/gm, "[REDACTED]");
    return data;
  });
  return message;
});

log.initialize({ preload: true, spyRendererConsole: true });
log.errorHandler.startCatching({
  showDialog: false,
  onError({ error, processType, versions }) {
    if (applicationExited) return;
    if (processType === "renderer") return;
    if (stateSaverInterval) clearInterval(stateSaverInterval);

    if (error instanceof AggregateError) {
      log.error(error);
      for (const subError of error.errors) log.error(subError);
    } else log.error(error);

    if (error && (error as any).code === "EPIPE" || error.message.includes("EPIPE")) {
      console.warn("Ignored EPIPE error (likely Discord RPC)");
      return;
    }

    let result = 1;
    const dialogMessage = `Environment Details:\n    ${versions.app}\n    ${versions.electron}\n    ${versions.os}\n\nName: ${error.name}\nMessage: ${error.message}\nCause: ${error.cause ?? "Unknown"}\n\n${error.stack}`;

    if (!app.isReady()) dialog.showErrorBox(`YouTube Music Desktop App Crashed`, `Application crashed before ready\n\n${dialogMessage}`);
    else {
      const options = ["Copy to Clipboard and Exit", "Exit"];
      if (!app.isPackaged) options.push("Copy to Clipboard and Continue", "Continue");
      result = dialog.showMessageBoxSync({
        title: "Error",
        message: "YouTube Music Desktop App Crashed",
        detail: dialogMessage,
        type: "error",
        buttons: options
      });
      if (result === 0 || result === 2) clipboard.writeText(`YouTube Music Desktop App Crashed\n\n${dialogMessage}`);
    }
    if (result === 0 || result === 1) {
      applicationExited = true;
      app.exit(1);
    }
  }
});
log.eventLogger.startLogging();

Object.assign(console, log.functions);

if (electronSquirrelStartup) app.quit();

log.info("Application launched");
app.enableSandbox();

// Global EPIPE error trap — prevents Discord RPC pipe failures from crashing the app
process.on("uncaughtException", (err) => {
  if (err && (err as any).code === "EPIPE") {
    log.warn("Suppressed uncaughtException EPIPE (Discord RPC)");
    return;
  }
  throw err;
});
process.on("unhandledRejection", (reason: any) => {
  if (reason && (reason.code === "EPIPE" || (reason.message && reason.message.includes("EPIPE")))) {
    log.warn("Suppressed unhandledRejection EPIPE (Discord RPC)");
    return;
  }
  throw reason;
});

const template: MenuItemConstructorOptions[] = [{ role: "appMenu", label: "YouTube Music Desktop App" }, { role: "editMenu" }];
const builtMenu = isDarwin ? Menu.buildFromTemplate(template) : null;
Menu.setApplicationMenu(builtMenu);

const companionServer = new CompanionServer();
const customCss = new CustomCSS();
const discordPresence = new DiscordPresence();
const lastFMScrobbler = new LastFM();
const nowPlayingNotifications = new NowPlayingNotifications();
const ratioVolume = new VolumeRatio();

const ytmViewIntegrationScripts: { [name: string]: { [name: string]: string } } = {};

let mainWindow: BrowserWindow = null;
let settingsWindow: BrowserWindow = null;
let ytmView: BrowserView = null;
let tray: Tray = null;
let trayContextMenu = null;

let lastUrl = "";
let lastVideoId = "";
let lastPlaylistId = "";

let companionAuthWindowEnableTimeout: NodeJS.Timeout | null = null;
let ytmViewLoadTimeout: NodeJS.Timeout | null = null;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.exit(0);
} else {
  app.on("second-instance", (_, commandLine) => {
    if (mainWindow) {
      mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    handleProtocol(commandLine[commandLine.length - 1]);
  });
}

function handleProtocol(url: string) {
  log.info("Handling protocol url", url);
  const urlPaths = url.split("://")[1];
  if (urlPaths) {
    const paths = urlPaths.split("/");
    if (paths.length > 0 && paths[0] === "play" && paths.length >= 2) {
      if (ytmView) ytmView.webContents.send("remoteControl:execute", "navigate", { watchEndpoint: { videoId: paths[1], playlistId: paths[2] } });
    }
  }
}

if (!app.isDefaultProtocolClient("ytmd")) {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      log.info("Application set as default protcol client for 'ytmd'");
      app.setAsDefaultProtocolClient("ytmd", process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    log.info("Application set as default protcol client for 'ytmd'");
    app.setAsDefaultProtocolClient("ytmd", process.execPath);
  }
}

const memoryStore = new MemoryStore<MemoryStoreSchema>();
memoryStore.onStateChanged((newState, oldState) => {
  if (mainWindow !== null) mainWindow.webContents.send("memoryStore:stateChanged", newState, oldState);
  if (settingsWindow !== null) settingsWindow.webContents.send("memoryStore:stateChanged", newState, oldState);
  if (ytmView !== null) ytmView.webContents.send("memoryStore:stateChanged", newState, oldState);
  
  if (newState.ultimateOpacity !== undefined && oldState.ultimateOpacity !== newState.ultimateOpacity) {
    if (mainWindow !== null && typeof mainWindow.setOpacity === "function") {
      mainWindow.setOpacity(newState.ultimateOpacity);
    }
  }
});
log.info("Created memory store");

function shouldDisableUpdates() {
  if (process.platform !== "win32") return true;
}

if (app.isPackaged && !shouldDisableUpdates() && !YTMD_DISABLE_UPDATES) {
  const updateServer = "https://update.electronjs.org";
  const updateFeed = `${updateServer}/${YTMD_UPDATE_FEED_OWNER}/${YTMD_UPDATE_FEED_REPOSITORY}/${process.platform}-${process.arch}/${app.getVersion()}`;

  autoUpdater.setFeedURL({ url: updateFeed });
  autoUpdater.on("checking-for-update", () => {
    if (appLaunchUpdateCheck) memoryStore.set("ytmViewLoadingStatus", "Checking for updates...");
    if (settingsWindow) settingsWindow.webContents.send("app:checkingForUpdates");
  });
  autoUpdater.on("update-available", () => {
    log.info("Application update available");
    memoryStore.set("appUpdateAvailable", true);
    appUpdateAvailable = true;
    if (appLaunchUpdateCheck) memoryStore.set("ytmViewLoadingStatus", "Downloading update...");
    if (settingsWindow) settingsWindow.webContents.send("app:updateAvailable");
  });
  autoUpdater.on("update-not-available", () => {
    if (appLaunchUpdateCheck) appLaunchUpdateCheck = false;
    if (settingsWindow) settingsWindow.webContents.send("app:updateNotAvailable");
  });
  autoUpdater.on("update-downloaded", () => {
    log.info("Application update downloaded");
    appUpdateDownloaded = true;
    memoryStore.set("appUpdateDownloaded", true);
    if (appLaunchUpdateCheck) autoUpdater.quitAndInstall();
    if (settingsWindow) settingsWindow.webContents.send("app:updateDownloaded");
  });
  autoUpdater.on("error", () => {
    if (appLaunchUpdateCheck) appLaunchUpdateCheck = false;
    if (settingsWindow) settingsWindow.webContents.send("app:updateNotAvailable");
  });
  log.info("Setup application updater");
  setInterval(
    () => {
      autoUpdater.checkForUpdates();
    },
    1000 * 60 * 15
  );
} else {
  memoryStore.set("autoUpdaterDisabled", true);
}

function getIconPath(icon: string) {
  return path.join(assetFolder, `${process.env.NODE_ENV === "development" ? "icons/" : ""}${icon}`);
}
function getControlsIconPath(icon: string) {
  return getIconPath(`${process.env.NODE_ENV === "development" ? "controls/" : ""}${icon}`);
}

function anyShortcutChanged(newState: Readonly<StoreSchema>, oldState: Readonly<StoreSchema>) {
  if (newState.shortcuts.next !== oldState.shortcuts.next) return true;
  if (newState.shortcuts.playPause !== oldState.shortcuts.playPause) return true;
  if (newState.shortcuts.previous !== oldState.shortcuts.previous) return true;
  if (newState.shortcuts.thumbsDown !== oldState.shortcuts.thumbsDown) return true;
  if (newState.shortcuts.thumbsUp !== oldState.shortcuts.thumbsUp) return true;
  if (newState.shortcuts.volumeDown !== oldState.shortcuts.volumeDown) return true;
  if (newState.shortcuts.volumeUp !== oldState.shortcuts.volumeUp) return true;
  return false;
}

const store = new Conf<StoreSchema>({
  configName: "config",
  cwd: app.getPath("userData"),
  projectVersion: app.getVersion(),
  watch: true,
  defaults: {
    metadata: { version: 1 },
    general: { disableHardwareAcceleration: false, hideToTrayOnClose: false, showNotificationOnSongChange: false, startOnBoot: false, startMinimized: false },
    appearance: { alwaysShowVolumeSlider: false, customCSSEnabled: false, customCSSPath: null, zoom: 100, trayIconStyle: TrayIconStyle.Auto },
    playback: { continueWhereYouLeftOff: true, continueWhereYouLeftOffPaused: true, enableSpeakerFill: false, progressInTaskbar: false, ratioVolume: false },
    integrations: {
      companionServerEnabled: false,
      companionServerAuthTokens: null,
      companionServerCORSWildcardEnabled: false,
      discordPresenceEnabled: false,
      lastFMEnabled: false
    },
    shortcuts: { playPause: "", next: "", previous: "", thumbsUp: "", thumbsDown: "", volumeUp: "", volumeDown: "" },
    state: { lastUrl: "https://music.youtube.com/", lastPlaylistId: "", lastVideoId: "", windowBounds: null, windowMaximized: false },
    lastfm: { api_key: "2a69bcf769a7a28a8bf2f6a5100accad", secret: "46eea23770a459a49eb4d26cbf46b41c", token: null, sessionKey: null, scrobblePercent: 50 },
    developer: { enableDevTools: false },
    ultimate: { theme: "none", opacity: 1, themeConfig: null }
  },
  beforeEachMigration: (store, context) => {
    log.info(`Performing store migration from ${context.fromVersion} to ${context.toVersion}`);
  },
  migrations: {
    ">=2.0.0": store => {
      // @ts-ignore
      store.delete("integrations.companionServerAuthWindowEnabled");
      // @ts-ignore
      store.delete("state.companionServerAuthWindowEnableTime");
      if (!store.has("appearance.zoom")) store.set("appearance.zoom", 100);
    },
    ">=2.0.1": store => {
      if (!store.has("lastfm.scrobblePercent")) store.set("lastfm.scrobblePercent", 50);
    },
    ">=2.0.7": store => {
      if (!store.has("appearance.trayIconStyle")) store.set("appearance.trayIconStyle", 0);
    }
  }
});
log.info("Created electron store");

// Seed memoryStore with persisted ultimate settings from disk
try {
  const savedUltimate = store.get("ultimate") as any;
  if (savedUltimate) {
    if (savedUltimate.theme) memoryStore.set("ultimateTheme", savedUltimate.theme);
    if (savedUltimate.opacity !== undefined) memoryStore.set("ultimateOpacity", savedUltimate.opacity);
    if (savedUltimate.themeConfig) memoryStore.set("ultimateThemeConfig", savedUltimate.themeConfig);
    log.info(`Ultimate: Restored saved theme "${savedUltimate.theme}" from disk`);
  }
} catch (e) {
  log.warn("Ultimate: Failed to restore saved settings", e);
}

store.onDidAnyChange(async (newState, oldState) => {
  if (settingsWindow !== null) settingsWindow.webContents.send("settings:stateChanged", newState, oldState);
  if (ytmView !== null) ytmView.webContents.send("settings:stateChanged", newState, oldState);

  if (process.env.NODE_ENV !== "development") app.setLoginItemSettings({ openAtLogin: newState.general.startOnBoot });

  if (newState.general.showNotificationOnSongChange && !oldState.general.showNotificationOnSongChange) {
    nowPlayingNotifications.enable();
    log.info("Integration enabled: Now playing notifications");
  } else if (!newState.general.showNotificationOnSongChange && oldState.general.showNotificationOnSongChange) {
    nowPlayingNotifications.disable();
    log.info("Integration disabled: Now playing notifications");
  }

  if (newState.appearance.zoom !== oldState.appearance.zoom) {
    if (ytmView) {
      ytmView.webContents.setZoomFactor(newState.appearance.zoom / 100);
      log.info("Integration update: Zoom Factor");
    }
  }

  if (newState.appearance.customCSSEnabled) customCss.provide(store, ytmView);
  if (newState.appearance.customCSSEnabled && !oldState.appearance.customCSSEnabled) {
    customCss.enable();
    log.info("Integration enabled: Custom CSS");
  } else if (!newState.appearance.customCSSEnabled && oldState.appearance.customCSSEnabled) {
    customCss.disable();
    log.info("Integration disabled: Custom CSS");
  }
  if (oldState.appearance.trayIconStyle !== newState.appearance.trayIconStyle) setTrayIcon();

  if (newState.playback.ratioVolume) ratioVolume.provide(ytmView);
  if (newState.playback.ratioVolume && !oldState.playback.ratioVolume) {
    ratioVolume.enable();
    log.info("Integration enabled: Ratio volume");
  } else if (!newState.playback.ratioVolume && oldState.playback.ratioVolume) {
    ratioVolume.disable();
    log.info("Integration disabled: Ratio volume");
  }

  let companionServerAuthWindowEnabled = memoryStore.get("companionServerAuthWindowEnabled") ?? false;
  if (newState.integrations.companionServerEnabled) companionServer.provide(store, memoryStore, ytmView);
  if (newState.integrations.companionServerEnabled && !oldState.integrations.companionServerEnabled) {
    companionServer.enable();
    log.info("Integration enabled: Companion server");
  } else if (!newState.integrations.companionServerEnabled && oldState.integrations.companionServerEnabled) {
    companionServer.disable();
    log.info("Integration disabled: Companion server");
    if (companionServerAuthWindowEnabled) {
      memoryStore.set("companionServerAuthWindowEnabled", false);
      clearInterval(companionAuthWindowEnableTimeout);
      companionAuthWindowEnableTimeout = null;
      companionServerAuthWindowEnabled = false;
    }
  }

  if (companionServerAuthWindowEnabled && !companionAuthWindowEnableTimeout) {
    companionAuthWindowEnableTimeout = setTimeout(() => {
      memoryStore.set("companionServerAuthWindowEnabled", null);
      companionAuthWindowEnableTimeout = null;
    }, 300 * 1000);
  }

  if (newState.integrations.companionServerCORSWildcardEnabled !== oldState.integrations.companionServerCORSWildcardEnabled) {
    if (newState.integrations.companionServerEnabled && oldState.integrations.companionServerEnabled) {
      await companionServer.disable();
      await companionServer.enable();
    }
  }

  if (newState.integrations.discordPresenceEnabled) discordPresence.provide(memoryStore);
  if (newState.integrations.discordPresenceEnabled && !oldState.integrations.discordPresenceEnabled) {
    discordPresence.enable();
    log.info("Integration enabled: Discord presence");
  } else if (!newState.integrations.discordPresenceEnabled && oldState.integrations.discordPresenceEnabled) {
    discordPresence.disable();
    log.info("Integration disabled: Discord presence");
  }

  if (newState.integrations.lastFMEnabled) lastFMScrobbler.provide(store, memoryStore);
  if (newState.integrations.lastFMEnabled && !oldState.integrations.lastFMEnabled) {
    lastFMScrobbler.enable();
    log.info("Integration enabled: Last.fm");
  } else if (!newState.integrations.lastFMEnabled && oldState.integrations.lastFMEnabled) {
    lastFMScrobbler.disable();
    log.info("Integration disabled: Last.fm");
  }

  if (anyShortcutChanged(newState, oldState)) registerShortcuts();
});
log.info("Created electron store");

if (store.get("general").disableHardwareAcceleration) app.disableHardwareAcceleration();
if (store.get("playback").enableSpeakerFill) app.commandLine.appendSwitch("try-supported-channel-layouts");

function saveState() {
  store.set("state.lastUrl", lastUrl);
  store.set("state.lastVideoId", lastVideoId);
  store.set("state.lastPlaylistId", lastPlaylistId);
}
stateSaverInterval = setInterval(
  () => {
    saveState();
  },
  5 * 60 * 1000
);

function setupTaskbarFeatures() {
  if (mainWindow && mainWindow.isVisible() && process.platform === "win32") {
    mainWindow.setThumbarButtons([
      {
        tooltip: "Previous",
        icon: nativeImage.createFromPath(getControlsIconPath("play-previous-button.png")),
        flags: ["disabled"],
        click() {
          if (ytmView) ytmView.webContents.send("remoteControl:execute", "previous");
        }
      },
      {
        tooltip: "Play/Pause",
        icon: nativeImage.createFromPath(getControlsIconPath("play-button.png")),
        flags: ["disabled"],
        click() {
          if (ytmView) ytmView.webContents.send("remoteControl:execute", "playPause");
        }
      },
      {
        tooltip: "Next",
        icon: nativeImage.createFromPath(getControlsIconPath("play-next-button.png")),
        flags: ["disabled"],
        click() {
          if (ytmView) ytmView.webContents.send("remoteControl:execute", "next");
        }
      }
    ]);
  }
  playerStateStore.addEventListener((state: PlayerState) => {
    const hasVideo = !!state.videoDetails;
    const isPlaying = state.trackState === VideoState.Playing;
    if (process.platform == "win32" && mainWindow && mainWindow.isVisible()) {
      const taskbarFlags = [];
      if (!hasVideo) taskbarFlags.push("disabled");
      mainWindow.setThumbarButtons([
        {
          tooltip: "Previous",
          icon: nativeImage.createFromPath(getControlsIconPath("play-previous-button.png")),
          flags: taskbarFlags,
          click() {
            if (ytmView) ytmView.webContents.send("remoteControl:execute", "previous");
          }
        },
        {
          tooltip: "Play/Pause",
          icon: isPlaying
            ? nativeImage.createFromPath(getControlsIconPath("pause-button.png"))
            : nativeImage.createFromPath(getControlsIconPath("play-button.png")),
          flags: taskbarFlags,
          click() {
            if (ytmView) ytmView.webContents.send("remoteControl:execute", "playPause");
          }
        },
        {
          tooltip: "Next",
          icon: nativeImage.createFromPath(getControlsIconPath("play-next-button.png")),
          flags: taskbarFlags,
          click() {
            if (ytmView) ytmView.webContents.send("remoteControl:execute", "next");
          }
        }
      ]);
    }
    if (mainWindow && store.get("playback.progressInTaskbar"))
      mainWindow.setProgressBar(hasVideo ? state.videoProgress / state.videoDetails.durationSeconds : -1, { mode: isPlaying ? "normal" : "paused" });
  });

  store.onDidChange("playback", (newValue, oldValue) => {
    if (mainWindow && newValue.progressInTaskbar !== oldValue.progressInTaskbar && !newValue.progressInTaskbar) mainWindow.setProgressBar(-1);
  });
}

function trayIconFileName(style: TrayIconStyle) {
  if (process.platform === "win32") return "tray.ico";
  if (process.platform === "darwin") return "trayTemplate.png";
  let color: "white" | "black";
  if (style === TrayIconStyle.White) color = "white";
  else if (style === TrayIconStyle.Black) color = "black";
  else color = nativeTheme.shouldUseDarkColors ? "white" : "black";
  return `ytmd_${color}.png`;
}
function getTrayIconPath() {
  const style = store.get("appearance").trayIconStyle;
  const iconsDir = process.env.NODE_ENV === "development" ? path.join(app.getAppPath(), "src/assets/icons") : process.resourcesPath;
  return path.join(iconsDir, trayIconFileName(style));
}
function setTrayIcon() {
  tray.setImage(getTrayIconPath());
}

function registerShortcuts() {
  const shortcuts = store.get("shortcuts");
  globalShortcut.unregisterAll();
  log.info("Unregistered shortcuts");

  const register = (key: string, name: string, cmd: string) => {
    if (key) {
      let registered = false;
      try {
        registered = globalShortcut.register(key, () => {
          if (ytmView) ytmView.webContents.send("remoteControl:execute", cmd);
        });
      } catch {}
      memoryStore.set(`shortcuts${name.charAt(0).toUpperCase() + name.slice(1)}RegisterFailed`, !registered);
    } else {
      memoryStore.set(`shortcuts${name.charAt(0).toUpperCase() + name.slice(1)}RegisterFailed`, false);
    }
  };

  register(shortcuts.playPause, "playPause", "playPause");
  register(shortcuts.next, "next", "next");
  register(shortcuts.previous, "previous", "previous");
  register(shortcuts.thumbsUp, "thumbsUp", "toggleLike");
  register(shortcuts.thumbsDown, "thumbsDown", "toggleDislike");
  register(shortcuts.volumeUp, "volumeUp", "volumeUp");
  register(shortcuts.volumeDown, "volumeDown", "volumeDown");
  log.info("Registered shortcuts");
}

function sendMainWindowStateIpc() {
  if (mainWindow !== null)
    mainWindow.webContents.send("mainWindow:stateChanged", {
      minimized: mainWindow.isMinimized(),
      maximized: mainWindow.isMaximized(),
      fullscreen: mainWindow.isFullScreen()
    });
}
function ytmViewNavigated() {
  if (ytmView !== null) {
    const url = ytmView.webContents.getURL();
    if (url.startsWith("https://music.youtube.com/")) {
      lastUrl = url;
      ytmView.webContents.send("ytmView:navigationStateChanged", {
        canGoBack: ytmView.webContents.navigationHistory.canGoBack(),
        canGoForward: ytmView.webContents.navigationHistory.canGoForward()
      });
    }
  }
}
function sendSettingsWindowStateIpc() {
  if (settingsWindow !== null)
    settingsWindow.webContents.send("settingsWindow:stateChanged", { minimized: settingsWindow.isMinimized(), maximized: settingsWindow.isMaximized() });
}
function openExternalFromYtmView(urlString: string) {
  const url = new URL(urlString);
  const domainSplit = url.hostname.split(".");
  domainSplit.reverse();
  const domain = `${domainSplit[1]}.${domainSplit[0]}`;
  if (domain === "google.com" || domain === "youtube.com") shell.openExternal(urlString);
}

const createOrShowSettingsWindow = (): void => {
  if (mainWindow === null) return;
  if (settingsWindow !== null) {
    settingsWindow.focus();
    return;
  }

  const mainWindowBounds = mainWindow.getBounds();
  settingsWindow = new BrowserWindow({
    width: 800,
    height: 600,
    x: Math.round(mainWindowBounds.x + (mainWindowBounds.width / 2 - 400)),
    y: Math.round(mainWindowBounds.y + (mainWindowBounds.height / 2 - 300)),
    minimizable: false,
    maximizable: false,
    resizable: false,
    frame: false,
    show: false,
    icon: getIconPath("ytmd.png"),
    parent: mainWindow,
    modal: !isDarwin,
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#000000", symbolColor: "#BBBBBB", height: 36 },
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      preload: path.join(__dirname, `../renderer/windows/settings/preload.js`),
      devTools: store.get("developer.enableDevTools")
    }
  });

  settingsWindow.on("maximize", sendSettingsWindowStateIpc);
  settingsWindow.on("unmaximize", sendSettingsWindowStateIpc);
  settingsWindow.on("minimize", sendSettingsWindowStateIpc);
  settingsWindow.on("restore", sendSettingsWindowStateIpc);
  settingsWindow.once("closed", () => {
    settingsWindow = null;
  });

  settingsWindow.webContents.setWindowOpenHandler(details => {
    if (details.url === "https://github.com/ytmdesktop/ytmdesktop" || details.url === "https://ytmdesktop.github.io/") shell.openExternal(details.url);
    return { action: "deny" };
  });

  settingsWindow.webContents.on("will-navigate", event => {
    if (process.env.NODE_ENV === "development") if (event.url.startsWith("http://localhost")) return;
    event.preventDefault();
  });

  settingsWindow.on("ready-to-show", () => {
    settingsWindow.show();
    if (process.env.NODE_ENV === "development") settingsWindow.webContents.openDevTools({ mode: "detach" });
  });

  if (ALL_WINDOWS_VITE_DEV_SERVER_URL) settingsWindow.loadURL(ALL_WINDOWS_VITE_DEV_SERVER_URL + "/windows/settings/index.html");
  else settingsWindow.loadFile(path.join(__dirname, `../renderer/windows/settings/index.html`));
};

function urlIsGoogleAccountsDomain(url: URL): boolean {
  const supportedDomains = [
    ".google.com",
    ".google.ad",
    ".google.ae",
    ".google.com.af",
    ".google.com.ag",
    ".google.al",
    ".google.am",
    ".google.co.ao",
    ".google.com.ar",
    ".google.as",
    ".google.at",
    ".google.com.au",
    ".google.az",
    ".google.ba",
    ".google.com.bd",
    ".google.be",
    ".google.bf",
    ".google.bg",
    ".google.com.bh",
    ".google.bi",
    ".google.bj",
    ".google.com.bn",
    ".google.com.bo",
    ".google.com.br",
    ".google.bs",
    ".google.bt",
    ".google.co.bw",
    ".google.by",
    ".google.com.bz",
    ".google.ca",
    ".google.cd",
    ".google.cf",
    ".google.cg",
    ".google.ch",
    ".google.ci",
    ".google.co.ck",
    ".google.cl",
    ".google.cm",
    ".google.cn",
    ".google.com.co",
    ".google.co.cr",
    ".google.com.cu",
    ".google.cv",
    ".google.com.cy",
    ".google.cz",
    ".google.de",
    ".google.dj",
    ".google.dk",
    ".google.dm",
    ".google.com.do",
    ".google.dz",
    ".google.com.ec",
    ".google.ee",
    ".google.com.eg",
    ".google.es",
    ".google.com.et",
    ".google.fi",
    ".google.com.fj",
    ".google.fm",
    ".google.fr",
    ".google.ga",
    ".google.ge",
    ".google.gg",
    ".google.com.gh",
    ".google.com.gi",
    ".google.gl",
    ".google.gm",
    ".google.gr",
    ".google.com.gt",
    ".google.gy",
    ".google.com.hk",
    ".google.hn",
    ".google.hr",
    ".google.ht",
    ".google.hu",
    ".google.co.id",
    ".google.ie",
    ".google.co.il",
    ".google.im",
    ".google.co.in",
    ".google.iq",
    ".google.is",
    ".google.it",
    ".google.je",
    ".google.com.jm",
    ".google.jo",
    ".google.co.jp",
    ".google.co.ke",
    ".google.com.kh",
    ".google.ki",
    ".google.kg",
    ".google.co.kr",
    ".google.com.kw",
    ".google.kz",
    ".google.la",
    ".google.com.lb",
    ".google.li",
    ".google.lk",
    ".google.co.ls",
    ".google.lt",
    ".google.lu",
    ".google.lv",
    ".google.com.ly",
    ".google.co.ma",
    ".google.md",
    ".google.me",
    ".google.mg",
    ".google.mk",
    ".google.ml",
    ".google.com.mm",
    ".google.mn",
    ".google.com.mt",
    ".google.mu",
    ".google.mv",
    ".google.mw",
    ".google.com.mx",
    ".google.com.my",
    ".google.co.mz",
    ".google.com.na",
    ".google.com.ng",
    ".google.com.ni",
    ".google.ne",
    ".google.nl",
    ".google.no",
    ".google.com.np",
    ".google.nr",
    ".google.nu",
    ".google.co.nz",
    ".google.com.om",
    ".google.com.pa",
    ".google.com.pe",
    ".google.com.pg",
    ".google.com.ph",
    ".google.com.pk",
    ".google.pl",
    ".google.pn",
    ".google.com.pr",
    ".google.ps",
    ".google.pt",
    ".google.com.py",
    ".google.com.qa",
    ".google.ro",
    ".google.ru",
    ".google.rw",
    ".google.com.sa",
    ".google.com.sb",
    ".google.sc",
    ".google.se",
    ".google.com.sg",
    ".google.sh",
    ".google.si",
    ".google.sk",
    ".google.com.sl",
    ".google.sn",
    ".google.so",
    ".google.sm",
    ".google.sr",
    ".google.st",
    ".google.com.sv",
    ".google.td",
    ".google.tg",
    ".google.co.th",
    ".google.com.tj",
    ".google.tl",
    ".google.tm",
    ".google.tn",
    ".google.to",
    ".google.com.tr",
    ".google.tt",
    ".google.com.tw",
    ".google.co.tz",
    ".google.com.ua",
    ".google.co.ug",
    ".google.co.uk",
    ".google.com.uy",
    ".google.co.uz",
    ".google.com.vc",
    ".google.co.ve",
    ".google.co.vi",
    ".google.com.vn",
    ".google.vu",
    ".google.ws",
    ".google.rs",
    ".google.co.za",
    ".google.co.zm",
    ".google.co.zw",
    ".google.cat"
  ];
  const domain = url.hostname.split("accounts")[1];
  return supportedDomains.includes(domain);
}
function isPreventedNavOrRedirect(url: URL): boolean {
  return (
    url.hostname !== "consent.youtube.com" &&
    url.hostname !== "accounts.youtube.com" &&
    url.hostname !== "music.youtube.com" &&
    !(
      (url.hostname === "www.youtube.com" || url.hostname === "youtube.com") &&
      (url.pathname === "/signin" || url.pathname === "/premium" || url.pathname === "/musicpremium" || url.pathname === "/signin_prompt")
    ) &&
    !urlIsGoogleAccountsDomain(url)
  );
}

const createYTMView = (): void => {
  memoryStore.set("ytmViewLoadTimedout", false);
  memoryStore.set("ytmViewLoading", true);
  memoryStore.set("ytmViewLoadingStatus", "Initializing...");

  ytmView = new BrowserView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      partition: app.isPackaged ? "persist:ytmview" : "persist:ytmview-dev",
      preload: path.join(__dirname, `../renderer/windows/ytmview/preload.js`),
      autoplayPolicy: store.get("playback.continueWhereYouLeftOffPaused") ? "document-user-activation-required" : "no-user-gesture-required"
    }
  });
  companionServer.provide(store, memoryStore, ytmView);
  customCss.provide(store, ytmView);
  ratioVolume.provide(ytmView);

  ytmView.webContents.on("will-navigate", event => {
    const url = new URL(event.url);
    if (isPreventedNavOrRedirect(url)) {
      event.preventDefault();
      openExternalFromYtmView(event.url);
    }
  });
  ytmView.webContents.on("will-redirect", event => {
    const url = new URL(event.url);
    if (isPreventedNavOrRedirect(url)) event.preventDefault();
    if (
      (url.hostname === "www.youtube.com" && url.pathname === "/premium") ||
      (url.hostname === "youtube.com" && url.pathname === "/premium") ||
      (url.hostname === "www.youtube.com" && url.pathname === "/musicpremium") ||
      (url.hostname === "youtube.com" && url.pathname === "/musicpremium")
    ) {
      ytmView.webContents.loadURL(
        "https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26app%3Ddesktop%26next%3Dhttps%253A%252F%252Fmusic.youtube.com%252F"
      );
    }
  });
  ytmView.webContents.on("did-navigate", ytmViewNavigated);
  ytmView.webContents.on("did-navigate-in-page", ytmViewNavigated);
  ytmView.webContents.on("enter-html-full-screen", () => {
    if (mainWindow) mainWindow.setFullScreen(true);
  });
  ytmView.webContents.on("leave-html-full-screen", () => {
    if (mainWindow) mainWindow.setFullScreen(false);
  });
  ytmView.webContents.on("render-process-gone", () => {
    store.set("state.lastUrl", lastUrl);
    store.set("state.lastVideoId", lastVideoId);
    store.set("state.lastPlaylistId", lastPlaylistId);
    createYTMView();
  });
  ytmView.webContents.on("page-title-updated", (_event, title) => {
    if (mainWindow) mainWindow.setTitle(`${title} | YouTube Music Desktop App`);
  });
  ytmView.webContents.on("context-menu", (_event, params) => {
    if (store.get("developer.enableDevTools")) {
      Menu.buildFromTemplate([
        { label: "YouTube Music Desktop", type: "normal", enabled: false },
        { type: "separator" },
        {
          label: "Open Developer Tools",
          type: "normal",
          click: () => {
            if (ytmView) ytmView.webContents.openDevTools({ mode: "detach" });
          }
        }
      ]).popup({ window: mainWindow, x: params.x, y: params.y, sourceType: params.menuSourceType });
    }
  });
  ytmView.webContents.on("will-prevent-unload", event => {
    if (mainWindow && !applicationQuitting) {
      if (ytmView.webContents.getURL().startsWith("https://music.youtube.com/")) {
        const choice = dialog.showMessageBoxSync(mainWindow, {
          type: "question",
          buttons: ["Leave", "Stay"],
          title: "Navigation",
          message: "YouTube Music is preventing navigation. Do you want to leave or stay?",
          defaultId: 0,
          cancelId: 1
        });
        if (choice !== 0) return;
      }
    }
    event.preventDefault();
  });
  ytmView.webContents.on("unresponsive", () => {
    memoryStore.set("ytmViewUnresponsive", true);
  });
  ytmView.webContents.on("responsive", () => {
    memoryStore.set("ytmViewUnresponsive", false);
  });
  ytmView.webContents.setWindowOpenHandler(details => {
    openExternalFromYtmView(details.url);
    return { action: "deny" };
  });
  ytmView.webContents.on("did-start-loading", () => {
    memoryStore.set("ytmViewLoadingStatus", "Loading YouTube Music...");
  });
  ytmView.webContents.on("did-stop-loading", () => {
    if (!memoryStore.get("ytmViewLoadingError")) memoryStore.set("ytmViewLoadingStatus", "Loaded YouTube Music");
  });
  ytmView.webContents.on("did-fail-load", (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
    if (isMainFrame) {
      if (ytmViewLoadTimeout) clearTimeout(ytmViewLoadTimeout);
      memoryStore.set("ytmViewLoadingError", true);
      memoryStore.set("ytmViewLoadingStatus", `Failed to load YouTube Music: ${errorDescription} (${errorCode})`);
    }
  });

  memoryStore.set("ytmViewLoadingStatus", "Initialized");

  let navigateDefault = true;
  const continueWhereYouLeftOff: boolean = store.get("playback.continueWhereYouLeftOff");
  if (continueWhereYouLeftOff) {
    const lastUrl: string = store.get("state.lastUrl");
    if (lastUrl && lastUrl.startsWith("https://music.youtube.com/")) {
      ytmView.webContents.loadURL(lastUrl);
      navigateDefault = false;
    }
  }
  if (navigateDefault) {
    ytmView.webContents.loadURL("https://music.youtube.com/");
    store.set("state.lastUrl", "https://music.youtube.com/");
  }

  ytmViewLoadTimeout = setTimeout(() => {
    memoryStore.set("ytmViewLoadTimedout", true);
  }, 30 * 1000);
};

const createMainWindow = (): void => {
  const scaleFactor = screen.getPrimaryDisplay().scaleFactor;
  const windowBounds = store.get("state").windowBounds;
  mainWindow = new BrowserWindow({
    width: windowBounds?.width ?? 1280 / scaleFactor,
    height: windowBounds?.height ?? 720 / scaleFactor,
    x: windowBounds?.x,
    y: windowBounds?.y,
    minWidth: 156,
    minHeight: 180,
    frame: false,
    show: false,
    icon: getIconPath("ytmd.png"),
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#000000", symbolColor: "#BBBBBB", height: 36 },
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      preload: path.join(__dirname, `../renderer/windows/main/preload.js`),
      devTools: store.get("developer.enableDevTools")
    },
    opacity: memoryStore.get("ultimateOpacity") ?? 1
  });
  const windowMaximized = store.get("state").windowMaximized;
  if (windowBounds) mainWindow.setBounds(windowBounds);
  if (windowMaximized) mainWindow.maximize();

  mainWindow.on("resize", () => {
    setTimeout(() => {
      if (ytmView) {
        if (mainWindow.fullScreen) ytmView.setBounds({ x: 0, y: 0, width: mainWindow.getContentBounds().width, height: mainWindow.getContentBounds().height });
        else ytmView.setBounds({ x: 0, y: 36, width: mainWindow.getContentBounds().width, height: mainWindow.getContentBounds().height - 36 });
      }
    });
  });
  mainWindow.on("enter-full-screen", () => {
    setTimeout(() => {
      if (ytmView) ytmView.setBounds({ x: 0, y: 0, width: mainWindow.getContentBounds().width, height: mainWindow.getContentBounds().height });
    });
    sendMainWindowStateIpc();
  });
  mainWindow.on("leave-full-screen", () => {
    setTimeout(() => {
      ytmView.setBounds({ x: 0, y: 36, width: mainWindow.getContentBounds().width, height: mainWindow.getContentBounds().height - 36 });
    });
    sendMainWindowStateIpc();
  });
  mainWindow.on("maximize", sendMainWindowStateIpc);
  mainWindow.on("unmaximize", sendMainWindowStateIpc);
  mainWindow.on("minimize", sendMainWindowStateIpc);
  mainWindow.on("restore", sendMainWindowStateIpc);
  mainWindow.on("close", event => {
    if (!applicationQuitting && (store.get("general").hideToTrayOnClose || isDarwin)) {
      event.preventDefault();
      mainWindow.hide();
    }
    store.set("state.windowBounds", mainWindow.getNormalBounds());
    store.set("state.windowMaximized", mainWindow.isMaximized());
  });
  mainWindow.once("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", event => {
    if (process.env.NODE_ENV === "development") if (event.url.startsWith("http://localhost")) return;
    event.preventDefault();
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    if (process.env.NODE_ENV === "development") mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  if (ALL_WINDOWS_VITE_DEV_SERVER_URL) mainWindow.loadURL(ALL_WINDOWS_VITE_DEV_SERVER_URL + "/windows/main/index.html");
  else mainWindow.loadFile(path.join(__dirname, `../renderer/windows/main/index.html`));
};

app.on("ready", async () => {
  log.info("Application ready");
  const firstRunPath = path.join(app.getPath("userData"), ".first-run");
  try {
    await fs.access(firstRunPath, fs.constants.F_OK);
  } catch {
    const firstRunTouch = await fs.open(firstRunPath, "a");
    await firstRunTouch.close();
  }

  if (!safeStorage.isEncryptionAvailable()) memoryStore.set("safeStorageAvailable", false);
  else memoryStore.set("safeStorageAvailable", true);

  ipcMain.on("mainWindow:minimize", event => {
    if (mainWindow !== null && event.sender === mainWindow.webContents) mainWindow.minimize();
  });
  ipcMain.on("mainWindow:maximize", event => {
    if (mainWindow !== null && event.sender === mainWindow.webContents) mainWindow.maximize();
  });
  ipcMain.on("mainWindow:restore", event => {
    if (mainWindow !== null && event.sender === mainWindow.webContents) mainWindow.restore();
  });
  ipcMain.on("mainWindow:close", event => {
    if (mainWindow !== null && event.sender === mainWindow.webContents) {
      if (store.get("general").hideToTrayOnClose || isDarwin) mainWindow.hide();
      else app.quit();
    }
  });
  ipcMain.on("mainWindow:requestWindowState", event => {
    if (event.sender === mainWindow.webContents) sendMainWindowStateIpc();
  });

  ipcMain.on("settingsWindow:open", event => {
    if (event.sender === mainWindow.webContents) createOrShowSettingsWindow();
  });
  ipcMain.on("settingsWindow:minimize", event => {
    if (settingsWindow !== null && event.sender === settingsWindow.webContents) settingsWindow.minimize();
  });
  ipcMain.on("settingsWindow:maximize", event => {
    if (settingsWindow !== null && event.sender === settingsWindow.webContents) settingsWindow.maximize();
  });
  ipcMain.on("settingsWindow:restore", event => {
    if (settingsWindow !== null && event.sender === settingsWindow.webContents) settingsWindow.restore();
  });
  ipcMain.on("settingsWindow:close", event => {
    if (settingsWindow !== null && event.sender === settingsWindow.webContents) settingsWindow.close();
  });
  ipcMain.on("settingsWindow:restartapplication", event => {
    if (event.sender === settingsWindow.webContents) {
      app.relaunch();
      app.quit();
    }
  });

  ipcMain.on("ytmView:loaded", event => {
    if (ytmView !== null && mainWindow !== null && event.sender === ytmView.webContents) {
      memoryStore.set("ytmViewLoading", false);
      clearTimeout(ytmViewLoadTimeout);
      mainWindow.addBrowserView(ytmView);
      ytmView.setBounds({ x: 0, y: 36, width: mainWindow.getContentBounds().width, height: mainWindow.getContentBounds().height - 36 });
      if (process.env.NODE_ENV === "development") ytmView.webContents.openDevTools({ mode: "detach" });
      ratioVolume.ytmViewLoaded();
      customCss.updateCSS();
    }
  });

  ipcMain.on("ytmView:videoProgressChanged", (event, progress) => {
    if (event.sender === ytmView.webContents) playerStateStore.updateVideoProgress(progress);
  });
  ipcMain.on("ytmView:videoStateChanged", (event, state) => {
    if (event.sender === ytmView.webContents) playerStateStore.updateVideoState(state);
  });
  ipcMain.on("ytmView:videoDataChanged", (event, videoDetails, playlistId, album, likeStatus, hasFullMetadata) => {
    if (event.sender === ytmView.webContents) {
      lastVideoId = videoDetails.videoId;
      lastPlaylistId = playlistId;
      playerStateStore.updateVideoDetails(videoDetails, playlistId, album, likeStatus, hasFullMetadata);
    }
  });
  ipcMain.on("ytmView:storeStateChanged", (event, queue, likeStatus, volume, muted, adPlaying) => {
    if (event.sender === ytmView.webContents) playerStateStore.updateFromStore(queue, likeStatus, volume, muted, adPlaying);
  });
  ipcMain.on("ytmView:switchFocus", (event, context) => {
    if (event.sender !== ytmView.webContents && event.sender !== mainWindow.webContents) return;
    if (context === "main" && mainWindow && ytmView.webContents.isFocused()) mainWindow.webContents.focus();
    else if (context === "ytm" && ytmView && mainWindow.webContents.isFocused()) ytmView.webContents.focus();
  });
  ipcMain.on("ytmView:navigateDefault", event => {
    if (ytmView && event.sender === mainWindow.webContents) ytmView.webContents.loadURL("https://music.youtube.com/");
  });
  ipcMain.on("ytmView:recreate", event => {
    if (event.sender === mainWindow.webContents && ytmView) {
      if (mainWindow) mainWindow.removeBrowserView(ytmView);
      (ytmView.webContents as any).destroy();
      ytmView = null;
      createYTMView();
    }
  });
  ipcMain.handle("ytmView:getIntegrationScripts", event => {
    if (event.sender === ytmView.webContents) return ytmViewIntegrationScripts;
  });

  ipcMain.handle("memoryStore:get", (event, key: string) => {
    return memoryStore.get(key);
  });
  ipcMain.on("memoryStore:set", (event, key: string, value?: unknown) => {
    memoryStore.set(key, value);
  });
  ipcMain.on("settings:set", (event, key: string, value?: unknown) => {
    if (settingsWindow && event.sender !== settingsWindow.webContents) return;
    store.set(key, value);
  });
  ipcMain.handle("settings:get", (event, key: string) => {
    if (
      mainWindow &&
      event.sender !== mainWindow.webContents &&
      settingsWindow &&
      event.sender !== settingsWindow.webContents &&
      ytmView &&
      event.sender !== ytmView.webContents
    )
      return;
    return store.get(key);
  });
  ipcMain.handle("settings:reset", (event, key: keyof StoreSchema) => {
    if (event.sender === settingsWindow.webContents) store.reset(key);
  });

  ipcMain.handle("safeStorage:decryptString", (event, value: string) => {
    if (!memoryStore.get("safeStorageAvailable")) throw new Error("safeStorage is unavailable");
    if (event.sender === settingsWindow.webContents && value) return safeStorage.decryptString(Buffer.from(value, "hex"));
    return null;
  });
  ipcMain.handle("safeStorage:encryptString", (event, value: string) => {
    if (!memoryStore.get("safeStorageAvailable")) throw new Error("safeStorage is unavailable");
    if (event.sender === settingsWindow.webContents) return safeStorage.encryptString(value).toString("hex");
  });

  ipcMain.handle("app:getVersion", event => {
    if (event.sender === settingsWindow.webContents) return app.getVersion();
  });
  ipcMain.on("app:checkForUpdates", event => {
    if (event.sender === settingsWindow.webContents && (!appUpdateAvailable || !appUpdateDownloaded)) autoUpdater.checkForUpdates();
  });
  ipcMain.handle("app:isUpdateAvailable", event => {
    if (event.sender === settingsWindow.webContents) return appUpdateAvailable;
  });
  ipcMain.handle("app:isUpdateDownloaded", event => {
    if (event.sender === settingsWindow.webContents) return appUpdateDownloaded;
  });
  ipcMain.on("app:restartApplicationForUpdate", event => {
    if (mainWindow && event.sender !== mainWindow.webContents && settingsWindow && event.sender !== settingsWindow.webContents) return;
    applicationQuitting = true;
    autoUpdater.quitAndInstall();
  });

  const ytmPartition = app.isPackaged ? "persist:ytmview" : "persist:ytmview-dev";
  const ytmSession = session.fromPartition(ytmPartition);

  ytmSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === "fullscreen") return true;
    if (permission === "media") return true;
    if (permission === "clipboard-sanitized-write") return true;
    if (permission === "storage-access") return true;
    return false;
  });
  ytmSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === "fullscreen") return callback(true);
    if (permission === "media") return callback(true);
    if (permission === "clipboard-sanitized-write") return callback(true);
    return callback(false);
  });

  // Block ad tracking requests that cause CORS errors
  ytmSession.webRequest.onBeforeRequest({ urls: ["*://www.youtube.com/pagead/*"] }, (details, callback) => {
    callback({ cancel: true });
  });

  // Fix CORS headers for cross-origin YouTube requests
  ytmSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    if (details.url.includes("youtube.com") || details.url.includes("googlevideo.com") || details.url.includes("google.com")) {
      // Remove all existing ACAO headers (case-insensitive) to prevent duplication
      for (const key of Object.keys(responseHeaders)) {
        if (key.toLowerCase() === "access-control-allow-origin") {
          delete responseHeaders[key];
        }
        if (key.toLowerCase() === "access-control-allow-credentials") {
          delete responseHeaders[key];
        }
      }
      responseHeaders["Access-Control-Allow-Origin"] = ["https://music.youtube.com"];
      responseHeaders["Access-Control-Allow-Credentials"] = ["true"];
    }
    callback({ responseHeaders });
  });

  registerShortcuts();

  tray = new Tray(getTrayIconPath());
  trayContextMenu = Menu.buildFromTemplate([
    { label: "YouTube Music Desktop", type: "normal", enabled: false },
    { type: "separator" },
    {
      label: "Show/Hide Window",
      type: "normal",
      click: () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) mainWindow.hide();
          else mainWindow.show();
        }
      }
    },
    {
      label: "Play/Pause",
      type: "normal",
      click: () => {
        ytmView.webContents.send("remoteControl:execute", "playPause");
      }
    },
    {
      label: "Previous",
      type: "normal",
      click: () => {
        ytmView.webContents.send("remoteControl:execute", "previous");
      }
    },
    {
      label: "Next",
      type: "normal",
      click: () => {
        ytmView.webContents.send("remoteControl:execute", "next");
      }
    },
    { type: "separator" },
    {
      label: "Quit",
      type: "normal",
      click: () => {
        app.quit();
      }
    }
  ]);
  tray.setToolTip("YouTube Music Desktop");
  tray.setContextMenu(trayContextMenu);
  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      else mainWindow.show();
    }
  });

  createMainWindow();

  memoryStore.set("ytmViewLoading", true);
  memoryStore.set("ytmViewLoadingStatus", "Checking for updates...");
  if (app.isPackaged && !shouldDisableUpdates() && !YTMD_DISABLE_UPDATES) {
    autoUpdater.checkForUpdates();
    await new Promise<void>(resolve => {
      setInterval(() => {
        if (!appLaunchUpdateCheck) resolve();
      }, 250);
    });
  } else appLaunchUpdateCheck = false;

  ytmViewIntegrationScripts["ratioVolume"] = ratioVolume.getYTMScripts().reduce<{ [name: string]: string }>((map, obj) => {
    map[obj.name] = obj.script;
    return map;
  }, {});

  // Pre-load extensions into session BEFORE the page navigates
  // Chrome content scripts only inject on page load, so they must be registered first
  try {
    const preExtMgr = new ExtensionManager();
    await preExtMgr.loadSavedExtensions();
    log.info("Extensions pre-loaded into session before page navigation");
  } catch (e) {
    log.error("Extension pre-load failed", e);
  }

  createYTMView();
  setupTaskbarFeatures();

  // ----- INJECTION DU CERVEAU ULTIMATE ICI -----
  const ultimateCore = new UltimateCoreManager(mainWindow, ytmView);

  // Inject external themes — triggered when the preload signals registry is ready
  let themeInjected = false;
  ipcMain.on("ultimate:registry-ready", async () => {
    if (themeInjected) return;
    themeInjected = true;
    log.info("UltimateCoreManager: Registry ready signal received, sending themes to preload...");
    try {
      // Send each theme file to the preload for injection via webFrame (same JS context as registry)
      const themeFiles = ultimateCore.getThemeFiles();
      for (const tf of themeFiles) {
        ytmView.webContents.send("ultimate:inject-theme-file", tf.filename, tf.content);
      }
      log.info(`UltimateCoreManager: Sent ${themeFiles.length} theme files to preload`);
    } catch (e) {
      log.error("UltimateCoreManager: Theme injection failed:", e);
    }
  });

  if (store.get("appearance").zoom) ytmView.webContents.setZoomFactor(store.get("appearance").zoom / 100);

  if (store.get("general").showNotificationOnSongChange) nowPlayingNotifications.enable();
  if (store.get("appearance").customCSSEnabled) {
    customCss.provide(store, ytmView);
    customCss.enable();
  }
  if (store.get("playback").ratioVolume) {
    ratioVolume.provide(ytmView);
    ratioVolume.enable();
  }
  if (store.get("integrations").companionServerEnabled) {
    companionServer.provide(store, memoryStore, ytmView);
    companionServer.enable();
  }
  if (store.get("integrations").discordPresenceEnabled) {
    discordPresence.provide(memoryStore);
    discordPresence.enable();
  }
  if (store.get("integrations").lastFMEnabled) {
    lastFMScrobbler.provide(store, memoryStore);
    lastFMScrobbler.enable();
  }

  nativeTheme.on("updated", setTrayIcon);
});

app.on("before-quit", () => {
  applicationQuitting = true;
  saveState();
});
app.on("open-url", (_, url) => {
  handleProtocol(url);
});
app.on("window-all-closed", () => {
  if (!isDarwin) app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
    createYTMView();
  }
});
