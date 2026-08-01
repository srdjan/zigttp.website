# Plan 004: A failing enhancement in `script.js` cannot take deck navigation with it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report; do not improvise around it. When done, update the status row for this
> plan in `plans/README.md`, unless a reviewer says they maintain the index.
>
> **Drift check, run first**:
> `grep -n "rootMargin" -B 20 static/script.js | head -40` If the scroll-spy
> block does not match the excerpt under Current state, stop and report.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `63e96ec` and 2026-08-01

## Why this matters

`static/script.js` is one flat top-level scope. The scroll-spy block builds an
`IntersectionObserver` whose `rootMargin` is computed from a CSS custom
property. If that property does not resolve, `parseInt` yields `NaN`, the string
becomes `"NaNpx 0px -60% 0px"`, and the `IntersectionObserver` constructor
throws `SyntaxError`. Nothing catches it, so every line below stops executing,
including all of deck navigation: buttons, dots, keyboard control, swipe, and
hash restore.

That inverts the contract this branch was built around. The no-JS deck is
designed to degrade to "unstyled but fully navigable." A CSS failure currently
degrades it to "no navigation at all," which is worse than having no JavaScript.

## Current state

The scroll-spy block, `static/script.js:81-115`:

```js
// Scroll spy for active nav indicator
const spyLinks = document.querySelectorAll(
  '.nav-links a[href^="#"], .z-nav-links a[href^="#"]',
);
const spySections = [...spyLinks].map((link) =>
  document.querySelector(link.getAttribute("href"))
).filter(Boolean);

if (spySections.length && "IntersectionObserver" in globalThis) {
  const linkForId = new Map();
  spyLinks.forEach((link) => {
    const id = link.getAttribute("href").slice(1);
    if (!linkForId.has(id)) linkForId.set(id, link);
  });
  const scrollSpy = new IntersectionObserver(
    (entries) => {/* ... */},
    {
      threshold: 0.3,
      rootMargin: `${-parseInt(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--nav-height",
        ),
      )}px 0px -60% 0px`,
    },
  );
  spySections.forEach((section) => scrollSpy.observe(section));
}
```

Facts:

- `--nav-height` is defined exactly once, at `static/style.css:15`, as `56px`.
  If `style.css` fails to load or is blocked, `getPropertyValue` returns `""`
  and `parseInt("")` is `NaN`.
- The `IntersectionObserver` constructor rejects a non-pixel, non-percent
  `rootMargin` by throwing. It does not fall back to a default.
- Deck navigation begins at `static/script.js:118`
  (`const deck = document.getElementById("deck");`) and runs to the end of the
  file at `:236`. All of it is below the throw site, in the same scope.
- The install-card copy handler (`:48-71`) and both `initMenuToggle` calls
  (`:39-43`, `:74-79`) are above the throw site and would survive.
- `static/script.js` is loaded with `defer` on both pages
  (`static/index.html:744`, `static/deck.html:983`).

**Assumption this plan depends on**: the deck page and the homepage share this
one file, so a homepage-only feature can break a deck-only feature. Confirmed by
the two `<script src="/script.js?v=13">` references above.

## Commands you will need

| Purpose             | Command                                             | Expected on success          |
| ------------------- | --------------------------------------------------- | ---------------------------- |
| Install/setup       | n/a                                                 | no dependencies              |
| Typecheck/compile   | `deno check main.ts`                                | `Check main.ts`, exit 0      |
| Tests               | `deno task test`                                    | `ok \| N passed \| 0 failed` |
| Lint/format check   | `deno fmt --check && deno lint`                     | `Checked N files`, exit 0    |
| Manual verification | `deno task start` then `http://localhost:8000/deck` | see Step 3                   |

## Scope

**In scope, the only files to modify:**

- `static/script.js` — the scroll-spy block.
- `static/index.html` and `static/deck.html` — the `script.js?v=` bump, one line
  each, kept in sync.
- `tests/site_contract_test.ts` — regression assertion.

**Out of scope, do not touch even if related:**

- `static/style.css` — `--nav-height` is correctly defined; the bug is the
  consumer's missing guard, not the token.
- The deck navigation logic itself (`static/script.js:118-236`). It is not
  defective; it is only unreachable when something above it throws.
- `static/playground.js` — a separate file with its own `IntersectionObserver`
  at `:1023`, already guarded by a feature check and using a literal
  `rootMargin: "300px"`. It cannot hit this bug.
- Converting `script.js` to modules or adding a build step. `CLAUDE.md` rules
  out a bundler.

## Git/workflow guidance

- Branch name: current branch `fix/ux-audit` unless the operator says otherwise.
- Commit style: Conventional Commits. Suggested:
  `fix(site): isolate scroll spy from deck navigation`.
- Do not push, open a PR, or deploy.

## Steps

### Step 1: Give the computed offset a real fallback

Extract the offset into a named value with an explicit default that matches the
token in `static/style.css:15`. Replace the inline template expression with
something like:

```js
const navHeightRaw = getComputedStyle(document.documentElement)
  .getPropertyValue("--nav-height");
const navHeight = Number.parseInt(navHeightRaw, 10) || 56;
```

Then use `rootMargin:`${-navHeight}px 0px -60% 0px``.

