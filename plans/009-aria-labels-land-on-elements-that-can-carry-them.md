# Plan 009: Every `aria-label` lands on an element that can carry a name

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report; do not improvise around it. When done, update the status row for this
> plan in `plans/README.md`, unless a reviewer says they maintain the index.
>
> **Drift check, run first**: `grep -n 'aria-label' static/index.html` If the
> line numbers and labels do not match the Current state table, stop and report.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `63e96ec` and 2026-08-01

## Why this matters

Three `aria-label` attributes on the homepage sit on plain `div` elements. ARIA
maps a `div` with no role to the `generic` role, and `generic` prohibits naming,
so assistive technology discards the label. The intent was to describe three
meaningful regions, including the product-shot code card that carries the site's
central story, and none of those descriptions reach a screen reader today.

This is not a large defect, but it is a silent one: the markup looks correct,
reviews pass over it, and the accessibility it claims to provide does not exist.

## Current state

Every `aria-label` in `static/index.html`, with a verdict for each:

| Line    | Element                                   | Label                                                                    | Verdict                                         |
| ------- | ----------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------- |
| 113     | `<nav class="z-nav">`                     | Primary navigation                                                       | Correct. `nav` allows naming.                   |
| 114     | `<a class="z-brand">`                     | zttp home                                                                | Correct. Links allow naming.                    |
| 122     | `<button>`                                | Toggle menu                                                              | Correct.                                        |
| 164     | `<div class="z-install-card">`            | Install command                                                          | **Broken.** `generic` role, name discarded.     |
| 179-181 | `<div class="z-code-card">`               | One zttp expert session: a vetoed draft, then a compiler-authored repair | **Broken.** Same.                               |
| 218     | `<div class="z-calm-strip">`              | Playground trust boundaries                                              | **Broken.** Same.                               |
| 226     | `<div class="zp-tabs" role="tablist">`    | Example handler                                                          | Correct. Explicit `tablist` role allows naming. |
| 259     | element with `aria-label="Perturbations"` | Perturbations                                                            | Verify the element and its role during Step 1.  |
| 304     | tabpanel                                  | via `aria-labelledby`                                                    | Correct.                                        |
| 317     | `<textarea>`                              | Handler source code                                                      | Correct. Form controls allow naming.            |
| 346     | `<div class="zp-lensbar" role="tablist">` | Proof lens                                                               | Correct.                                        |
| 514     | `<ol class="z-workflow">`                 | The zttp write path                                                      | Correct. Lists allow naming.                    |
| 629     | `<ul>`                                    | Runtime proof carrier                                                    | Correct.                                        |
| 683     | `<div class="z-install-card">`            | Install command                                                          | **Broken.** Second instance of the same card.   |

Context for the most important one, `static/index.html:178-183`:

```html
<figure class="z-product-shot">
  <div
    class="z-code-card"
    aria-label="One zttp expert session: a vetoed draft, then a compiler-authored repair"
  >
    <div class="z-pane-title">
              <span>zttp expert</span><em>one write path</em>
            </div>
```

Note that a `<figure>` already wraps it. `figure` allows naming, and a
`figcaption` is the native way to caption one. The fix here is mostly a matter
of moving the text to where the platform already expects it.

The install card appears twice, at `:164` and `:683`. `static/script.js:48-71`
wires both by querying `.z-install-card` and reading `button` and `code` inside.
Any structural change must keep that selector working.

Constraint from `CLAUDE.md`: prefer deletion over additions in CSS, and drop
selectors with no matching markup. Prefer solutions that need no new CSS.

## Commands you will need

| Purpose             | Command                                                                       | Expected on success          |
| ------------------- | ----------------------------------------------------------------------------- | ---------------------------- |
| Install/setup       | n/a                                                                           | no dependencies              |
| Tests               | `deno task test`                                                              | `ok \| N passed \| 0 failed` |
| Full gate           | `deno task verify`                                                            | exit 0                       |
| Format check        | `deno fmt --check`                                                            | `Checked N files`, exit 0    |
| Manual verification | `deno task start` plus a screen reader or the browser accessibility inspector | see Step 4                   |

## Scope

**In scope, the only files to modify:**

- `static/index.html` — the three broken labels.
- `static/home.css` — only if a visually-hidden helper is needed and none
  already exists.
- `static/deck.html` — only if Step 1 finds the same pattern there.

**Out of scope, do not touch even if related:**

- The nine `aria-label` attributes marked Correct above.
- `static/script.js`. The `.z-install-card` selector and its `button` and `code`
  lookups must keep working; the markup change must accommodate the script, not
  the other way around.
- Visual design. Nothing here should change how the page looks, with one
  deliberate exception if the operator prefers a visible `figcaption` in Step 2.
- The playground component internals.

## Git/workflow guidance

- Branch name: current branch `fix/ux-audit` unless the operator says otherwise.
- Commit style: Conventional Commits. Suggested:
  `fix(a11y): give labelled regions a nameable role`.
- Do not push, open a PR, or deploy.

## Steps

### Step 1: Audit both documents, then decide per case

Run `grep -n 'aria-label' static/index.html static/deck.html` and classify every
result the same way as the Current state table. Add any `deck.html` instances of
the same pattern to the work list before starting; there is no reason to fix one
document and leave the other.

Also resolve line 259 (`aria-label="Perturbations"`), which was not fully
classified. If it sits on a role-less `div`, it joins the broken list. If it
sits on a `group`, `toolbar`, or similar, it is fine.

