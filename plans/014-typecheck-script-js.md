# Plan 014: `static/script.js` is type-checked, and the mechanism is proven

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report; do not improvise around it. When done, update the status row for this
> plan in `plans/README.md`, unless a reviewer says they maintain the index.
>
> **Drift check, run first**: `cat deno.json && head -5 static/script.js`
> `compilerOptions` must still be exactly `{ "strict": true }` and
> `static/script.js` must not already carry a `// @ts-check` pragma. If either
> differs, stop and report.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `874afb0` and 2026-08-01
- **Supersedes**: the first third of
  `plans/006-typecheck-the-client-javascript-for-real.md`, which is marked
  SUPERSEDED

## Why this matters

Plan 006 tried to type-check both client files in one pass and stopped at its
own decision point: 173 diagnostics against a ceiling of 40. The ceiling was
right and the scope was wrong. This plan takes the smaller file, 34 diagnostics,
and lands it behind a real gate.

Until this lands, `static/script.js` and `static/playground.js` ship 1200 lines
the toolchain never inspects, while `docs/plan.md` and `CLAUDE.md` both describe
a `deno check` step that reports success on them regardless of content.

`script.js` goes first for a reason beyond size: it is 34 diagnostics of the
same three kinds that dominate the larger file, so clearing it establishes the
fix patterns plan 015 will repeat 139 times.

## Current state

Measured on Deno 2.9.4 at commit `874afb0`. Reproduce any of it with a scratch
config; do not take these numbers on trust.

**The two mechanism facts this plan rests on, both verified:**

1. **`// @ts-check` works per file with global `checkJs` off.** A scratch file
   containing `// @ts-check`, `const n = 1;`, `n.toUpperCase();` fails
   `deno check` with exit 1. The same file without the pragma exits 0. So this
   migration can proceed one file at a time, with a real gate at each step,
   instead of needing a repository-wide flag flip that cannot land until every
   file is clean.

2. **Adding the DOM lib breaks nothing that is checked today.** With
   `"lib": ["deno.window", "dom", "dom.iterable", "esnext"]`, `main.ts`,
   `tests/site_contract_test.ts`, and `tests/playground_behavior_test.ts` all
   still check clean, exit 0. `@b-fuze/deno-dom` coexists with `lib.dom` without
   type conflicts. The `deno.window` entry must stay first; `main.ts` needs the
   `Deno` namespace.

Without the DOM lib, Deno's default lib produces 24 spurious
`TS2584 cannot find name 'document'` diagnostics across the two files. Those are
configuration noise, not real findings, which is why the lib change comes first.

**`static/script.js` diagnostics with the DOM lib, 34 total:**

| Code                              | Count | What it is                                                             |
| --------------------------------- | ----- | ---------------------------------------------------------------------- |
| TS18047                           | 11    | value is possibly null, from `querySelector` results                   |
| TS2339                            | 9     | property does not exist, mostly `Element` where `HTMLElement` is meant |
| TS7006                            | 8     | parameter implicitly has an `any` type                                 |
| TS7034 / TS7005                   | 2     | variable implicitly `any` from its inferred type                       |
| TS2771 / TS2769 / TS2531 / TS2345 | 4     | one each, individually reasoned                                        |

The 8 TS7006 cluster on two functions:

```
TS7006 [ERROR]: Parameter 'button' implicitly has an 'any' type.
function initMenuToggle(button, links, outsideSelector, buttonActiveClass) {
TS7006 [ERROR]: Parameter 'open' implicitly has an 'any' type.
  const setMenuState = (open) => {
```

**Constraints:**

- `CLAUDE.md`: no npm, no bundler, no build step. `static/script.js` ships to
  the browser exactly as written, so every annotation must be a JSDoc comment.
  TypeScript syntax is not available.
- `/Users/srdjans/.claude/CLAUDE.md`: never use the `any` type, never cast to
  `any`. Use `unknown` with narrowing. `@ts-ignore` is equally out.
- `static/script.js` is loaded by both `static/index.html:744` and
  `static/deck.html:983`, and both must keep the same `?v=` number.

## Commands you will need

