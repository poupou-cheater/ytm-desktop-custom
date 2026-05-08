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

const defaultThemeConfig = (await (window as any).ytmd.getDefaultThemeConfig()) || {};
const storedThemeConfig = ultimateStored?.themeConfig || {};
// Deep merge: for each theme key, merge stored values over defaults
const mergedThemeConfig: any = {};
const defKeys = defaultThemeConfig ? Object.keys(defaultThemeConfig) : [];
for (const key of defKeys) {
  mergedThemeConfig[key] = { ...(defaultThemeConfig[key] || {}), ...(storedThemeConfig[key] || {}) };
}
const stoKeys = storedThemeConfig ? Object.keys(storedThemeConfig) : [];
for (const key of stoKeys) {
  if (!mergedThemeConfig[key]) mergedThemeConfig[key] = storedThemeConfig[key];
}

const themeConfig = ref<any>(mergedThemeConfig);
const extensions = ref<any[]>([]);

// Sync initial values to memoryStore so the preload relay picks them up
memoryStore.set("ultimateOpacity", ultimateOpacity.value);
memoryStore.set("ultimateTheme", ultimateTheme.value);
memoryStore.set("ultimateThemeConfig", JSON.parse(JSON.stringify(mergedThemeConfig)));

async function loadExtensionList() {
  try { extensions.value = await (window as any).ytmd.listExtensions(); } catch { extensions.value = []; }
}
loadExtensionList();

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

function addThemeColor(themeKey: string) {
  if (themeConfig.value[themeKey] && themeConfig.value[themeKey].colors && themeConfig.value[themeKey].colors.length < 4) {
    themeConfig.value[themeKey].colors.push("#ffffff");
    themeConfigChanged();
  }
}

