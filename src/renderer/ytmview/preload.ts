import { contextBridge, ipcRenderer, webFrame } from "electron";
import Store from "../store-ipc/store";
import MemoryStore from "../store-ipc/memory-store";
import { StoreSchema, MemoryStoreSchema } from "~shared/store/schema";

import playerBarControlsScript from "./scripts/playerbarcontrols.script?raw";
import hookPlayerApiEventsScript from "./scripts/hookplayerapievents.script?raw";
import getPlaylistsScript from "./scripts/getplaylists.script?raw";
import toggleLikeScript from "./scripts/togglelike.script?raw";
import toggleDislikeScript from "./scripts/toggledislike.script?raw";
import ultimateScript from "./scripts/ultimate.script?raw"; // <-- INJECTION 1

const store = new Store<StoreSchema>();
const memoryStore = new MemoryStore<MemoryStoreSchema>();

contextBridge.exposeInMainWorld("ytmd", {
  sendVideoProgress: (volume: number) => ipcRenderer.send("ytmView:videoProgressChanged", volume),
  sendVideoState: (state: number) => ipcRenderer.send("ytmView:videoStateChanged", state),
  sendVideoData: (videoDetails: unknown, playlistId: string, album: { id: string; text: string }, likeStatus: unknown, hasFullMetadata: boolean) =>
    ipcRenderer.send("ytmView:videoDataChanged", videoDetails, playlistId, album, likeStatus, hasFullMetadata),
  sendStoreUpdate: (queueState: unknown, likeStatus: string, volume: number, muted: boolean, adPlaying: boolean) =>
    ipcRenderer.send("ytmView:storeStateChanged", queueState, likeStatus, volume, muted, adPlaying),
  sendCreatePlaylistObservation: (playlist: unknown) => ipcRenderer.send("ytmView:createPlaylistObserved", playlist),
  sendDeletePlaylistObservation: (playlistId: string) => ipcRenderer.send("ytmView:deletePlaylistObserved", playlistId)
});

// --- INJECTION 2 : Pont API Ultimate ---
contextBridge.exposeInMainWorld("ultimateAPI", {
  downloadTrack: (url: string, destPath: string, format: string) => ipcRenderer.invoke("ultimate:download-track", url, destPath, format),
  onDownloadProgress: (callback: (data: any) => void) => ipcRenderer.on("ultimate:download-progress", (_e, data) => callback(data)),
});

// Relai IPC vers le WebFrame du Moteur d'App State
ipcRenderer.on("ultimate:app-state", (_event, data) => {
  webFrame.executeJavaScript(`window.postMessage({type:"ULTIMATE_APP_STATE",state:${JSON.stringify(data.state)}},"*")`);
});

function createStyleSheet() {
  const css = document.createElement("style");
  css.appendChild(
    document.createTextNode(`
      .ytmd-history-back, .ytmd-history-forward { cursor: pointer; margin: 0 18px 0 2px; font-size: 24px; color: rgba(255, 255, 255, 0.5); }
      .ytmd-history-back.pivotbar, .ytmd-history-forward.pivotbar { padding-top: 12px; }
      .ytmd-history-back.disabled, .ytmd-history-forward.disabled { cursor: not-allowed; }
      .ytmd-history-back:hover:not(.disabled), .ytmd-history-forward:hover:not(.disabled) { color: #FFFFFF; }
      .ytmd-hidden { display: none; }
      .ytmd-persist-volume-slider { opacity: 1 !important; pointer-events: initial !important; }
      .ytmd-player-bar-control.library-button { margin-left: 8px; }
      .ytmd-player-bar-control.library-button.hidden { display: none; }
      .ytmd-player-bar-control.playlist-button { margin-left: 8px; }
      .ytmd-player-bar-control.playlist-button.hidden { display: none; }
      .ytmd-player-bar-control.sleep-timer-button.active { color: #FFFFFF; }
    `)
  );
  document.head.appendChild(css);
}

