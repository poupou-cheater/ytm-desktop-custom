<script setup lang="ts">
import { ref } from "vue";
import KeybindInput from "../../components/KeybindInput.vue";
import YTMDSetting from "../../components/YTMDSetting.vue";
import { StoreSchema, TrayIconStyle } from "~shared/store/schema";
import { AuthToken } from "~shared/integrations/companion-server/types";
import logo from "~assets/icons/ytmd.png";

declare const YTMD_GIT_COMMIT_HASH: string;
declare const YTMD_GIT_BRANCH: string;

const ytmdVersion = await window.ytmd.getAppVersion();
const ytmdCommitHash = YTMD_GIT_COMMIT_HASH.substring(0, 7);
const ytmdBranch = YTMD_GIT_BRANCH;

const isDarwin = window.ytmd.isDarwin;
const isLinux = window.ytmd.isLinux;

const currentTab = ref(1);
const requiresRestart = ref(false);
const checkingForUpdate = ref(false);
const updateAvailable = ref(await window.ytmd.isAppUpdateAvailable());
const updateNotAvailable = ref(false);
const updateDownloaded = ref(await window.ytmd.isAppUpdateDownloaded());

const store = window.ytmd.store;
const memoryStore = window.ytmd.memoryStore;
const safeStorage = window.ytmd.safeStorage;

const safeStorageAvailable = ref<boolean>(await memoryStore.get("safeStorageAvailable"));

const general: StoreSchema["general"] = await store.get("general");
const appearance: StoreSchema["appearance"] = await store.get("appearance");
const playback: StoreSchema["playback"] = await store.get("playback");
const integrations: StoreSchema["integrations"] = await store.get("integrations");
const shortcuts: StoreSchema["shortcuts"] = await store.get("shortcuts");
const lastFM: StoreSchema["lastfm"] = await store.get("lastfm");

// Ultimate — Load from disk store (persisted), sync to memoryStore (runtime)
const ultimateStored = await store.get("ultimate") as any;
const ultimateOpacity = ref<number>(ultimateStored?.opacity ?? 1);
const ultimateTheme = ref<string>(ultimateStored?.theme ?? "none");

const storedThemeConfig = ultimateStored?.themeConfig || {};
const themeConfig = ref<any>({ ...storedThemeConfig });
const extensions = ref<any[]>([]);
const availableThemes = ref<any[]>([]);

/**
 * Scan .theme.js files from disk, extract metadata (id, name, defaults, schema).
 * Merge defaults into themeConfig for any new themes found.
 */
async function scanThemes() {
  try {
    const themes = await (window as any).ytmd.scanThemes();
    availableThemes.value = themes;

    // Merge defaults for any newly discovered theme
    let changed = false;
    for (const theme of themes) {
      if (theme.defaults && !themeConfig.value[theme.id]) {
        themeConfig.value[theme.id] = JSON.parse(JSON.stringify(theme.defaults));
        changed = true;
      }
    }
    if (changed) {
      themeConfigChanged();
    }
  } catch (e) {
    console.error("Failed to scan themes", e);
    availableThemes.value = [];
  }
}

// Sync initial values to memoryStore so the preload relay picks them up
memoryStore.set("ultimateOpacity", ultimateOpacity.value);
memoryStore.set("ultimateTheme", ultimateTheme.value);
memoryStore.set("ultimateThemeConfig", JSON.parse(JSON.stringify(themeConfig.value)));

async function loadExtensionList() {
  try { extensions.value = await (window as any).ytmd.listExtensions(); } catch { extensions.value = []; }
}
loadExtensionList();
scanThemes();

async function ultimateSettingsChanged() {
  const cfg = JSON.parse(JSON.stringify(themeConfig.value));
  memoryStore.set("ultimateOpacity", Number(ultimateOpacity.value));
  memoryStore.set("ultimateTheme", ultimateTheme.value);
  memoryStore.set("ultimateThemeConfig", cfg);
  // Persist to disk
  store.set("ultimate.theme", ultimateTheme.value);
  store.set("ultimate.opacity", Number(ultimateOpacity.value));
  store.set("ultimate.themeConfig", cfg);
}

async function themeConfigChanged() {
  const cfg = JSON.parse(JSON.stringify(themeConfig.value));
  memoryStore.set("ultimateThemeConfig", cfg);
  store.set("ultimate.themeConfig", cfg);
}

const extensionLoadMessage = ref("");
const extensionLoadError = ref(false);

async function loadChromeExtension(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    const file = target.files[0];
    const filePath = window.ytmd.getTrueFilePath(file);
    const pathSegments = filePath.split(/[/\\]/);
    pathSegments.pop();
    const extDir = pathSegments.join("\\");
    try {
      const result = await (window as any).ytmd.loadExtension(extDir);
      if (result.success) {
        extensionLoadMessage.value = "Extension chargée ! Redémarrage requis.";
        extensionLoadError.value = false;
        await loadExtensionList();
      } else {
        extensionLoadMessage.value = "Erreur : " + result.error;
        extensionLoadError.value = true;
      }
    } catch {
      extensionLoadMessage.value = "Erreur inattendue.";
      extensionLoadError.value = true;
    }
  }
  target.value = "";
}

async function removeExtension(id: string) {
  await (window as any).ytmd.removeExtension(id);
  await loadExtensionList();
}

async function toggleExtension(id: string, enabled: boolean) {
  await (window as any).ytmd.toggleExtension(id, enabled);
  await loadExtensionList();
}

async function openExtensionOptions(id: string) {
  await (window as any).ytmd.openExtensionOptions(id);
}

function addThemeColor(themeKey: string, fieldKey: string = "colors") {
  if (themeConfig.value[themeKey] && themeConfig.value[themeKey][fieldKey] && themeConfig.value[themeKey][fieldKey].length < 4) {
    themeConfig.value[themeKey][fieldKey].push("#ffffff");
    themeConfigChanged();
  }
}