`|| 56` is deliberate rather than `?? 56`: `parseInt` returns `NaN`, not `null`,
and `NaN` is falsy, so `||` is the operator that actually catches this. A zero
offset would also be wrong here, and `0 || 56` giving 56 is acceptable because a
zero nav height is not a real configuration.

Add a one-line comment explaining that the literal mirrors `--nav-height` in
`static/style.css`, so the two do not drift silently. Match the existing comment
style in the file: sentence case, no emojis, no em dashes.

**Verify**: `grep -n "navHeight" static/script.js` -> the extracted binding and
its single use in `rootMargin`.

### Step 2: Stop one broken enhancement from killing the file

Wrap the scroll-spy construction so a throw is contained and reported instead of
aborting the rest of the file:

```js
  try {
    const scrollSpy = new IntersectionObserver(/* ... */);
    spySections.forEach((section) => scrollSpy.observe(section));
  } catch (err) {
    console.error("script: scroll spy unavailable", err);
  }
}
```

Scope the `try` to the observer construction and the `observe` loop only. Do not
wrap the whole file, and do not wrap the deck block. The goal is that a failure
in an optional nav indicator degrades to "no active-link highlight," which is
exactly what progressive enhancement should mean here.

Match the diagnostic prefix convention: `static/playground.js` uses
`console.error("playground: ...", err)` at `:187` and `:1004`. Use `script:` for
this file.

**Verify**: `grep -n "scroll spy unavailable" static/script.js` -> one match.

### Step 3: Prove the isolation by hand

The point of this plan is behavior under failure, so verify the failure case,
not only the happy path.

1. Run `deno task start` and load `http://localhost:8000/deck`. Confirm slides
   advance with the next/prev buttons, arrow keys, dots, and that the URL hash
   updates.
2. Load `http://localhost:8000/` and confirm the nav active-link indicator still
   tracks the section you are scrolled to.
3. Simulate the failure: in devtools, block `style.css` (request blocking) and
   reload `/deck`. Confirm the page renders unstyled and that slide navigation
   still works. Before this fix, navigation is dead in that state.

Step 3.3 is the acceptance test for this plan. If it cannot be reproduced with
request blocking, an equivalent way to make `--nav-height` unresolvable is
acceptable; record which method was used.

**Teardown is mandatory.** Kill the server, close the browser, then confirm
`lsof -nP -iTCP:8000 -sTCP:LISTEN` returns no rows.

**Verify**: deck navigation works with `style.css` blocked, and
`lsof -nP -iTCP:8000 -sTCP:LISTEN` -> no output.

### Step 4: Bump the cache-bust version on both pages

`static/script.js` is referenced from two documents. Bump both to the same next
unused number:

- `static/index.html:744`
- `static/deck.html:983`

They currently both read `v=13`. A mismatch between the two would serve two
different cached copies of one file to the same visitor.

**Verify**: `grep -rn "script.js?v=" static/` -> exactly two lines with the same
version number.

## Test plan

Add to `tests/site_contract_test.ts`, near the existing deck test at lines
134-166:

```ts
Deno.test("an optional enhancement cannot abort deck navigation", async () => {
  const script = await source("static/script.js");
  const spyIndex = script.indexOf("new IntersectionObserver");
  const deckIndex = script.indexOf('document.getElementById("deck")');

  assert(
    spyIndex !== -1 && deckIndex !== -1 && spyIndex < deckIndex,
    "the scroll spy still precedes deck navigation in the same scope",
  );
  assert(
    script.includes("scroll spy unavailable"),
    "a failing scroll spy must be caught, not left to abort the file",
  );
});
```

The first assertion documents why the second one matters: as long as the spy
runs first in a shared scope, its failure must be contained.

Edge cases:

- `--nav-height` resolves normally: offset is 56, behavior unchanged. This is
  the regression case.
- `--nav-height` is empty: offset falls back to 56, no throw.
- `IntersectionObserver` construction throws for some other reason: caught,
  logged, deck still works.
- The homepage has no deck element, so the deck block is a no-op there. The fix
  must not change that.

## Done criteria

All must hold:

- [ ] `deno fmt --check` exits 0
- [ ] `deno lint` exits 0
- [ ] `deno task test` exits 0 with the new assertions passing
- [ ] Deck navigation works with `style.css` blocked in a real browser
- [ ] The homepage nav active-link indicator still works normally
- [ ] `script.js?v=` matches across `static/index.html` and `static/deck.html`
- [ ] No files outside the in-scope list are modified
- [ ] `:8000` is free and no browser session is left open
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The scroll-spy excerpt does not match the live code.
- Deck navigation is still dead with `style.css` blocked after the change. That
  would mean a second throw site exists above the deck block, and the plan needs
  extending rather than patching.
- `--nav-height` has moved out of `static/style.css:15` or gained a non-pixel
  unit.
- `deno task test` fails twice after reasonable local correction.

## Maintenance notes

- The structural risk outlives this fix: `static/script.js` stays one flat scope
  shared by two pages, so any new top-level enhancement can abort everything
  below it. The cheap discipline is to put each independent feature in its own
  guarded block and keep deck navigation last. Consider that rule when the file
  next grows.
- Reviewers should check that the `try` is scoped to the observer only, and that
  the `56` fallback carries the comment pointing at `static/style.css`.
- Deliberately deferred: splitting `script.js` into per-page files would remove
  the cross-page coupling entirely, but it adds a request and a versioning
  surface, so it is a separate decision.