function createMaterialSymbolsLink() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,100,0,0";
  return link;
}

function createNavigationMenuArrows() {
  const historyBackElement = document.createElement("span");
  historyBackElement.classList.add("material-symbols-outlined", "ytmd-history-back", "disabled");
  historyBackElement.innerText = "west";
  historyBackElement.addEventListener("click", function () {
    if (!historyBackElement.classList.contains("disabled")) history.back();
  });
  const historyForwardElement = document.createElement("span");
  historyForwardElement.classList.add("material-symbols-outlined", "ytmd-history-forward", "disabled");
  historyForwardElement.innerText = "east";
  historyForwardElement.addEventListener("click", function () {
    if (!historyForwardElement.classList.contains("disabled")) history.forward();
  });

  ipcRenderer.on("ytmView:navigationStateChanged", (event, state) => {
    if (state.canGoBack) historyBackElement.classList.remove("disabled");
    else historyBackElement.classList.add("disabled");
    if (state.canGoForward) historyForwardElement.classList.remove("disabled");
    else historyForwardElement.classList.add("disabled");
  });

  const pivotBar = document.querySelector("ytmusic-pivot-bar-renderer");
  if (!pivotBar) {
    const searchBar = document.querySelector("ytmusic-search-box");
    if (searchBar && searchBar.parentNode) {
      const navBar = searchBar.parentNode;
      navBar.insertBefore(historyForwardElement, searchBar);
      navBar.insertBefore(historyBackElement, historyForwardElement);
    }
  } else {
    historyForwardElement.classList.add("pivotbar");
    historyBackElement.classList.add("pivotbar");
    pivotBar.prepend(historyForwardElement);
    pivotBar.prepend(historyBackElement);
  }
}

function createKeyboardNavigation() {
  const keyboardNavigation = document.createElement("div");
  keyboardNavigation.tabIndex = 32767;
  keyboardNavigation.onfocus = () => {
    keyboardNavigation.blur();
    ipcRenderer.send("ytmView:switchFocus", "main");
  };
  document.body.appendChild(keyboardNavigation);
}

async function createAdditionalPlayerBarControls() {
  (await webFrame.executeJavaScript(playerBarControlsScript))();
}
async function hideChromecastButton() {
  (await webFrame.executeJavaScript(`(function() { window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_CAST_AVAILABLE', payload: false }); })`))();
}
async function hookPlayerApiEvents() {
  (await webFrame.executeJavaScript(hookPlayerApiEventsScript))();
}
function overrideHistoryButtonDisplay() {
  const btn = document.querySelector<HTMLElement>("#history-link .history-button");
  if (btn) btn.setAttribute("style", "display: inline-block !important;");
}
function getYTMTextRun(runs: { text: string }[]) {
  let final = "";
  for (const run of runs) {
    final += run.text;
  }
  return final;
}

(async function () {
  await webFrame.executeJavaScript(`
    (function() {
      let fakeBaseClass = function() {
        try {
          if (!window.__YTMD_HOOK__) {
            if (this.store && !!this.store.getState && !!this.store.dispatch && !!this.store.subscribe) {
              let ytmdHook = { ytmStore: this.store }; Object.freeze(ytmdHook); window.__YTMD_HOOK__ = ytmdHook;
            }
          }
        } catch {}
      }
      Object.defineProperty(window, "PolymerFakeBaseClassWithoutHtml", { set: (value) => {}, get: () => { return fakeBaseClass } })
    })();
  `);
})();