function removeThemeColor(themeKey: string, index: number) {
  if (themeConfig.value[themeKey] && themeConfig.value[themeKey].colors && themeConfig.value[themeKey].colors.length > 2) {
    themeConfig.value[themeKey].colors.splice(index, 1);
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
        <li :class="{ active: currentTab === 6 }" @click="changeTab(6)" style="color: #00e676; font-weight: bold">
          <span class="material-symbols-outlined" style="color: #00e676">bolt</span>Ultimate
        </li>
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

        <div v-if="currentTab === 6" class="ultimate-tab" style="padding: 10px; overflow-y: auto">
          <h2 style="color: #00e676; margin-bottom: 20px">⚡ Paramètres Ultimate</h2>
          <div class="u-section"><p class="u-label">Opacité: {{ ultimateOpacity }}</p><input type="range" min="0.1" max="1" step="0.05" v-model="ultimateOpacity" @input="ultimateSettingsChanged" class="u-range" /></div>
          <div class="u-section"><p class="u-label">Thème</p>
            <select v-model="ultimateTheme" @change="ultimateSettingsChanged" class="u-select">
              <option value="none">Désactivé</option><option value="starry">🌌 Nuit Étoilée</option><option value="audio-reactive">🎵 Audio-Réactif</option>
              <option value="liquid">🫧 Liquid Gradient</option><option value="lofi">☕ Lo-Fi</option><option value="retro-crt">📺 Rétro CRT</option><option value="vortex">🌀 Vortex 3D</option>
            </select>
          </div>
          <div v-if="ultimateTheme==='starry'&&themeConfig.starry" class="u-config"><h3 class="u-config-title">🌌 Nuit Étoilée</h3>
            <div class="u-row"><span>Couleur haut (ciel)</span><input type="color" v-model="themeConfig.starry.topColor" @input="themeConfigChanged"/></div>
            <div class="u-row"><span>Couleur bas (horizon)</span><input type="color" v-model="themeConfig.starry.bottomColor" @input="themeConfigChanged"/></div>
            <div class="u-row"><span>Nombre d'étoiles: {{themeConfig.starry.starCount}}</span><input type="range" min="50" max="5000" step="50" v-model.number="themeConfig.starry.starCount" @input="themeConfigChanged" class="u-range"/></div>
            <div class="u-row"><span>Étoiles filantes</span><input type="checkbox" v-model="themeConfig.starry.showShootingStars" @change="themeConfigChanged"/></div>
            <div class="u-row"><span>Nombre étoiles filantes: {{themeConfig.starry.shootingStarCount}}</span><input type="range" min="1" max="30" step="1" v-model.number="themeConfig.starry.shootingStarCount" @input="themeConfigChanged" class="u-range"/></div>
            <div class="u-row"><span>Vitesse rotation: {{themeConfig.starry.animationSpeed}}</span><input type="range" min="0.1" max="10" step="0.1" v-model.number="themeConfig.starry.animationSpeed" @input="themeConfigChanged" class="u-range"/></div>
          </div>
          <div v-if="ultimateTheme==='audio-reactive'&&themeConfig['audio-reactive']" class="u-config"><h3 class="u-config-title">🎵 Audio-Réactif</h3>
            <div class="u-row"><span>Sensibilité: {{themeConfig['audio-reactive'].bassSensitivity}}</span><input type="range" min="0.1" max="3" step="0.1" v-model.number="themeConfig['audio-reactive'].bassSensitivity" @input="themeConfigChanged" class="u-range"/></div>
            <div class="u-row"><span>Forme</span><select v-model="themeConfig['audio-reactive'].shape" @change="themeConfigChanged" class="u-select-sm"><option value="bars">Barres</option><option value="circles">Cercles</option></select></div>
            <div class="u-row" v-for="(c,i) in themeConfig['audio-reactive'].colors" :key="'ar-'+i"><span>Couleur {{i+1}}</span><input type="color" :value="c" @input="themeConfig['audio-reactive'].colors[i]=($event.target as HTMLInputElement).value;themeConfigChanged()"/><button v-if="themeConfig['audio-reactive'].colors.length>2" @click="removeThemeColor('audio-reactive',i)" class="u-btn-sm">✕</button></div>
            <button v-if="themeConfig['audio-reactive'].colors.length<4" @click="addThemeColor('audio-reactive')" class="u-btn">+ Couleur</button>
          </div>
          <div v-if="ultimateTheme==='liquid'&&themeConfig.liquid" class="u-config"><h3 class="u-config-title">🫧 Liquid</h3>
            <div class="u-row"><span>Vitesse: {{themeConfig.liquid.speed}}</span><input type="range" min="0.1" max="5" step="0.1" v-model.number="themeConfig.liquid.speed" @input="themeConfigChanged" class="u-range"/></div>
            <div class="u-row"><span>Flou: {{themeConfig.liquid.blurIntensity}}px</span><input type="range" min="10" max="100" step="5" v-model.number="themeConfig.liquid.blurIntensity" @input="themeConfigChanged" class="u-range"/></div>
            <div class="u-row" v-for="(c,i) in themeConfig.liquid.colors" :key="'lq-'+i"><span>Couleur {{i+1}}</span><input type="color" :value="c" @input="themeConfig.liquid.colors[i]=($event.target as HTMLInputElement).value;themeConfigChanged()"/><button v-if="themeConfig.liquid.colors.length>2" @click="removeThemeColor('liquid',i)" class="u-btn-sm">✕</button></div>
            <button v-if="themeConfig.liquid.colors.length<4" @click="addThemeColor('liquid')" class="u-btn">+ Couleur</button>
          </div>
          <div v-if="ultimateTheme==='lofi'&&themeConfig.lofi" class="u-config"><h3 class="u-config-title">☕ Lo-Fi</h3>
            <div class="u-row"><span>Météo</span><select v-model="themeConfig.lofi.weather" @change="themeConfigChanged" class="u-select-sm"><option value="rain">🌧 Pluie</option><option value="snow">❄ Neige</option><option value="clear">☀ Clair</option></select></div>
            <div class="u-row"><span>Intensité: {{themeConfig.lofi.intensity}}</span><input type="range" min="0.1" max="3" step="0.1" v-model.number="themeConfig.lofi.intensity" @input="themeConfigChanged" class="u-range"/></div>
            <div class="u-row"><span>Heure</span><select v-model="themeConfig.lofi.forceTimeOfDay" @change="themeConfigChanged" class="u-select-sm"><option value="auto">Auto</option><option value="day">Jour</option><option value="night">Nuit</option></select></div>
          </div>
          <div v-if="ultimateTheme==='retro-crt'&&themeConfig['retro-crt']" class="u-config"><h3 class="u-config-title">📺 CRT</h3>
            <div class="u-row"><span>Scanlines: {{themeConfig['retro-crt'].scanlineOpacity}}</span><input type="range" min="0" max="1" step="0.05" v-model.number="themeConfig['retro-crt'].scanlineOpacity" @input="themeConfigChanged" class="u-range"/></div>
            <div class="u-row"><span>Glitches: {{themeConfig['retro-crt'].glitchIntensity}}</span><input type="range" min="0" max="1" step="0.01" v-model.number="themeConfig['retro-crt'].glitchIntensity" @input="themeConfigChanged" class="u-range"/></div>
            <div class="u-row"><span>Distortion: {{themeConfig['retro-crt'].distortion}}</span><input type="range" min="0" max="1" step="0.05" v-model.number="themeConfig['retro-crt'].distortion" @input="themeConfigChanged" class="u-range"/></div>
          </div>
          <div v-if="ultimateTheme==='vortex'&&themeConfig.vortex" class="u-config"><h3 class="u-config-title">🌀 Vortex</h3>
            <div class="u-row"><span>Vitesse: {{themeConfig.vortex.speed}}</span><input type="range" min="0.1" max="5" step="0.1" v-model.number="themeConfig.vortex.speed" @input="themeConfigChanged" class="u-range"/></div>
            <div class="u-row"><span>Couleur</span><input type="color" v-model="themeConfig.vortex.color" @input="themeConfigChanged"/></div>
            <div class="u-row"><span>Rotation: {{themeConfig.vortex.cameraRotation}}</span><input type="range" min="0" max="3" step="0.1" v-model.number="themeConfig.vortex.cameraRotation" @input="themeConfigChanged" class="u-range"/></div>
          </div>
          <div class="u-section" style="margin-top:24px"><h3 style="color:#00e676;margin-bottom:12px">🧩 Extensions Chrome</h3>
            <div style="display:flex;gap:10px;margin-bottom:12px"><input type="file" webkitdirectory directory ref="extensionInput" @change="loadChromeExtension" style="display:none"/><button @click="($refs.extensionInput as HTMLInputElement).click()" class="u-btn" style="flex:1">📁 Charger une extension</button></div>
            <p v-if="extensionLoadMessage" :style="{color:extensionLoadError?'#ff4444':'#00e676',fontSize:'13px',marginBottom:'8px'}">{{extensionLoadMessage}}</p>
            <div v-for="ext in extensions" :key="ext.id" class="u-ext-row">
              <div style="flex:1;min-width:0"><p style="margin:0;font-weight:bold;color:#eee;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ext.name}}</p><p style="margin:2px 0 0;font-size:12px;color:#888">v{{ext.version}}</p></div>
              <label class="u-toggle"><input type="checkbox" :checked="ext.enabled" @change="toggleExtension(ext.id,!ext.enabled)"/><span class="u-toggle-slider"></span></label>
              <button v-if="ext.optionsUrl" @click="openExtensionOptions(ext.id)" class="u-btn-sm" style="color:#00e676" title="Paramètres">⚙</button>
              <button @click="removeExtension(ext.id)" class="u-btn-sm" style="color:#ff4444" title="Supprimer">✕</button>
            </div>
            <p v-if="extensions.length===0" style="color:#666;font-size:13px">Aucune extension</p>
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
.u-section { margin-bottom: 16px; }
.u-label { color: #ccc; margin: 0 0 6px; font-size: 14px; font-weight: 500; }
.u-range { width: 100%; cursor: pointer; accent-color: #00e676; }
.u-select, .u-select-sm { padding: 6px 8px; background: #1a1a1a; color: #fff; border: 1px solid #333; border-radius: 4px; outline: none; font-size: 13px; }
.u-select { width: 100%; }
.u-select-sm { min-width: 120px; }
.u-config { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
.u-config-title { color: #00e676; margin: 0 0 10px; font-size: 14px; }
.u-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; color: #ccc; font-size: 13px; }
.u-row input[type="color"] { width: 32px; height: 28px; border: 1px solid #444; border-radius: 4px; background: transparent; cursor: pointer; padding: 0; }
.u-row input[type="checkbox"] { accent-color: #00e676; width: 18px; height: 18px; cursor: pointer; }
.u-btn { background: #222; color: #00e676; border: 1px solid #333; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 12px; }
.u-btn:hover { background: #2a2a2a; }
.u-btn-sm { background: transparent; border: none; color: #888; cursor: pointer; font-size: 16px; padding: 2px 6px; }
.u-btn-sm:hover { color: #ff4444; }
.u-ext-row { display: flex; align-items: center; gap: 10px; padding: 8px; background: #1a1a1a; border-radius: 6px; margin-bottom: 6px; }
.u-toggle { position: relative; width: 40px; height: 22px; flex-shrink: 0; }
.u-toggle input { opacity: 0; width: 0; height: 0; }
.u-toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: #333; border-radius: 22px; transition: 0.2s; }
.u-toggle-slider:before { content: ""; position: absolute; height: 16px; width: 16px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.2s; }
.u-toggle input:checked + .u-toggle-slider { background: #00e676; }
.u-toggle input:checked + .u-toggle-slider:before { transform: translateX(18px); }
</style>
