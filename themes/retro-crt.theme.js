/**
 * Retro CRT Theme — 📺
 * 
 * External theme file for Ultimate YTM
 * Place in: %APPDATA%/YouTube Music Desktop App/themes/
 * 
 * Old-school CRT monitor effect with scanlines, glitch, and vignette.
 * - Configurable scanline opacity
 * - Random glitch flashes
 * - Chromatic aberration distortion
 * 
 * Config keys: scanlineOpacity, glitchIntensity, distortion
 */
(function(registry) {
  if (!registry) {
    console.warn("[CRTTheme] No theme registry found, skipping");
    return;
  }

  registry.register({
    id: "retro-crt",
    name: "📺 Retro CRT",
    defaults: {
      scanlineOpacity: 0.3,
      glitchIntensity: 0.05,
      distortion: 0.0
    },
    schema: [
      { key: "scanlineOpacity", type: "range", label: "Scanlines", min: 0, max: 1, step: 0.05, default: 0.3 },
      { key: "glitchIntensity", type: "range", label: "Glitch", min: 0, max: 0.5, step: 0.01, default: 0.05 },
      { key: "distortion", type: "range", label: "Distorsion", min: 0, max: 1, step: 0.05, default: 0.0 }
    ],

    // Runtime state
    _canvas: null,
    _ctx: null,
    _animId: null,
    _config: null,

    init: function(canvas, ctx, config) {
      this.destroy();
      this._config = config || this.defaults;
      canvas.style.display = "block";
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      this._canvas = canvas;
      this._ctx = canvas.getContext("2d");
      this._loop();
      console.log("[CRTTheme] Initialized");
    },

    _loop: function() {
      var self = this;
      function frame() {
        self._animId = requestAnimationFrame(frame);
        self._draw();
      }
      self._animId = requestAnimationFrame(frame);
    },

    _draw: function() {
      var ctx = this._ctx;
      if (!ctx) return;
      var c = this._config;
      var w = this._canvas.width, h = this._canvas.height;
      ctx.clearRect(0, 0, w, h);
      // Scanlines
      ctx.fillStyle = "rgba(0,0,0," + c.scanlineOpacity + ")";
      for (var i = 0; i < h; i += 4) ctx.fillRect(0, i, w, 2);
      // Glitch
      if (Math.random() < c.glitchIntensity) {
        ctx.fillStyle = "rgba(255,255,255," + (Math.random() * 0.15) + ")";
        ctx.fillRect(0, Math.random() * h, w, Math.random() * 50 + 10);
      }
      // Chromatic aberration
      if (c.distortion > 0) {
        ctx.fillStyle = "rgba(255,0,0," + (c.distortion * 0.1) + ")";
        ctx.fillRect(2, 0, w, h);
        ctx.fillStyle = "rgba(0,255,255," + (c.distortion * 0.1) + ")";
        ctx.fillRect(-2, 0, w, h);
      }
      // Vignette
      var grad = ctx.createRadialGradient(w / 2, h / 2, h / 4, w / 2, h / 2, w);
      grad.addColorStop(0, "transparent");
      grad.addColorStop(1, "rgba(0,0,0,0.8)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },

    render: function(dt, timestamp) {},

    cleanup: function() {
      if (this._animId) cancelAnimationFrame(this._animId);
      this._animId = null;
      if (this._canvas) {
        var ctx = this._canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        this._canvas.style.display = "none";
      }
    },

    destroy: function() {
      this.cleanup();
      this._ctx = null;
      this._canvas = null;
    },

    resize: function(w, h) {
      if (this._canvas) {
        this._canvas.width = w;
        this._canvas.height = h;
      }
    }
  });

  console.log("[CRTTheme] Registered with theme registry");
})(window.__themeRegistry);