window.addEventListener("load", async () => {
  if (window.location.hostname !== "music.youtube.com") {
    if (window.location.hostname === "consent.youtube.com" || window.location.hostname === "accounts.google.com") ipcRenderer.send("ytmView:loaded");
    return;
  }

  await new Promise<void>(resolve => {
    const interval = setInterval(async () => {
      try {
        const hooked = await webFrame.executeJavaScript(`(function() { return !!window.__YTMD_HOOK__; })();`);
        if (hooked) {
          clearInterval(interval);
          resolve();
        }
      } catch (e) {
        // ignore
      }
    }, 250);
  });

  let materialSymbolsLoaded = false;
  const materialSymbols = createMaterialSymbolsLink();
  materialSymbols.onload = () => {
    materialSymbolsLoaded = true;
  };
  document.head.appendChild(materialSymbols);

  await new Promise<void>(resolve => {
    const interval = setInterval(async () => {
      try {
        const playerApiReady: boolean = await webFrame.executeJavaScript(`
          (function() { 
            const pb = document.querySelector("ytmusic-app-layout>ytmusic-player-bar");
            return !!(pb && pb.playerApi && pb.playerApi.isReady && pb.playerApi.isReady()); 
          })();
        `);
        if (materialSymbolsLoaded && playerApiReady) {
          clearInterval(interval);
          resolve();
        }
      } catch (e) {
        // Still loading, ignore
      }
    }, 250);
  });

  createStyleSheet();
  createNavigationMenuArrows();
  createKeyboardNavigation();
  await createAdditionalPlayerBarControls();
  await hideChromecastButton();
  await hookPlayerApiEvents();
  overrideHistoryButtonDisplay();

  // --- INJECTION 3 : Exécution du noyau UI dans le main world ---
  await webFrame.executeJavaScript(ultimateScript);

  // Notify main process that theme registry is ready
  ipcRenderer.send("ultimate:registry-ready");

  // Receive theme files from main process and inject via webFrame (same JS context as registry)
  ipcRenderer.on("ultimate:inject-theme-file", async (_event, filename: string, content: string) => {
    try {
      await webFrame.executeJavaScript(content);
      console.log(`[Ultimate] Injected theme file: ${filename}`);
    } catch (e) {
      console.error(`[Ultimate] Failed to inject theme file ${filename}:`, e);
    }
  });

  const initialTheme = await memoryStore.get("ultimateTheme");
  const initialConfig = await memoryStore.get("ultimateThemeConfig");

  if (initialConfig) {
    const cfgStr = JSON.stringify(initialConfig).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    await webFrame.executeJavaScript(`if(window.__ultimateTheme){window.__ultimateTheme.updateConfig(JSON.parse('${cfgStr}'));console.log("[Ultimate] Config applied")}`);
  }
  if (initialTheme && initialTheme !== "none") {
    await webFrame.executeJavaScript(`if(window.__ultimateTheme){window.__ultimateTheme.setTheme('${initialTheme}');console.log("[Ultimate] Theme set: ${initialTheme}")}`);
  }

  memoryStore.onStateChanged((newState: any, oldState: any) => {
    if (newState.ultimateThemeConfig !== undefined && JSON.stringify(newState.ultimateThemeConfig) !== JSON.stringify(oldState.ultimateThemeConfig)) {
      const cfgStr = JSON.stringify(newState.ultimateThemeConfig).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      webFrame.executeJavaScript(`if(window.__ultimateTheme){window.__ultimateTheme.updateConfig(JSON.parse('${cfgStr}'))}`);
    }
    if (newState.ultimateTheme !== undefined && newState.ultimateTheme !== oldState.ultimateTheme) {
      webFrame.executeJavaScript(`if(window.__ultimateTheme){window.__ultimateTheme.setTheme('${newState.ultimateTheme}');console.log("[Ultimate] Theme changed: ${newState.ultimateTheme}")}`);
    }
  });

  const integrationScripts: { [integrationName: string]: { [scriptName: string]: string } } = await ipcRenderer.invoke("ytmView:getIntegrationScripts");
  const state = await store.get("state");
  const continueWhereYouLeftOff = (await store.get("playback")).continueWhereYouLeftOff;

  if (continueWhereYouLeftOff) {
    if (!state.lastUrl.startsWith("https://music.youtube.com/watch")) {
      if (state.lastVideoId) {
        let heightTransitionCount = 0;
        const transitionEnd = async (e: TransitionEvent) => {
          if (e.target === document.querySelector("ytmusic-app-layout>ytmusic-player-bar")) {
            if (e.propertyName === "height") {
              (await webFrame.executeJavaScript(`(function() { document.querySelector("ytmusic-popup-container").refitPopups_(); })`))();
              heightTransitionCount++;
              if (heightTransitionCount >= 2)
                document.querySelector("ytmusic-app-layout>ytmusic-player-bar").removeEventListener("transitionend", transitionEnd);
            }
          }
        };
        document.querySelector("ytmusic-app-layout>ytmusic-player-bar").addEventListener("transitionend", transitionEnd);
        document.dispatchEvent(
          new CustomEvent("yt-navigate", { detail: { endpoint: { watchEndpoint: { videoId: state.lastVideoId, playlistId: state.lastPlaylistId } } } })
        );
      }
    } else {
      (
        await webFrame.executeJavaScript(
          `(function() { window.ytmd.sendVideoData(document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.getPlayerResponse().videoDetails, document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.getPlaylistId()); })`
        )
      )();
    }
  }

  const alwaysShowVolumeSlider = (await store.get("appearance")).alwaysShowVolumeSlider;
  if (alwaysShowVolumeSlider) {
    const slider = document.querySelector("ytmusic-app-layout>ytmusic-player-bar #volume-slider");
    if (slider) slider.classList.add("ytmd-persist-volume-slider");
  }

  ipcRenderer.on("remoteControl:execute", async (_event, command, value) => {
    switch (command) {
      case "playPause": {
        (
          await webFrame.executeJavaScript(
            `(function() { document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playing ? document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.pauseVideo() : document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.playVideo(); })`
          )
        )();
        break;
      }
      case "play": {
        (await webFrame.executeJavaScript(`(function() { document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.playVideo(); })`))();
        break;
      }
      case "pause": {
        (await webFrame.executeJavaScript(`(function() { document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.pauseVideo(); })`))();
        break;
      }
      case "next": {
        (await webFrame.executeJavaScript(`(function() { document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.nextVideo(); })`))();
        break;
      }
      case "previous": {
        (await webFrame.executeJavaScript(`(function() { document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.previousVideo(); })`))();
        break;
      }
      case "toggleLike": {
        (await webFrame.executeJavaScript(toggleLikeScript))();
        break;
      }
      case "toggleDislike": {
        (await webFrame.executeJavaScript(toggleDislikeScript))();
        break;
      }
      case "volumeUp": {
        const currentVolumeUp: number = (
          await webFrame.executeJavaScript(`(function() { return document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.getVolume(); })`)
        )();
        let newVolumeUp = currentVolumeUp + 10;
        if (currentVolumeUp > 100) newVolumeUp = 100;
        (
          await webFrame.executeJavaScript(
            `(function(newVolumeUp) { document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.setVolume(newVolumeUp); window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_VOLUME', payload: newVolumeUp }); })`
          )
        )(newVolumeUp);
        break;
      }
      case "volumeDown": {
        const currentVolumeDown: number = (
          await webFrame.executeJavaScript(`(function() { return document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.getVolume(); })`)
        )();
        let newVolumeDown = currentVolumeDown - 10;
        if (currentVolumeDown < 0) newVolumeDown = 0;
        (
          await webFrame.executeJavaScript(
            `(function(newVolumeDown) { document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.setVolume(newVolumeDown); window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_VOLUME', payload: newVolumeDown }); })`
          )
        )(newVolumeDown);
        break;
      }
      case "setVolume": {
        const valueInt: number = parseInt(value);
        if (isNaN(valueInt) || valueInt < 0 || valueInt > 100) return;
        (
          await webFrame.executeJavaScript(
            `(function(valueInt) { document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.setVolume(valueInt); window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_VOLUME', payload: valueInt }); })`
          )
        )(valueInt);
        break;
      }
      case "mute":
        (
          await webFrame.executeJavaScript(
            `(function() { document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.mute(); window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_MUTED', payload: true }); })`
          )
        )();
        break;
      case "unmute":
        (
          await webFrame.executeJavaScript(
            `(function() { document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.unMute(); window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_MUTED', payload: false }); })`
          )
        )();
        break;
      case "repeatMode":
        (await webFrame.executeJavaScript(`(function(value) { window.__YTMD_HOOK__.ytmStore.dispatch({ type: 'SET_REPEAT', payload: value }); })`))(value);
        break;
      case "seekTo":
        (await webFrame.executeJavaScript(`(function(value) { document.querySelector("ytmusic-app-layout>ytmusic-player-bar").playerApi.seekTo(value); })`))(
          value
        );
        break;
      case "shuffle":
        (await webFrame.executeJavaScript(`(function() { document.querySelector("ytmusic-app-layout>ytmusic-player-bar").queue.shuffle(); })`))();
        break;
      case "playQueueIndex": {
        const index: number = parseInt(value);
        (
          await webFrame.executeJavaScript(`
            (function(index) {
              const state = window.__YTMD_HOOK__.ytmStore.getState(); const queue = state.queue;
              const maxQueueIndex = state.queue.items.length - 1; const maxAutoMixQueueIndex = Math.max(state.queue.automixItems.length - 1, 0);
              let useAutoMix = false; if (index > maxQueueIndex) { index = index - state.queue.items.length; useAutoMix = true; }
              let song = null; if (!useAutoMix) { song = queue.items[index]; } else { song = queue.automixItems[index]; }
              let playlistPanelVideoRenderer;
              if (song.playlistPanelVideoRenderer) playlistPanelVideoRenderer = song.playlistPanelVideoRenderer;
              else if (song.playlistPanelVideoWrapperRenderer) playlistPanelVideoRenderer = song.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer;
              document.dispatchEvent(new CustomEvent("yt-navigate", { detail: { endpoint: { watchEndpoint: playlistPanelVideoRenderer.navigationEndpoint.watchEndpoint } } }));
            })
          `)
        )(index);
        break;
      }
      case "navigate": {
        const endpoint = value;
        document.dispatchEvent(new CustomEvent("yt-navigate", { detail: { endpoint } }));
        break;
      }
    }
  });

  ipcRenderer.on("ytmView:getPlaylists", async (_event, requestId) => {
    const rawPlaylists = await (await webFrame.executeJavaScript(getPlaylistsScript))();
    const playlists = [];
    for (const rawPlaylist of rawPlaylists) {
      const playlist = rawPlaylist.playlistAddToOptionRenderer;
      playlists.push({ id: playlist.playlistId, title: getYTMTextRun(playlist.title.runs) });
    }
    ipcRenderer.send(`ytmView:getPlaylists:response:${requestId}`, playlists);
  });

  store.onDidAnyChange(newState => {
    const volumeSlider = document.querySelector("#volume-slider");
    if (volumeSlider) {
      if (newState.appearance.alwaysShowVolumeSlider) {
        if (!volumeSlider.classList.contains("ytmd-persist-volume-slider")) volumeSlider.classList.add("ytmd-persist-volume-slider");
      } else {
        if (volumeSlider.classList.contains("ytmd-persist-volume-slider")) volumeSlider.classList.remove("ytmd-persist-volume-slider");
      }
    }
  });

  ipcRenderer.on("ytmView:refitPopups", async () => {});
  ipcRenderer.on("ytmView:executeScript", async (_event, integrationName, scriptName) => {
    const scripts = integrationScripts[integrationName];
    if (scripts) {
      const script = scripts[scriptName];
      if (script) {
        (await webFrame.executeJavaScript(script))();
      }
    }
  });

  ipcRenderer.send("ytmView:loaded");
});
