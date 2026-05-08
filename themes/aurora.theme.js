/**
 * Aurora Borealis PHOTOREAL Theme — 🌌
 *
 * Basé sur la référence photographique :
 * - Piliers verticaux striés
 * - Base lumineuse intense
 * - Dégradé profond vers le ciel étoilé
 */
(function (registry) {
  if (!registry) {
    console.warn("[AuroraTheme] No theme registry found, skipping");
    return;
  }

  registry.register({
    id: "aurora_photoreal",
    name: "🌌 Aurore Boréale (Photo-Réaliste)",
    defaults: {
      skyTopColor: "#020716", // Bleu nuit très sombre
      skyBottomColor: "#0a2233", // Sarcelle/Bleu profond (cf. image)
      auroraColor1: "#1aff66", // Vert radioactif intense
      auroraColor2: "#00eeff", // Cyan lumineux
      intensity: 1.2,
      rayHeight: 0.6, // Hauteur des rayons (60% de l'écran)
      waveSpeed: 0.8,
      starCount: 250
    },
    schema: [
      { key: "skyTopColor", type: "color", label: "Ciel (Zénith)", default: "#020716" },
      { key: "skyBottomColor", type: "color", label: "Ciel (Horizon)", default: "#0a2233" },
      { key: "auroraColor1", type: "color", label: "Aurore Principale (Vert)", default: "#1aff66" },
      { key: "auroraColor2", type: "color", label: "Aurore Secondaire (Cyan)", default: "#00eeff" },
      { key: "intensity", type: "range", label: "Luminosité Globale", min: 0.1, max: 2, step: 0.1, default: 1.2 },
      { key: "rayHeight", type: "range", label: "Hauteur du rideau", min: 0.2, max: 1, step: 0.05, default: 0.6 },
      { key: "waveSpeed", type: "range", label: "Vitesse d'ondulation", min: 0.1, max: 3, step: 0.1, default: 0.8 },
      { key: "starCount", type: "range", label: "Nombre d'étoiles", min: 0, max: 500, step: 25, default: 250 }
    ],

    _canvas: null,
    _ctx: null,
    _raf: null,
    _stars: null,
    _config: null,
    _startTime: 0,
    _resizeHandler: null,

    init: function (canvas, ctx, config) {
      this.destroy();
      this._config = config || this.defaults;
      this._startTime = performance.now();

      var cv = document.createElement("canvas");
      cv.id = "photoreal-aurora-canvas";
      cv.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:0;pointer-events:none;";
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
      document.body.insertBefore(cv, document.body.firstChild);

      this._canvas = cv;
      this._ctx = cv.getContext("2d", { alpha: false }); // Optimisation

      this._generateStars(this._config.starCount || 250);

      var self = this;
      this._resizeHandler = function () {
        if (self._canvas) {
          self._canvas.width = window.innerWidth;
          self._canvas.height = window.innerHeight;
        }
      };
      window.addEventListener("resize", this._resizeHandler);

      function loop(now) {
        self._raf = requestAnimationFrame(loop);
        self._render((now - self._startTime) / 1000);
      }
      this._raf = requestAnimationFrame(loop);
    },

    _generateStars: function (count) {
      this._stars = [];
      for (var i = 0; i < count; i++) {
        this._stars.push({
          x: Math.random(),
          y: Math.random() * 0.7, // Pas d'étoiles tout en bas
          size: Math.random() * 1.5 + 0.3,
          twinkleSpeed: Math.random() * 2 + 0.5,
          offset: Math.random() * 100
        });
      }
    },

    _hexToRgb: function (hex) {
      var r = parseInt(hex.substr(1, 2), 16);
      var g = parseInt(hex.substr(3, 2), 16);
      var b = parseInt(hex.substr(5, 2), 16);
      return r + "," + g + "," + b;
    },

    _render: function (t) {
      var cv = this._canvas;
      var ctx = this._ctx;
      var c = this._config;
      if (!cv || !ctx) return;

      var w = cv.width;
      var h = cv.height;
      var speed = (c.waveSpeed || 0.8) * 0.2;
      var intensity = c.intensity || 1.2;
      var maxHeight = (c.rayHeight || 0.6) * h;

      // 1. Fond du Ciel
      var skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, c.skyTopColor || "#020716");
      skyGrad.addColorStop(1, c.skyBottomColor || "#0a2233");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. Rendu des Étoiles (Optimisé : fillRect au lieu de arc)
      ctx.fillStyle = "#ffffff";
      for (var i = 0; i < this._stars.length; i++) {
        var s = this._stars[i];
        var twinkle = Math.sin(t * s.twinkleSpeed + s.offset) * 0.4 + 0.6;
        ctx.globalAlpha = twinkle;
        ctx.fillRect(s.x * w, s.y * h, s.size, s.size);
      }
      ctx.globalAlpha = 1.0;

      // 3. Aurore Boréale (Optimisé : Gradient réutilisé)
      var color1 = this._hexToRgb(c.auroraColor1 || "#1aff66");
      var color2 = this._hexToRgb(c.auroraColor2 || "#00eeff");

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      var bands = 2;
      var rayWidth = 4; // Un peu plus large pour gagner en performance

      for (var b = 0; b < bands; b++) {
        var isPrimary = b === 0;
        var rgb = isPrimary ? color1 : color2;
        var baseY = h * 0.75 + b * h * 0.05;

        // On crée UN SEUL dégradé vertical par bande
        var bandGrad = ctx.createLinearGradient(0, 0, 0, -maxHeight);
        bandGrad.addColorStop(0, "rgba(" + rgb + ", 1)");
        bandGrad.addColorStop(0.2, "rgba(" + rgb + ", 0.8)");
        bandGrad.addColorStop(0.6, "rgba(" + rgb + ", 0.2)");
        bandGrad.addColorStop(1, "rgba(" + rgb + ", 0)");

        for (var x = 0; x < w; x += rayWidth) {
          var nx = x / w;

          var wave1 = Math.sin(nx * 3 - t * speed + b) * (h * 0.08);
          var wave2 = Math.cos(nx * 8 + t * speed * 1.5) * (h * 0.03);
          var currentBaseY = baseY + wave1 + wave2;

          var rayNoise = Math.sin(nx * 80 + t * 4) * 0.5 + 0.5;
          var clusterNoise = Math.sin(nx * 10 - t) * 0.5 + 0.5;

          var currentHeight = maxHeight * (0.4 + clusterNoise * 0.4 + rayNoise * 0.2);
          var alpha = (0.1 + clusterNoise * 0.3 + rayNoise * 0.2) * intensity;
          if (isPrimary) alpha *= 1.2;

          ctx.globalAlpha = Math.min(alpha, 1.0);
          ctx.setTransform(1, 0, 0, 1, x, currentBaseY);
          ctx.fillStyle = bandGrad;
          ctx.fillRect(0, 0, rayWidth, -currentHeight);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform

        // Ligne de base (Stroke est okay car hors de la boucle x)
        ctx.beginPath();
        for (var x = 0; x <= w; x += 20) {
          var nx = x / w;
          var wave1 = Math.sin(nx * 3 - t * speed + b) * (h * 0.08);
          var wave2 = Math.cos(nx * 8 + t * speed * 1.5) * (h * 0.03);
          var currentBaseY = baseY + wave1 + wave2;
          if (x === 0) ctx.moveTo(x, currentBaseY);
          else ctx.lineTo(x, currentBaseY);
        }
        ctx.strokeStyle = "rgba(" + rgb + "," + 0.5 * intensity + ")";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.restore();
    },

    updateConfig: function (config) {
      this._config = config || this.defaults;
      var count = this._config.starCount || 250;
      if (!this._stars || this._stars.length !== count) {
        this._generateStars(count);
      }
    },

    destroy: function () {
      if (this._raf) cancelAnimationFrame(this._raf);
      var old = document.getElementById("photoreal-aurora-canvas");
      if (old) old.remove();
      this._canvas = this._ctx = this._stars = this._raf = null;
      if (this._resizeHandler) window.removeEventListener("resize", this._resizeHandler);
    }
  });

  console.log("[AuroraTheme] Registered Photoreal theme with theme registry");
})(window.__themeRegistry);
