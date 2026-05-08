/**
 * Vortex Theme — 🌀
 * 
 * External theme file for Ultimate YTM
 * Place in: %APPDATA%/YouTube Music Desktop App/themes/
 * 
 * WebGL tunnel/vortex shader effect.
 * - Speed control
 * - Custom color
 * - Camera rotation
 * 
 * Config keys: speed, color, cameraRotation
 */
(function(registry) {
  if (!registry) {
    console.warn("[VortexTheme] No theme registry found, skipping");
    return;
  }

  registry.register({
    id: "vortex",
    name: "🌀 Vortex",
    defaults: {
      speed: 1.0,
      color: "#00ffff",
      cameraRotation: 0.0
    },
    schema: [
      { key: "speed", type: "range", label: "Vitesse", min: 0.1, max: 5, step: 0.1, default: 1.0 },
      { key: "color", type: "color", label: "Couleur", default: "#00ffff" },
      { key: "cameraRotation", type: "range", label: "Rotation caméra", min: 0, max: 2, step: 0.1, default: 0.0 }
    ],

    // Runtime state
    _canvas: null,
    _gl: null,
    _program: null,
    _animId: null,
    _config: null,
    _startTime: 0,

    init: function(canvas, ctx, config) {
      this.destroy();
      this._config = config || this.defaults;
      canvas.style.display = "block";
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      this._canvas = canvas;
      this._gl = canvas.getContext("webgl", { antialias: false, alpha: true });
      if (!this._gl) {
        console.error("[VortexTheme] WebGL not available");
        return;
      }
      this._initWebGL();
      this._startTime = performance.now();
      this._loop();
      console.log("[VortexTheme] Initialized");
    },

    _initWebGL: function() {
      var gl = this._gl;
      if (!gl) return;
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
      this._program = gl.createProgram();
      if (!this._program || !vShader || !fShader) return;
      gl.attachShader(this._program, vShader);
      gl.attachShader(this._program, fShader);
      gl.linkProgram(this._program);

      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    },

    _hexToRgb: function(hex) {
      var r = parseInt(hex.slice(1, 3), 16);
      var g = parseInt(hex.slice(3, 5), 16);
      var b = parseInt(hex.slice(5, 7), 16);
      return { r: r, g: g, b: b };
    },

    _loop: function() {
      var self = this;
      function frame(timestamp) {
        self._animId = requestAnimationFrame(frame);
        self._draw(timestamp);
      }
      self._animId = requestAnimationFrame(frame);
    },

    _draw: function(timestamp) {
      var gl = this._gl;
      if (!gl || !this._program) return;
      var c = this._config;
      var col = this._hexToRgb(c.color);
      var t = (timestamp - this._startTime) * 0.001;
      gl.useProgram(this._program);
      var pos = gl.getAttribLocation(this._program, "position");
      gl.enableVertexAttribArray(pos);
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(gl.getUniformLocation(this._program, "u_res"), this._canvas.width, this._canvas.height);
      gl.uniform1f(gl.getUniformLocation(this._program, "u_time"), t);
      gl.uniform1f(gl.getUniformLocation(this._program, "u_speed"), c.speed);
      gl.uniform1f(gl.getUniformLocation(this._program, "u_rot"), c.cameraRotation);
      gl.uniform3f(gl.getUniformLocation(this._program, "u_col"), col.r / 255, col.g / 255, col.b / 255);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },

    render: function(dt, timestamp) {},

    cleanup: function() {
      if (this._animId) cancelAnimationFrame(this._animId);
      this._animId = null;
      if (this._canvas) {
        this._canvas.style.display = "none";
      }
    },

    destroy: function() {
      this.cleanup();
      this._gl = null;
      this._program = null;
      this._canvas = null;
    },

    resize: function(w, h) {
      if (this._canvas) {
        this._canvas.width = w;
        this._canvas.height = h;
      }
    }
  });

  console.log("[VortexTheme] Registered with theme registry");
})(window.__themeRegistry);
