/**
 * Lo-Fi Theme — 🌧️
 * 
 * External theme file for Ultimate YTM
 * Place in: %APPDATA%/YouTube Music Desktop App/themes/
 * 
 * Ambient weather particles (rain or snow) with day/night cycle.
 * - Auto time-of-day detection
 * - Rain or snow mode
 * - Configurable intensity
 * 
 * Config keys: weather, intensity, forceTimeOfDay
 */
(function(registry) {
  if (!registry) {
    console.warn("[LofiTheme] No theme registry found, skipping");
    return;
  }

  registry.register({
    id: "lofi",
    name: "🌧️ Lo-Fi",
    defaults: {
      weather: "rain",
      intensity: 1.0,
      forceTimeOfDay: "auto"
    },
    schema: [
      { key: "weather", type: "select", label: "Météo", options: ["rain", "snow"], default: "rain" },
      { key: "intensity", type: "range", label: "Intensité", min: 0.1, max: 3, step: 0.1, default: 1.0 },
      { key: "forceTimeOfDay", type: "select", label: "Heure du jour", options: ["auto", "day", "night"], default: "auto" }
    ],

    // Runtime state
    _canvas: null,
    _ctx: null,
    _particles: [],
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
      this._initParticles();
      this._loop();
      console.log("[LofiTheme] Initialized — weather=" + this._config.weather);
    },

    _initParticles: function() {
      this._particles = [];
      var w = this._canvas.width, h = this._canvas.height;
      for (var i = 0; i < 500; i++) {
        this._particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vy: Math.random() * 5 + 2,
          vx: Math.random() * 2 - 1,
          size: Math.random() * 2 + 1
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
      var hour = new Date().getHours();
      var isNight = c.forceTimeOfDay === "night" || (c.forceTimeOfDay === "auto" && (hour > 19 || hour < 7));
      ctx.fillStyle = isNight ? "#0a0a1a" : "#ffebd6";
      ctx.fillRect(0, 0, w, h);
      var intensity = c.intensity;
      var weather = c.weather;
      if (weather === "rain") {
        ctx.strokeStyle = "rgba(150,180,255,0.5)";
        ctx.lineWidth = 1;
        for (var i = 0; i < this._particles.length; i++) {
          var p = this._particles[i];
          p.y += p.vy * intensity * 2;
          p.x += p.vx * 0.5;
          if (p.y > h) { p.y = 0; p.x = Math.random() * w; }
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - 1, p.y + p.size * 5);
          ctx.stroke();
        }
      } else if (weather === "snow") {
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        for (var i = 0; i < this._particles.length; i++) {
          var p = this._particles[i];
          p.y += p.vy * intensity * 0.3;
          p.x += Math.sin(p.y * 0.01) * 0.5;
          if (p.y > h) { p.y = 0; p.x = Math.random() * w; }
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
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
      this._particles = [];
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

  console.log("[LofiTheme] Registered with theme registry");
})(window.__themeRegistry);
