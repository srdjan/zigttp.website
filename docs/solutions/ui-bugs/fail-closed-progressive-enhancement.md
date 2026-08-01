---
title: Fail closed when optional UI enhancement cannot load
date: 2026-08-01
last_updated: 2026-08-01
category: ui-bugs
module: static frontend
problem_type: ui_bug
component: frontend_stimulus
symptoms:
  - A pre-rendered proven verdict or guarantee pane could remain visible after the proof engine failed to load
  - A blocked-state diagnostic could remain visible after the analyzer returned to a proven state
  - The editor could appear blank before the lazy analyzer entered the viewport
  - Navigation and deck content could become inaccessible when JavaScript was unavailable
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [progressive-enhancement, fail-closed, accessibility, wasm, lazy-loading]
---

# Fail closed when optional UI enhancement cannot load

## Problem

The site uses JavaScript and WebAssembly for useful interactions, but the
document must remain readable and truthful before either dependency is ready.
Several presentation paths hid fallback content or preserved success-looking
state when enhancement was absent, incomplete, or moving between proof states.

The most damaging case was contradictory proof output. A visitor could see a
green `PROVEN` verdict beside a stale red diagnostic, or see an empty source
editor while the analyzer was still waiting to load. Even after the failure
header was corrected to `UNAVAILABLE`, the card could still show green guarantee
chips beside `proof not run`.

## Symptoms

- A WebAssembly load failure could inherit the pre-rendered `PROVEN` preview.
- An `UNAVAILABLE` header and `proof not run` count could still sit above green
  guarantee chips.
- Returning from a blocked proof to a proven proof could leave the old
  diagnostic panel painted.
- JavaScript made the textarea text transparent before the lazy syntax overlay
  contained the server-rendered source.
- Mobile navigation and deck slides could be hidden when their controller did
  not load.

## What Didn't Work

A static fallback was necessary but not sufficient. Once JavaScript attached,
the component entered states that the original document could not represent by
itself. A failed analyzer fetch needed to revoke the preview, and a component
readiness class needed to expose a fully populated enhanced surface.

Updating only the failure header was also insufficient. The proof lens bar and
four proof panes are separate from the verdict and diagnostic nodes
(`static/index.html:333-473`). Hiding the diagnostic alone left the
server-rendered guarantee chips visible, while clearing the fallback markup
would have broken the no-JavaScript preview.

Native attributes were also insufficient when author CSS contradicted them. The
diagnostic container correctly received `hidden`, but the base `.zp-why` rule
assigned `display: grid` and overrode the browser's default hidden rule.
Clearing the diagnostic text in JavaScript would still leave the panel in
layout, and adding a second visibility class would duplicate state.

## Solution

Start from usable HTML, then make every enhancement boundary explicit:

1. Keep the document root in `no-js` until the shared controller loads. Expose
   navigation and deck content in document order when that class remains
   (`static/script.js:1-3`, `static/style.css:172-178`,
   `static/style.css:361-392`).
2. Ship the playground with readable source in a read-only textarea and a
   pre-rendered proof preview (`static/index.html:306-343`). Add `zp-js` only
   when the component controller has its required nodes
   (`static/playground.js:10-16`).
3. Model `static`, `loading`, `live`, and `unavailable` in one state function.
   Only `live` unlocks input. `unavailable` replaces the verdict with
   `UNAVAILABLE`, reports that proof did not run, and exposes retry
   (`static/playground.js:938-988`). Derive proof-detail visibility from the
   same transition so `loading` and `unavailable` hide the lens bar and every
   pane, while `static` and `live` restore only the active lens
   (`static/playground.js:629-638`, `static/playground.js:938-948`).
4. Make native proof and diagnostic visibility authoritative in the component
   stylesheet (`static/home.css:1691-1694`, `static/home.css:2071-2084`):

   ```css
   .zp-lensbar[hidden],
   .zp-lens[hidden],
   .zp-why[hidden] {
     display: none;
   }
   ```

5. Seed the highlighted overlay from the textarea before entering static state
   and before installing the lazy observer (`static/playground.js:1016-1033`):

   ```js
   syncHighlight();
   setPlaygroundState("static");
   ```

6. Normalize deck state before selecting the URL-addressed slide, then keep the
   active slide synchronized with `aria-current`, the counter, the URL, browser
   history, keyboard input, and pointer swipes (`static/script.js:129-235`).

The site contract suite now covers the no-JavaScript fallbacks, analyzer failure
state, stale proof-detail suppression, hidden diagnostic rule, pre-boot
highlight ordering, routes, and deck state
(`tests/site_contract_test.ts:7-166`).

## Why This Works

The document is useful before enhancement. JavaScript then moves each component
through explicit states and enables controls only after the dependency that can
honor them is ready. A dependency failure cannot inherit a success claim because
the unavailable transition updates the verdict, count, status, controls, retry
affordance, lens navigation, and proof panes together. A successful retry moves
back through the same transition, reveals only the selected lens, and then
re-renders it from the live analyzer result (`static/playground.js:633-638`,
`static/playground.js:1001-1011`).

The two presentation fixes keep one owner for each state. The `hidden` attribute
owns diagnostic visibility, with CSS that honors it even beside a grid rule. The
textarea owns the pre-boot source, and `syncHighlight()` derives the enhanced
layer from that value before the browser can paint it. WebAssembly remains
lazy-loaded when `IntersectionObserver` is available, with an immediate
compatibility fallback. No independently maintained duplicate source or inline
`display` styles are introduced.

## Prevention

- Render core content and navigation in useful document order before adding
  enhancement code.
- Treat controller readiness, dependency loading, and interactive readiness as
  separate states.
- Never let a static preview masquerade as a live result.
- When a result becomes unavailable, hide its complete evidence region, not only
  the headline or diagnostic.
- When author CSS assigns `display` to an element controlled by `hidden`, add a
  component-scoped `[hidden]` rule after the base display rule.
- Populate a derived visual layer before hiding its readable fallback.
- Test with JavaScript disabled, with optional dependencies blocked, and during
  the interval before a lazy dependency starts.
- Keep route and security-header behavior covered at the request-handler
  boundary (`main.ts:57-104`).

## Related Issues

- None recorded.
