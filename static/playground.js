// Live proof playground. Loads the real zigts analyzer (compiled to wasm)
// and drives the proof card from its output. The page works without this
// script: the section ships a pre-rendered proven card and a plain editor.
//
// WASM_URL is patched by scripts/build-wasm-playground.sh on every build.
const WASM_URL = "/zigts-analyzer.da9d8f5c69ad.wasm";

(function () {
  "use strict";
  const section = document.getElementById("playground");
  const editor = document.getElementById("zp-src");
  const card = document.getElementById("zp-card");
  if (!section || !editor || !card) return;
  // Signal JS is live: enables the highlight overlay and hides the raw
  // textarea text. Without this class the textarea stays plainly readable.
  section.classList.add("zp-js");

  // --- demo sources -------------------------------------------------------
  // The seed is fully proven. Each variant breaks exactly one proof so a
  // visitor who never types still watches the card flip red and back. The
  // anchor lines are named constants so the seed and the variant edits that
  // target them cannot drift apart.
  const IMPORT_LINE = 'import type { Spec } from "zigttp:types";';
  const RETURN_LINE = "  return Response.json({ ok: true });";
  const SEED = [
    IMPORT_LINE,
    "",
    "// Every obligation below is discharged by the compiler",
    "// on each keystroke. Break one and the card flips red.",
    "type Guarantees = Spec<",
    '  "deterministic" | "no_secret_leakage" | "injection_safe"',
    ">;",
    "",
    "function handler(req: Request): Response & Guarantees {",
    RETURN_LINE,
    "}",
    "",
  ].join("\n");

  const VARIANTS = {
    datenow: SEED.replace(
      RETURN_LINE,
      "  const stamp = Date.now();\n  return Response.json({ ok: true, stamp });",
    ),
    secret: SEED
      .replace(IMPORT_LINE, IMPORT_LINE + '\nimport { env } from "zigttp:env";')
      .replace(
        RETURN_LINE,
        '  return Response.json({ apiKey: env("SECRET_KEY") });',
      ),
    while: SEED.replace(
      RETURN_LINE,
      "  while (true) {}\n" + RETURN_LINE,
    ),
  };

  // --- property model -----------------------------------------------------
  // The seven properties `zigts check --json` reports under proof.properties,
  // each paired with the substrate restrictions that earned it (Trade lens).
  // `gave`/`earned` text mirrors TRADE_TABLE in packages/runtime/src/studio.zig
  // (itself a mirror of proof_to_restrictions) - keep the wording in sync.
  const PROPS = [
    {
      key: "deterministic",
      label: "deterministic",
      gave: ["async/await", "while", "do...while", "for(;;)"],
      earned: "deterministic, replayable, AI-refactorable",
    },
    {
      key: "read_only",
      label: "read-only",
      gave: ["delete", "++", "--"],
      earned: "shape-stable property access, no hidden writes",
    },
    {
      key: "state_isolated",
      label: "state-isolated",
      gave: ["class", "this", "++", "--"],
      earned: "explicit data flow, no shared mutable receivers",
    },
    {
      key: "injection_safe",
      label: "injection-safe",
      gave: [],
      earned: "flow analysis tracks user-input into sinks",
    },
    {
      key: "retry_safe",
      label: "retry-safe",
      gave: ["try/catch", "throw"],
      earned: "Result-narrowed, exhaustive paths, no hidden control flow",
    },
    {
      key: "idempotent",
      label: "idempotent",
      gave: [],
      earned: "earned by analysis; retries are safe",
    },
    {
      key: "fault_covered",
      label: "fault-covered",
      gave: [],
      earned: "every failure path has a witness or test",
    },
  ];

  // --- wasm bridge --------------------------------------------------------
  // Reused across analyze() calls instead of reconstructed per keystroke.
  const ENC = new TextEncoder();
  const DEC = new TextDecoder();
  let wasm = null;

  async function loadWasm() {
    const resp = await fetch(WASM_URL);
    if (!resp.ok) throw new Error("fetch " + resp.status);
    const mod = await WebAssembly.compile(await resp.arrayBuffer());
    // The analyzer never runs a handler, so the SDK host functions it imports
    // are never called; stub them so instantiation succeeds.
    const env = {};
    for (const imp of WebAssembly.Module.imports(mod)) {
      if (imp.module === "env" && imp.kind === "function") {
        env[imp.name] = () => 0;
      }
    }
    const inst = await WebAssembly.instantiate(mod, { env });
    wasm = inst.exports;
  }

  // Run the analyzer over `src`. Returns the parsed JSON envelope, or null.
  // `wasm.memory.buffer` is re-read after every wasm call: the analyzer grows
  // linear memory, which detaches any ArrayBuffer view taken before the call.
  function analyze(src) {
    if (!wasm) return null;
    const enc = ENC.encode(src);
    const ptr = wasm.alloc(BigInt(enc.length));
    if (ptr === 0n) return null;
    new Uint8Array(wasm.memory.buffer).set(enc, Number(ptr));
    // The playground is a TypeScript (.ts) surface; JSX is not offered, so
    // the analyzer's is_tsx flag is always 0.
    const rp = Number(wasm.analyze(ptr, BigInt(enc.length), 0));
    wasm.free(ptr, BigInt(enc.length));
    if (rp === 0) return null;
    const len = new DataView(wasm.memory.buffer).getUint32(rp, true);
    const json = DEC.decode(new Uint8Array(wasm.memory.buffer, rp + 4, len));
    try {
      return JSON.parse(json);
    } catch (err) {
      console.error("playground: malformed analyzer output", err);
      return null;
    }
  }

  // --- syntax highlight overlay ------------------------------------------
  // Tokenize into {text, cls} runs and build DOM nodes (no innerHTML).
  const TOKEN =
    /(\/\/[^\n]*)|("[^"\n]*"|'[^'\n]*')|\b(import|export|from|type|function|const|let|return|if|else|while|for|of|true|false|undefined|new|class)\b/g;

  function tokenize(code) {
    const out = [];
    let last = 0;
    for (const m of code.matchAll(TOKEN)) {
      if (m.index > last) out.push({ text: code.slice(last, m.index) });
      const cls = m[1] ? "zp-com" : m[2] ? "z-token-str" : "z-token-key";
      out.push({ text: m[0], cls: cls });
      last = m.index + m[0].length;
    }
    if (last < code.length) out.push({ text: code.slice(last) });
    return out;
  }

  const hl = document.getElementById("zp-hl");
  function syncHighlight() {
    if (hl) {
      hl.textContent = "";
      tokenize(editor.value).forEach((t) => {
        if (t.cls) {
          const s = document.createElement("span");
          s.className = t.cls;
          s.textContent = t.text;
          hl.appendChild(s);
        } else {
          hl.appendChild(document.createTextNode(t.text));
        }
      });
      hl.appendChild(document.createTextNode("\n"));
    }
    syncScroll();
  }

  function syncScroll() {
    if (!hl) return;
    hl.parentElement.scrollTop = editor.scrollTop;
    hl.parentElement.scrollLeft = editor.scrollLeft;
  }

  // --- proof card rendering ----------------------------------------------
  const reduceMotion = globalThis.matchMedia &&
    globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let prevState = {};
  let activeLens = "properties";
  let lastResult = null;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function render(result) {
    lastResult = result;
    const ok = result && result.success === true;
    const proof = (result && result.proof) || null;
    const props = (proof && proof.properties) || {};
    const diags = (result && result.diagnostics) || [];
    const errors = diags.filter((d) => d.severity === "error");
    const provenCount = PROPS.filter((p) => props[p.key] === true).length;

    const head = card.querySelector(".zp-head");
    head.className = "zp-head " + (ok ? "zp-ok" : "zp-blocked");
    head.querySelector(".zp-verdict").textContent = ok ? "PROVEN" : "BLOCKED";
    head.querySelector(".zp-count").textContent = provenCount + " / " +
      PROPS.length + " properties";

    // The verdict header and Why row are always visible; only the active
    // lens pane needs rebuilding. The other panes render on tab switch.
    renderWhy(errors);
    renderLens(activeLens);
  }

  // Rebuild one lens pane from the cached last result. The Caller view is
  // static HTML and never re-rendered.
  function renderLens(lens) {
    if (!lastResult) return;
    const proof = lastResult.proof || null;
    const props = (proof && proof.properties) || {};
    if (lens === "properties") {
      renderProperties(props, proof);
    } else if (lens === "trade") {
      renderTrade(props);
    } else if (lens === "handover") {
      renderHandover(lastResult.success === true, props, proof);
    }
  }

  function chip(label, on, flipped) {
    const li = el("li", "zp-chip " + (on ? "on" : "off"));
    if (flipped && !reduceMotion) li.classList.add("zp-flip");
    li.appendChild(el("span", "zp-glyph", on ? "+" : "-"));
    li.appendChild(el("span", "zp-chip-label", label));
    return li;
  }

  function renderProperties(props, proof) {
    const ul = card.querySelector(".zp-chips");
    ul.textContent = "";
    PROPS.forEach((p) => {
      const on = props[p.key] === true;
      const flipped = prevState[p.key] !== undefined &&
        prevState[p.key] !== props[p.key];
      ul.appendChild(chip(p.label, on, flipped));
    });
    // prevState tracks the last *Properties* render so the flip animation
    // fires for chips that changed since this lens was last shown.
    prevState = Object.assign({}, props);

    const specWrap = card.querySelector(".zp-specs");
    specWrap.textContent = "";
    const specs = (proof && proof.declared_specs) || [];
    if (specs.length) {
      specWrap.appendChild(el("span", "zp-specs-label", "declared Spec<>"));
      const undischarged = new Set(
        ((proof && proof.spec_diagnostics) || []).map((d) => d.spec_name),
      );
      specs.forEach((s) => {
        const ok = !undischarged.has(s);
        specWrap.appendChild(el("span", "zp-spec " + (ok ? "on" : "off"), s));
      });
    }
  }

  function renderWhy(errors) {
    const why = card.querySelector(".zp-why");
    if (!errors.length) {
      why.hidden = true;
      return;
    }
    const d = errors[0];
    why.hidden = false;
    why.textContent = "";
    why.appendChild(el("span", "zp-status-dot z-dot-blocked"));
    why.appendChild(el("code", "zp-why-code", d.code));
    why.appendChild(el("span", "zp-why-msg", d.message));
    if (d.line) {
      why.appendChild(el("code", "zp-why-loc", "handler.ts:" + d.line));
    }
    if (d.suggestion) {
      why.appendChild(el("span", "zp-why-fix", "fix: " + d.suggestion));
    }
  }

  function renderTrade(props) {
    const ul = card.querySelector(".zp-trade");
    ul.textContent = "";
    PROPS.forEach((p) => {
      const on = props[p.key] === true;
      const li = el("li", "zp-trade-row " + (on ? "on" : "off"));
      const h = el("div", "zp-trade-head");
      h.appendChild(el("span", "zp-glyph", on ? "+" : "-"));
      h.appendChild(el("span", "zp-chip-label", p.label));
      li.appendChild(h);
      if (p.gave.length) {
        const g = el("div", "zp-trade-line");
        g.appendChild(el("span", "zp-trade-tag", "gave up"));
        g.appendChild(el("span", undefined, p.gave.join(", ")));
        li.appendChild(g);
      }
      const e = el("div", "zp-trade-line");
      e.appendChild(el("span", "zp-trade-tag", "earned"));
      e.appendChild(el("span", undefined, p.earned));
      li.appendChild(e);
      ul.appendChild(li);
    });
  }

  function renderHandover(ok, props, proof) {
    const pre = card.querySelector(".zp-cert");
    const proven = PROPS.filter((p) => props[p.key] === true).map((p) =>
      p.label
    );
    const specs = (proof && proof.declared_specs) || [];
    pre.textContent = [
      "zigttp proof certificate",
      "------------------------",
      "verdict:  " + (ok ? "proven" : "blocked"),
      "proven:   " + (proven.join(", ") || "(none)"),
      "declared: " + (specs.join(", ") || "(none)"),
      "",
      ok
        ? "Every property above is a compiler guarantee an AI agent"
        : "Resolve the blockers above; the compiler will not ship",
      ok
        ? "can rely on while it refactors this handler."
        : "this handler until each obligation is discharged.",
    ].join("\n");
  }

  // --- lens switching -----------------------------------------------------
  card.querySelectorAll("[data-lens]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeLens = btn.getAttribute("data-lens");
      card.querySelectorAll("[data-lens]").forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      card.querySelectorAll(".zp-lens").forEach((pane) => {
        pane.hidden = pane.getAttribute("data-lens") !== activeLens;
      });
      // The newly-shown pane may be stale - rebuild it from the last result.
      renderLens(activeLens);
    });
  });

  const copyBtn = card.querySelector(".zp-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const text = card.querySelector(".zp-cert").textContent;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.textContent = "Copied";
          setTimeout(() => (copyBtn.textContent = "Copy certificate"), 1400);
        });
      }
    });
  }

  // --- run loop -----------------------------------------------------------
  let debounce = 0;
  function runAnalysis() {
    if (!wasm) return;
    const result = analyze(editor.value);
    if (result) render(result);
  }

  function scheduleAnalysis() {
    syncHighlight();
    clearTimeout(debounce);
    debounce = setTimeout(runAnalysis, 160);
  }

  editor.addEventListener("input", scheduleAnalysis);
  editor.addEventListener("scroll", syncScroll);
  editor.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const s = editor.selectionStart, end = editor.selectionEnd;
    editor.value = editor.value.slice(0, s) + "  " + editor.value.slice(end);
    editor.selectionStart = editor.selectionEnd = s + 2;
    scheduleAnalysis();
  });

  // --- perturbation buttons ----------------------------------------------
  let activePerturb = null;
  const perturbBtns = section.querySelectorAll("[data-perturb]");
  perturbBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.getAttribute("data-perturb");
      if (activePerturb === kind) {
        editor.value = SEED;
        activePerturb = null;
      } else {
        editor.value = VARIANTS[kind] || SEED;
        activePerturb = kind;
      }
      perturbBtns.forEach((b) => {
        const k = b.getAttribute("data-perturb");
        b.classList.toggle("active", k === activePerturb);
        b.textContent = k === activePerturb
          ? "Revert"
          : b.getAttribute("data-label");
      });
      syncHighlight();
      runAnalysis();
    });
  });

  // --- boot ---------------------------------------------------------------
  function setStatus(text, kind) {
    const s = card.querySelector(".zp-status");
    if (s) {
      s.textContent = text;
      s.className = "zp-status" + (kind ? " " + kind : "");
    }
  }

  let booted = false;
  async function boot() {
    if (booted) return;
    booted = true;
    editor.value = SEED;
    syncHighlight();
    if (typeof WebAssembly === "undefined") {
      setStatus("playground needs WebAssembly", "zp-status-warn");
      return;
    }
    setStatus("loading proof engine...", "");
    try {
      await loadWasm();
    } catch (err) {
      console.error("playground: proof engine failed to load", err);
      setStatus(
        "proof engine unavailable - install zigttp to try it locally",
        "zp-status-warn",
      );
      return;
    }
    setStatus("", "");
    card.classList.add("zp-live");
    editor.removeAttribute("readonly");
    runAnalysis();
  }

  // Lazy-load: only fetch the wasm once the section nears the viewport.
  if ("IntersectionObserver" in globalThis) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          io.disconnect();
          boot();
        }
      });
    }, { rootMargin: "300px" });
    io.observe(section);
  } else {
    boot();
  }
})();
