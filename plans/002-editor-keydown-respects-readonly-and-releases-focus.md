# Plan 002: The playground editor releases keyboard focus and honors `readonly`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report; do not improvise around it. When done, update the status row for this
> plan in `plans/README.md`, unless a reviewer says they maintain the index.
>
> **Drift check, run first**:
> `grep -n 'e.key !== "Tab"' -B 4 -A 8 static/playground.js` If the excerpt
> under Current state does not match the live code, stop and report. The
> repository had 11 uncommitted modified files when this plan was written, so
> `git diff` against `c05521f` is not a reliable drift signal.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (independent of plan 001; different lines in the same
  file, so land 001 first if both are in flight)
- **Category**: bug
- **Planned at**: commit `63e96ec` and 2026-08-01

## Why this matters

Two defects share one eight-line handler, so one plan closes both.

First, the handler swallows every `Tab` press unconditionally. A keyboard-only
visitor who reaches the source editor cannot leave it. That is a WCAG 2.1.2 (No
Keyboard Trap) failure on the page's primary interactive control, on a site
whose product claim is rigor.

Second, the handler writes `editor.value` directly, which `readonly` does not
block. In the `static`, `loading`, and `unavailable` states the editor is marked
`readonly` and every other control is disabled, yet a `Tab` press still edits
the seed source, cancels the attract demo through `engage()`, and leaves the
card describing source that is no longer on screen.

## Current state

The whole handler, `static/playground.js:732-739`:

```js
editor.addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  e.preventDefault();
  const s = editor.selectionStart, end = editor.selectionEnd;
  editor.value = editor.value.slice(0, s) + "  " + editor.value.slice(end);
  editor.selectionStart = editor.selectionEnd = s + 2;
  scheduleAnalysis();
});
```

Supporting facts the executor needs:

- `readonly` is applied by state, `static/playground.js:943-944`:

```js
const interactive = state === "live";
editor.toggleAttribute("readonly", !interactive);
```

- `static/index.html:310-318` ships the textarea with `readonly` in the markup,
  so the non-interactive case is the page's initial state, not an edge case:

```html
<textarea
  id="zp-src"
  class="zp-src"
  spellcheck="false"
  autocomplete="off"
  autocapitalize="off"
  readonly
  aria-label="Handler source code"
>
```

- `scheduleAnalysis` calls `engage()` first (`static/playground.js:722-727`),
  and `engage()` cancels every pending demo timer and sets the demo state to
  `manual control` (`static/playground.js:870-876`). That is why a stray
  pre-boot `Tab` kills the attract demo.
- The textarea is inside a `role="tabpanel"` (`static/index.html:304`,
  `aria-labelledby="zp-seed-tab-spec"`). Tab-out therefore lands on the next
  focusable control after the panel, which is the expected reading order.

**Assumption this plan depends on**: `Shift+Tab` is not currently special-cased
anywhere else in the file. Confirmed: `grep -n shiftKey static/playground.js`
returns nothing.

## Commands you will need

| Purpose             | Command                                                    | Expected on success          |
| ------------------- | ---------------------------------------------------------- | ---------------------------- |
| Install/setup       | n/a                                                        | no dependencies              |
| Typecheck/compile   | `deno check main.ts`                                       | `Check main.ts`, exit 0      |
| Tests               | `deno task test`                                           | `ok \| N passed \| 0 failed` |
| Lint/format check   | `deno fmt --check && deno lint`                            | `Checked N files`, exit 0    |
| Manual verification | `deno task start` then `http://localhost:8000/#playground` | see Step 4                   |

## Scope

**In scope, the only files to modify:**

- `static/playground.js` — the keydown handler.
- `static/index.html` — the `playground.js?v=` bump, and one microcopy addition
  if Step 3 is taken.
- `tests/site_contract_test.ts` — regression assertions.

**Out of scope, do not touch even if related:**

- `static/home.css` — no styling change is required.
- The `engage()` and demo-timer logic. The bug is that the handler runs at all
  in a read-only state, not that `engage()` misbehaves.
- The lens and seed tab keyboard handling in `wireTabs`
  (`static/playground.js:598-626`). That code already implements correct
  roving-tabindex arrow navigation and is not part of this defect.

## Git/workflow guidance

- Branch name: current branch `fix/ux-audit` unless the operator says otherwise.
- Commit style: Conventional Commits, no emojis, no em dashes. Example from
  history: `fix(site): make interactive surfaces fail closed`.
- Do not push, open a PR, or deploy.

## Steps

### Step 1: Refuse to edit a read-only editor

Add an early return so the handler is inert whenever the editor is not
interactive. Insert immediately after the `Tab` check:

```js
if (editor.readOnly) return;
```

Placing it after the `Tab` guard rather than before keeps every non-Tab key on
its existing path and keeps the handler cheap.

**Verify**: `grep -n "editor.readOnly" static/playground.js` -> one match,
inside the keydown handler.

### Step 2: Let `Shift+Tab` leave the editor

Change the guard so a backwards tab is never intercepted:

```js
if (e.key !== "Tab" || e.shiftKey) return;
```

