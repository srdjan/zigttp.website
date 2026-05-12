// deno-lint-ignore-file no-import-prefix
// anime.js v4 choreography for the zigttp landing page.
// One signature hero sequence, plus quiet motion for tabs, the proof
// checklist, and feature reveals. Mirrors animejs.com's restraint:
// motion serves the content, not the other way around.

import {
  animate,
  createTimeline,
  stagger,
  svg,
} from "https://cdn.jsdelivr.net/npm/animejs@4.4.1/dist/bundles/anime.esm.min.js";

const REDUCED = globalThis.matchMedia("(prefers-reduced-motion: reduce)")
  .matches;

// Mark the body so CSS can opt initial elements out of the pre-anim
// "hidden" state when motion is disabled.
if (REDUCED) document.documentElement.dataset.reducedMotion = "true";

/* ---------- hero sequence ---------- */

function splitChars(el) {
  const text = el.textContent;
  el.textContent = "";
  const frag = document.createDocumentFragment();
  for (const ch of text) {
    const span = document.createElement("span");
    span.className = "ch";
    span.textContent = ch;
    if (ch === " ") span.classList.add("ch-space");
    frag.appendChild(span);
  }
  el.appendChild(frag);
  return el.querySelectorAll(".ch");
}

function heroSequence() {
  const wordmark = document.querySelector("[data-anim='hero-wordmark']");
  const headlineLines = document.querySelectorAll("[data-anim='hero-line']");
  const sub = document.querySelector("[data-anim='hero-sub']");
  const ctas = document.querySelector("[data-anim='hero-ctas']");
  const cmd = document.querySelector("[data-anim='hero-cmd']");
  const outputs = document.querySelectorAll("[data-anim='hero-output']");
  const replay = document.querySelector("[data-anim='hero-replay']");
  const engineLines = document.querySelectorAll("[data-anim='engine-line']");
  const engineBars = document.querySelectorAll(
    "[data-anim='engine-bars'] rect",
  );
  const engineDots = document.querySelectorAll(
    "[data-anim='engine-dots'] circle",
  );
  const pulse = document.querySelector("[data-anim='engine-pulse']");

  if (!wordmark || !cmd) return;

  // Pre-split the typed command into characters once.
  const cmdChars = splitChars(cmd);
  const drawables = engineLines.length
    ? svg.createDrawable("[data-anim='engine-line']")
    : [];

  if (REDUCED) {
    // Reveal everything immediately for reduced-motion users.
    [wordmark, sub, ctas, ...headlineLines].forEach(
      (el) => el && el.classList.add("is-visible"),
    );
    cmdChars.forEach((c) => c.classList.add("is-visible"));
    outputs.forEach((o) => o.classList.add("is-visible"));
    engineBars.forEach((bar) => bar.style.opacity = ".92");
    engineDots.forEach((dot) => dot.style.opacity = "1");
    if (pulse) pulse.style.opacity = "1";
    return;
  }

  function play() {
    // Reset state for replay.
    [wordmark, sub, ctas, ...headlineLines].forEach(
      (el) => el && el.classList.remove("is-visible"),
    );
    cmdChars.forEach((c) => c.classList.remove("is-visible"));
    outputs.forEach((o) => o.classList.remove("is-visible"));
    engineBars.forEach((bar) => bar.style.opacity = ".92");
    engineDots.forEach((dot) => dot.style.opacity = "1");
    drawables.forEach((line) => {
      line.draw = "0 0";
    });
    if (pulse) pulse.style.opacity = "0";

    const tl = createTimeline({ defaults: { ease: "outQuad" } });

    tl.add(wordmark, {
      opacity: [0, 1],
      translateY: [12, 0],
      duration: 600,
      onBegin: () => wordmark.classList.add("is-visible"),
    });

    headlineLines.forEach((line, i) => {
      tl.add(
        line,
        {
          opacity: [0, 1],
          translateY: [16, 0],
          duration: 700,
          onBegin: () => line.classList.add("is-visible"),
        },
        i === 0 ? "-=350" : "-=500",
      );
    });

    tl.add(
      sub,
      {
        opacity: [0, 1],
        translateY: [10, 0],
        duration: 500,
        onBegin: () => sub.classList.add("is-visible"),
      },
      "-=300",
    );

    tl.add(
      ctas,
      {
        opacity: [0, 1],
        translateY: [8, 0],
        duration: 400,
        onBegin: () => ctas.classList.add("is-visible"),
      },
      "-=200",
    );

    tl.add(
      engineBars,
      {
        scaleX: [0.12, 1],
        transformOrigin: "center",
        duration: 520,
        ease: "outQuad",
        delay: stagger(34, { from: "center" }),
      },
      "-=240",
    );

    tl.add(
      drawables,
      {
        draw: ["0 0", "0 1"],
        duration: 900,
        ease: "inOutQuad",
        delay: stagger(120),
      },
      "-=500",
    );

    tl.add(
      engineDots,
      {
        scale: [0.2, 1],
        duration: 320,
        ease: "outQuad",
        delay: stagger(45),
      },
      "-=620",
    );

    // Typewriter: reveal each char of the command one by one.
    tl.add(
      cmdChars,
      {
        opacity: [0, 1],
        duration: 16,
        delay: stagger(22),
      },
      "-=200",
    );

    // Output lines stagger in after the command finishes typing.
    outputs.forEach((o, i) => {
      tl.add(
        o,
        {
          opacity: [0, 1],
          translateY: [6, 0],
          duration: 360,
          onBegin: () => o.classList.add("is-visible"),
        },
        i === 0 ? "+=180" : "-=240",
      );
    });

    if (pulse) {
      tl.add(
        pulse,
        {
          opacity: [0, 1],
          scale: [0.65, 1],
          duration: 300,
          ease: "outQuad",
        },
        "-=520",
      );
    }
  }

  play();
  if (replay) replay.addEventListener("click", play);
}

