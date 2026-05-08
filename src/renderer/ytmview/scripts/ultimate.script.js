class UltimateThemeEngine {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "ultimate-theme-canvas";
    this.canvas.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:0;pointer-events:none;";
    document.body.insertBefore(this.canvas, document.body.firstChild);
    this.bgStyleEl = null;
    this.ctx = null;
    this.gl = null;
    this.currentTheme = "none";
    this.animationFrameId = 0;
    this.lastFrameTime = 0;
    this.isPaused = false;
    this.fpsLimit = 60;
    this.config = {
      starry: { topColor: "#000000", bottomColor: "#142b44", starCount: 300, shootingStarCount: 4, showShootingStars: true, animationSpeed: 1.0 },
      "audio-reactive": { bassSensitivity: 1.5, colors: ["#ff0055","#0044ff","#ffcc00"], shape: "bars" },
      liquid: { colors: ["#ff0055","#0044ff","#ffcc00"], speed: 1.0, blurIntensity: 40 },
      lofi: { weather: "rain", intensity: 1.0, forceTimeOfDay: "auto" },
      "retro-crt": { scanlineOpacity: 0.3, glitchIntensity: 0.05, distortion: 0.0 },
      vortex: { speed: 1.0, color: "#00ffff", cameraRotation: 0.0 }
    };
    this.audioCtx = null;
    this.analyser = null;
    this.dataArray = null;
    this.stars = [];
    this.shootingStars = [];
    this.blobs = [];
    this.weatherParticles = [];
    this.shaderProgram = null;
    this.startTime = performance.now();
    window.addEventListener("resize", () => this.resizeCanvas());
    this.resizeCanvas();
    window.addEventListener("message", event => {
      if (event.data && event.data.type === "ULTIMATE_APP_STATE") {
        this.isPaused = event.data.state === "background" || event.data.state === "minimized";
        if (this.isPaused) cancelAnimationFrame(this.animationFrameId);
        // External themes manage their own animation loops — no renderLoop call needed
      }
    });
  }
  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }
  updateConfig(newConfig) {
    if (newConfig) {
      for (var key in newConfig) {
        if (this.config[key]) {
          for (var prop in newConfig[key]) {
            this.config[key][prop] = newConfig[key][prop];
          }
        }
      }
    }
    // Rebuild starry DOM if active so changes are visible immediately
    if (this.currentTheme === "starry") {
      this.cleanupStarryDOM();
      this.initStarryDOM();
    }
  }
  setFpsLimit(fps) { this.fpsLimit = fps || 60; }
  setTheme(themeName) {
    // Cleanup previous external theme
    if (this._activeExternalTheme && this._activeExternalTheme.destroy) {
      this._activeExternalTheme.destroy();
      this._activeExternalTheme = null;
    }
    this.currentTheme = themeName;
    this._pendingTheme = null;
    cancelAnimationFrame(this.animationFrameId);
    this.ctx = null;
    this.gl = null;
    this.cleanupStarryDOM();
    if (this.currentTheme === "none") {
      try { var tc = this.canvas.getContext("2d"); if(tc) tc.clearRect(0,0,this.canvas.width,this.canvas.height); } catch(e){}
      this.canvas.style.display = "none";
      this.removeThemeBackground();
      return;
    }
    this.injectThemeBackground();
    // External theme registry only
    if (window.__themeRegistry && window.__themeRegistry.has(themeName)) {
      var extTheme = window.__themeRegistry.get(themeName);
      this._activeExternalTheme = extTheme;
      this.canvas.style.display = "none";
      var cfg = this.config[themeName] || extTheme.defaults || {};
      extTheme.init(this.canvas, null, cfg);
      console.log("[Ultimate] Using external theme: " + themeName);
      return;
    }
    // Theme not yet loaded — mark as pending for retry when themes are injected
    this._pendingTheme = themeName;
    console.log("[Ultimate] Theme '" + themeName + "' pending — waiting for external themes to load...");
  }
  _onThemeRegistered(themeId) {
    // Called when a new theme is registered — retry pending theme if it matches
    if (this._pendingTheme && this._pendingTheme === themeId) {
      console.log("[Ultimate] Pending theme '" + themeId + "' now available, applying...");
      this.setTheme(this._pendingTheme);
    }
  }
  cleanupStarryDOM() {
    var old = document.getElementById("ultimate-starry-container");
    if (old) old.remove();
    var oldStyle = document.getElementById("ultimate-starry-css");
    if (oldStyle) oldStyle.remove();
  }
  injectThemeBackground() {
    if (this.bgStyleEl) { this.bgStyleEl.remove(); this.bgStyleEl = null; }
    var orphan = document.getElementById("ultimate-theme-bg");
    if (orphan) orphan.remove();
    if (this._bgInterval) { clearInterval(this._bgInterval); this._bgInterval = null; }

    this.bgStyleEl = document.createElement("style");
    this.bgStyleEl.id = "ultimate-theme-bg";
    this.bgStyleEl.textContent = [
      // 1. Kill background-color globally — exclude thumbnail/media elements
      "html,body,ytmusic-app{background-color:transparent!important}",
      "ytmusic-app *:not(#oneko):not(img):not(video):not(canvas):not(yt-img-shadow):not(ytmusic-thumbnail-renderer):not(.image){background-color:transparent!important}",
      // 2. Kill background-image ONLY on overlay/gradient containers
      "ytmusic-app,ytmusic-browse-response,ytmusic-section-list-renderer," +
      "ytmusic-immersive-header-renderer,ytmusic-header-renderer," +
      "#browse-page," +
      "ytmusic-background-overlay-renderer{background-image:none!important}",
      // 3. .background-gradient — THE Quick Picks background killer (full background, not just image)
      ".background-gradient,.background-gradient.style-scope," +
      "div.background-gradient.style-scope.ytmusic-browse-response," +
      "ytmusic-browse-response .background-gradient{" +
      "background:transparent!important;background-color:transparent!important;background-image:none!important;" +
      "--ytmusic-background-overlay-background:transparent!important}",
      // 4. ytmusic-background-overlay-renderer — nuke CSS var and direct background
      "ytmusic-background-overlay-renderer{" +
      "background:transparent!important;background-color:transparent!important;background-image:none!important;" +
      "--ytmusic-background-overlay-background:transparent!important}",
      // 5. Quick Picks / carousel / shelf — force transparent
      "ytmusic-carousel-shelf-renderer,ytmusic-carousel-shelf-renderer.fullbleed," +
      "ytmusic-shelf-renderer,.fullbleed," +
      "ytmusic-carousel-shelf-renderer .header-group," +
      "ytmusic-carousel-shelf-basic-header-renderer," +
      "#browse-page #header,#browse-page #content,#browse-page #contents,#content-wrapper," +
      "ytmusic-tabbed-search-results-renderer,ytmusic-chip-cloud-renderer," +
      "ytmusic-single-column-browse-results-renderer{background:transparent!important;background-color:transparent!important;background-image:none!important}",
      // 6. Chip cloud gradient boxes
      ".gradient-box.style-scope.ytmusic-chip-cloud-chip-renderer{background:transparent!important;background-image:none!important}",
      // 7. Restore OUR starry container gradient
      "#ultimate-starry-container{background:var(--ut-bg)!important}",
      // 8. Player bar: dark blur
      "ytmusic-player-bar{background:rgba(0,0,0,0.7)!important;backdrop-filter:blur(12px)!important}",
      // 9. Nav bar
      "ytmusic-nav-bar{background:rgba(0,0,0,0.35)!important;backdrop-filter:blur(8px)!important}",
      // 10. Hover states
      "ytmusic-player-queue-item:hover,ytmusic-responsive-list-item-renderer:hover,tp-yt-paper-item:hover{background:rgba(255,255,255,0.06)!important}",
      // 11. Protect thumbnails — never strip their sizing
      "ytmusic-thumbnail-renderer img,yt-img-shadow img,#song-image img{max-width:100%!important;max-height:100%!important;object-fit:cover!important}",
      "ytmusic-thumbnail-renderer,yt-img-shadow,.image.ytmusic-carousel-shelf-basic-header-renderer{overflow:hidden!important}",
      // 12. YTM CSS custom properties
      "ytmusic-app{--ytmusic-general-background-a:transparent!important;--ytmusic-general-background-b:transparent!important;--ytmusic-general-background-c:transparent!important;--ytmusic-background:transparent!important;--ytmusic-color-black1:transparent!important;--ytmusic-color-black2:transparent!important;--ytmusic-color-black3:transparent!important;--ytmusic-color-black4:transparent!important}",
      // 13. Hide YTM ad UI elements
      "ytmusic-mealbar-promo-renderer{display:none!important}",
      "ytmusic-statement-banner-renderer{display:none!important}",
      ".ytmusic-promoted-sparkles-text-search-renderer{display:none!important}",
      "ytmusic-rich-grid-media-ad-renderer{display:none!important}",
      "#masthead-ad{display:none!important}",
      ".ad-showing .html5-video-container{display:none!important}",
      ".ytp-ad-module{display:none!important}",
      ".ytp-ad-overlay-container{display:none!important}"
    ].join("");
    document.head.appendChild(this.bgStyleEl);

    // Periodically strip inline backgrounds + inject into shadow DOMs
    var self = this;
    this._bgNuking = false;
    this._bgNukeQueued = false;
    this._bgInterval = setInterval(function() {
      if (self._bgNuking) return;
      self._bgNuking = true;
      self._stripInlineBackgrounds();
      self._injectShadowDOMStyles();
      self._nukeQuickPicksBackground();
      self._bgNuking = false;
    }, 800);
    // Early passes — catch backgrounds as they appear
    [200, 500, 1000, 2000, 4000, 6000].forEach(function(ms) {
      setTimeout(function() {
        if (self._bgNuking) return;
        self._bgNuking = true;
        self._stripInlineBackgrounds();
        self._injectShadowDOMStyles();
        self._nukeQuickPicksBackground();
        self._bgNuking = false;
      }, ms);
    });

    // MutationObserver — catch YTM re-applying backgrounds in real time
    // Uses re-entrancy guard + debounce to prevent infinite loop
    // (our nuke modifies styles → triggers observer → which calls nuke again)
    if (this._bgObserver) this._bgObserver.disconnect();
    this._bgObserver = new MutationObserver(function(mutations) {
      if (self._bgNuking) return; // Prevent infinite loop
      var needsNuke = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        var tn = m.target && m.target.tagName ? m.target.tagName.toLowerCase() : "";
        if (m.type === "attributes" && (m.attributeName === "style" || m.attributeName === "class")) {
          if (tn === "ytmusic-browse-response" || tn === "ytmusic-immersive-header-renderer" ||
              tn === "ytmusic-background-overlay-renderer" || tn === "ytmusic-header-renderer" ||
              (m.target.classList && m.target.classList.contains("background-gradient"))) {
            needsNuke = true;
          }
        }
        if (m.type === "childList" && m.addedNodes.length > 0) {
          needsNuke = true;
        }
      }
      if (needsNuke && !self._bgNukeQueued) {
        self._bgNukeQueued = true;
        requestAnimationFrame(function() {
          self._bgNuking = true;
          self._nukeQuickPicksBackground();
          self._bgNuking = false;
          self._bgNukeQueued = false;
        });
      }
    });
    this._bgObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"]
    });

    console.log("[Ultimate] Background transparency injected");
  }
  _installAdBlocker() {
    // Hooks already installed at script load time (see bottom of file)
    // This just sets up the backup DOM-based skip for ads that slip through
    setInterval(function() {
      var movie = document.querySelector(".html5-video-player");
      if (!movie) return;
      if (movie.classList.contains("ad-showing") || movie.classList.contains("ad-interrupting")) {
        var video = document.querySelector("video");
        if (video && video.duration && isFinite(video.duration) && video.duration < 300) {
          video.currentTime = video.duration;
          video.muted = true;
        }
        var skip = document.querySelector(".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button");
        if (skip) skip.click();
      }
    }, 250);
  }
  _injectShadowDOMStyles() {
    // Inject transparency + slider restore into every shadow root
    var css = "*:not(#oneko):not(img):not(video):not(canvas):not(yt-img-shadow):not(.image){background-color:transparent!important}" +
      ":host{background:transparent!important;background-color:transparent!important;--ytmusic-background-overlay-background:transparent!important}" +
      "#sliderBar{background:rgba(255,255,255,0.2)!important;height:2px!important}" +
      "#progressContainer{background:rgba(255,255,255,0.2)!important}" +
      "#primaryProgress{background:#fff!important}" +
      "#secondaryProgress{background:rgba(255,255,255,0.15)!important}" +
      ".slider-knob-inner{background:#fff!important}" +
      "#sliderKnob{background:transparent!important}";
    this._walkShadowRoots(document.body, css);
  }
  _walkShadowRoots(root, css) {
    // Recursively walk DOM and shadow roots
    var children = root.children || root.childNodes;
    if (!children) return;
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      if (!el || !el.tagName) continue;
      if (el.id && el.id.indexOf("ultimate") === 0) continue;
      if (el.shadowRoot && !el.shadowRoot._utInjected) {
        var s = document.createElement("style");
        s.setAttribute("data-ut", "shadow-bg");
        s.textContent = css;
        el.shadowRoot.appendChild(s);
        el.shadowRoot._utInjected = true;
        // Also walk inside this shadow root
        this._walkShadowRoots(el.shadowRoot, css);
      }
      // Recurse into children
      if (el.children && el.children.length > 0) {
        this._walkShadowRoots(el, css);
      }
    }
  }
  _stripInlineBackgrounds() {
    var els = document.querySelectorAll("[style]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      // Skip our own theme elements
      if (el.id && el.id.indexOf("ultimate") === 0) continue;
      if (el.closest && el.closest("#ultimate-starry-container")) continue;
      // Skip neko cat and chrome extension elements
      if (el.id === "oneko") continue;
      if (el.tagName === "IMG" || el.tagName === "VIDEO" || el.tagName === "CANVAS") continue;
      // Skip thumbnail containers — never strip their background (thumbnails use bg-image)
      var tn = el.tagName ? el.tagName.toLowerCase() : "";
      if (tn === "yt-img-shadow" || tn === "ytmusic-thumbnail-renderer") continue;
      if (el.classList && (el.classList.contains("image") || el.classList.contains("thumbnail"))) continue;
      // Skip SVG elements
      if (el.tagName === "svg" || el.tagName === "SVG" || (el.closest && el.closest("svg"))) continue;
      var s = el.getAttribute("style") || "";
      // Strip --ytmusic-background-overlay-background CSS var (Quick Picks overlay)
      if (s.indexOf("--ytmusic-background-overlay-background") !== -1) {
        el.style.setProperty("--ytmusic-background-overlay-background", "transparent", "important");
        el.style.setProperty("background-color", "transparent", "important");
        el.style.setProperty("background", "transparent", "important");
      }
      if (s.indexOf("background") !== -1) {
        // Don't touch elements with only CSS custom properties (except the overlay one we already handled)
        if (s.indexOf("--") !== -1 && s.indexOf("--ytmusic-background-overlay-background") === -1 && s.indexOf("background:") === -1 && s.indexOf("background-image:") === -1) continue;
        // Don't touch elements that have background-size (likely thumbnails with bg-image)
        if (s.indexOf("background-size") !== -1 || s.indexOf("background-position") !== -1) continue;
        // Only strip background-color
        el.style.setProperty("background-color", "transparent", "important");
        // Strip background-image only if it's a gradient (NOT url — url is thumbnails)
        var bgImg = el.style.backgroundImage || "";
        if (bgImg.indexOf("gradient") !== -1) {
          el.style.setProperty("background-image", "none", "important");
        }
      }
    }
  }
  _nukeQuickPicksBackground() {
    // Direct DOM nuke — bypasses all CSS specificity issues
    // 1. .background-gradient divs (the main culprit)
    var grads = document.querySelectorAll(".background-gradient");
    for (var i = 0; i < grads.length; i++) {
      grads[i].style.setProperty("background", "transparent", "important");
      grads[i].style.setProperty("background-color", "transparent", "important");
      grads[i].style.setProperty("background-image", "none", "important");
    }
    // 2. ytmusic-background-overlay-renderer
    var overlays = document.querySelectorAll("ytmusic-background-overlay-renderer");
    for (var i = 0; i < overlays.length; i++) {
      overlays[i].style.setProperty("background", "transparent", "important");
      overlays[i].style.setProperty("background-color", "transparent", "important");
      overlays[i].style.setProperty("background-image", "none", "important");
      overlays[i].style.setProperty("--ytmusic-background-overlay-background", "transparent", "important");
    }
    // 3. #content-wrapper
    var cw = document.querySelectorAll("#content-wrapper");
    for (var i = 0; i < cw.length; i++) {
      cw[i].style.setProperty("background", "transparent", "important");
    }
    // 4. ytmusic-browse-response
    var br = document.querySelectorAll("ytmusic-browse-response");
    for (var i = 0; i < br.length; i++) {
      br[i].style.setProperty("background", "transparent", "important");
      br[i].style.setProperty("background-image", "none", "important");
    }
    // 5. ytmusic-immersive-header-renderer — album/playlist hero gradient
    var immHeaders = document.querySelectorAll("ytmusic-immersive-header-renderer");
    for (var i = 0; i < immHeaders.length; i++) {
      immHeaders[i].style.setProperty("background", "transparent", "important");
      immHeaders[i].style.setProperty("background-color", "transparent", "important");
      immHeaders[i].style.setProperty("background-image", "none", "important");
      // Also nuke the gradient div inside immersive headers
      var inner = immHeaders[i].querySelectorAll(".gradient-container, .background, [class*='gradient']");
      for (var j = 0; j < inner.length; j++) {
        inner[j].style.setProperty("background", "transparent", "important");
        inner[j].style.setProperty("background-image", "none", "important");
      }
    }
    // 6. ytmusic-header-renderer
    var headers = document.querySelectorAll("ytmusic-header-renderer");
    for (var i = 0; i < headers.length; i++) {
      headers[i].style.setProperty("background", "transparent", "important");
      headers[i].style.setProperty("background-image", "none", "important");
    }
    // 7. #header inside browse-response (dynamic gradient)
    var browseHeaders = document.querySelectorAll("ytmusic-browse-response #header");
    for (var i = 0; i < browseHeaders.length; i++) {
      browseHeaders[i].style.setProperty("background", "transparent", "important");
      browseHeaders[i].style.setProperty("background-image", "none", "important");
    }
    // 8. ytmusic-section-list-renderer — sometimes gets background
    var slr = document.querySelectorAll("ytmusic-section-list-renderer");
    for (var i = 0; i < slr.length; i++) {
      slr[i].style.setProperty("background", "transparent", "important");
      slr[i].style.setProperty("background-image", "none", "important");
    }
    // 9. Any element with inline gradient background (catch-all for YTM dynamic styles)
    var gradEls = document.querySelectorAll('[style*="linear-gradient"]:not(#ultimate-starry-container):not(#oneko):not([style*="background-size"])');
    for (var i = 0; i < gradEls.length; i++) {
      var el = gradEls[i];
      if (el.tagName === "IMG" || el.tagName === "VIDEO" || el.tagName === "CANVAS") continue;
      if (el.id && el.id.indexOf("ultimate") === 0) continue;
      el.style.setProperty("background", "transparent", "important");
      el.style.setProperty("background-image", "none", "important");
    }
  }
  removeThemeBackground() {
    if (this._bgInterval) { clearInterval(this._bgInterval); this._bgInterval = null; }
    if (this._bgObserver) { this._bgObserver.disconnect(); this._bgObserver = null; }
    if (this.bgStyleEl) {
      this.bgStyleEl.remove();
      this.bgStyleEl = null;
    }
    this.cleanupStarryDOM();
    console.log("[Ultimate] Background transparency removed");
  }
  // All theme renderers are now external .theme.js files
  // No built-in rendering code — themes register via window.__themeRegistry
}