| Purpose         | Command                                                    | Expected on success                                               |
| --------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Install/setup   | n/a                                                        | no dependencies                                                   |
| Check this file | `deno check static/script.js`                              | after Step 1 and the pragma, real diagnostics; at the end, exit 0 |
| Count remaining | `deno check static/script.js 2>&1 \| grep -cE '^TS[0-9]+'` | decreasing, 0 at the end                                          |
| Full gate       | `deno task verify`                                         | exit 0                                                            |
| Tests           | `deno task test`                                           | `ok \| 19 passed \| 0 failed`                                     |

Note: Deno caches type-check results, so a second identical `deno check` can
print nothing and exit 0 while the first reported errors. If output looks
suspiciously empty, touch the file or vary the config path before believing it.

## Scope

**In scope, the only files to modify:**

- `deno.json` — add the `lib` array; extend the `verify` check stage to include
  `static/script.js`.
- `static/script.js` — the `// @ts-check` pragma and the JSDoc annotations that
  make it pass.
- `static/index.html` and `static/deck.html` — the `script.js?v=` bump, kept
  identical.

**Out of scope, do not touch even if related:**

- `static/playground.js`. That is plan 015. Do not add its pragma here; leaving
  it unpragma'd is what keeps this plan small.
- `"checkJs": true`. That is plan 016, and enabling it here would drag
  `playground.js` in and reproduce exactly the failure that stopped plan 006.
- Behavior. No function may change what it does. If a diagnostic reveals a real
  bug, report it and leave it; a behavior change buried in a 34-diagnostic
  annotation pass is unreviewable.
- `main.ts`, `tests/`. Already checked and already clean.

## Git/workflow guidance

- Branch: work directly on local `main`, per the project's git convention.
- Commit style: Conventional Commits. Suggested:
  `chore(types): type-check the shared page controller`.
- Land Step 1 and Step 2 as one commit if they are small, otherwise separately.
  Do not push or deploy.

## Steps

### Step 1: Add the DOM lib

Change `deno.json` `compilerOptions` to:

```json
"compilerOptions": {
  "strict": true,
  "lib": ["deno.window", "dom", "dom.iterable", "esnext"]
}
```

Keep `deno.window` first. Do not add `checkJs`.

**Verify**: `deno task verify` -> exit 0, unchanged. This step alone must be
behavior-neutral and diagnostic-neutral, because nothing is checking JS yet.

### Step 2: Turn checking on for this file only

Add `// @ts-check` as the first line of `static/script.js`, above the existing
comment block.

**Verify**: `deno check static/script.js 2>&1 | grep -cE '^TS[0-9]+'` -> 34. If
the number differs materially, the Current state measurement is stale; stop and
report the new count and breakdown.

### Step 3: Annotate the function parameters

Clear the 8 TS7006 and the 2 implicit-`any`-variable diagnostics with JSDoc.
`initMenuToggle` is the main one:

```js
/**
 * @param {HTMLElement | null} button
 * @param {HTMLElement | null} links
 * @param {string} outsideSelector
 * @param {string} [buttonActiveClass]
 */
function initMenuToggle(button, links, outsideSelector, buttonActiveClass) {
```

The `| null` is honest: all four call sites pass a `querySelector` result, and
the function already guards with `if (!button || !links) return;` at line 10.
Typing the parameter as nullable and relying on the existing guard is better
than typing it non-null and lying at the call site.

**Verify**: `deno check static/script.js 2>&1 | grep -c TS7006` -> 0.

### Step 4: Narrow the DOM queries

Clear the 11 TS18047 and 9 TS2339. Prefer, in this order:

1. **An existing guard.** Much of this file already checks. Where a guard
   exists, a JSDoc `@type` on the binding is often all TypeScript needs to
   follow it.
2. **A JSDoc `@type` naming the concrete interface**, for example
   `/** @type {HTMLButtonElement | null} */` for the deck prev/next buttons,
   which is what makes `.disabled` at lines 137-138 type-check.
3. **A new guard** where none exists. Adding a guard is allowed and is a real
   improvement, as long as the guarded path was already unreachable. If it was
   reachable, that is a bug: report it under STOP conditions rather than
   silently fixing it.