function removeThemeColor(themeKey: string, index: number, fieldKey: string = "colors") {
  if (themeConfig.value[themeKey] && themeConfig.value[themeKey][fieldKey] && themeConfig.value[themeKey][fieldKey].length > 2) {
    themeConfig.value[themeKey][fieldKey].splice(index, 1);
    themeConfigChanged();
  }
}

const disableHardwareAcceleration = ref<boolean>(general.disableHardwareAcceleration);
const hideToTrayOnClose = ref<boolean>(general.hideToTrayOnClose);
const showNotificationOnSongChange = ref<boolean>(general.showNotificationOnSongChange);
const startOnBoot = ref<boolean>(general.startOnBoot);
const startMinimized = ref<boolean>(general.startMinimized);

const alwaysShowVolumeSlider = ref<boolean>(appearance.alwaysShowVolumeSlider);
const customCSSEnabled = ref<boolean>(appearance.customCSSEnabled);
const customCSSPath = ref<string>(appearance.customCSSPath);
const zoom = ref<number>(appearance.zoom);
const trayIconStyle = ref<number>(appearance.trayIconStyle);

const continueWhereYouLeftOff = ref<boolean>(playback.continueWhereYouLeftOff);
const continueWhereYouLeftOffPaused = ref<boolean>(playback.continueWhereYouLeftOffPaused);
const enableSpeakerFill = ref<boolean>(playback.enableSpeakerFill);
const progressInTaskbar = ref<boolean>(playback.progressInTaskbar);
const ratioVolume = ref<boolean>(playback.ratioVolume);

const companionServerEnabled = ref<boolean>(integrations.companionServerEnabled);
const companionServerAuthTokens = ref<AuthToken[]>(
  safeStorageAvailable.value ? (JSON.parse(await safeStorage.decryptString(integrations.companionServerAuthTokens)) ?? []) : []
);
const companionServerCORSWildcardEnabled = ref<boolean>(integrations.companionServerCORSWildcardEnabled);
const discordPresenceEnabled = ref<boolean>(integrations.discordPresenceEnabled);
const lastFMEnabled = ref<boolean>(integrations.lastFMEnabled);

const shortcutPlayPause = ref<string>(shortcuts.playPause);
const shortcutNext = ref<string>(shortcuts.next);
const shortcutPrevious = ref<string>(shortcuts.previous);
const shortcutThumbsUp = ref<string>(shortcuts.thumbsUp);
const shortcutThumbsDown = ref<string>(shortcuts.thumbsDown);
const shortcutVolumeUp = ref<string>(shortcuts.volumeUp);
const shortcutVolumeDown = ref<string>(shortcuts.volumeDown);

const lastFMSessionKey = ref<string>(lastFM.sessionKey);
const scrobblePercent = ref<number>(lastFM.scrobblePercent);

store.onDidAnyChange(async newState => {
  disableHardwareAcceleration.value = newState.general.disableHardwareAcceleration;
  hideToTrayOnClose.value = newState.general.hideToTrayOnClose;
  showNotificationOnSongChange.value = newState.general.showNotificationOnSongChange;
  startOnBoot.value = newState.general.startOnBoot;
  startMinimized.value = newState.general.startMinimized;

  alwaysShowVolumeSlider.value = newState.appearance.alwaysShowVolumeSlider;
  customCSSEnabled.value = newState.appearance.customCSSEnabled;
  customCSSPath.value = newState.appearance.customCSSPath;
  zoom.value = newState.appearance.zoom;
  trayIconStyle.value = newState.appearance.trayIconStyle;

  continueWhereYouLeftOff.value = newState.playback.continueWhereYouLeftOff;
  continueWhereYouLeftOffPaused.value = newState.playback.continueWhereYouLeftOffPaused;
  enableSpeakerFill.value = newState.playback.enableSpeakerFill;
  progressInTaskbar.value = newState.playback.progressInTaskbar;
  ratioVolume.value = newState.playback.ratioVolume;

  companionServerEnabled.value = newState.integrations.companionServerEnabled;
  companionServerAuthTokens.value = safeStorageAvailable.value
    ? (JSON.parse(await safeStorage.decryptString(newState.integrations.companionServerAuthTokens)) ?? [])
    : [];
  companionServerCORSWildcardEnabled.value = newState.integrations.companionServerCORSWildcardEnabled;
  discordPresenceEnabled.value = newState.integrations.discordPresenceEnabled;
  lastFMEnabled.value = newState.integrations.lastFMEnabled;
  lastFMSessionKey.value = newState.lastfm.sessionKey;
  scrobblePercent.value = newState.lastfm.scrobblePercent;

  shortcutPlayPause.value = newState.shortcuts.playPause;
  shortcutNext.value = newState.shortcuts.next;
  shortcutPrevious.value = newState.shortcuts.previous;
  shortcutThumbsUp.value = newState.shortcuts.thumbsUp;
  shortcutThumbsDown.value = newState.shortcuts.thumbsDown;
  shortcutVolumeUp.value = newState.shortcuts.volumeUp;
  shortcutVolumeDown.value = newState.shortcuts.volumeDown;
});

const discordPresenceConnectionFailed = ref<boolean>(await memoryStore.get("discordPresenceConnectionFailed"));

const shortcutsPlayPauseRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsPlayPauseRegisterFailed"));
const shortcutsNextRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsNextRegisterFailed"));
const shortcutsPreviousRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsPreviousRegisterFailed"));
const shortcutsThumbsUpRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsThumbsUpRegisterFailed"));
const shortcutsThumbsDownRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsThumbsDownRegisterFailed"));
const shortcutsVolumeUpRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsVolumeUpRegisterFailed"));
const shortcutsVolumeDownRegisterFailed = ref<boolean>(await memoryStore.get("shortcutsVolumeDownRegisterFailed"));

const companionServerAuthWindowEnabled = ref<boolean>(await memoryStore.get("companionServerAuthWindowEnabled"));
const autoUpdaterDisabled = ref<boolean>(await memoryStore.get("autoUpdaterDisabled"));

