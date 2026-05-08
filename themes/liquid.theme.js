/**
 * Liquid Theme — 🫧
 * 
 * External theme file for Ultimate YTM
 * Place in: %APPDATA%/YouTube Music Desktop App/themes/
 * 
 * Metaball-style floating blobs with blur effect.
 * - Configurable blob colors
 * - Speed and blur controls
 * 
 * Config keys: colors, speed, blurIntensity
 */
(function(registry) {
  if (!registry) {
    console.warn("[LiquidTheme] No theme registry found, skipping");
    return;
  }

  registry.register({
    id: "liquid",
    name: "🫧 Liquid",
    defaults: {
      colors: ["#ff0055", "#0044ff", "#ffcc00"],
      speed: 1.0,
      blurIntensity: 40
    },
    schema: [
      { key: "speed", type: "range", label: "Vitesse", min: 0.1, max: 5, step: 0.1, default: 1.0 },
      { key: "blurIntensity", type: "range", label: "Flou", min: 0, max: 100, step: 5, default: 40 }
    ],

    // Runtime state
    _canvas: null,
    _ctx: null,
    _blobs: [],
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
      this._initBlobs();
      this._loop();
      console.log("[LiquidTheme] Initialized — " + this._blobs.length + " blobs");
    },

    _initBlobs: function() {
      this._blobs = [];
      var c = this._config;
      var cols = c.colors && c.colors.length >= 2 ? c.colors : ["#ff0055", "#0044ff", "#ffcc00"];
      var w = this._canvas.width, h = this._canvas.height;
      for (var i = 0; i < cols.length; i++) {
        this._blobs.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          radius: Math.random() * 200 + 200,
          color: cols[i]
        });
      }
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
      var spd = c.speed;
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, w, h);
      ctx.filter = "blur(" + c.blurIntensity + "px) contrast(2)";
      for (var i = 0; i < this._blobs.length; i++) {
        var b = this._blobs[i];
        b.x += b.vx * spd;
        b.y += b.vy * spd;
        if (b.x < 0 || b.x > w) b.vx *= -1;
        if (b.y < 0 || b.y > h) b.vy *= -1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();
      }
      ctx.filter = "none";
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
      this._blobs = [];
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

  console.log("[LiquidTheme] Registered with theme registry");
})(window.__themeRegistry);