Do not add `?.` purely to silence a diagnostic on a value the code genuinely
requires. That converts a loud failure into a silent no-op, which is the
opposite of what this codebase is for.

**Verify**: `deno check static/script.js 2>&1 | grep -cE 'TS18047|TS2339'` -> 0.

### Step 5: Reason about the remaining four individually

TS2771, TS2769, TS2531, and TS2345 are one each. Read each in full and fix the
cause, not the symptom. If any of them cannot be cleared without `any`, a cast
to `any`, or `@ts-ignore`, stop and report the exact line and diagnostic text.

**Verify**: `deno check static/script.js` -> exit 0, no output.

### Step 6: Wire it into the gate

Extend the `check` stage of the `verify` task so the file stays checked:

```json
"verify": "deno fmt --check && deno lint && deno check main.ts tests/site_contract_test.ts static/script.js && deno task test",
```

**Verify**: `deno task verify` -> exit 0. Then delete the pragma line
temporarily, confirm `deno check static/script.js` still exits 0 (because
nothing else enables checking), restore it, and confirm a deliberate type error
now fails `deno task verify`. That two-part check is what proves the gate is
real rather than decorative.

### Step 7: Bump versions and confirm no runtime change

Bump `script.js?v=` in both `static/index.html:744` and `static/deck.html:983`
to the same next number. They currently read `v=14`.

Then run `deno task start` and confirm in a browser: the mobile menu opens and
closes, Escape and outside-click close it, both install Copy buttons work, the
homepage nav active-link indicator moves, and the deck advances by button, dot,
arrow key, and hash. An annotation pass must be invisible at runtime.

**Teardown is mandatory.** Kill the server, close the browser, then confirm
`lsof -nP -iTCP:8000 -sTCP:LISTEN` returns no rows.

**Verify**: every behavior above works, and `lsof -nP -iTCP:8000 -sTCP:LISTEN`
-> no output.

## Test plan

No new application tests; the deliverable is that a command stops lying.

- **Acceptance**: with the pragma present, a deliberate type error in
  `static/script.js` fails `deno task verify`. With it absent, the same error
  passes. Both halves must be observed.
- **Regression**: `deno task test` still passes 19, and the browser pass in Step
  7 shows no behavior change.
- Watch for `deno fmt` reflowing `static/script.js` in a way that breaks a
  source-text assertion in `tests/site_contract_test.ts`, which still greps this
  file at the deck-navigation test.

## Done criteria

- [ ] `deno.json` has the four-entry `lib` array and no `checkJs`
- [ ] `static/script.js` starts with `// @ts-check`
- [ ] `deno check static/script.js` exits 0 with no diagnostics
- [ ] `deno task verify` includes `static/script.js` and exits 0
- [ ] A deliberate type error in the file fails the gate; removing the pragma
      makes it pass
- [ ] No `any`, no cast to `any`, no `@ts-ignore` was introduced
- [ ] No function's behavior changed, confirmed by reading the diff
- [ ] `script.js?v=` matches across both documents
- [ ] `deno task test` passes 19
- [ ] `:8000` free, no browser session left open
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- `compilerOptions` is not `{ "strict": true }` at the start, or the pragma is
  already present.
- Step 1 alone changes any existing diagnostic or test result.
- Step 2 reports materially more or fewer than 34 diagnostics.
- Any diagnostic reveals a genuine runtime bug. Report it; do not fix behavior
  here.
- Clearing a diagnostic appears to require `any`, a cast to `any`, or
  `@ts-ignore`.
- The browser pass shows any behavior change.

## Maintenance notes

- The `lib` array is now load-bearing for both this file and plan 015. Removing
  `dom` reintroduces 24 spurious `cannot find name 'document'` diagnostics;
  removing `deno.window` breaks `main.ts`.
- Reviewers should scrutinize Step 4 for `?.` chains added to silence rather
  than to express, and Step 3 for parameters typed non-null where the call site
  can pass null.
- Deliberately deferred: `static/playground.js` (plan 015) and the global
  `checkJs` flip (plan 016). Until 016 lands, a newly added `.js` file is still
  unchecked unless someone remembers the pragma.