memoryStore.onStateChanged(newState => {
  discordPresenceConnectionFailed.value = newState.discordPresenceConnectionFailed;
  shortcutsPlayPauseRegisterFailed.value = newState.shortcutsPlayPauseRegisterFailed;
  shortcutsNextRegisterFailed.value = newState.shortcutsNextRegisterFailed;
  shortcutsPreviousRegisterFailed.value = newState.shortcutsPreviousRegisterFailed;
  shortcutsThumbsUpRegisterFailed.value = newState.shortcutsThumbsUpRegisterFailed;
  shortcutsThumbsDownRegisterFailed.value = newState.shortcutsThumbsDownRegisterFailed;
  shortcutsVolumeUpRegisterFailed.value = newState.shortcutsVolumeUpRegisterFailed;
  shortcutsVolumeDownRegisterFailed.value = newState.shortcutsVolumeDownRegisterFailed;
  companionServerAuthWindowEnabled.value = newState.companionServerAuthWindowEnabled;
  safeStorageAvailable.value = newState.safeStorageAvailable;
  autoUpdaterDisabled.value = newState.autoUpdaterDisabled;

  if (newState.ultimateOpacity !== undefined) ultimateOpacity.value = newState.ultimateOpacity;
  if (newState.ultimateTheme !== undefined) ultimateTheme.value = newState.ultimateTheme;
});


async function memorySettingsChanged() {
  memoryStore.set("companionServerAuthWindowEnabled", companionServerAuthWindowEnabled.value);
}

async function settingsChanged() {
  store.set("general.hideToTrayOnClose", hideToTrayOnClose.value);
  store.set("general.showNotificationOnSongChange", showNotificationOnSongChange.value);
  store.set("general.startOnBoot", startOnBoot.value);
  store.set("general.startMinimized", startMinimized.value);
  store.set("general.disableHardwareAcceleration", disableHardwareAcceleration.value);

  store.set("appearance.alwaysShowVolumeSlider", alwaysShowVolumeSlider.value);
  store.set("appearance.customCSSEnabled", customCSSEnabled.value);
  store.set("appearance.zoom", zoom.value);
  store.set("appearance.trayIconStyle", trayIconStyle.value);

  store.set("playback.continueWhereYouLeftOff", continueWhereYouLeftOff.value);
  store.set("playback.continueWhereYouLeftOffPaused", continueWhereYouLeftOffPaused.value);
  store.set("playback.progressInTaskbar", progressInTaskbar.value);
  store.set("playback.enableSpeakerFill", enableSpeakerFill.value);
  store.set("playback.ratioVolume", ratioVolume.value);

  store.set("integrations.companionServerEnabled", companionServerEnabled.value);
  store.set("integrations.companionServerCORSWildcardEnabled", companionServerCORSWildcardEnabled.value);
  store.set("integrations.discordPresenceEnabled", discordPresenceEnabled.value);
  store.set("integrations.lastFMEnabled", lastFMEnabled.value);
  store.set("lastfm.scrobblePercent", scrobblePercent.value);

  store.set("shortcuts.playPause", shortcutPlayPause.value);
  store.set("shortcuts.next", shortcutNext.value);
  store.set("shortcuts.previous", shortcutPrevious.value);
  store.set("shortcuts.thumbsUp", shortcutThumbsUp.value);
  store.set("shortcuts.thumbsDown", shortcutThumbsDown.value);
  store.set("shortcuts.volumeUp", shortcutVolumeUp.value);
  store.set("shortcuts.volumeDown", shortcutVolumeDown.value);
}

async function settingChangedRequiresRestart() {
  requiresRestart.value = true;
  settingsChanged();
}
async function settingChangedFile(event: Event) {
  const target = event.target as HTMLInputElement;
  const setting = target.dataset.setting;
  if (!setting) throw new Error("No setting specified in File Input");
  store.set(setting, target.files.length > 0 ? window.ytmd.getTrueFilePath(target.files[0]) : null);
  target.value = null;
}

async function restartDiscordPresence() {
  discordPresenceEnabled.value = false;
  await settingsChanged();
  discordPresenceEnabled.value = true;
  await settingsChanged();
}
async function deleteCompanionAuthToken(appId: string) {
  const index = companionServerAuthTokens.value.findIndex(token => token.appId === appId);
  if (index > -1) companionServerAuthTokens.value.splice(index, 1);
  if (safeStorageAvailable.value)
    store.set("integrations.companionServerAuthTokens", await safeStorage.encryptString(JSON.stringify(companionServerAuthTokens.value)));
}

function removeCustomCSSPath() {
  store.set("appearance.customCSSPath", null);
}
function changeTab(newTab: number) {
  currentTab.value = newTab;
  if (newTab === 6) {
    scanThemes();
  }
}
function restartApplication() {
  window.ytmd.restartApplication();
}
function restartApplicationForUpdate() {
  window.ytmd.restartApplicationForUpdate();
}
function checkForUpdates() {
  window.ytmd.checkForUpdates();
  checkingForUpdate.value = true;
}
async function logoutLastFM() {
  store.set("lastfm.sessionKey", null);
  lastFMEnabled.value = false;
  lastFMSessionKey.value = null;
  await settingsChanged();
}
async function openThemesDir() {
  await window.ytmd.openThemesDir();
}

window.ytmd.handleCheckingForUpdate(() => {
  checkingForUpdate.value = true;
});
window.ytmd.handleUpdateAvailable(() => {
  checkingForUpdate.value = false;
  updateAvailable.value = true;
  updateNotAvailable.value = false;
});
window.ytmd.handleUpdateNotAvailable(() => {
  checkingForUpdate.value = false;
  updateNotAvailable.value = true;
  updateAvailable.value = false;
});
window.ytmd.handleUpdateDownloaded(() => {
  checkingForUpdate.value = false;
  updateNotAvailable.value = false;
  updateAvailable.value = false;
  updateDownloaded.value = true;
});
</script>

