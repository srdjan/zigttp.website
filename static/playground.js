// Live proof playground. Loads the real zigts analyzer (compiled to wasm)
// and drives the proof card from its output. The page works without this
// script: the section ships a pre-rendered proven card and a plain editor.
//
// WASM_URL is patched by scripts/build-wasm-playground.sh on every build.
const WASM_URL = "/zigts-analyzer.5af8cd83c269.wasm";

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
  // Two seeds back the editor tabs. Both share one handler body, so they
  // prove the same properties; they differ only in whether a Spec<...> is
  // declared - which is the whole point: every guarantee is enforced by
  // default, and Spec<...> only narrows the *declared* set. Each variant
  // breaks exactly one proof so a passive visitor still watches the card
  // flip. RETURN_LINE is the shared anchor the variant edits target, so the
  // seeds and their variants cannot drift apart.
  const RETURN_LINE = "  return Response.json({ ok: true });";

  const SEED_DEFAULT = [
    "// No Spec<...> here, so every guarantee is enforced by",
    "// default. Break one below and the card flips red.",
    "function handler(req: Request): Response {",
    RETURN_LINE,
    "}",
    "",
  ].join("\n");

  const SEED_SPEC = [
    'import type { Spec } from "zigttp:types";',
    "",
    "// All guarantees are enforced by default. This Spec<...>",
    "// narrows enforcement to these three; break one and the card flips red.",
    "type Guarantees = Spec<",
    '  "deterministic" | "no_secret_leakage" | "injection_safe"',
    ">;",
    "",
    "function handler(req: Request): Response & Guarantees {",
    RETURN_LINE,
    "}",
    "",
  ].join("\n");

  // Derive the three perturbation variants from whichever seed is active.
  function variantsFor(seed) {
    return {
      datenow: seed.replace(
        RETURN_LINE,
        "  const stamp = Date.now();\n  return Response.json({ ok: true, stamp });",
      ),
      secret: ('import { env } from "zigttp:env";\n' + seed).replace(
        RETURN_LINE,
        '  return Response.json({ apiKey: env("SECRET_KEY") });',
      ),
      while: seed.replace(RETURN_LINE, "  while (true) {}\n" + RETURN_LINE),
    };
  }

  // The Spec<...> tab is first and active on load - it proves green, so the
  // attract demo and first impression stay green. The no-Spec tab is strict
  // (it enforces every guarantee, including unearned fault-coverage).
  let activeSeed = SEED_SPEC;
  let VARIANTS = variantsFor(activeSeed);

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
  // The property key whose proof trace is expanded, or null. One open at a
  // time (accordion). Tracked so a recompile rebuild restores the open chip.
  let openChipKey = null;

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
    const verdictEl = head.querySelector(".zp-verdict");
    const verdict = ok ? "PROVEN" : "BLOCKED";
    // Guarded so the aria-live region announces only on a real flip.
    if (verdictEl.textContent !== verdict) verdictEl.textContent = verdict;
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

  // Look up the proof trace for one property in the last analyzer result.
  // Null when the analyzer is older than this feature (graceful degrade).
  function traceFor(key) {
    const pt = lastResult && lastResult.proof && lastResult.proof.proofTrace;
    return (pt && pt[key]) || null;
  }

  // Build one property cell: a chip button plus a collapsible trace panel.
  // The panel is rendered lazily - only when the chip is the open one.
  function chip(p, on, flipped) {
    const cell = el("li", "zp-chip-cell");
    const btn = el("button", "zp-chip " + (on ? "on" : "off"));
    btn.type = "button";
    btn.setAttribute("data-prop", p.key);
    if (flipped && !reduceMotion) btn.classList.add("zp-flip");
    btn.appendChild(el("span", "zp-glyph", on ? "+" : "-"));
    btn.appendChild(el("span", "zp-chip-label", p.label));

    const trace = traceFor(p.key);
    if (!trace) {
      cell.appendChild(btn);
      return cell;
    }

    const chev = el("span", "zp-chevron");
    chev.setAttribute("aria-hidden", "true");
    btn.appendChild(chev);
    const panelId = "zp-trace-" + p.key;
    btn.setAttribute("aria-expanded", openChipKey === p.key ? "true" : "false");
    btn.setAttribute("aria-controls", panelId);

    const panel = el("div", "zp-trace");
    panel.id = panelId;
    const inner = el("div", "zp-trace-inner");
    panel.appendChild(inner);
    cell.appendChild(btn);
    cell.appendChild(panel);

    if (openChipKey === p.key) {
      cell.classList.add("zp-open");
      renderTrace(inner, trace);
    }
    return cell;
  }

  // Render one property's reasoning into its trace panel. Branches on the
  // counterexample shape: a flow chain for data-leak proofs, an offending
  // node for structural proofs.
  function renderTrace(inner, trace) {
    inner.textContent = "";
    const body = el("div", "zp-trace-body " + (trace.holds ? "ok" : "bad"));
    body.appendChild(el(
      "p",
      "zp-trace-head",
      trace.holds ? "How the compiler proved this" : "Counterexample",
    ));
    body.appendChild(el("p", "zp-trace-summary", trace.summary));

    const f = trace.facts;
    if (f && typeof f.pathsEnumerated === "number") {
      let txt = f.pathsEnumerated + " path" +
        (f.pathsEnumerated === 1 ? "" : "s") + " enumerated";
      if (f.pathsExhaustive) txt += " (exhaustive)";
      if (f.failableSites > 0) {
        txt += " - " + f.coveredSites + "/" + f.failableSites +
          " failable I/O sites covered";
      }
      body.appendChild(el("p", "zp-trace-fact", txt));
    }

    // Resisted evidence: the attack a passing flow proof defeats. Present only
    // when the property holds; turns a green check into a source -> guard ->
    // sink chain. Reuses the flow-chain element pattern; degrades to nothing
    // against an older wasm that does not emit `resisted`.
    const r = trace.resisted;
    if (trace.holds && r) {
      if (r.attackInput) {
        body.appendChild(el("p", "zp-trace-req", "tried: " + r.attackInput));
      }
      const chain = el("p", "zp-trace-flow");
      (r.chain || []).forEach((step, i) => {
        if (i > 0) chain.appendChild(el("span", "zp-trace-arrow", " -> "));
        chain.appendChild(el("span", "zp-trace-step", step));
      });
      body.appendChild(chain);
      if (r.conclusion) {
        const c = el("p", "zp-trace-fix");
        c.appendChild(el("span", "zp-trace-fix-tag", "safe"));
        c.appendChild(el("span", undefined, r.conclusion));
        body.appendChild(c);
      }
    }

    const cx = trace.counterexample;
    if (cx && cx.kind === "flow-chain") {
      const flow = el("p", "zp-trace-flow");
      (cx.flow || []).forEach((step, i) => {
        if (i > 0) flow.appendChild(el("span", "zp-trace-arrow", " -> "));
        flow.appendChild(el("span", "zp-trace-step", step));
      });
      body.appendChild(flow);
      if (cx.request) {
        body.appendChild(el(
          "p",
          "zp-trace-req",
          "triggered by " + cx.request.method + " " + cx.request.url +
            (cx.request.hasAuthHeader ? " with an Authorization header" : ""),
        ));
      }
    } else if (cx && cx.kind === "offending-node") {
      const code = el("p", "zp-trace-code");
      code.appendChild(el(
        "span",
        "zp-trace-loc",
        "handler.ts:" + cx.location.line,
      ));
      code.appendChild(el("code", "zp-trace-snip", cx.snippet));
      body.appendChild(code);
    }
    if (cx && cx.fix) {
      const fix = el("p", "zp-trace-fix");
      fix.appendChild(el("span", "zp-trace-fix-tag", "fix"));
      fix.appendChild(el("span", undefined, cx.fix));
      body.appendChild(fix);
    }
    inner.appendChild(body);
  }

  function renderProperties(props, proof) {
    const ul = card.querySelector(".zp-chips");
    ul.textContent = "";
    PROPS.forEach((p) => {
      const on = props[p.key] === true;
      const flipped = prevState[p.key] !== undefined &&
        prevState[p.key] !== props[p.key];
      ul.appendChild(chip(p, on, flipped));
    });
    // prevState tracks the last *Properties* render so the flip animation
    // fires for chips that changed since this lens was last shown.
    prevState = Object.assign({}, props);

    const specWrap = card.querySelector(".zp-specs");
    specWrap.textContent = "";
    // Only show the declared-Spec row when the handler actually declares a
    // Spec<...> (comments stripped first). With no Spec, every guarantee is
    // enforced by default and the analyzer reports the full active set - that
    // is not an author declaration, so the row stays empty. This is the whole
    // point of the two tabs: default enforces all; Spec<...> narrows.
    const declaresSpec = /Spec\s*</.test(
      editor.value.replace(/\/\/[^\n]*/g, ""),
    );
    const specs = (proof && proof.declared_specs) || [];
    if (declaresSpec && specs.length) {
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
      engage();
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

  // --- proof trace expand/collapse ---------------------------------------
  // One delegated listener on the chip list: the list element persists across
  // renderProperties rebuilds, only its children are replaced.
  const chipsList = card.querySelector(".zp-chips");
  if (chipsList) {
    chipsList.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".zp-chip");
      if (!btn || !chipsList.contains(btn)) return;
      const cell = btn.parentElement;
      const panel = cell.querySelector(".zp-trace");
      if (!panel) return; // chip has no trace (older analyzer)
      engage();
      const key = btn.getAttribute("data-prop");
      const wasOpen = cell.classList.contains("zp-open");
      // Accordion: close every open cell first.
      chipsList.querySelectorAll(".zp-chip-cell.zp-open").forEach((c) => {
        c.classList.remove("zp-open");
        const b = c.querySelector(".zp-chip");
        if (b) b.setAttribute("aria-expanded", "false");
      });
      if (wasOpen) {
        openChipKey = null;
        return;
      }
      openChipKey = key;
      cell.classList.add("zp-open");
      btn.setAttribute("aria-expanded", "true");
      const inner = panel.querySelector(".zp-trace-inner");
      const trace = traceFor(key);
      if (inner && trace && !inner.firstChild) renderTrace(inner, trace);
    });
  }

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

  function fmtMs(ms) {
    return (ms < 10 ? ms.toFixed(1) : String(Math.round(ms))) + " ms";
  }

  function runAnalysis() {
    if (!wasm) return;
    const t0 = performance.now();
    const result = analyze(editor.value);
    const elapsed = performance.now() - t0;
    if (result) {
      render(result);
      setStatus("proved in " + fmtMs(elapsed), "");
    }
  }

  function scheduleAnalysis() {
    engage();
    syncHighlight();
    clearTimeout(debounce);
    debounce = setTimeout(runAnalysis, 160);
  }

  editor.addEventListener("input", scheduleAnalysis);
  editor.addEventListener("scroll", syncScroll);
  editor.addEventListener("focus", engage);
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

  // Swap the editor to a perturbation variant - or back to the seed when
  // `kind` is null - sync the button states, and re-prove. Shared by the
  // buttons and the auto-demo. A direct editor.value write does not fire an
  // `input` event, so this never trips the engage() interaction guard.
  function applyPerturb(kind) {
    activePerturb = kind;
    editor.value = kind ? (VARIANTS[kind] || activeSeed) : activeSeed;
    perturbBtns.forEach((b) => {
      const k = b.getAttribute("data-perturb");
      b.classList.toggle("active", k === kind);
      b.textContent = k === kind ? "Revert" : b.getAttribute("data-label");
    });
    syncHighlight();
    runAnalysis();
  }

  perturbBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      engage();
      const kind = btn.getAttribute("data-perturb");
      applyPerturb(activePerturb === kind ? null : kind);
    });
  });

  // --- seed tabs ----------------------------------------------------------
  // Switch the editor between the no-Spec default and the Spec<...> example.
  // Both prove the same properties; only the declared-Spec chip row differs.
  // Switching resets any active perturbation and collapses an open trace.
  const seedTabs = section.querySelectorAll("[data-seed]");

  function selectSeed(which) {
    activeSeed = which === "spec" ? SEED_SPEC : SEED_DEFAULT;
    VARIANTS = variantsFor(activeSeed);
    activePerturb = null;
    perturbBtns.forEach((b) => {
      b.classList.remove("active");
      b.textContent = b.getAttribute("data-label");
    });
    openChipKey = null;
    editor.value = activeSeed;
    syncHighlight();
    runAnalysis();
  }

  seedTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      engage();
      seedTabs.forEach((t) => {
        const on = t === tab;
        t.classList.toggle("active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
      });
      selectSeed(tab.getAttribute("data-seed"));
    });
  });

  // --- attract demo -------------------------------------------------------
  // Until the visitor touches the playground, run one scripted proof flip so
  // a passive scroll-by sees the card move on its own. Any interaction - or a
  // reduced-motion preference - cancels it.
  const DEMO_INJECT_MS = 1400;
  const DEMO_HOLD_MS = 1900;
  const DEMO_REVERT_MS = DEMO_INJECT_MS + DEMO_HOLD_MS;
  let userEngaged = false;
  let demoTimers = [];

  function clearHints() {
    section.querySelectorAll(".zp-hint").forEach((b) =>
      b.classList.remove("zp-hint")
    );
  }

  // First real interaction cancels the demo. Clearing the timers is the whole
  // cancellation - a cleared timer cannot fire, so the callbacks need no guard.
  function engage() {
    if (userEngaged) return;
    userEngaged = true;
    demoTimers.forEach(clearTimeout);
    demoTimers = [];
    clearHints();
  }

  function autoDemo() {
    if (reduceMotion || userEngaged) return;
    const datenowBtn = section.querySelector('[data-perturb="datenow"]');
    demoTimers.push(setTimeout(() => {
      if (datenowBtn) datenowBtn.classList.add("zp-hint");
      applyPerturb("datenow");
    }, DEMO_INJECT_MS));
    // Unfurl the broken proof's trace so a passive viewer sees the
    // counterexample, not just a red chip.
    demoTimers.push(setTimeout(() => {
      openChipKey = "deterministic";
      renderLens("properties");
    }, DEMO_INJECT_MS + 560));
    demoTimers.push(setTimeout(() => {
      clearHints();
      openChipKey = null;
      applyPerturb(null);
    }, DEMO_REVERT_MS));
  }

  // --- boot ---------------------------------------------------------------
  function setStatus(text, kind) {
    const s = card.querySelector(".zp-status");
    if (!s) return;
    s.textContent = text;
    const cls = "zp-status" + (kind ? " " + kind : "");
    if (s.className !== cls) s.className = cls;
  }

  let booted = false;
  async function boot() {
    if (booted) return;
    booted = true;
    editor.value = activeSeed;
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
    card.classList.add("zp-live");
    editor.removeAttribute("readonly");
    runAnalysis();
    autoDemo();
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
