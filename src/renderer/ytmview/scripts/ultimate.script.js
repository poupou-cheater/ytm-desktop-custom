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
        else { this.lastFrameTime = performance.now(); this.renderLoop(performance.now()); }
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
    this.currentTheme = themeName;
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
    if (themeName === "starry") {
      this.canvas.style.display = "none";
      this.initStarryDOM();
      return;
    }
    this.canvas.style.display = "block";
    if (themeName === "vortex") {
      this.gl = this.canvas.getContext("webgl", { antialias: false, alpha: true });
      this.initWebGL();
    } else {
      this.ctx = this.canvas.getContext("2d");
      if (themeName === "audio-reactive") this.setupAudioAnalysis();
      if (themeName === "liquid") this.initLiquid();
      if (themeName === "lofi") this.initLofi();
    }
    this.startTime = performance.now();
    this.lastFrameTime = performance.now();
    if (!this.isPaused) this.renderLoop(performance.now());
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
      // 1. Kill backgrounds — use background-color only (not shorthand) to preserve extension sprites
      "html,body,ytmusic-app{background-color:transparent!important;background-image:none!important}",
      "ytmusic-app *:not(#oneko):not(img):not(video):not(canvas){background-color:transparent!important}",
      // 2. Kill background-image on YTM-specific elements (gradients, overlays)
      "ytmusic-browse-response,ytmusic-browse-response *:not(img)," +
      "ytmusic-section-list-renderer,ytmusic-section-list-renderer *:not(img)," +
      "ytmusic-shelf-renderer,ytmusic-carousel-shelf-renderer," +
      "ytmusic-immersive-header-renderer,ytmusic-header-renderer," +
      "ytmusic-tabbed-search-results-renderer,ytmusic-chip-cloud-renderer," +
      "#browse-page,#content,#contents,#header," +
      ".fullbleed,.background-gradient," +
      "ytmusic-background-overlay-renderer{background-image:none!important;background:transparent!important}",
      // 3. Restore OUR starry container gradient
      "#ultimate-starry-container{background:var(--ut-bg)!important}",
      // 4. Player bar: dark blur for readability
      "ytmusic-player-bar{background:rgba(0,0,0,0.7)!important;backdrop-filter:blur(12px)!important}",
      // 5. Nav bar
      "ytmusic-nav-bar{background:rgba(0,0,0,0.35)!important;backdrop-filter:blur(8px)!important}",
      // 6. Hover states
      "ytmusic-player-queue-item:hover,ytmusic-responsive-list-item-renderer:hover,tp-yt-paper-item:hover{background:rgba(255,255,255,0.06)!important}",
      // 7. Neko cat — protect extension elements
      "#oneko{background-image:var(--oneko-bg)!important}",
      // 8. YTM CSS custom properties
      "ytmusic-app{--ytmusic-general-background-a:transparent!important;--ytmusic-general-background-b:transparent!important;--ytmusic-general-background-c:transparent!important;--ytmusic-background:transparent!important;--ytmusic-color-black1:transparent!important;--ytmusic-color-black2:transparent!important;--ytmusic-color-black3:transparent!important;--ytmusic-color-black4:transparent!important}",
      // 9. Hide YTM ads
      "ytmusic-mealbar-promo-renderer{display:none!important}",
      "ytmusic-statement-banner-renderer{display:none!important}",
      ".ytmusic-promoted-sparkles-text-search-renderer{display:none!important}",
      "ytmusic-rich-grid-media-ad-renderer{display:none!important}",
      "#masthead-ad{display:none!important}",
      ".ad-showing .html5-video-container{display:none!important}",
      ".ytp-ad-module{display:none!important}",
      ".ytp-ad-overlay-container{display:none!important}",
      "tp-yt-paper-dialog.ytmusic-popup-container{display:none!important}"
    ].join("");
    document.head.appendChild(this.bgStyleEl);

    // Periodically strip inline backgrounds + inject into shadow DOMs
    var self = this;
    this._bgInterval = setInterval(function() {
      self._stripInlineBackgrounds();
      self._injectShadowDOMStyles();
    }, 1500);
    setTimeout(function() { self._stripInlineBackgrounds(); self._injectShadowDOMStyles(); }, 300);
    setTimeout(function() { self._stripInlineBackgrounds(); self._injectShadowDOMStyles(); }, 1000);
    setTimeout(function() { self._stripInlineBackgrounds(); self._injectShadowDOMStyles(); }, 3000);
    setTimeout(function() { self._injectShadowDOMStyles(); }, 5000);

    console.log("[Ultimate] Background transparency + ad hide injected");
  }
  _injectShadowDOMStyles() {
    // Inject transparency + slider restore into every shadow root
    var css = "*:not(#oneko):not(img):not(video):not(canvas){background-color:transparent!important}" +
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
      // Skip SVG elements
      if (el.tagName === "svg" || el.tagName === "SVG" || (el.closest && el.closest("svg"))) continue;
      var s = el.getAttribute("style") || "";
      if (s.indexOf("background") !== -1) {
        // Don't touch elements with only CSS custom properties
        if (s.indexOf("--") !== -1 && s.indexOf("background:") === -1 && s.indexOf("background-image:") === -1) continue;
        // Only strip background-color and background (leave background-image for extensions)
        el.style.setProperty("background-color", "transparent", "important");
        // Strip background-image only if it's a gradient (YTM overlays)
        var bgImg = el.style.backgroundImage || "";
        if (bgImg.indexOf("gradient") !== -1) {
          el.style.setProperty("background-image", "none", "important");
        }
        // Strip shorthand background only if it contains gradient
        var bg = el.style.background || "";
        if (bg.indexOf("gradient") !== -1 || bg.indexOf("rgb") !== -1) {
          el.style.setProperty("background", "transparent", "important");
        }
      }
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
  renderLoop(timestamp) {
    if (this.isPaused) return;
    this.animationFrameId = requestAnimationFrame(this.renderLoop.bind(this));
    var elapsed = timestamp - this.lastFrameTime;
    var interval = 1000 / this.fpsLimit;
    if (elapsed < interval) return;
    this.lastFrameTime = timestamp - (elapsed % interval);
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      switch(this.currentTheme) {
        case "audio-reactive": this.drawAudioReactive(); break;
        case "liquid": this.drawLiquid(timestamp); break;
        case "lofi": this.drawLofi(); break;
        case "retro-crt": this.drawCRT(); break;
      }
    } else if (this.gl) {
      if (this.currentTheme === "vortex") this.drawVortex(timestamp);
    }
  }
  setupAudioAnalysis() {
    if (!this.audioCtx) {
      var vid = document.querySelector("video");
      if (vid) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        var src = this.audioCtx.createMediaElementSource(vid);
        src.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      }
    }
  }
  hexToRgb(hex) {
    var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return {r:r,g:g,b:b};
  }
  initStarryDOM() {
    var c = this.config.starry;
    var speed = c.animationSpeed || 1.0;
    // Drift duration: speed 1 = 600s, speed 10 = 60s (very subtle)
    var driftDuration = Math.max(30, Math.round(600 / speed));
    var twinkleDur = Math.max(2, Math.round(5 / speed));
    // Inject CSS
    var style = document.createElement("style");
    style.id = "ultimate-starry-css";
    style.textContent = [
      // Slow diagonal drift — stars move left and slightly up, then reset seamlessly
      "@keyframes ut-sky-drift{0%{transform:translate(0,0)}100%{transform:translate(-25%,-8%)}}",
      // Twinkle
      "@keyframes ut-twinkle1{0%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}20%{box-shadow:0 0 0 0 transparent}60%{box-shadow:0 0 0 0 transparent}80%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}100%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}}",
      "@keyframes ut-twinkle2{0%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}20%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}40%{box-shadow:0 0 0 0 transparent}80%{box-shadow:0 0 0 0 transparent}100%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}}",
      "@keyframes ut-twinkle3{0%{box-shadow:0 0 0 0 transparent}20%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}60%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}80%{box-shadow:0 0 0 0 transparent}100%{box-shadow:0 0 0 0 transparent}}",
      "@keyframes ut-twinkle4{0%{box-shadow:0 0 0 0 transparent}40%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}60%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}80%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}100%{box-shadow:0 0 0 0 transparent}}",
      // Shooting star
      "@keyframes ut-shooting{0%{transform:rotate(315deg) translateX(0);opacity:1}70%{opacity:1}100%{transform:rotate(315deg) translateX(-1500px);opacity:0}}",
      ".ut-shooting-star{position:absolute;width:4px;height:4px;background:#fff;border-radius:50%;animation:ut-shooting 3s linear;left:initial;z-index:2;box-shadow:0 0 0 4px rgba(255,255,255,0.1),0 0 0 8px rgba(255,255,255,0.1),0 0 20px rgba(255,255,255,0.1)}",
      ".ut-shooting-star::before{content:'';position:absolute;top:50%;transform:translateY(-50%);width:300px;height:1px;background:linear-gradient(90deg,#fff,transparent)}",
      "#ultimate-starry-container{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;overflow:hidden}"
    ].join("");
    document.head.appendChild(style);
    // Outer container = gradient background via CSS var (restore rule uses --ut-bg)
    var container = document.createElement("div");
    container.id = "ultimate-starry-container";
    var gradient = "linear-gradient(180deg," + (c.topColor || "#000000") + " 0%," + (c.bottomColor || "#142b44") + " 100%)";
    container.style.setProperty("--ut-bg", gradient);
    container.style.setProperty("background", gradient, "important");
    document.body.insertBefore(container, document.body.firstChild);
    // Drifting star field — oversized so drift doesn't show edges
    var field = document.createElement("div");
    field.style.cssText = "position:absolute;top:-15%;left:-5%;width:140%;height:130%;animation:ut-sky-drift "+driftDuration+"s linear infinite";
    container.appendChild(field);
    // Place ALL stars within the field (they'll all be visible since field covers viewport)
    var count = c.starCount || 300;
    for (var i = 0; i < count; i++) {
      var size = Math.random() < 0.6 ? 1 : (Math.random() < 0.85 ? 2 : 3);
      var star = document.createElement("div");
      star.style.position = "absolute";
      star.style.left = (Math.random() * 100).toFixed(2) + "%";
      star.style.top = (Math.random() * 100).toFixed(2) + "%";
      star.style.width = size + "px";
      star.style.height = size + "px";
      star.style.backgroundColor = "#fff";
      star.style.borderRadius = "50%";
      star.style.opacity = (0.4 + Math.random() * 0.6).toFixed(2);
      if (Math.random() < 0.2) {
        star.style.setProperty("animation", "ut-twinkle"+(Math.floor(Math.random()*4)+1)+" "+twinkleDur+"s infinite", "important");
      }
      field.appendChild(star);
    }
    // Shooting stars on the container (don't drift)
    var ssCount = c.showShootingStars ? (c.shootingStarCount || 4) : 0;
    for (var s = 0; s < ssCount; s++) this.createShootingStar(container);
    console.log("[Ultimate] Starry: "+count+" stars, "+ssCount+" shooters, drift="+driftDuration+"s");
  }
  createShootingStar(container) {
    var ss = document.createElement("span");
    ss.className = "ut-shooting-star";
    if (Math.random() < 0.75) {
      ss.style.top = "-4px";
      ss.style.right = (Math.random()*90)+"%";
    } else {
      ss.style.top = (Math.random()*50)+"%";
      ss.style.right = "-4px";
    }
    ss.style.animationDuration = (Math.floor(Math.random()*3)+3)+"s";
    ss.style.animationDelay = (Math.floor(Math.random()*7))+"s";
    container.appendChild(ss);
    ss.addEventListener("animationend", function() {
      if (Math.random() < 0.75) {
        ss.style.top = "-4px";
        ss.style.right = (Math.random()*90)+"%";
      } else {
        ss.style.top = (Math.random()*50)+"%";
        ss.style.right = "-4px";
      }
      ss.style.animation = "none";
      void ss.offsetWidth;
      ss.style.animation = "";
      ss.style.animationDuration = (Math.floor(Math.random()*4)+3)+"s";
    });
  }
  drawAudioReactive() {
    if (!this.ctx || !this.analyser || !this.dataArray) return;
    var c = this.config["audio-reactive"];
    this.analyser.getByteFrequencyData(this.dataArray);
    var w = this.canvas.width, h = this.canvas.height;
    this.ctx.fillStyle = "#000000";
    this.ctx.fillRect(0,0,w,h);
    var sens = c.bassSensitivity;
    var colors = c.colors && c.colors.length > 0 ? c.colors : ["#ff0055"];
    if (c.shape === "circles") {
      var cx = w/2, cy = h/2;
      var step = Math.PI*2 / this.dataArray.length;
      for (var i = 0; i < this.dataArray.length; i++) {
        var val = (this.dataArray[i]/255) * sens;
        var radius = 50 + val * (h*0.35);
        var angle = i * step;
        var x = cx + Math.cos(angle)*radius;
        var y = cy + Math.sin(angle)*radius;
        var ci = i % colors.length;
        this.ctx.beginPath();
        this.ctx.arc(x, y, Math.max(2, val*6), 0, Math.PI*2);
        this.ctx.fillStyle = colors[ci];
        this.ctx.fill();
      }
    } else {
      var barW = (w / this.dataArray.length) * 2.5;
      var bx = 0;
      for (var i = 0; i < this.dataArray.length; i++) {
        var barH = (this.dataArray[i]/255) * h * sens;
        var ci = i % colors.length;
        this.ctx.fillStyle = colors[ci];
        this.ctx.fillRect(bx, h-barH, barW, barH);
        bx += barW + 1;
      }
    }
  }
  initLiquid() {
    this.blobs = [];
    var c = this.config.liquid;
    var cols = c.colors && c.colors.length >= 2 ? c.colors : ["#ff0055","#0044ff","#ffcc00"];
    for (var i = 0; i < cols.length; i++) {
      this.blobs.push({ x: Math.random()*this.canvas.width, y: Math.random()*this.canvas.height, vx: (Math.random()-0.5)*2, vy: (Math.random()-0.5)*2, radius: Math.random()*200+200, color: cols[i] });
    }
  }
  drawLiquid(time) {
    if (!this.ctx) return;
    var c = this.config.liquid;
    var w = this.canvas.width, h = this.canvas.height;
    var spd = c.speed;
    this.ctx.fillStyle = "#111";
    this.ctx.fillRect(0,0,w,h);
    this.ctx.filter = "blur("+c.blurIntensity+"px) contrast(2)";
    for (var i = 0; i < this.blobs.length; i++) {
      var b = this.blobs[i];
      b.x += b.vx * spd;
      b.y += b.vy * spd;
      if (b.x < 0 || b.x > w) b.vx *= -1;
      if (b.y < 0 || b.y > h) b.vy *= -1;
      this.ctx.beginPath();
      this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI*2);
      this.ctx.fillStyle = b.color;
      this.ctx.fill();
    }
    this.ctx.filter = "none";
  }
  initLofi() {
    this.weatherParticles = [];
    for (var i = 0; i < 500; i++) {
      this.weatherParticles.push({ x: Math.random()*this.canvas.width, y: Math.random()*this.canvas.height, vy: Math.random()*5+2, vx: Math.random()*2-1, size: Math.random()*2+1 });
    }
  }
  drawLofi() {
    if (!this.ctx) return;
    var c = this.config.lofi;
    var w = this.canvas.width, h = this.canvas.height;
    var hour = new Date().getHours();
    var isNight = c.forceTimeOfDay === "night" || (c.forceTimeOfDay === "auto" && (hour > 19 || hour < 7));
    var isDay = c.forceTimeOfDay === "day" || (c.forceTimeOfDay === "auto" && !isNight);
    this.ctx.fillStyle = isDay ? "#ffebd6" : "#0a0a1a";
    this.ctx.fillRect(0,0,w,h);
    var intensity = c.intensity;
    var weather = c.weather;
    if (weather === "rain") {
      this.ctx.strokeStyle = "rgba(150,180,255,0.5)";
      this.ctx.lineWidth = 1;
      for (var i = 0; i < this.weatherParticles.length; i++) {
        var p = this.weatherParticles[i];
        p.y += p.vy * intensity * 2;
        p.x += p.vx * 0.5;
        if (p.y > h) { p.y = 0; p.x = Math.random()*w; }
        this.ctx.beginPath();
        this.ctx.moveTo(p.x, p.y);
        this.ctx.lineTo(p.x - 1, p.y + p.size*5);
        this.ctx.stroke();
      }
    } else if (weather === "snow") {
      this.ctx.fillStyle = "rgba(255,255,255,0.8)";
      for (var i = 0; i < this.weatherParticles.length; i++) {
        var p = this.weatherParticles[i];
        p.y += p.vy * intensity * 0.3;
        p.x += Math.sin(p.y * 0.01) * 0.5;
        if (p.y > h) { p.y = 0; p.x = Math.random()*w; }
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        this.ctx.fill();
      }
    }
  }
  drawCRT() {
    if (!this.ctx) return;
    var c = this.config["retro-crt"];
    var w = this.canvas.width, h = this.canvas.height;
    this.ctx.clearRect(0,0,w,h);
    this.ctx.fillStyle = "rgba(0,0,0,"+c.scanlineOpacity+")";
    for (var i = 0; i < h; i += 4) this.ctx.fillRect(0,i,w,2);
    if (Math.random() < c.glitchIntensity) {
      this.ctx.fillStyle = "rgba(255,255,255,"+(Math.random()*0.15)+")";
      this.ctx.fillRect(0, Math.random()*h, w, Math.random()*50+10);
    }
    if (c.distortion > 0) {
      this.ctx.fillStyle = "rgba(255,0,0,"+(c.distortion*0.1)+")";
      this.ctx.fillRect(2,0,w,h);
      this.ctx.fillStyle = "rgba(0,255,255,"+(c.distortion*0.1)+")";
      this.ctx.fillRect(-2,0,w,h);
    }
    var grad = this.ctx.createRadialGradient(w/2,h/2,h/4,w/2,h/2,w);
    grad.addColorStop(0,"transparent");
    grad.addColorStop(1,"rgba(0,0,0,0.8)");
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0,0,w,h);
  }
  initWebGL() {
    if (!this.gl) return;
    var gl = this.gl;
    var vs = "attribute vec2 position; void main(){gl_Position=vec4(position,0.0,1.0);}";
    var fs = "precision highp float;uniform vec2 u_res;uniform float u_time;uniform vec3 u_col;uniform float u_speed;uniform float u_rot;" +
      "void main(){vec2 p=(gl_FragCoord.xy*2.0-u_res)/min(u_res.x,u_res.y);" +
      "float a=atan(p.y,p.x)+u_rot*u_time*0.1;float r=length(p);" +
      "float u=1.0/r+u_time*u_speed;float v=a/3.14159;" +
      "float tex=sin(u*10.0)*sin(v*10.0);" +
      "vec3 col=u_col*tex*r;gl_FragColor=vec4(col,1.0);}";
    var compile = function(type, src) {
      var s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    var vShader = compile(gl.VERTEX_SHADER, vs);
    var fShader = compile(gl.FRAGMENT_SHADER, fs);
    this.shaderProgram = gl.createProgram();
    if (!this.shaderProgram || !vShader || !fShader) return;
    gl.attachShader(this.shaderProgram, vShader);
    gl.attachShader(this.shaderProgram, fShader);
    gl.linkProgram(this.shaderProgram);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  }
  drawVortex(time) {
    if (!this.gl || !this.shaderProgram) return;
    var gl = this.gl;
    var c = this.config.vortex;
    var col = this.hexToRgb(c.color);
    var t = (time - this.startTime) * 0.001;
    gl.useProgram(this.shaderProgram);
    var pos = gl.getAttribLocation(this.shaderProgram, "position");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    gl.uniform2f(gl.getUniformLocation(this.shaderProgram,"u_res"), this.canvas.width, this.canvas.height);
    gl.uniform1f(gl.getUniformLocation(this.shaderProgram,"u_time"), t);
    gl.uniform1f(gl.getUniformLocation(this.shaderProgram,"u_speed"), c.speed);
    gl.uniform1f(gl.getUniformLocation(this.shaderProgram,"u_rot"), c.cameraRotation);
    gl.uniform3f(gl.getUniformLocation(this.shaderProgram,"u_col"), col.r/255, col.g/255, col.b/255);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
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
  console.log("[Ultimate] Theme engine initializing...");
  new UltimateUIInjector();
  window.__ultimateTheme = new UltimateThemeEngine();
  console.log("[Ultimate] Theme engine ready, canvas injected.");
})();