For each broken case, pick the fix in this order of preference:

1. **Use a native element that allows naming.** Best outcome, no ARIA needed.
2. **Add an explicit role that permits a name**, such as `role="group"` or
   `role="region"`. Use `region` sparingly; it adds a landmark, and too many
   landmarks make navigation worse rather than better.
3. **Replace the label with visible or visually-hidden text** inside the
   container.

Do not simply move `aria-label` to a parent that also has no role. That
reproduces the bug one level up.

**Verify**: a written list of the three or more broken cases with the chosen fix
for each, before any edit.

### Step 2: Fix the product-shot card

`static/index.html:178-183`. The `<figure>` wrapper makes this the easy one:
move the description into a `<figcaption>`.

Two acceptable outcomes; the operator picks:

- **Visible caption**, which also helps sighted readers understand what the
  terminal transcript is showing. Needs a small amount of CSS for the caption,
  so check `static/home.css` for an existing caption or muted-text class first.
- **Visually-hidden caption**, which preserves the current visual design
  exactly. Requires a visually-hidden utility. Check whether one already exists
  in `static/style.css` or `static/home.css`; a `.skip-link` exists at
  `static/index.html:110` and its styles may already provide a reusable pattern.

If neither a caption class nor a visually-hidden utility exists and adding one
means inventing a new token, stop and report. `CLAUDE.md` prefers deletion over
additions and a new selector needs a decision.

Remove the now-redundant `aria-label` from the `div`.

**Verify**: the browser accessibility inspector shows the figure with an
accessible name containing "vetoed draft".

### Step 3: Fix the install cards and the calm strip

- **Install cards** (`:164` and `:683`): the card contains a `code` element and
  a Copy `button` that already has its own accessible name. The container itself
  is decorative grouping. The most honest fix is usually to drop the
  `aria-label` entirely rather than force a role onto it, because the meaningful
  content is already labelled. If the grouping genuinely needs a name, use
  `role="group"` with the label. Decide, apply the same choice to both
  instances, and keep them identical: `static/script.js:48` treats them as one
  shape.

- **Calm strip** (`:218`, "Playground trust boundaries"): three status chips.
  `role="group"` with the existing label is the natural fit. A `<ul>` of `<li>`
  chips would also work and is more semantic, but that is a markup restructure
  with CSS consequences; only take it if the existing styles already tolerate
  it.

**Verify**: `grep -n 'aria-label' static/index.html` -> no remaining
`aria-label` on an element without a naming-capable role.

### Step 4: Confirm with a real accessibility tree

Static inspection is not enough; the whole defect is that the markup looks
right.

Run `deno task start` and open the browser accessibility inspector on the
homepage. For each element changed, confirm the accessible name is present and
reads as intended. If a screen reader is available, navigate the page and
confirm the product-shot caption is announced.

**Teardown is mandatory.** Kill the server, close the browser, then confirm
`lsof -nP -iTCP:8000 -sTCP:LISTEN` returns no rows.

**Verify**: every changed element exposes its intended accessible name in the
inspector, and `lsof -nP -iTCP:8000 -sTCP:LISTEN` -> no output.

### Step 5: Confirm the install-card script still works

The Copy button on both install cards must still copy. `static/script.js:48-71`
depends on `.z-install-card` containing a `button` and a `code`.

**Verify**: both Copy buttons show "Copied" and place the install command on the
clipboard.

## Test plan

Add to `tests/site_contract_test.ts`, alongside the existing markup contracts at
lines 54-86:

```ts
Deno.test("labelled regions use a role that can carry a name", async () => {
  const home = await source("static/index.html");

  assert(
    !/<div\s+class="z-code-card"\s+aria-label=/.test(home),
    "the product shot must be named by its figure, not by a role-less div",
  );
  assert(
    home.includes("<figcaption"),
    "the product shot must carry a figcaption",
  );
});
```

Keep the assertion narrow. A general "no `aria-label` on any `div`" rule would
be wrong, since a `div` with an explicit role can legitimately carry one, and
the file already has correct examples at `:226` and `:346`.

Edge cases:

- Both install cards must end up identical.
- If `deck.html` has the same pattern, add a matching assertion for it.
- The nine correct labels must be untouched; a diff review confirms this.

## Done criteria

All must hold:

- [ ] `deno task verify` exits 0
- [ ] No `aria-label` remains on an element whose role prohibits naming, in
      either document
- [ ] The product-shot description is exposed through a `figcaption`
- [ ] Both install cards use the identical approach
- [ ] The accessibility inspector confirms each intended name in a real browser
- [ ] Both Copy buttons still work
- [ ] No new CSS selector was added without operator sign-off
- [ ] No files outside the in-scope list are modified
- [ ] `:8000` is free and no browser session is left open
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The Current state table does not match
  `grep -n 'aria-label' static/index.html`.
- A fix needs a new CSS class and no existing helper fits.
- Restructuring the calm strip or an install card would change the visual
  layout.
- The accessibility inspector still shows a missing name after a change.
- Either Copy button stops working.

## Maintenance notes

- The rule to carry forward: `aria-label` only works on elements whose role
  permits a name. A bare `div` or `span` is `generic` and drops it. Prefer a
  native element, then an explicit role, then real text.
- Reviewers should check the accessibility tree, not the markup. The markup
  looking plausible is exactly how this defect survived.
- Deliberately deferred: a full WCAG audit of both pages. This plan closes one
  specific, verified defect class and does not claim broader conformance.