class UltimateUIInjector {
  constructor() {
    this.initObservers();
    this.injectMobileLayoutCSS();
    document.addEventListener("fullscreenchange", function() {
      document.body.classList.toggle("ultimate-fullscreen", !!document.fullscreenElement);
    });
  }
  initObservers() {
    new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes.length) this.replacePremiumDownloadButton();
      }
    }.bind(this)).observe(document.body, { childList: true, subtree: true });
  }
  replacePremiumDownloadButton() {
    document.querySelectorAll("ytmusic-menu-navigation-item-renderer.style-scope.ytmusic-menu-popup-renderer").forEach(function(btn) {
      var txt = btn.querySelector("yt-formatted-string");
      if (txt && txt.textContent && txt.textContent.toLowerCase().indexOf("t\u00e9l\u00e9charger") !== -1) {
        btn.setAttribute("style","display:none!important");
        if (btn.parentElement && !btn.parentElement.querySelector(".ultimate-dl-btn")) {
          var cb = document.createElement("div");
          cb.className = "ultimate-dl-btn style-scope ytmusic-menu-popup-renderer";
          cb.style.cssText = "padding:12px 16px;cursor:pointer;display:flex;align-items:center;color:#00e676;font-weight:bold;font-family:Roboto,Arial,sans-serif;font-size:14px;";
          var buildContent = function() {
            cb.textContent = "";
            var svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
            svg.setAttribute("style","width:24px;height:24px;margin-right:16px;fill:#00e676");
            svg.setAttribute("viewBox","0 0 24 24");
            var p = document.createElementNS("http://www.w3.org/2000/svg","path");
            p.setAttribute("d","M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z");
            svg.appendChild(p);
            cb.appendChild(svg);
            cb.appendChild(document.createTextNode(" Installer Hors-Ligne (Ultimate)"));
          };
          buildContent();
          cb.addEventListener("click", function() {
            if (window.ultimateAPI) {
              window.ultimateAPI.downloadTrack(window.location.href, "C:\\Downloads\\YTM_Ultimate", "mp3");
              cb.textContent = "T\u00e9l\u00e9chargement initi\u00e9...";
              setTimeout(buildContent, 2000);
            }
          });
          btn.parentElement.insertBefore(cb, btn.nextSibling);
        }
      }
    });
  }
  injectMobileLayoutCSS() {
    var style = document.createElement("style");
    style.id = "ultimate-mobile-layout";
    style.textContent =
      "body.ultimate-fullscreen ytmusic-player-page{display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:center!important}" +
      "body.ultimate-fullscreen #main-panel.ytmusic-player-page{width:100vw!important;height:70vh!important;display:flex!important;align-items:center!important;justify-content:center!important}" +
      "body.ultimate-fullscreen #song-image.ytmusic-player{width:80vmin!important;height:80vmin!important;border-radius:20px!important;box-shadow:0 20px 50px rgba(0,0,0,0.5)!important}" +
      "body.ultimate-fullscreen ytmusic-player-bar{height:30vh!important;background:transparent!important;flex-direction:column!important;justify-content:center!important;padding-bottom:5vh!important}" +
      "body.ultimate-fullscreen .left-controls.ytmusic-player-bar,body.ultimate-fullscreen .middle-controls.ytmusic-player-bar,body.ultimate-fullscreen .right-controls.ytmusic-player-bar{width:90vw!important;justify-content:center!important}" +
      "body.ultimate-fullscreen .title.ytmusic-player-bar{font-size:2.5em!important;text-align:center!important;margin-bottom:10px!important}" +
      "body.ultimate-fullscreen .byline.ytmusic-player-bar{font-size:1.5em!important;text-align:center!important}";
    document.head.appendChild(style);
  }
}

