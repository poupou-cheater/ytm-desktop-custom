/**
 * Aurora Borealis Theme — 🌌
 *
 * External theme file for NOVA Engine
 * Place in: %APPDATA%/YouTube Music Desktop App/themes/
 *
 * Creates a realistic aurora borealis effect with:
 * - Dark starry sky background
 * - Flowing aurora curtains with green/cyan/purple bands
 * - Smooth sine-wave animation with screen compositing
 * - Bright edge glow on each curtain
 *
 * Config keys: skyTopColor, skyBottomColor, auroraColor1-3, intensity, speed, starCount, bandCount
 */
(function(registry) {
  if (!registry) {
    console.warn("[AuroraTheme] No theme registry found, skipping");
    return;
  }

  registry.register({
    id: "aurora",
    name: "🌌 Aurore Boréale",
    defaults: {
      skyTopColor: "#000510",
      skyBottomColor: "#0a1628",
      auroraColor1: "#00ff87",
      auroraColor2: "#00bcd4",
      auroraColor3: "#7c4dff",
      intensity: 1.0,
      speed: 1.0,
      starCount: 200,
      bandCount: 5
    },
    schema: [
      { key: "skyTopColor", type: "color", label: "Ciel (haut)", default: "#000510" },
      { key: "skyBottomColor", type: "color", label: "Ciel (bas)", default: "#0a1628" },
      { key: "auroraColor1", type: "color", label: "Aurore — Vert", default: "#00ff87" },
      { key: "auroraColor2", type: "color", label: "Aurore — Cyan", default: "#00bcd4" },
      { key: "auroraColor3", type: "color", label: "Aurore — Violet", default: "#7c4dff" },
      { key: "intensity", type: "range", label: "Intensité", min: 0.1, max: 2, step: 0.1, default: 1.0 },
      { key: "speed", type: "range", label: "Vitesse", min: 0.1, max: 3, step: 0.1, default: 1.0 },
      { key: "starCount", type: "range", label: "Étoiles", min: 0, max: 500, step: 25, default: 200 },
      { key: "bandCount", type: "range", label: "Bandes d'aurore", min: 2, max: 10, step: 1, default: 5 }
    ],

    _canvas: null,
    _ctx: null,
    _raf: null,
    _stars: null,
    _config: null,
    _startTime: 0,
    _resizeHandler: null,

    init: function(canvas, ctx, config) {
      this.destroy();
      var c = config || this.defaults;
      this._config = c;
      this._startTime = performance.now();

      // Dedicated canvas
      var cv = document.createElement("canvas");
      cv.id = "ultimate-aurora-canvas";
      cv.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:0;pointer-events:none;";
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
      document.body.insertBefore(cv, document.body.firstChild);
      this._canvas = cv;
      this._ctx = cv.getContext("2d");

      // Generate stars
      this._generateStars(c.starCount || 200);

      // Resize handler
      var self = this;
      this._resizeHandler = function() {
        if (self._canvas) {
          self._canvas.width = window.innerWidth;
          self._canvas.height = window.innerHeight;
        }
      };
      window.addEventListener("resize", this._resizeHandler);

      // Animation loop
      function loop(now) {
        self._raf = requestAnimationFrame(loop);
        self._render((now - self._startTime) / 1000);
      }
      this._raf = requestAnimationFrame(loop);
      console.log("[AuroraTheme] Initialized: " + (c.starCount || 200) + " stars, " + (c.bandCount || 5) + " bands");
    },

    _generateStars: function(count) {
      this._stars = [];
      for (var i = 0; i < count; i++) {
        this._stars.push({
          x: Math.random(),
          y: Math.random(),
          size: Math.random() * 1.5 + 0.5,
          brightness: Math.random() * 0.5 + 0.5,
          twinkleSpeed: Math.random() * 2 + 1
        });
      }
    },

    _hexToRgb: function(hex) {
      var r = parseInt(hex.substr(1, 2), 16);
      var g = parseInt(hex.substr(3, 2), 16);
      var b = parseInt(hex.substr(5, 2), 16);
      return [r, g, b];
    },

    _render: function(t) {
      var cv = this._canvas;
      var ctx = this._ctx;
      var c = this._config;
      if (!cv || !ctx) return;

      var w = cv.width;
      var h = cv.height;
      var speed = (c.speed || 1) * 0.3;
      var intensity = c.intensity || 1;
      var bandCount = c.bandCount || 5;

      // Sky gradient
      var skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, c.skyTopColor || "#000510");
      skyGrad.addColorStop(1, c.skyBottomColor || "#0a1628");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Stars
      if (this._stars) {
        for (var i = 0; i < this._stars.length; i++) {
          var s = this._stars[i];
          var twinkle = Math.sin(t * s.twinkleSpeed + i) * 0.3 + 0.7;
          ctx.beginPath();
          ctx.arc(s.x * w, s.y * h, s.size, 0, 6.2832);
          ctx.fillStyle = "rgba(255,255,255," + (s.brightness * twinkle).toFixed(2) + ")";
          ctx.fill();
        }
      }

      // Aurora colors
      var colors = [
        this._hexToRgb(c.auroraColor1 || "#00ff87"),
        this._hexToRgb(c.auroraColor2 || "#00bcd4"),
        this._hexToRgb(c.auroraColor3 || "#7c4dff")
      ];
      var hexColors = [
        c.auroraColor1 || "#00ff87",
        c.auroraColor2 || "#00bcd4",
        c.auroraColor3 || "#7c4dff"
      ];

      // Aurora bands
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      var segments = 14;

      for (var b = 0; b < bandCount; b++) {
        var phase = b * 1.7 + t * speed;
        var yBase = h * (0.12 + b * 0.055);
        var ci = b % colors.length;
        var rgb = colors[ci];
        var bandAlpha = (0.07 + Math.sin(t * 0.5 + b * 0.8) * 0.035) * intensity;
        var bandHeight = h * (0.3 + Math.sin(t * 0.3 + b) * 0.1);

        // Build curtain path
        var points = [];
        for (var s = 0; s <= segments; s++) {
          var px = (s / segments) * w;
          var wave1 = Math.sin(s * 0.8 + phase) * h * 0.08;
          var wave2 = Math.sin(s * 1.3 + phase * 1.5 + b * 2) * h * 0.05;
          var wave3 = Math.sin(s * 0.4 + phase * 0.7) * h * 0.03;
          points.push({ x: px, y: yBase + wave1 + wave2 + wave3 });
        }

        // Fill curtain
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (var s = 0; s < points.length; s++) {
          if (s === 0) {
            ctx.lineTo(points[s].x, points[s].y);
          } else {
            var cpx = (points[s - 1].x + points[s].x) / 2;
            ctx.quadraticCurveTo(cpx, points[s].y - h * 0.015, points[s].x, points[s].y);
          }
        }
        ctx.lineTo(w, h);
        ctx.closePath();

        var grad = ctx.createLinearGradient(0, yBase - bandHeight * 0.5, 0, yBase + bandHeight);
        var rs = rgb[0] + "," + rgb[1] + "," + rgb[2];
        grad.addColorStop(0, "rgba(" + rs + ",0)");
        grad.addColorStop(0.25, "rgba(" + rs + "," + (bandAlpha * 0.5).toFixed(3) + ")");
        grad.addColorStop(0.45, "rgba(" + rs + "," + bandAlpha.toFixed(3) + ")");
        grad.addColorStop(0.7, "rgba(" + rs + "," + (bandAlpha * 0.3).toFixed(3) + ")");
        grad.addColorStop(1, "rgba(" + rs + ",0)");
        ctx.fillStyle = grad;
        ctx.fill();

        // Bright edge glow
        ctx.beginPath();
        for (var s = 0; s < points.length; s++) {
          if (s === 0) ctx.moveTo(points[s].x, points[s].y);
          else {
            var cpx = (points[s - 1].x + points[s].x) / 2;
            ctx.quadraticCurveTo(cpx, points[s].y - h * 0.015, points[s].x, points[s].y);
          }
        }
        ctx.strokeStyle = "rgba(" + rs + "," + Math.min(bandAlpha * 2.5, 0.5).toFixed(3) + ")";
        ctx.lineWidth = 1.5;
        ctx.shadowColor = hexColors[ci];
        ctx.shadowBlur = 18 * intensity;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    },

    updateConfig: function(config) {
      this._config = config || this.defaults;
      var count = this._config.starCount || 200;
      if (!this._stars || this._stars.length !== count) {
        this._generateStars(count);
      }
    },

    destroy: function() {
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = null;
      var old = document.getElementById("ultimate-aurora-canvas");
      if (old) old.remove();
      this._canvas = null;
      this._ctx = null;
      this._stars = null;
      if (this._resizeHandler) window.removeEventListener("resize", this._resizeHandler);
      this._resizeHandler = null;
    },

    resize: function(w, h) {
      if (this._canvas) {
        this._canvas.width = w;
        this._canvas.height = h;
      }
    }
  });

  console.log("[AuroraTheme] Registered with theme registry");
})(window.__themeRegistry);
