(function () {
  "use strict";

  var BG_COLOR = "#14142a";
  var CLR_CYAN = [139, 195, 216];
  var CLR_WHITE = [220, 235, 245];
  var CLR_GOLD = [247, 164, 29];

  var GOLD_CHANCE = 0.008;
  var ARC_EVERY = 3;

  // Seeded PRNG (mulberry32) for deterministic pattern
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mobileCheck() {
    return window.innerWidth < 768;
  }

  function params() {
    var mobile = mobileCheck();
    return {
      spokes: mobile ? 48 : 72,
      dotsPerSpoke: mobile ? 25 : 40,
      minRadius: mobile ? 40 : 60,
    };
  }

  function sizeCanvas(canvas) {
    var dpr = Math.min(devicePixelRatio || 1, 2);
    if (mobileCheck()) dpr = Math.min(dpr, 1.5);
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function render(ctx, w, h) {
    var p = params();
    var rng = mulberry32(42);
    var focalX = w * 0.5;
    var focalY = h + 40;
    var maxRadius = Math.max(w, h) * 1.4;

    // Fill background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = "lighter";

    // Store spoke angles for arc drawing
    var spokeAngles = [];
    for (var i = 0; i < p.spokes; i++) {
      var baseAngle = -Math.PI + (i / p.spokes) * Math.PI;
      var jitter = (rng() - 0.5) * 0.005;
      spokeAngles.push(baseAngle + jitter);
    }

    // Draw concentric arcs first (behind dots)
    for (var j = 0; j < p.dotsPerSpoke; j++) {
      if (j % ARC_EVERY !== 0) continue;
      var t = j / p.dotsPerSpoke;
      var radius = p.minRadius + (maxRadius - p.minRadius) * (t * t);

      // Opacity: brighter near center, fading outward
      var baseAlpha = 0.15 + 0.55 * (1 - t);
      var arcAlpha = baseAlpha * 0.2;
      if (arcAlpha < 0.005) continue;

      ctx.beginPath();
      ctx.arc(focalX, focalY, radius, -Math.PI, 0);
      ctx.strokeStyle = "rgba(" + CLR_CYAN[0] + "," + CLR_CYAN[1] + "," + CLR_CYAN[2] + "," + arcAlpha.toFixed(4) + ")";
      ctx.lineWidth = 0.3;
      ctx.stroke();
    }

    // Draw dots along each spoke
    for (var si = 0; si < p.spokes; si++) {
      var angle = spokeAngles[si];

      for (var dj = 0; dj < p.dotsPerSpoke; dj++) {
        var dt = dj / p.dotsPerSpoke;
        var r = p.minRadius + (maxRadius - p.minRadius) * (dt * dt);

        // Radial jitter
        r += (rng() - 0.5) * r * 0.02;

        var x = focalX + Math.cos(angle) * r;
        var y = focalY + Math.sin(angle) * r;

        // Skip dots outside viewport with margin
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;

        var dotSize = 0.5 + rng() * 1.0;
        var isGold = rng() < GOLD_CHANCE;

        // Opacity: brighter near center, fading outward
        var alpha = 0.15 + 0.55 * (1 - dt);

        // Viewport edge falloff
        var edgeX = Math.min(x / 100, (w - x) / 100, 1);
        var edgeY = Math.min(y / 100, (h - y) / 100, 1);
        alpha *= Math.max(0, Math.min(edgeX, edgeY));

        if (alpha < 0.005) continue;

        var clr = isGold ? CLR_GOLD : (rng() < 0.3 ? CLR_CYAN : CLR_WHITE);

        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + clr[0] + "," + clr[1] + "," + clr[2] + "," + alpha.toFixed(3) + ")";
        ctx.fill();
      }
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function init() {
    var canvas = document.createElement("canvas");
    canvas.className = "bg-radial-canvas";
    var s = canvas.style;
    s.position = "fixed";
    s.top = "0";
    s.left = "0";
    s.zIndex = "-1";
    s.pointerEvents = "none";
    document.body.insertBefore(canvas, document.body.firstChild);

    var size = sizeCanvas(canvas);
    render(size.ctx, size.w, size.h);

    var resizeTimer;
    var ro = new ResizeObserver(function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        size = sizeCanvas(canvas);
        render(size.ctx, size.w, size.h);
      }, 200);
    });
    ro.observe(document.documentElement);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