<template>
  <div class="settings-container">
    <div class="content-container">
      <ul class="sidebar">
        <li :class="{ active: currentTab === 1 }" @click="changeTab(1)"><span class="material-symbols-outlined">settings_applications</span>General</li>
        <li :class="{ active: currentTab === 2 }" @click="changeTab(2)"><span class="material-symbols-outlined">brush</span>Appearance</li>
        <li :class="{ active: currentTab === 3 }" @click="changeTab(3)"><span class="material-symbols-outlined">music_note</span>Playback</li>
        <li :class="{ active: currentTab === 4 }" @click="changeTab(4)"><span class="material-symbols-outlined">wifi_tethering</span>Integrations</li>
        <li :class="{ active: currentTab === 5 }" @click="changeTab(5)"><span class="material-symbols-outlined">keyboard</span>Shortcuts</li>
        <li :class="{ active: currentTab === 6 }" @click="changeTab(6)" class="nova-sidebar"><span class="material-symbols-outlined nova-sidebar-ic">auto_awesome</span>NOVA</li>
        <span class="push"></span>
        <li :class="{ active: currentTab === 99 }" @click="changeTab(99)"><span class="material-symbols-outlined">info</span>About</li>
      </ul>
      <div class="content">
        <div v-if="requiresRestart" class="restart-banner">
          <p class="message"><span class="material-symbols-outlined">autorenew</span> Restart app to apply changes</p>
          <button class="restart-button" @click="restartApplication">Restart</button>
        </div>

        <div v-if="currentTab === 1" class="general-tab">
          <YTMDSetting v-if="!isDarwin" v-model="hideToTrayOnClose" type="checkbox" name="Hide to tray on close" @change="settingsChanged" />
          <YTMDSetting v-model="showNotificationOnSongChange" type="checkbox" name="Show notification on song change" @change="settingsChanged" />
          <YTMDSetting v-model="startOnBoot" type="checkbox" name="Start on boot" @change="settingsChanged" />
          <YTMDSetting
            v-model="disableHardwareAcceleration"
            type="checkbox"
            restart-required
            name="Disable hardware acceleration"
            @change="settingChangedRequiresRestart"
          />
        </div>

        <div v-if="currentTab === 2" class="appearance-tab">
          <YTMDSetting v-model="alwaysShowVolumeSlider" type="checkbox" name="Always show volume slider" @change="settingsChanged" />
          <YTMDSetting v-model="customCSSEnabled" type="checkbox" name="Custom CSS" @change="settingsChanged" />
          <YTMDSetting
            v-if="customCSSEnabled"
            v-model="customCSSPath"
            type="file"
            indented
            bind-setting="appearance.customCSSPath"
            name="Custom CSS file path"
            @file-change="settingChangedFile"
            @clear="removeCustomCSSPath"
          />
          <YTMDSetting v-model="zoom" type="range" max="300" min="30" step="10" name="Zoom" @change="settingsChanged" />
          <YTMDSetting
            v-if="isLinux"
            v-model="trayIconStyle"
            :options-map="{ [TrayIconStyle.Auto]: 'Auto', [TrayIconStyle.White]: 'White', [TrayIconStyle.Black]: 'Black' }"
            type="select"
            name="Tray icon style"
            @change="settingsChanged"
          />
        </div>

        <div v-if="currentTab === 3" class="playback-tab">
          <YTMDSetting v-model="continueWhereYouLeftOff" name="Continue where you left off" type="checkbox" @change="settingsChanged" />
          <YTMDSetting
            v-if="continueWhereYouLeftOff"
            v-model="continueWhereYouLeftOffPaused"
            type="checkbox"
            indented
            name="Pause on application launch"
            @change="settingsChanged"
          />
          <YTMDSetting v-model="progressInTaskbar" type="checkbox" name="Show track progress on taskbar" @change="settingsChanged" />
          <YTMDSetting v-model="enableSpeakerFill" type="checkbox" restart-required name="Enable speaker fill" @change="settingChangedRequiresRestart" />
          <YTMDSetting v-model="ratioVolume" type="checkbox" name="Ratio volume" @change="settingsChanged" />
        </div>

        <div v-if="currentTab === 4" class="integrations-tab">
          <YTMDSetting
            v-model="companionServerEnabled"
            type="checkbox"
            name="Companion server"
            :disabled="!safeStorageAvailable"
            disabled-message="This integration cannot be enabled due to safeStorage being unavailable"
            @change="settingsChanged"
          />
          <YTMDSetting
            v-if="companionServerEnabled && safeStorageAvailable"
            v-model="companionServerCORSWildcardEnabled"
            type="checkbox"
            indented
            name="Allow browser communication"
            description="This setting could be dangerous as it allows any website you visit to communicate with the companion server"
            @change="settingsChanged"
          />
          <YTMDSetting
            v-if="companionServerEnabled && safeStorageAvailable"
            v-model="companionServerAuthWindowEnabled"
            type="checkbox"
            indented
            name="Enable companion authorization"
            description="Automatically disables after the first successful authorization or 5 minutes has passed"
            @change="memorySettingsChanged"
          />
          <YTMDSetting
            v-if="companionServerEnabled && safeStorageAvailable"
            type="custom"
            flex-column
            indented
            name="Authorized companions"
            description="This is a list of companions that currently have access to the companion server"
            @change="settingsChanged"
          >
            <table class="authorized-companions-table">
              <thead>
                <tr>
                  <th class="companion">Companion</th>
                  <th class="version">Version</th>
                  <th class="controls"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="authToken in companionServerAuthTokens" :key="authToken.appId">
                  <td class="companion">
                    <span class="name">{{ authToken.appName }}</span
                    ><br /><span class="id">{{ authToken.appId }}</span>
                  </td>
                  <td class="version">{{ authToken.appVersion }}</td>
                  <td class="controls">
                    <button @click="deleteCompanionAuthToken(authToken.appId)"><span class="material-symbols-outlined">delete</span></button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="companionServerAuthTokens.length === 0" class="no-authorized-companions"><td>No authorized companions</td></div>
          </YTMDSetting>
          <YTMDSetting v-model="discordPresenceEnabled" type="checkbox" name="Discord rich presence" @change="settingsChanged" />
          <div v-if="discordPresenceEnabled && discordPresenceConnectionFailed" class="setting indented">
            <p class="discord-failure">Discord connection could not be established after 30 attempts</p>
            <button @click="restartDiscordPresence">Retry</button>
          </div>
          <YTMDSetting
            v-model="lastFMEnabled"
            type="checkbox"
            name="Last.fm scrobbling"
            :disabled="!safeStorageAvailable"
            disabled-message="This integration cannot be enabled due to safeStorage being unavailable"
            @change="settingsChanged"
          />
          <div v-if="lastFMEnabled" class="setting indented">
            <div class="name-with-description">
              <p class="description">
                User is Authenticated:<span v-if="lastFMSessionKey" style="color: #4caf50">Yes</span><span v-else style="color: #ff1100">No</span>
              </p>
            </div>
            <button v-if="lastFMSessionKey" @click="logoutLastFM">Logout</button>
          </div>
          <YTMDSetting
            v-if="lastFMEnabled"
            v-model="scrobblePercent"
            class="settings indented"
            type="range"
            name="Scrobble percent"
            description="Determines when a song is scrobbled"
            min="50"
            max="95"
            step="5"
            @change="settingsChanged"
          />
        </div>

        <div v-if="currentTab === 5" class="shortcuts-tab">
          <div class="setting">
            <p class="shortcut-title">
              Play/Pause<span v-if="shortcutsPlayPauseRegisterFailed" class="material-symbols-outlined register-error" title="Failed to register keybind."
                >error</span
              >
            </p>
            <KeybindInput v-model="shortcutPlayPause" @change="settingsChanged" />
          </div>
          <div class="setting">
            <p class="shortcut-title">
              Next<span v-if="shortcutsNextRegisterFailed" class="material-symbols-outlined register-error" title="Failed to register keybind.">error</span>
            </p>
            <KeybindInput v-model="shortcutNext" @change="settingsChanged" />
          </div>
          <div class="setting">
            <p class="shortcut-title">
              Previous<span v-if="shortcutsPreviousRegisterFailed" class="material-symbols-outlined register-error" title="Failed to register keybind."
                >error</span
              >
            </p>
            <KeybindInput v-model="shortcutPrevious" @change="settingsChanged" />
          </div>
          <div class="setting">
            <p class="shortcut-title">
              Thumbs Up<span v-if="shortcutsThumbsUpRegisterFailed" class="material-symbols-outlined register-error" title="Failed to register keybind."
                >error</span
              >
            </p>
            <KeybindInput v-model="shortcutThumbsUp" @change="settingsChanged" />
          </div>
          <div class="setting">
            <p class="shortcut-title">
              Thumbs Down<span v-if="shortcutsThumbsDownRegisterFailed" class="material-symbols-outlined register-error" title="Failed to register keybind."
                >error</span
              >
            </p>
            <KeybindInput v-model="shortcutThumbsDown" @change="settingsChanged" />
          </div>
          <div class="setting">
            <p class="shortcut-title">
              Increase Volume<span v-if="shortcutsVolumeUpRegisterFailed" class="material-symbols-outlined register-error" title="Failed to register keybind."
                >error</span
              >
            </p>
            <KeybindInput v-model="shortcutVolumeUp" @change="settingsChanged" />
          </div>
          <div class="setting">
            <p class="shortcut-title">
              Decrease Volume<span v-if="shortcutsVolumeDownRegisterFailed" class="material-symbols-outlined register-error" title="Failed to register keybind."
                >error</span
              >
            </p>
            <KeybindInput v-model="shortcutVolumeDown" @change="settingsChanged" />
          </div>
        </div>

        <div v-if="currentTab === 6" class="nv">
          <div class="nv-hero"><div class="nv-glow"></div><div class="nv-brand"><span class="nv-diamond">◆</span><div><h2 class="nv-title">NOVA</h2><p class="nv-sub">Moteur de personnalisation</p></div></div></div>
          <div class="nv-scroll">
            <!-- Apparence -->
            <div class="nv-card">
              <div class="nv-head"><span class="material-symbols-outlined">palette</span><span>Apparence</span></div>
              <div class="nv-field"><div class="nv-ftop"><label>Opacité</label><span class="nv-val">{{ Math.round(ultimateOpacity * 100) }}%</span></div><input type="range" min="0.1" max="1" step="0.05" v-model="ultimateOpacity" @input="ultimateSettingsChanged" class="nv-range" /></div>
              <div class="nv-field"><label>Thème visuel</label><div class="nv-trow"><select v-model="ultimateTheme" @change="ultimateSettingsChanged" class="nv-sel"><option value="none">Aucun</option><option v-for="theme in availableThemes" :key="'to-'+theme.id" :value="theme.id">{{ theme.name }}</option></select><button @click="openThemesDir" class="nv-ibtn" title="Ouvrir dossier"><span class="material-symbols-outlined">folder_open</span></button><button @click="scanThemes" class="nv-ibtn" title="Actualiser"><span class="material-symbols-outlined">refresh</span></button></div></div>
            </div>
            <!-- Theme Config -->
            <div v-for="theme in availableThemes" :key="'cfg-'+theme.id"><div v-if="ultimateTheme===theme.id && themeConfig[theme.id]" class="nv-card">
              <div class="nv-head"><span class="material-symbols-outlined">tune</span><span>{{ theme.name }}</span></div>
              <div v-for="field in theme.schema" :key="'f-'+field.key" class="nv-field">
                <div v-if="field.type!=='color-array'" class="nv-ftop"><label>{{ field.label }}</label><span v-if="field.type==='range'" class="nv-val">{{ themeConfig[theme.id][field.key] }}</span></div>
                <input v-if="field.type==='color'" type="color" v-model="themeConfig[theme.id][field.key]" @input="themeConfigChanged" class="nv-color"/>
                <label v-if="field.type==='checkbox'||field.type==='boolean'" class="nv-tog"><input type="checkbox" v-model="themeConfig[theme.id][field.key]" @change="themeConfigChanged"/><span class="nv-track"><span class="nv-thumb"></span></span></label>
                <input v-if="field.type==='range'" type="range" :min="field.min" :max="field.max" :step="field.step" v-model.number="themeConfig[theme.id][field.key]" @input="themeConfigChanged" class="nv-range"/>
                <select v-if="field.type==='select'" v-model="themeConfig[theme.id][field.key]" @change="themeConfigChanged" class="nv-sel nv-sel-sm"><option v-for="(opt,oi) in field.options" :key="'o-'+oi" :value="typeof opt==='string'?opt:opt.value">{{ typeof opt==='string'?opt:opt.label }}</option></select>
                <div v-if="field.type==='color-array'" class="nv-ca"><label>{{ field.label }}</label><div class="nv-calist"><div v-for="(c,i) in themeConfig[theme.id][field.key]" :key="'c-'+theme.id+'-'+i" class="nv-caitem"><input type="color" :value="c" @input="themeConfig[theme.id][field.key][i]=($event.target as HTMLInputElement).value;themeConfigChanged()" class="nv-color"/><button v-if="themeConfig[theme.id][field.key].length>2" @click="removeThemeColor(theme.id,i,field.key)" class="nv-carm"><span class="material-symbols-outlined">close</span></button></div><button v-if="themeConfig[theme.id][field.key].length<4" @click="addThemeColor(theme.id,field.key)" class="nv-caadd"><span class="material-symbols-outlined">add</span></button></div></div>
              </div>
            </div></div>
            <!-- Extensions -->
            <div class="nv-card">
              <div class="nv-head"><span class="material-symbols-outlined">extension</span><span>Extensions Chrome</span></div>
              <div class="nv-extact"><input type="file" webkitdirectory directory ref="extensionInput" @change="loadChromeExtension" style="display:none"/><button @click="($refs.extensionInput as HTMLInputElement).click()" class="nv-btnp"><span class="material-symbols-outlined">add_circle</span>Charger une extension</button></div>
              <p v-if="extensionLoadMessage" :class="['nv-status',extensionLoadError?'nv-st-err':'nv-st-ok']"><span class="material-symbols-outlined">{{extensionLoadError?'error':'check_circle'}}</span>{{extensionLoadMessage}}</p>
              <div v-for="ext in extensions" :key="ext.id" class="nv-ext">
                <div class="nv-extinfo"><span class="nv-extname">{{ext.name}}</span><span class="nv-extver">v{{ext.version}}</span></div>
                <div class="nv-extctrl"><label class="nv-tog"><input type="checkbox" :checked="ext.enabled" @change="toggleExtension(ext.id,!ext.enabled)"/><span class="nv-track"><span class="nv-thumb"></span></span></label><button v-if="ext.optionsUrl" @click="openExtensionOptions(ext.id)" class="nv-ibtn" title="Paramètres"><span class="material-symbols-outlined">settings</span></button><button @click="removeExtension(ext.id)" class="nv-ibtn nv-ibtn-d" title="Supprimer"><span class="material-symbols-outlined">delete</span></button></div>
              </div>
              <div v-if="extensions.length===0" class="nv-empty"><span class="material-symbols-outlined">extension_off</span><span>Aucune extension installée</span></div>
            </div>
          </div>
        </div>

        <div v-if="currentTab === 99" class="about-tab">
          <img class="icon" :src="logo" />
          <h2 class="app-name">YouTube Music Desktop App</h2>
          <p class="made-by">Made by YTMDesktop Team</p>
          <template v-if="!autoUpdaterDisabled">
            <button
              v-if="!updateDownloaded"
              :disabled="!(!checkingForUpdate && !updateAvailable && !updateDownloaded)"
              class="update-check-button"
              @click="checkForUpdates"
            >
              <span class="material-symbols-outlined">update</span>Check for updates
            </button>
            <button v-if="updateDownloaded" class="update-button" @click="restartApplicationForUpdate">
              <span class="material-symbols-outlined">upgrade</span>Restart to update
            </button>
            <p v-if="checkingForUpdate && !updateAvailable && !updateDownloaded" class="updating">
              <span class="material-symbols-outlined">progress_activity</span>Checking for updates...
            </p>
            <p v-if="updateAvailable && !updateDownloaded" class="updating">
              <span class="material-symbols-outlined">progress_activity</span>Downloading update...
            </p>
            <p v-if="updateNotAvailable" class="no-update">Update not available</p>
          </template>
          <template v-if="autoUpdaterDisabled">
            <button disabled class="update-check-button"><span class="material-symbols-outlined">update</span>Check for updates</button>
            <p class="no-auto-updater">Auto updater disabled</p>
          </template>
          <span class="version-info"
            ><p class="version">Version: {{ ytmdVersion }}</p>
            <p class="branch">Branch: {{ ytmdBranch }}</p>
            <p class="commit">Commit: {{ ytmdCommitHash }}</p></span
          >
          <div class="links">
            <a href="https://github.com/ytmdesktop/ytmdesktop" target="_blank">GitHub</a><a href="https://ytmdesktop.github.io/" target="_blank">Website</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-container {
  user-select: none;
}
.content-container {
  display: flex;
  height: 100%;
}
.content {
  overflow: auto;
  flex-grow: 1;
  padding: 4px 16px;
}
.content::-webkit-scrollbar {
  width: 12px;
}
.content::-webkit-scrollbar-track {
  background: #212121;
}
.content::-webkit-scrollbar-thumb {
  background-color: #414141;
}
.sidebar {
  width: 25%;
  min-width: 25%;
  list-style-type: none;
  margin: unset;
  padding: unset;
  height: 100%;
  border-right: 1px solid #212121;
  display: flex;
  flex-direction: column;
}
.sidebar li {
  display: flex;
  align-items: center;
  padding: 16px;
  cursor: pointer;
  color: #bbbbbb;
  transition: background-color 0.2s;
}
.sidebar li .material-symbols-outlined {
  font-size: 28px;
  font-variation-settings:
    "FILL" 0,
    "wght" 100,
    "GRAD" 0,
    "opsz" 28;
  margin-right: 8px;
}
.sidebar li:hover {
  background-color: #111111;
}
.sidebar li.active {
  background-color: #212121;
  color: #eeeeee;
}
.sidebar .push {
  flex-grow: 1;
}
.setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.setting.indented {
  margin-left: 12px;
  padding-left: 12px;
  border-left: 1px solid #212121;
}
.name-with-description .name {
  margin-bottom: unset;
}
.name-with-description .description {
  margin-top: 4px;
  color: #969696;
}
.about-tab {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  height: 100%;
}
.icon {
  width: 128px;
  height: 128px;
  margin-bottom: 16px;
}
.app-name {
  margin: 0;
}
.version-info .version,
.version-info .branch,
.version-info .commit {
  margin: 4px 0;
  color: #bbbbbb;
}
.made-by {
  margin: 16px 0;
}
.links {
  margin-top: 32px;
  width: 100%;
  display: flex;
  justify-content: space-evenly;
}
.links a {
  color: #bbbbbb;
}
.restart-banner {
  background-color: #f44336;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.restart-banner .message {
  display: flex;
  align-items: center;
}
.restart-banner .message .material-symbols-outlined {
  margin: 0 8px;
}
.restart-banner .restart-button {
  margin: 0 8px;
  background-color: transparent;
  border: 1px solid #ffffff;
  border-radius: 4px;
  padding: 8px 16px;
  cursor: pointer;
}
.update-check-button {
  display: flex;
  align-items: center;
  background-color: transparent;
  border: 1px solid #ffffff;
  border-radius: 4px;
  padding: 4px 8px;
  margin-bottom: 8px;
  cursor: pointer;
}
.update-check-button:disabled {
  border: 1px solid #888888;
  cursor: not-allowed;
}
.updating,
.no-update,
.no-auto-updater {
  display: flex;
  align-items: center;
  color: #888888;
  margin: 0 0 8px 0;
}
.updating .material-symbols-outlined {
  animation: rotation 1s infinite linear;
}
@keyframes rotation {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(359deg);
  }
}
.update-button {
  display: flex;
  align-items: center;
  background-color: #f44336;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  margin-bottom: 8px;
  cursor: pointer;
}
.update-check-button .material-symbols-outlined,
.updating .material-symbols-outlined,
.update-button .material-symbols-outlined {
  margin-right: 4px;
}
.version-info {
  user-select: text;
}
.setting.disabled {
  color: #c6c6c6;
}
.authorized-companions-table {
  width: 100%;
  table-layout: fixed;
}
.authorized-companions-table tr .companion {
  width: 70%;
  word-wrap: break-word;
}
.authorized-companions-table tr .companion .id {
  color: #969696;
  font-size: 14px;
}
.authorized-companions-table tbody tr .version {
  word-wrap: break-word;
}
.authorized-companions-table tr th,
.authorized-companions-table tr td {
  padding: 4px;
}
.authorized-companions-table th {
  text-align: left;
}
.authorized-companions-table thead tr th {
  border-bottom: 1px solid #212121;
}
.authorized-companions-table thead tr .controls {
  width: 48px;
}
.authorized-companions-table tbody button {
  border-radius: 4px;
  padding: 4px;
  display: flex;
  align-items: center;
  background-color: #212121;
  cursor: pointer;
  border: none;
}
.no-authorized-companions {
  color: #bbbbbb;
  padding: 4px;
}
.discord-failure {
  margin: 0;
  color: #969696;
}
button {
  margin: 3px 3px 3px 4px;
  border-radius: 4px;
  padding: 8px;
  display: flex;
  align-items: center;
  background-color: #212121;
  cursor: pointer;
  border: none;
}
.shortcuts-tab .shortcut-title {
  display: flex;
  justify-content: center;
  align-items: center;
}
.shortcuts-tab .shortcut-title .register-error {
  margin-left: 4px;
  color: #f44336;
}
/* — NOVA Sidebar — */
.nova-sidebar { color: #2563eb !important; font-weight: 600 !important; letter-spacing: 1.5px; }
.nova-sidebar-ic { color: #2563eb !important; }
/* — NOVA Tab Layout — */
.nv { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.nv-hero { position: relative; padding: 20px 20px 16px; flex-shrink: 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.nv-glow { position: absolute; top: -60px; left: -30px; width: 180px; height: 180px; background: radial-gradient(circle, rgba(37,99,235,0.1) 0%, transparent 70%); pointer-events: none; }
.nv-brand { display: flex; align-items: center; gap: 12px; position: relative; z-index: 1; }
.nv-diamond { font-size: 26px; background: linear-gradient(135deg, #2563eb, #7c3aed); -webkit-background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 0 8px rgba(37,99,235,0.25)); }
.nv-title { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 4px; background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.nv-sub { margin: 2px 0 0; font-size: 10px; color: #555; letter-spacing: 1.5px; text-transform: uppercase; }
.nv-scroll { flex: 1; overflow-y: auto; padding: 16px 20px 20px; }
.nv-scroll::-webkit-scrollbar { width: 5px; }
.nv-scroll::-webkit-scrollbar-track { background: transparent; }
.nv-scroll::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
.nv-scroll::-webkit-scrollbar-thumb:hover { background: #3a3a3a; }
/* — Cards — */
.nv-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; transition: border-color 0.25s; }
.nv-card:hover { border-color: rgba(255,255,255,0.09); }
.nv-head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 11px; font-weight: 600; color: #999; text-transform: uppercase; letter-spacing: 1.2px; }
.nv-head .material-symbols-outlined { font-size: 16px; color: #2563eb; }
/* — Fields — */
.nv-field { margin-bottom: 12px; }
.nv-field:last-child { margin-bottom: 0; }
.nv-field > label { display: block; font-size: 12px; color: #777; margin-bottom: 6px; }
.nv-ftop { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.nv-ftop label { font-size: 12px; color: #888; }
.nv-val { font-size: 11px; color: #2563eb; font-weight: 600; font-variant-numeric: tabular-nums; background: rgba(37,99,235,0.08); padding: 2px 8px; border-radius: 4px; }
/* — Range — */
.nv-range { width: 100%; height: 4px; -webkit-appearance: none; appearance: none; background: rgba(255,255,255,0.07); border-radius: 2px; outline: none; cursor: pointer; }
.nv-range::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #2563eb; cursor: pointer; box-shadow: 0 0 6px rgba(37,99,235,0.3); transition: box-shadow 0.2s; }
.nv-range::-webkit-slider-thumb:hover { box-shadow: 0 0 12px rgba(37,99,235,0.5); }
/* — Select — */
.nv-sel { width: 100%; padding: 7px 10px; background: rgba(255,255,255,0.03); color: #ccc; border: 1px solid rgba(255,255,255,0.07); border-radius: 6px; outline: none; font-size: 12px; cursor: pointer; transition: border-color 0.2s; }
.nv-sel:hover, .nv-sel:focus { border-color: rgba(37,99,235,0.25); }
.nv-sel-sm { width: auto; min-width: 110px; }
.nv-sel option { background: #141414; color: #ccc; }
/* — Theme row — */
.nv-trow { display: flex; gap: 6px; align-items: center; margin-top: 4px; }
.nv-trow .nv-sel { flex: 1; }
/* — Icon buttons — */
.nv-ibtn { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 6px; color: #666; cursor: pointer; transition: all 0.2s; padding: 0; margin: 0; flex-shrink: 0; }
.nv-ibtn:hover { background: rgba(255,255,255,0.06); color: #2563eb; border-color: rgba(37,99,235,0.2); }
.nv-ibtn .material-symbols-outlined { font-size: 16px; }
.nv-ibtn-d:hover { color: #ff4444; border-color: rgba(255,68,68,0.2); }
/* — Color — */
.nv-color { width: 34px; height: 26px; border: 1px solid rgba(255,255,255,0.1); border-radius: 5px; background: transparent; cursor: pointer; padding: 1px; transition: border-color 0.2s; }
.nv-color:hover { border-color: rgba(37,99,235,0.3); }
/* — Toggle — */
.nv-tog { position: relative; display: inline-flex; align-items: center; cursor: pointer; flex-shrink: 0; }
.nv-tog input { position: absolute; opacity: 0; width: 0; height: 0; }
.nv-track { position: relative; width: 36px; height: 20px; background: rgba(255,255,255,0.08); border-radius: 10px; transition: background 0.3s; }
.nv-thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: #555; border-radius: 50%; transition: all 0.3s cubic-bezier(0.4,0,0.2,1); }
.nv-tog input:checked + .nv-track { background: rgba(37,99,235,0.18); }
.nv-tog input:checked + .nv-track .nv-thumb { transform: translateX(16px); background: #2563eb; box-shadow: 0 0 6px rgba(37,99,235,0.4); }
/* — Color array — */
.nv-ca { width: 100%; }
.nv-ca > label { display: block; font-size: 12px; color: #888; margin-bottom: 6px; }
.nv-calist { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.nv-caitem { display: flex; align-items: center; gap: 3px; }
.nv-carm { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; background: transparent; border: none; color: #555; cursor: pointer; padding: 0; margin: 0; border-radius: 3px; transition: color 0.2s; }
.nv-carm:hover { color: #ff4444; }
.nv-carm .material-symbols-outlined { font-size: 13px; }
.nv-caadd { display: flex; align-items: center; justify-content: center; width: 34px; height: 26px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.12); border-radius: 5px; color: #555; cursor: pointer; padding: 0; margin: 0; transition: all 0.2s; }
.nv-caadd:hover { border-color: rgba(37,99,235,0.3); color: #2563eb; }
.nv-caadd .material-symbols-outlined { font-size: 15px; }
/* — Primary button — */
.nv-btnp { display: flex; align-items: center; gap: 6px; width: 100%; padding: 9px 14px; background: rgba(37,99,235,0.06); border: 1px solid rgba(37,99,235,0.12); border-radius: 7px; color: #2563eb; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.2s; margin: 0; justify-content: center; }
.nv-btnp:hover { background: rgba(37,99,235,0.1); border-color: rgba(37,99,235,0.22); }
.nv-btnp .material-symbols-outlined { font-size: 16px; }
/* — Status — */
.nv-status { display: flex; align-items: center; gap: 6px; font-size: 11px; padding: 6px 10px; border-radius: 5px; margin: 8px 0; }
.nv-status .material-symbols-outlined { font-size: 14px; }
.nv-st-ok { color: #2563eb; background: rgba(37,99,235,0.05); }
.nv-st-err { color: #ff4444; background: rgba(255,68,68,0.05); }
/* — Extensions — */
.nv-extact { margin-bottom: 10px; }
.nv-ext { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: rgba(255,255,255,0.015); border: 1px solid rgba(255,255,255,0.04); border-radius: 7px; margin-bottom: 5px; transition: border-color 0.2s; }
.nv-ext:hover { border-color: rgba(255,255,255,0.08); }
.nv-extinfo { display: flex; flex-direction: column; min-width: 0; }
.nv-extname { font-size: 12px; font-weight: 500; color: #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-extver { font-size: 10px; color: #555; margin-top: 1px; }
.nv-extctrl { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
.nv-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px; color: #3a3a3a; font-size: 12px; }
.nv-empty .material-symbols-outlined { font-size: 28px; opacity: 0.5; }
</style>