function circuitPulse() {
  const path = document.querySelector(".engine-trace");
  const pulse = document.querySelector("[data-anim='engine-pulse']");
  if (!path || !pulse || REDUCED) return;

  animate(pulse, {
    ...svg.createMotionPath(path),
    opacity: [0.25, 1, 0.25],
    duration: 4200,
    ease: "inOutQuad",
    loop: true,
  });

  animate("[data-anim='engine-arc']", {
    rotate: "+=360",
    duration: (_, i) => 9000 + i * 1800,
    ease: "linear",
    loop: true,
  });
}

/* ---------- proof checklist ---------- */

function proofChecklist() {
  const list = document.querySelector("[data-anim='proof-list']");
  if (!list) return;
  const items = list.querySelectorAll("li");

  if (REDUCED) {
    items.forEach((i) => i.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animate(items, {
          opacity: [0, 1],
          translateX: [-12, 0],
          duration: 320,
          ease: "outQuad",
          delay: stagger(110),
          onBegin: () => items.forEach((i) => i.classList.add("is-visible")),
        });
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.4 },
  );
  observer.observe(list);
}

/* ---------- tab swap (Provable Subset section) ---------- */

function tabSwap() {
  const tablist = document.querySelector(".code-tabs [role='tablist']");
  if (!tablist) return;
  const container = tablist.closest(".code-tabs");
  const tabs = [...tablist.querySelectorAll("[role='tab']")];

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      const panel = container.querySelector(`#tab-${target}`);
      if (!panel || REDUCED) return;
      // The panel is made visible by script.js's activateTab handler
      // (which runs first). We animate the just-revealed panel.
      animate(panel, {
        opacity: [0, 1],
        translateY: [6, 0],
        duration: 260,
        ease: "outQuad",
      });
    });
  });
}

/* ---------- feature reveal ---------- */

function featureReveal() {
  const rows = document.querySelectorAll("[data-anim='feature-row']");
  if (!rows.length) return;

  if (REDUCED) {
    rows.forEach((r) => r.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting).map((e) =>
        e.target
      );
      if (!visible.length) return;
      animate(visible, {
        opacity: [0, 1],
        translateY: [18, 0],
        duration: 520,
        ease: "outQuad",
        delay: stagger(90),
        onBegin: () => visible.forEach((r) => r.classList.add("is-visible")),
      });
      visible.forEach((t) => observer.unobserve(t));
    },
    { threshold: 0.2 },
  );
  rows.forEach((r) => observer.observe(r));
}

/* ---------- boot ---------- */

function boot() {
  heroSequence();
  circuitPulse();
  proofChecklist();
  tabSwap();
  featureReveal();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
