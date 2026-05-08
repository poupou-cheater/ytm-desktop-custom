class UltimateThemeEngine {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "ultimate-theme-canvas";
    this.canvas.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:0;pointer-events:none;";
    document.body.insertBefore(this.canvas, document.body.firstChild);
    this.bgStyleEl = null;
    this.currentTheme = "none";
    this.isPaused = false;
    this.config = {
      "starry": { topColor: "#000000", bottomColor: "#142b44", starCount: 300, shootingStarCount: 4, showShootingStars: true, animationSpeed: 1.0 },
      "audio-reactive": { bassSensitivity: 1.5, colors: ["#ff0055", "#0044ff", "#ffcc00"], shape: "bars" },
      "liquid": { colors: ["#ff0055", "#0044ff", "#ffcc00"], speed: 1.0, blurIntensity: 40 },
      "lofi": { weather: "rain", intensity: 1.0, forceTimeOfDay: "auto" },
      "retro-crt": { scanlineOpacity: 0.3, glitchIntensity: 0.05, distortion: 0.0 },
      "vortex": { speed: 1.0, color: "#00ffff", cameraRotation: 0.0 }
    };

    this._processedShadowRoots = new WeakSet();
    this._cleanupTimeout = null;

    window.addEventListener("resize", () => this.resizeCanvas());
    this.resizeCanvas();
    window.addEventListener("message", event => {
      if (event.data && event.data.type === "ULTIMATE_APP_STATE") {
        this.isPaused = event.data.state === "background" || event.data.state === "minimized";
      }
    });
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  updateConfig(newConfig) {
    if (newConfig) {
      for (var key in newConfig) {
        if (!this.config[key]) this.config[key] = {};
        for (var prop in newConfig[key]) {
          this.config[key][prop] = newConfig[key][prop];
        }
      }
    }

    if (this._activeExternalTheme && this.currentTheme !== "none") {
      var cfg = this.config[this.currentTheme] || this._activeExternalTheme.defaults || {};
      if (typeof this._activeExternalTheme.updateConfig === "function") {
        this._activeExternalTheme.updateConfig(cfg);
      }
    }
  }

  setTheme(themeName) {
    if (this._activeExternalTheme && this._activeExternalTheme.destroy) {
      this._activeExternalTheme.destroy();
      this._activeExternalTheme = null;
    }
    this.currentTheme = themeName;
    this._pendingTheme = null;
    this.cleanupStarryDOM();

    if (this.currentTheme === "none") {
      this.canvas.style.display = "none";
      this.removeThemeBackground();
      return;
    }

    this.injectThemeBackground();

    if (window.__themeRegistry && window.__themeRegistry.has(themeName)) {
      var extTheme = window.__themeRegistry.get(themeName);
      this._activeExternalTheme = extTheme;
      this.canvas.style.display = "none";
      var cfg = this.config[themeName] || extTheme.defaults || {};
      extTheme.init(this.canvas, null, cfg);
      return;
    }
    this._pendingTheme = themeName;
  }

  _onThemeRegistered(themeId) {
    if (this._pendingTheme && this._pendingTheme === themeId) {
      this.setTheme(this._pendingTheme);
    } else if (this.currentTheme === themeId) {
      // Live reload: if the currently active theme is re-registered, re-apply it
      console.log("[Ultimate] Reloading active theme from disk: " + themeId);
      this.setTheme(themeId);
    }
  }

  cleanupStarryDOM() {
    ["ultimate-starry-container", "ultimate-starry-css"].forEach(id => {
      var el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  injectThemeBackground() {
    if (this.bgStyleEl) this.bgStyleEl.remove();
    
    this.bgStyleEl = document.createElement("style");
    this.bgStyleEl.id = "ultimate-theme-bg";
    this.bgStyleEl.textContent = [
      "html,body,ytmusic-app{background:transparent!important;background-color:transparent!important;background-image:none!important}",
      "ytmusic-app *:not(#oneko):not(img):not(video):not(canvas):not(yt-img-shadow):not(ytmusic-thumbnail-renderer):not(.image){background-color:transparent!important;background-image:none!important}",
      "ytmusic-background-overlay-renderer, .background-gradient, ytmusic-browse-response, #browse-page, #content-wrapper, ytmusic-section-list-renderer, ytmusic-immersive-header-renderer{background:transparent!important;background-image:none!important;--ytmusic-background-overlay-background:transparent!important}",
      "ytmusic-player-bar{background:rgba(0,0,0,0.7)!important;backdrop-filter:blur(12px)!important}",
      "ytmusic-nav-bar{background:rgba(0,0,0,0.35)!important;backdrop-filter:blur(8px)!important}",
      "ytmusic-player-queue-item:hover,ytmusic-responsive-list-item-renderer:hover,tp-yt-paper-item:hover{background:rgba(255,255,255,0.06)!important}",
      "ytmusic-app{--ytmusic-general-background-a:transparent!important;--ytmusic-general-background-b:transparent!important;--ytmusic-general-background-c:transparent!important;--ytmusic-background:transparent!important;--ytmusic-color-black1:transparent!important;--ytmusic-color-black2:transparent!important;--ytmusic-color-black3:transparent!important;--ytmusic-color-black4:transparent!important}",
      "ytmusic-mealbar-promo-renderer, ytmusic-statement-banner-renderer, .ytmusic-promoted-sparkles-text-search-renderer, ytmusic-rich-grid-media-ad-renderer, #masthead-ad, .ad-showing .html5-video-container, .ytp-ad-module, .ytp-ad-overlay-container{display:none!important}"
    ].join("");
    document.head.appendChild(this.bgStyleEl);

    // Surgical MutationObserver
    if (this._bgObserver) this._bgObserver.disconnect();
    
    this._bgObserver = new MutationObserver(mutations => {
      let shouldCleanup = false;
      for (let i = 0; i < mutations.length; i++) {
        const mutation = mutations[i];
        if (mutation.addedNodes.length) {
          shouldCleanup = true;
          for (let j = 0; j < mutation.addedNodes.length; j++) {
            const node = mutation.addedNodes[j];
            if (node.nodeType === 1) this._processNode(node);
          }
        }
      }
      if (shouldCleanup) this._scheduleCleanup();
    });

    this._bgObserver.observe(document.body, { childList: true, subtree: true });
    
    // Initial surgical pass
    this._processNode(document.body);
    this._scheduleCleanup(0);

    document.addEventListener("yt-navigate-finish", () => this._scheduleCleanup(50));
  }

  _processNode(node) {
    if (node.shadowRoot) {
      this._injectShadowStyles(node.shadowRoot);
    }
    // Non-recursive scan for existing shadow roots in children
    const elementsWithShadow = node.querySelectorAll && node.querySelectorAll("*");
    if (elementsWithShadow) {
      for (let i = 0; i < elementsWithShadow.length; i++) {
        const el = elementsWithShadow[i];
        if (el.shadowRoot) this._injectShadowStyles(el.shadowRoot);
      }
    }
  }

  _injectShadowStyles(shadowRoot) {
    if (this._processedShadowRoots.has(shadowRoot)) return;
    
    const css = 
      "*:not(#oneko):not(img):not(video):not(canvas):not(yt-img-shadow):not(.image){background-color:transparent!important;background-image:none!important}" +
      ":host{background:transparent!important;--ytmusic-background-overlay-background:transparent!important}" +
      "#sliderBar, #progressContainer{background:rgba(255,255,255,0.2)!important;height:2px!important}" +
      "#primaryProgress, .slider-knob-inner{background:#fff!important}" +
      "#secondaryProgress{background:rgba(255,255,255,0.15)!important}";

    const s = document.createElement("style");
    s.textContent = css;
    shadowRoot.appendChild(s);
    this._processedShadowRoots.add(shadowRoot);
    
    // Process nested shadow roots
    const nested = shadowRoot.querySelectorAll("*");
    for (let i = 0; i < nested.length; i++) {
      if (nested[i].shadowRoot) this._injectShadowStyles(nested[i].shadowRoot);
    }
  }

  _scheduleCleanup(delay = 300) {
    if (this._cleanupTimeout) clearTimeout(this._cleanupTimeout);
    this._cleanupTimeout = setTimeout(() => this._runSurgicalCleanup(), delay);
  }

  _runSurgicalCleanup() {
    const fullbleeds = document.querySelectorAll("ytmusic-fullbleed-thumbnail-renderer");
    for (let i = 0; i < fullbleeds.length; i++) fullbleeds[i].remove();

    // Only target elements that are known to set inline backgrounds
    const targets = document.querySelectorAll("ytmusic-background-overlay-renderer, [style*='background'], [style*='--ytmusic']");
    for (let i = 0; i < targets.length; i++) {
      const el = targets[i];
      if (el.id && el.id.startsWith("ultimate")) continue;
      const style = el.getAttribute("style") || "";
      if (style.includes("linear-gradient") || style.includes("--ytmusic-background-overlay-background")) {
        el.style.setProperty("background", "transparent", "important");
        el.style.setProperty("background-image", "none", "important");
        el.style.setProperty("--ytmusic-background-overlay-background", "transparent", "important");
      }
    }
  }

  removeThemeBackground() {
    if (this._bgObserver) this._bgObserver.disconnect();
    if (this.bgStyleEl) this.bgStyleEl.remove();
    this.cleanupStarryDOM();
  }
}

class UltimateUIInjector {
  constructor() {
    this._processedMenus = new WeakSet();
    this.initObserver();
    this.injectLayoutCSS();
  }

  initObserver() {
    // Only watch for elements being added to the popup container (where menus live)
    const observer = new MutationObserver(mutations => {
      for (let mutation of mutations) {
        if (mutation.addedNodes.length) {
          this.replaceDownloadButton();
        }
      }
    });

    // Find the popup container or wait for it
    const startObserving = () => {
      const container = document.querySelector("ytmusic-popup-container");
      if (container) {
        observer.observe(container, { childList: true, subtree: true });
      } else {
        setTimeout(startObserving, 1000);
      }
    };
    startObserving();
  }

  replaceDownloadButton() {
    const menus = document.querySelectorAll("ytmusic-menu-popup-renderer:not(.ultimate-processed)");
    menus.forEach(menu => {
      menu.classList.add("ultimate-processed");
      const items = menu.querySelectorAll("ytmusic-menu-navigation-item-renderer");
      items.forEach(btn => {
        const txt = btn.querySelector("yt-formatted-string");
        if (txt && txt.textContent && txt.textContent.toLowerCase().includes("t\u00e9l\u00e9charger")) {
          btn.style.display = "none";
          if (!menu.querySelector(".ultimate-dl-btn")) {
            this.createCustomButton(menu, btn);
          }
        }
      });
    });
  }

  createCustomButton(parent, sibling) {
    const cb = document.createElement("div");
    cb.className = "ultimate-dl-btn style-scope ytmusic-menu-popup-renderer";
    cb.style.cssText = "padding:12px 16px;cursor:pointer;display:flex;align-items:center;color:#00e676;font-weight:bold;font-size:14px;";
    cb.innerHTML = '<svg style="width:24px;height:24px;margin-right:16px;fill:#00e676" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg> Installer Hors-Ligne (Ultimate)';
    
    cb.onclick = () => {
      if (window.ultimateAPI) {
        window.ultimateAPI.downloadTrack(window.location.href, "C:\\Downloads\\YTM_Ultimate", "mp3");
        cb.lastChild.textContent = " T\u00e9l\u00e9chargement initi\u00e9...";
        setTimeout(() => cb.lastChild.textContent = " Installer Hors-Ligne (Ultimate)", 2000);
      }
    };
    parent.insertBefore(cb, sibling.nextSibling);
  }

  injectLayoutCSS() {
    const style = document.createElement("style");
    style.textContent = `
      body.ultimate-fullscreen ytmusic-player-page{display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:center!important}
      body.ultimate-fullscreen #main-panel.ytmusic-player-page{width:100vw!important;height:70vh!important;display:flex!important;align-items:center!important;justify-content:center!important}
      body.ultimate-fullscreen #song-image.ytmusic-player{width:80vmin!important;height:80vmin!important;border-radius:20px!important;box-shadow:0 20px 50px rgba(0,0,0,0.5)!important}
      body.ultimate-fullscreen ytmusic-player-bar{height:30vh!important;background:transparent!important;flex-direction:column!important;justify-content:center!important;padding-bottom:5vh!important}
      body.ultimate-fullscreen .left-controls.ytmusic-player-bar,body.ultimate-fullscreen .middle-controls.ytmusic-player-bar,body.ultimate-fullscreen .right-controls.ytmusic-player-bar{width:90vw!important;justify-content:center!important}
      body.ultimate-fullscreen .title.ytmusic-player-bar{font-size:2.5em!important;text-align:center!important;margin-bottom:10px!important}
      body.ultimate-fullscreen .byline.ytmusic-player-bar{font-size:1.5em!important;text-align:center!important}
    `;
    document.head.appendChild(style);
  }
}

(function () {
  if (!window.__themeRegistry) {
    window.__themeRegistry = {
      _themes: {},
      register: function (theme) {
        this._themes[theme.id] = theme;
        if (window.__ultimateTheme) window.__ultimateTheme._onThemeRegistered(theme.id);
      },
      get: function (id) { return this._themes[id] || null; },
      list: function () {
        return Object.values(this._themes).map(t => ({ id: t.id, name: t.name, schema: t.schema || [], defaults: t.defaults || {} }));
      },
      has: function (id) { return !!this._themes[id]; }
    };
  }

  if (!window._utAdBlockInstalled) {
    const origFetch = window.fetch;
    window.fetch = function (input, init) {
      return origFetch.apply(this, arguments).then(response => {
        const url = typeof input === "string" ? input : input?.url || "";
        if (url.includes("/youtubei/v1/player")) {
          return response.clone().text().then(body => {
            try {
              const json = JSON.parse(body);
              ["adPlacements", "playerAds", "adSlots", "adBreakParams", "adBreakHeartbeatParams"].forEach(k => delete json[k]);
              if (json.playbackTracking) {
                ["ptrackingUrl", "qoeUrl", "atrUrl"].forEach(k => {
                  if (json.playbackTracking[k]?.baseUrl?.includes("adformat")) delete json.playbackTracking[k];
                });
              }
              return new Response(JSON.stringify(json), { status: response.status, statusText: response.statusText, headers: response.headers });
            } catch (e) { return response; }
          });
        }
        return response;
      });
    };

    const blockAdDOM = () => {
      const movie = document.querySelector(".html5-video-player");
      if (movie?.classList.contains("ad-showing")) {
        const video = document.querySelector("video");
        if (video && video.duration < 300) {
          video.currentTime = video.duration;
          video.muted = true;
        }
        document.querySelector(".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button")?.click();
      }
    };
    setInterval(blockAdDOM, 1000);
    window._utAdBlockInstalled = true;
  }

  new UltimateUIInjector();
  window.__ultimateTheme = new UltimateThemeEngine();
})();

