---
title: Fail closed when optional UI enhancement cannot load
date: 2026-08-01
category: ui-bugs
module: static frontend
problem_type: ui_bug
component: frontend_stimulus
symptoms:
  - A pre-rendered proven verdict could remain visible after the proof engine failed to load
  - Navigation and deck content could become inaccessible when JavaScript was unavailable
  - Slide state could not be linked, restored, or announced consistently
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [progressive-enhancement, fail-closed, accessibility, wasm, mobile]
---

# Fail closed when optional UI enhancement cannot load

## Problem

The site depended on JavaScript and WebAssembly for several useful interactions,
but some failure paths preserved success-looking state or hid content. A visitor
could therefore see an unearned proof verdict or lose access to navigation and
deck content when enhancement did not complete.

## Symptoms

- The proof playground shipped a useful pre-rendered preview, but a later
  analyzer load failure needed to revoke its positive verdict.
- Mobile navigation and the slide deck needed usable document-order fallbacks
  when JavaScript was blocked.
- Enhanced deck navigation needed current-state semantics, stable deep links,
  browser-history restoration, keyboard controls, and touch input.

## What Didn't Work

A static fallback by itself was not enough. Once JavaScript attached to the
page, a failed WebAssembly fetch became a distinct runtime state. Leaving the
pre-rendered `PROVEN` content in place would confuse a preview with a result
produced during the current visit.

Likewise, hiding inactive slides and mobile navigation by default made the
enhanced layout clean, but it also hid the only route to content when the
controlling script was absent.

## Solution

Start from usable HTML and make enhancement explicit:

1. Mark the root as `no-js` and let the external controller replace it with `js`
   only after that controller loads (`static/index.html:2`,
   `static/script.js:1-4`). Scope component-specific controls to the component's
   own readiness marker, so one loaded script cannot make another failed
   component look interactive.
2. Keep the playground editor read-only and its preview visible in the source
   document (`static/index.html:346-372`). Model `static`, `loading`, `live`,
   and `unavailable` states in one function. Only `live` unlocks controls, while
   `unavailable` replaces the verdict with `UNAVAILABLE`, says that proof did
   not run, and exposes retry (`static/playground.js:930-999`).
3. In no-JavaScript CSS, expose normal navigation links and stack every deck
   slide in document order (`static/style.css:172-178`,
   `static/style.css:361-392`).
4. During deck enhancement, normalize all server-rendered active state before
   selecting the URL-addressed slide. Keep the active slide synchronized with
   `aria-current`, the live counter, the URL hash, history events, keyboard
   input, and pointer swipes (`static/script.js:129-235`).
5. Keep touch targets at least 44 by 44 CSS pixels and allow the slide-dot row
   to scroll rather than compress (`static/style.css:1021-1109`).

The regression suite characterizes the fallback, failure, routing, and
accessibility contracts without adding a client framework
(`tests/site_contract_test.ts:11-126`).

## Why This Works

The document is useful before enhancement. JavaScript then moves the UI through
explicit states and enables controls only after their dependency is ready. A
dependency failure cannot inherit a success claim because the unavailable
transition updates the verdict, count, status, controls, and retry affordance
together.

The same boundary applies to navigation. CSS exposes content when there is no
controller, while JavaScript owns only the enhanced single-slide state.
Normalizing pre-rendered state before reading the hash prevents two slides from
appearing active at once.

## Prevention

- Render core content and navigation in useful document order before writing
  enhancement code.
- Give optional runtime dependencies explicit loading, live, and unavailable
  states. Never let a static preview masquerade as a live result.
- Enable inputs only in the state that can honor them.
- Test the page with JavaScript disabled and with each optional dependency
  blocked independently.
- For carousels and decks, verify deep linking, Back and Forward restoration,
  announced current state, keyboard behavior, touch behavior, inner scrolling,
  and 44-pixel targets.
- Keep route and security-header contracts covered when extracting a request
  handler for tests (`main.ts:57-104`).

## Related Issues

- None recorded.
