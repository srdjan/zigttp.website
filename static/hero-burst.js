(function () {
  "use strict";

  var REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Saddle curves as fractions of the title element's bounds
  var CURVES = [
    // Family A: upper-left to lower-right
    [[0.05, 0.00], [0.30, 0.30], [0.70, 0.60], [0.95, 1.00]],
    [[0.08, 0.08], [0.32, 0.33], [0.68, 0.58], [0.92, 0.92]],
    [[0.10, 0.15], [0.34, 0.36], [0.66, 0.55], [0.90, 0.85]],
    [[0.12, 0.22], [0.36, 0.38], [0.64, 0.53], [0.88, 0.78]],
    [[0.10, 0.30], [0.35, 0.42], [0.65, 0.52], [0.90, 0.70]],
    [[0.12, 0.38], [0.34, 0.44], [0.66, 0.52], [0.88, 0.62]],
    [[0.14, 0.45], [0.33, 0.48], [0.67, 0.52], [0.86, 0.55]],
    // Family B: upper-right to lower-left
    [[0.95, 0.00], [0.70, 0.30], [0.30, 0.60], [0.05, 1.00]],
    [[0.92, 0.08], [0.68, 0.33], [0.32, 0.58], [0.08, 0.92]],
    [[0.90, 0.15], [0.66, 0.36], [0.34, 0.55], [0.10, 0.85]],
    [[0.88, 0.22], [0.64, 0.38], [0.36, 0.53], [0.12, 0.78]],
    [[0.90, 0.30], [0.65, 0.42], [0.35, 0.52], [0.10, 0.70]],
    [[0.88, 0.38], [0.66, 0.44], [0.34, 0.52], [0.12, 0.62]],
    [[0.86, 0.45], [0.67, 0.48], [0.33, 0.52], [0.14, 0.55]],
  ];

  var CLR_TRAIL = "139,195,216";       // #8BC3D8
  var CLR_GLOW_OUTER = "rgba(160,214,230,0.06)"; // #A0D6E6
  var CLR_GLOW_MID = "rgba(146,191,211,0.2)";    // #92BFD3
  var CLR_SHADOW = "rgba(139,195,216,0.3)";       // #8BC3D8
  var CLR_TRACE = "146,191,211";       // #92BFD3

  var TRAIL_LEN = 50;
  var DURATION = 3800;
  var PARTICLE_TRAVEL = 2600;
  var FADE_START = 2800;
  var STAGGER = 80;
  var B_OFFSET = 100;

  function cubicBezier(t, p0, p1, p2, p3, w, h) {
    var u = 1 - t;
    var uu = u * u;
    var tt = t * t;
    return {
      x: (uu * u * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + tt * t * p3[0]) * w,
      y: (uu * u * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + tt * t * p3[1]) * h,
    };
  }

  function easeOutExpo(x) {
    return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
  }

  function sizeCanvas(canvas, el) {
    var dpr = Math.min(devicePixelRatio || 1, 2);
    var w = el.offsetWidth;
    var h = el.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function initParticles() {
    var particles = [];
    for (var i = 0; i < CURVES.length; i++) {
      var delay = i < 7
        ? i * STAGGER
        : B_OFFSET + (i - 7) * STAGGER;
      particles.push({
        curve: CURVES[i],
        delay: delay,
        trail: [],
      });
    }
    return particles;
  }

  function curveAlpha(i) {
    var idx = i < 7 ? i : i - 7;
    return 0.15 + idx * 0.05;
  }

  function drawTrail(ctx, trail, alpha) {
    if (trail.length < 2) return;
    for (var j = 1; j < trail.length; j++) {
      var frac = j / trail.length;
      var a = Math.pow(frac, 2.5) * alpha;
      if (a < 0.005) continue;
      ctx.beginPath();
      ctx.moveTo(trail[j - 1].x, trail[j - 1].y);
      ctx.lineTo(trail[j].x, trail[j].y);
      ctx.strokeStyle = "rgba(" + CLR_TRAIL + "," + a.toFixed(3) + ")";
      ctx.lineWidth = 0.3 + frac * 1.2;
      ctx.stroke();
    }
  }

  function drawParticle(ctx, pos) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = CLR_GLOW_OUTER;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = CLR_GLOW_MID;
    ctx.fill();
    ctx.shadowBlur = 12;
    ctx.shadowColor = CLR_SHADOW;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "#e0f0ff";
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawTraces(ctx, w, h, opacity) {
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < CURVES.length; i++) {
      var c = CURVES[i];
      var idx = i < 7 ? i : i - 7;
      var a = (0.08 + idx * 0.02) * opacity;
      var lw = idx > 4 ? 1.2 : 0.8;
      ctx.beginPath();
      ctx.moveTo(c[0][0] * w, c[0][1] * h);
      ctx.bezierCurveTo(
        c[1][0] * w, c[1][1] * h,
        c[2][0] * w, c[2][1] * h,
        c[3][0] * w, c[3][1] * h
      );
      ctx.strokeStyle = "rgba(" + CLR_TRACE + "," + a.toFixed(4) + ")";
      ctx.lineWidth = lw;
      ctx.stroke();
    }
    var grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.3);
    grad.addColorStop(0, "rgba(" + CLR_TRACE + "," + (0.045 * opacity).toFixed(4) + ")");
    grad.addColorStop(1, "rgba(" + CLR_TRACE + ",0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  }

  function run(el) {
    var canvas = document.createElement("canvas");
    canvas.className = "hero-burst-canvas";
    el.insertBefore(canvas, el.firstChild);

    var size = sizeCanvas(canvas, el);
    var ctx = size.ctx;
    var w = size.w;
    var h = size.h;

    if (REDUCED_MOTION) {
      drawTraces(ctx, w, h, 1);
      return;
    }

    var particles = initParticles();
    var startTime = -1;
    var raf;

    function tick(now) {
      if (startTime < 0) startTime = now;
      var elapsed = now - startTime;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      var allDone = true;

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var localTime = elapsed - p.delay;

        if (localTime < 0) {
          allDone = false;
          continue;
        }

        var progress = Math.min(localTime / PARTICLE_TRAVEL, 1);
        var t = easeOutExpo(progress);

        var pos = cubicBezier(t, p.curve[0], p.curve[1], p.curve[2], p.curve[3], w, h);

        p.trail.push(pos);
        if (p.trail.length > TRAIL_LEN) p.trail.shift();

        var alpha = curveAlpha(i);

        if (progress >= 1) {
          var fadeTime = localTime - PARTICLE_TRAVEL;
          var fadeFrac = Math.min(fadeTime / 600, 1);
          alpha *= 1 - fadeFrac * 0.7;
        } else {
          allDone = false;
        }

        drawTrail(ctx, p.trail, alpha);

        if (progress < 1) {
          allDone = false;
          drawParticle(ctx, pos);
        }
      }

      ctx.globalCompositeOperation = "source-over";

      if (elapsed > FADE_START) {
        var traceFrac = Math.min((elapsed - FADE_START) / (DURATION - FADE_START), 1);
        drawTraces(ctx, w, h, traceFrac);
      }

      if (elapsed < DURATION || !allDone) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
        ctx.clearRect(0, 0, w, h);
        drawTraces(ctx, w, h, 1);
      }
    }

    raf = requestAnimationFrame(tick);

    var resizeTimer;
    var ro = new ResizeObserver(function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        size = sizeCanvas(canvas, el);
        ctx = size.ctx;
        w = size.w;
        h = size.h;
        if (!raf) {
          drawTraces(ctx, w, h, 1);
        }
      }, 150);
    });
    ro.observe(el);
  }

  var title = document.querySelector(".hero-title");
  if (title) run(title);
})();