(function() {
  // Theme registry — external .theme.js files register here
  if (!window.__themeRegistry) {
    window.__themeRegistry = {
      _themes: {},
      register: function(theme) {
        this._themes[theme.id] = theme;
        console.log("[ThemeRegistry] Registered theme: " + theme.id + " (" + theme.name + ")");
        // Notify engine of new theme (for pending theme retry)
        if (window.__ultimateTheme && window.__ultimateTheme._onThemeRegistered) {
          window.__ultimateTheme._onThemeRegistered(theme.id);
        }
      },
      get: function(id) { return this._themes[id] || null; },
      list: function() {
        var result = [];
        for (var k in this._themes) {
          var t = this._themes[k];
          result.push({ id: t.id, name: t.name, schema: t.schema || [], defaults: t.defaults || {} });
        }
        return result;
      },
      has: function(id) { return !!this._themes[id]; }
    };
    console.log("[Ultimate] Theme registry created");
  }

  // Install ad blocker hooks IMMEDIATELY — before anything else loads
  if (!window._utAdBlockInstalled) {
    // Hook fetch
    var origFetch = window.fetch;
    window.fetch = function(input, init) {
      var url = (typeof input === "string") ? input : (input && input.url ? input.url : "");
      return origFetch.apply(this, arguments).then(function(response) {
        if (url.indexOf("/youtubei/v1/player") !== -1) {
          return response.clone().text().then(function(body) {
            try {
              var json = JSON.parse(body);
              var stripped = false;
              ["adPlacements", "playerAds", "adSlots", "adBreakParams", "adBreakHeartbeatParams"].forEach(function(key) {
                if (json[key]) { delete json[key]; stripped = true; }
              });
              if (json.playbackTracking) {
                ["ptrackingUrl", "qoeUrl", "atrUrl"].forEach(function(key) {
                  if (json.playbackTracking[key] && json.playbackTracking[key].baseUrl && json.playbackTracking[key].baseUrl.indexOf("adformat") !== -1) {
                    delete json.playbackTracking[key]; stripped = true;
                  }
                });
              }
              if (stripped) console.log("[Ultimate] Ads stripped from player API (fetch)");
              return new Response(JSON.stringify(json), { status: response.status, statusText: response.statusText, headers: response.headers });
            } catch(e) { return response; }
          });
        }
        return response;
      });
    };
    // Hook XHR
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) { this._utUrl = url; return origOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function() {
      var xhr = this;
      if (xhr._utUrl && xhr._utUrl.indexOf("/youtubei/v1/player") !== -1) {
        xhr.addEventListener("readystatechange", function() {
          if (xhr.readyState === 4 && xhr.status === 200) {
            try {
              var json = JSON.parse(xhr.responseText);
              var s = false;
              ["adPlacements", "playerAds", "adSlots", "adBreakParams", "adBreakHeartbeatParams"].forEach(function(k) { if (json[k]) { delete json[k]; s = true; } });
              if (s) {
                Object.defineProperty(xhr, "responseText", { value: JSON.stringify(json), writable: false, configurable: true });
                Object.defineProperty(xhr, "response", { value: JSON.stringify(json), writable: false, configurable: true });
                console.log("[Ultimate] Ads stripped from player API (XHR)");
              }
            } catch(e) {}
          }
        });
      }
      return origSend.apply(this, arguments);
    };
    window._utAdBlockInstalled = true;
    console.log("[Ultimate] API ad blocker hooks installed (early)");
  }

  console.log("[Ultimate] Theme engine initializing...");
  new UltimateUIInjector();
  window.__ultimateTheme = new UltimateThemeEngine();
  console.log("[Ultimate] Theme engine ready, canvas injected.");
  console.log("[Ultimate] External themes available: " + window.__themeRegistry.list().map(function(t) { return t.id; }).join(", ") || "(none yet — loaded after page navigation)");
})();