This gives every keyboard user a guaranteed exit: `Shift+Tab` moves focus back
to the seed tablist, which is a real control, not a dead end. Forward `Tab`
keeps inserting two spaces, which is the behavior the editor is meant to have.

The final handler:

```js
editor.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || e.shiftKey) return;
  if (editor.readOnly) return;
  e.preventDefault();
  const s = editor.selectionStart, end = editor.selectionEnd;
  editor.value = editor.value.slice(0, s) + "  " + editor.value.slice(end);
  editor.selectionStart = editor.selectionEnd = s + 2;
  scheduleAnalysis();
});
```

**Verify**: `grep -n "e.shiftKey" static/playground.js` -> one match, in the
keydown handler.

### Step 3: Tell the visitor the exit exists

An escape hatch nobody knows about is only half a fix. Add a short hint near the
editor so the behavior is discoverable. Put it in the existing editor panel in
`static/index.html`, adjacent to the textarea, as visible microcopy or as a
`<p class="zp-hint-text">`-style line consistent with the surrounding markup.

Suggested wording, matching house style (no emojis, no em dashes):
`Tab indents. Shift+Tab leaves the editor.`

Before adding a new class, check `static/home.css` for an existing helper that
already carries small muted text in this panel and reuse it. Do not introduce a
new selector if one already fits; `CLAUDE.md` says prefer deletion over
additions and drop selectors with no matching markup.

If no suitable existing class exists and adding one would mean new CSS, stop and
report rather than inventing a token. The hint is worth having but is not worth
a bespoke style rule without a decision.

**Verify**: `grep -n "Shift+Tab" static/index.html` -> one match.

### Step 4: Bump the cache-bust version and verify by hand

Bump `static/index.html:745` from `playground.js?v=12` to the next unused
number. If plan 001 already moved it to `v=13`, use `v=14`.

Then run the server and confirm, with the keyboard only:

1. Before the analyzer boots (scroll so the playground is off screen, then
   reload and immediately press `Tab` while focus is in the editor): the seed
   source is unchanged and the attract demo still runs when the section scrolls
   into view.
2. After the analyzer is live: `Tab` inserts two spaces and the card re-proves.
3. After the analyzer is live: `Shift+Tab` moves focus out of the editor to the
   seed tabs.

**Teardown is mandatory.** Kill the server, close the browser, then confirm
`lsof -nP -iTCP:8000 -sTCP:LISTEN` returns no rows.

**Verify**: all three manual checks pass and `lsof -nP -iTCP:8000 -sTCP:LISTEN`
-> no output.

## Test plan

Add to `tests/site_contract_test.ts`, in the style of the existing playground
tests at lines 88-132:

```ts
Deno.test("the editor never traps keyboard focus and never writes when read-only", async () => {
  const playground = await source("static/playground.js");

  assert(
    playground.includes('if (e.key !== "Tab" || e.shiftKey) return;'),
    "Shift+Tab must always leave the editor",
  );
  assert(
    playground.includes("if (editor.readOnly) return;"),
    "a read-only editor must reject the indent handler",
  );
});
```

Edge cases the change must handle:

- `Tab` pressed while the section is in `static` state, before the analyzer
  boots: no edit, no demo cancellation.
- `Tab` pressed while `unavailable`: no edit.
- `Shift+Tab` in any state: focus leaves, no edit.
- `Tab` while `live`: two spaces inserted at the caret, selection replaced,
  re-prove scheduled. This is the regression case; it must keep working.

Manual keyboard verification in Step 4 is required because the current suite
cannot execute DOM behavior. Plan 007 removes that limitation.

## Done criteria

All must hold:

- [ ] `deno fmt --check` exits 0
- [ ] `deno lint` exits 0
- [ ] `deno task test` exits 0 with the two new assertions passing
- [ ] `Shift+Tab` moves focus out of the editor in a live browser
- [ ] `Tab` in a read-only state leaves the seed source byte-identical
- [ ] `Tab` in the live state still indents and re-proves
- [ ] `static/index.html` references a bumped `playground.js?v=`
- [ ] No files outside the in-scope list are modified
- [ ] `:8000` is free and no browser session is left open
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The keydown handler excerpt under Current state does not match the live code.
- `setPlaygroundState` no longer applies `readonly` via
  `editor.toggleAttribute("readonly", !interactive)`.
- Step 3 cannot be done with an existing CSS class and would require a new
  selector.
- Manual keyboard verification shows focus landing somewhere other than a real
  control after `Shift+Tab`.
- The assumption that nothing else in the file inspects `shiftKey` turns out to
  be false.

## Maintenance notes

- Any future editor affordance (autoclose brackets, comment toggle) must repeat
  the `editor.readOnly` guard. The state machine sets `readonly` as its only
  interactivity signal for the textarea, so handlers have to check it
  themselves.
- Reviewers should confirm the hint text from Step 3 reuses an existing class
  rather than adding a selector.
- Deliberately deferred: the editor still has no visible focus-within treatment
  distinguishing it from the highlight overlay. That is a design question, not
  an accessibility defect, and is out of this plan.
