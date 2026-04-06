// pretext-animations.js - Smooth FAQ accordion + section title line reveal
// Progressive enhancement: if CDN import fails, site works normally with native <details>

const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;

function getFont(el) {
  const s = getComputedStyle(el);
  return s.font || `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
}

function getLineHeight(el) {
  const s = getComputedStyle(el);
  if (s.lineHeight === "normal") return parseFloat(s.fontSize) * 1.2;
  return parseFloat(s.lineHeight);
}

function debounce(fn, ms) {
  let id;
  return () => {
    clearTimeout(id);
    id = setTimeout(fn, ms);
  };
}

// FAQ Accordion
function initAccordion(prepare, layout) {
  const list = document.querySelector(".faq-list");
  if (!list) return;

  const items = [];
  const detailsEls = list.querySelectorAll("details.faq-item");

  detailsEls.forEach((details) => {
    const summary = details.querySelector("summary");
    const answer = details.querySelector(".faq-answer");
    if (!summary || !answer) return;

    const item = document.createElement("div");
    item.className = "faq-item";
    item.setAttribute("aria-expanded", "false");

    const btn = document.createElement("button");
    btn.className = "faq-question";
    btn.setAttribute("type", "button");
    btn.textContent = summary.textContent;

    const body = document.createElement("div");
    body.className = "faq-body";
    body.style.height = "0px";

    const inner = document.createElement("p");
    inner.className = "faq-answer";
    inner.innerHTML = answer.innerHTML;

    body.appendChild(inner);
    item.appendChild(btn);
    item.appendChild(body);

    details.replaceWith(item);

    items.push({ el: item, btn, body, inner, prepared: null });
  });

  if (items.length === 0) return;

  const sampleAnswer = items[0].inner;
  const font = getFont(sampleAnswer);
  const lh = getLineHeight(sampleAnswer);
  const answerStyle = getComputedStyle(sampleAnswer);
  const padBottom = parseFloat(answerStyle.paddingBottom);
  const padLeft = parseFloat(answerStyle.paddingLeft);

  items.forEach((item) => {
    item.prepared = prepare(item.inner.textContent, font);
  });

  function measureHeight(item) {
    const contentWidth = item.inner.parentElement.clientWidth - padLeft;
    const result = layout(item.prepared, contentWidth, lh);
    return result.height + padBottom;
  }

  function toggle(index) {
    const item = items[index];
    const isOpen = item.el.getAttribute("aria-expanded") === "true";

    if (isOpen) {
      item.el.setAttribute("aria-expanded", "false");
      item.body.style.height = "0px";
    } else {
      item.el.setAttribute("aria-expanded", "true");
      item.body.style.height = measureHeight(item) + "px";
    }
  }

  list.addEventListener("click", (e) => {
    const btn = e.target.closest("button.faq-question");
    if (!btn) return;
    const item = btn.closest(".faq-item");
    const index = items.findIndex((i) => i.el === item);
    if (index >= 0) toggle(index);
  });

  list.addEventListener("keydown", (e) => {
    const btn = e.target.closest("button.faq-question");
    if (!btn) return;
    const index = items.findIndex((i) => i.btn === btn);
    if (index < 0) return;
    let next;
    if (e.key === "ArrowDown") next = items[(index + 1) % items.length];
    else if (e.key === "ArrowUp") next = items[(index - 1 + items.length) % items.length];
    else if (e.key === "Home") next = items[0];
    else if (e.key === "End") next = items[items.length - 1];
    if (next) { e.preventDefault(); next.btn.focus(); }
  });

  window.addEventListener(
    "resize",
    debounce(() => {
      items.forEach((item) => {
        if (item.el.getAttribute("aria-expanded") === "true") {
          item.body.style.height = measureHeight(item) + "px";
        }
      });
    }, 150),
  );
}

// Section Title Line-by-Line Reveal
function initLineReveal(prepareWithSegments, layoutWithLines) {
  const els = document.querySelectorAll('[data-reveal="lines"]');
  if (els.length === 0) return;

  const state = [];

  function splitIntoLines(entry) {
    const { el, originalText } = entry;
    const font = getFont(el);
    const lh = getLineHeight(el);
    const width = el.clientWidth;

    if (width <= 0) return;

    const prepared = prepareWithSegments(originalText, font);
    const result = layoutWithLines(prepared, width, lh);

    el.innerHTML = "";
    el.classList.add("reveal-ready");
    entry.spans = [];

    result.lines.forEach((line) => {
      const span = document.createElement("span");
      span.className = "reveal-line";
      span.textContent = line.text;
      el.appendChild(span);
      entry.spans.push(span);
    });
  }

  function revealEntry(entry, baseDelay) {
    if (entry.revealed) return;
    entry.revealed = true;
    entry.spans.forEach((span, i) => {
      setTimeout(() => span.classList.add("visible"), baseDelay + i * 120);
    });
  }

  els.forEach((el) => {
    const entry = {
      el,
      originalText: el.textContent.trim(),
      spans: [],
      revealed: false,
    };
    state.push(entry);
    splitIntoLines(entry);
  });

  // Check which elements are already in viewport - reveal with a delay
  // so the user actually perceives the animation
  state.forEach((entry) => {
    const rect = entry.el.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
    if (inViewport) {
      revealEntry(entry, 300);
    }
  });

  // Observe remaining elements for scroll reveal
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((ioEntry) => {
        if (!ioEntry.isIntersecting) return;
        const entry = state.find((s) => s.el === ioEntry.target);
        if (!entry || entry.revealed) return;
        revealEntry(entry, 0);
        observer.unobserve(ioEntry.target);
      });
    },
    { threshold: 0.2 },
  );

  state.forEach((entry) => {
    if (!entry.revealed) observer.observe(entry.el);
  });

  window.addEventListener(
    "resize",
    debounce(() => {
      state.forEach((entry) => {
        if (entry.revealed) return;
        splitIntoLines(entry);
      });
    }, 200),
  );
}

async function init() {
  const { prepare, prepareWithSegments, layout, layoutWithLines } =
    await import("https://cdn.jsdelivr.net/npm/@chenglou/pretext@0.0.3/+esm");

  initAccordion(prepare, layout);

  if (!REDUCED_MOTION) {
    initLineReveal(prepareWithSegments, layoutWithLines);
  }
}

init().catch(() => {});
