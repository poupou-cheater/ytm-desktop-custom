export enum TrayIconStyle {
  Auto = 0,
  White = 1,
  Black = 2
}

export type ThemeConfig = {
  starry: {
    skyColor: string;
    animationSpeed: number;
    showShootingStars: boolean;
  };
  "audio-reactive": {
    bassSensitivity: number;
    colors: string[];
    shape: "bars" | "circles";
  };
  liquid: {
    colors: string[];
    speed: number;
    blurIntensity: number;
  };
  lofi: {
    weather: "rain" | "snow" | "clear";
    intensity: number;
    forceTimeOfDay: "auto" | "day" | "night";
  };
  "retro-crt": {
    scanlineOpacity: number;
    glitchIntensity: number;
    distortion: number;
  };
  vortex: {
    speed: number;
    color: string;
    cameraRotation: number;
  };
};

export type UltimateExtensionInfo = {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
  optionsUrl: string | null;
};

export type StoreSchema = {
  metadata: {
    version: 1;
  };
  general: {
    disableHardwareAcceleration: boolean;
    hideToTrayOnClose: boolean;
    showNotificationOnSongChange: boolean;
    startOnBoot: boolean;
    startMinimized: boolean;
  };
  appearance: {
    alwaysShowVolumeSlider: boolean;
    customCSSEnabled: boolean;
    customCSSPath: string | null;
    zoom: number;
    trayIconStyle: TrayIconStyle;
  };
  playback: {
    continueWhereYouLeftOff: boolean;
    continueWhereYouLeftOffPaused: boolean;
    enableSpeakerFill: boolean;
    progressInTaskbar: boolean;
    ratioVolume: boolean;
  };
  integrations: {
    companionServerEnabled: boolean;
    companionServerAuthTokens: string | null; // array[object] | Encrypted for security
    companionServerCORSWildcardEnabled: boolean;
    discordPresenceEnabled: boolean;
    lastFMEnabled: boolean;
  };
  shortcuts: {
    playPause: string;
    next: string;
    previous: string;
    thumbsUp: string;
    thumbsDown: string;
    volumeUp: string;
    volumeDown: string;
  };
  state: {
    lastUrl: string;
    lastPlaylistId: string;
    lastVideoId: string;
    windowBounds: Electron.Rectangle | null;
    windowMaximized: boolean;
  };
  lastfm: {
    api_key: string;
    secret: string;
    token: string | null;
    sessionKey: string | null;
    scrobblePercent: number;
  };
  developer: {
    enableDevTools: boolean;
  };
  ultimate: {
    theme: string;
    opacity: number;
    themeConfig: ThemeConfig | null;
  };
};

export type MemoryStoreSchema = {
  discordPresenceConnectionFailed: boolean;
  shortcutsPlayPauseRegisterFailed: boolean;
  shortcutsNextRegisterFailed: boolean;
  shortcutsPreviousRegisterFailed: boolean;
  shortcutsThumbsUpRegisterFailed: boolean;
  shortcutsThumbsDownRegisterFailed: boolean;
  shortcutsVolumeUpRegisterFailed: boolean;
  shortcutsVolumeDownRegisterFailed: boolean;
  companionServerAuthWindowEnabled: boolean;
  safeStorageAvailable: boolean;
  autoUpdaterDisabled: boolean;
  ytmViewLoadTimedout: boolean;
  ytmViewLoading: boolean;
  ytmViewLoadingError: boolean;
  ytmViewLoadingStatus: string;
  ytmViewUnresponsive: boolean;
  appUpdateAvailable: boolean;
  appUpdateDownloaded: boolean;
  ultimateTheme: string;
  ultimateOpacity: number;
  ultimateThemeConfig: ThemeConfig;
  ultimateFpsLimit: number;
};
