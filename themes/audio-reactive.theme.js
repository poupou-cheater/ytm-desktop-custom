/**
 * Audio Reactive Theme — 🎵
 * 
 * External theme file for Ultimate YTM
 * Place in: %APPDATA%/YouTube Music Desktop App/themes/
 * 
 * Visualizes audio frequencies from the playing track.
 * - Bars or circles mode
 * - Configurable bass sensitivity
 * - Multiple color support
 * 
 * Config keys: bassSensitivity, colors, shape
 */
(function(registry) {
  if (!registry) {
    console.warn("[AudioReactiveTheme] No theme registry found, skipping");
    return;
  }

  registry.register({
    id: "audio-reactive",
    name: "🎵 Audio Reactive",
    defaults: {
      bassSensitivity: 1.5,
      colors: ["#ff0055", "#0044ff", "#ffcc00"],
      shape: "bars"
    },
    schema: [
      { key: "bassSensitivity", type: "range", label: "Sensibilité basses", min: 0.1, max: 5, step: 0.1, default: 1.5 },
      { key: "shape", type: "select", label: "Forme", options: ["bars", "circles"], default: "bars" }
    ],

    // Runtime state
    _canvas: null,
    _ctx: null,
    _audioCtx: null,
    _analyser: null,
    _dataArray: null,
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
      this._setupAudio();
      this._loop();
      console.log("[AudioReactiveTheme] Initialized — shape=" + this._config.shape);
    },

    _setupAudio: function() {
      if (this._audioCtx) return;
      var vid = document.querySelector("video");
      if (!vid) return;
      try {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this._analyser = this._audioCtx.createAnalyser();
        this._analyser.fftSize = 256;
        var src = this._audioCtx.createMediaElementSource(vid);
        src.connect(this._analyser);
        this._analyser.connect(this._audioCtx.destination);
        this._dataArray = new Uint8Array(this._analyser.frequencyBinCount);
      } catch(e) {
        console.warn("[AudioReactiveTheme] Audio setup failed:", e);
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
      if (!ctx || !this._analyser || !this._dataArray) return;
      var c = this._config;
      this._analyser.getByteFrequencyData(this._dataArray);
      var w = this._canvas.width, h = this._canvas.height;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);
      var sens = c.bassSensitivity;
      var colors = c.colors && c.colors.length > 0 ? c.colors : ["#ff0055"];
      if (c.shape === "circles") {
        var cx = w / 2, cy = h / 2;
        var step = Math.PI * 2 / this._dataArray.length;
        for (var i = 0; i < this._dataArray.length; i++) {
          var val = (this._dataArray[i] / 255) * sens;
          var radius = 50 + val * (h * 0.35);
          var angle = i * step;
          var x = cx + Math.cos(angle) * radius;
          var y = cy + Math.sin(angle) * radius;
          var ci = i % colors.length;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(2, val * 6), 0, Math.PI * 2);
          ctx.fillStyle = colors[ci];
          ctx.fill();
        }
      } else {
        var barW = (w / this._dataArray.length) * 2.5;
        var bx = 0;
        for (var i = 0; i < this._dataArray.length; i++) {
          var barH = (this._dataArray[i] / 255) * h * sens;
          var ci = i % colors.length;
          ctx.fillStyle = colors[ci];
          ctx.fillRect(bx, h - barH, barW, barH);
          bx += barW + 1;
        }
      }
    },

    render: function(dt, timestamp) {
      // Render loop is self-managed via _loop
    },

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

  console.log("[AudioReactiveTheme] Registered with theme registry");
})(window.__themeRegistry);
