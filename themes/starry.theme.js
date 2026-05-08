/**
 * Starry Night Theme — 🌌
 * 
 * External theme file for Ultimate YTM
 * Place in: %APPDATA%/YouTube Music Desktop App/themes/
 * 
 * This theme creates a starfield background with:
 * - Gradient sky (topColor → bottomColor)
 * - Twinkling stars via CSS animations
 * - Shooting stars with trails
 * - Smooth diagonal drift for parallax effect
 * 
 * Config keys: topColor, bottomColor, starCount, shootingStarCount, showShootingStars, animationSpeed
 */
(function(registry) {
  if (!registry) {
    console.warn("[StarryTheme] No theme registry found, skipping");
    return;
  }

  registry.register({
    id: "starry",
    name: "🌌 Nuit Étoilée",
    defaults: {
      topColor: "#000000",
      bottomColor: "#142b44",
      starCount: 300,
      shootingStarCount: 4,
      showShootingStars: true,
      animationSpeed: 1.0
    },
    schema: [
      { key: "topColor", type: "color", label: "Couleur haut (ciel)", default: "#000000" },
      { key: "bottomColor", type: "color", label: "Couleur bas (horizon)", default: "#142b44" },
      { key: "starCount", type: "range", label: "Nombre d'étoiles", min: 50, max: 5000, step: 50, default: 300 },
      { key: "shootingStarCount", type: "range", label: "Étoiles filantes", min: 0, max: 30, step: 1, default: 4 },
      { key: "showShootingStars", type: "boolean", label: "Afficher étoiles filantes", default: true },
      { key: "animationSpeed", type: "range", label: "Vitesse rotation", min: 0.1, max: 10, step: 0.1, default: 1.0 }
    ],

    // Runtime state
    _container: null,

    init: function(canvas, ctx, config) {
      this.cleanup();
      var c = config || this.defaults;
      var speed = c.animationSpeed || 1.0;
      var driftDuration = Math.max(30, Math.round(600 / speed));
      var twinkleDur = Math.max(2, Math.round(5 / speed));

      // Inject CSS
      var style = document.createElement("style");
      style.id = "ultimate-starry-css";
      style.textContent = [
        "@keyframes ut-sky-drift{0%{transform:translate(0,0)}100%{transform:translate(-25%,-8%)}}",
        "@keyframes ut-twinkle1{0%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}20%{box-shadow:0 0 0 0 transparent}60%{box-shadow:0 0 0 0 transparent}80%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}100%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}}",
        "@keyframes ut-twinkle2{0%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}20%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}40%{box-shadow:0 0 0 0 transparent}80%{box-shadow:0 0 0 0 transparent}100%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}}",
        "@keyframes ut-twinkle3{0%{box-shadow:0 0 0 0 transparent}20%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}60%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}80%{box-shadow:0 0 0 0 transparent}100%{box-shadow:0 0 0 0 transparent}}",
        "@keyframes ut-twinkle4{0%{box-shadow:0 0 0 0 transparent}40%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}60%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}80%{box-shadow:0 0 8px 2px rgba(255,255,255,0.6)}100%{box-shadow:0 0 0 0 transparent}}",
        "@keyframes ut-shooting{0%{transform:rotate(315deg) translateX(0);opacity:1}70%{opacity:1}100%{transform:rotate(315deg) translateX(-1500px);opacity:0}}",
        ".ut-shooting-star{position:absolute;width:4px;height:4px;background:#fff;border-radius:50%;animation:ut-shooting 3s linear;left:initial;z-index:2;box-shadow:0 0 0 4px rgba(255,255,255,0.1),0 0 0 8px rgba(255,255,255,0.1),0 0 20px rgba(255,255,255,0.1)}",
        ".ut-shooting-star::before{content:'';position:absolute;top:50%;transform:translateY(-50%);width:300px;height:1px;background:linear-gradient(90deg,#fff,transparent)}",
        "#ultimate-starry-container{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;overflow:hidden}"
      ].join("");
      document.head.appendChild(style);

      // Container
      var container = document.createElement("div");
      container.id = "ultimate-starry-container";
      var gradient = "linear-gradient(180deg," + (c.topColor || "#000000") + " 0%," + (c.bottomColor || "#142b44") + " 100%)";
      container.style.setProperty("--ut-bg", gradient);
      container.style.setProperty("background", gradient, "important");
      document.body.insertBefore(container, document.body.firstChild);
      this._container = container;

      // Star field
      var field = document.createElement("div");
      field.style.cssText = "position:absolute;top:-15%;left:-5%;width:140%;height:130%;animation:ut-sky-drift " + driftDuration + "s linear infinite";
      container.appendChild(field);

      // Stars
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
          star.style.setProperty("animation", "ut-twinkle" + (Math.floor(Math.random() * 4) + 1) + " " + twinkleDur + "s infinite", "important");
        }
        field.appendChild(star);
      }

      // Shooting stars
      var self = this;
      var ssCount = c.showShootingStars ? (c.shootingStarCount || 4) : 0;
      for (var s = 0; s < ssCount; s++) self._createShootingStar(container);

      console.log("[StarryTheme] Initialized: " + count + " stars, " + ssCount + " shooters, drift=" + driftDuration + "s");
    },

    render: function(dt, timestamp) {
      // Starry uses pure CSS animations — no per-frame render needed
    },

    cleanup: function() {
      var old = document.getElementById("ultimate-starry-container");
      if (old) old.remove();
      var oldStyle = document.getElementById("ultimate-starry-css");
      if (oldStyle) oldStyle.remove();
      this._container = null;
    },

    destroy: function() {
      this.cleanup();
    },

    resize: function(w, h) {
      // CSS handles responsive layout
    },

    _createShootingStar: function(container) {
      var ss = document.createElement("span");
      ss.className = "ut-shooting-star";
      if (Math.random() < 0.75) {
        ss.style.top = "-4px";
        ss.style.right = (Math.random() * 90) + "%";
      } else {
        ss.style.top = (Math.random() * 50) + "%";
        ss.style.right = "-4px";
      }
      ss.style.animationDuration = (Math.floor(Math.random() * 3) + 3) + "s";
      ss.style.animationDelay = (Math.floor(Math.random() * 7)) + "s";
      container.appendChild(ss);
      ss.addEventListener("animationend", function() {
        if (Math.random() < 0.75) {
          ss.style.top = "-4px";
          ss.style.right = (Math.random() * 90) + "%";
        } else {
          ss.style.top = (Math.random() * 50) + "%";
          ss.style.right = "-4px";
        }
        ss.style.animation = "none";
        void ss.offsetWidth;
        ss.style.animation = "";
        ss.style.animationDuration = (Math.floor(Math.random() * 4) + 3) + "s";
      });
    }
  });

  console.log("[StarryTheme] Registered with theme registry");
})(window.__themeRegistry);
