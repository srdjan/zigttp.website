# Plan 006: The client JavaScript is actually type-checked

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report; do not improvise around it. When done, update the status row for this
> plan in `plans/README.md`, unless a reviewer says they maintain the index.
>
> **Drift check, run first**: `cat deno.json` If `compilerOptions` is not
> exactly `{ "strict": true }`, stop and report.

## Status

- **Priority**: P1
- **Effort**: S to enable, unknown to clear the resulting backlog
- **Risk**: MED
- **Depends on**: plans/005-one-verify-task-and-a-ci-gate.md
- **Category**: dx
- **Planned at**: commit `63e96ec` and 2026-08-01

## Why this matters

`docs/plan.md:27` documents
`deno check main.ts static/script.js static/playground.js` as the verification
gate, and `CLAUDE.md` tells contributors to run `deno check` before committing.
That command exits 0 on the client JavaScript while performing no analysis at
all, because `deno.json` does not enable `checkJs`. The result is worse than
having no check: 1035 lines of `static/playground.js` and 237 of
`static/script.js` are covered by a command that reports success no matter what
they contain.

Proof, reproducible in any scratch directory:

```
$ printf 'const n = 1;\nn.toUpperCase();\nundefinedFunction(42);\n' > probe.js
$ deno check probe.js; echo "EXIT=$?"
EXIT=0
```

Calling `toUpperCase` on a number and invoking an undeclared function both pass.

Every defect found in these two files during the audit was found by reading, not
by tooling. This plan makes the tooling real.

## Current state

`deno.json`:

```json
"compilerOptions": {
  "strict": true
}
```

The two client files and their shapes:

- `static/playground.js` (1035 lines) — one IIFE, `"use strict"`, heavy DOM
  access via `document.getElementById` and `querySelector`, plus a wasm bridge
  that reads `wasm.exports` members dynamically
  (`static/playground.js:150-190`). This file will produce the most diagnostics,
  and the wasm exports are the hardest part: `wasm` is assigned `inst.exports`
  and then indexed as `wasm.alloc`, `wasm.analyze`, `wasm.free`, `wasm.memory`,
  all of which TypeScript sees as `unknown` on a `WebAssembly.Exports` value.
- `static/script.js` (237 lines) — flat top-level scope, DOM queries throughout,
  several places that call methods on possibly-null query results (for example
  `prevBtn.disabled` at `:137` after a `querySelector` that TypeScript types as
  `Element | null`).

Relevant house rules from `/Users/srdjans/.claude/CLAUDE.md`:

- Never use the `any` type. Never cast to `any`. Use `unknown` with proper type
  narrowing instead.

That rule is the main constraint on this plan. The easy way to silence
wasm-export diagnostics is an `any` cast, and it is not available.

Project rules from `CLAUDE.md`:

- No build step, no bundler, no framework. These files ship to the browser as
  written, so any annotation must be JSDoc comments, not TypeScript syntax.

**Assumption this plan depends on**: `deno check` respects `checkJs` from
`deno.json` `compilerOptions` for files passed on the command line. Verify this
in Step 1 before doing any annotation work; the whole plan rests on it.

## Commands you will need

| Purpose             | Command                                                                         | Expected on success                   |
| ------------------- | ------------------------------------------------------------------------------- | ------------------------------------- |
| Install/setup       | n/a                                                                             | no dependencies                       |
| Probe the toolchain | see Step 1                                                                      | a non-zero exit with real diagnostics |
| Count the backlog   | `deno check static/playground.js static/script.js 2>&1 \| tee /tmp/checkjs.txt` | a diagnostic list                     |
| Full gate           | `deno task verify`                                                              | exit 0, once the backlog is cleared   |
| Tests               | `deno task test`                                                                | `ok \| N passed \| 0 failed`          |
| Format check        | `deno fmt --check`                                                              | `Checked N files`, exit 0             |

## Scope

**In scope, the only files to modify:**

- `deno.json` — add `checkJs` to `compilerOptions`, and extend the `check` stage
  of `deno task verify` to include the two client files.
- `static/playground.js` — JSDoc annotations and narrowing needed to pass.
- `static/script.js` — same.
- `static/index.html` and `static/deck.html` — `?v=` bumps if and only if the JS
  files changed behaviorally. A pure comment or annotation change still changes
  the bytes served, so bump anyway.

**Out of scope, do not touch even if related:**

- Behavior. This plan may not change what any function does. If a diagnostic
  reveals a real bug, stop and report it as a new finding rather than fixing it
  inside a typing pass; a behavior change hidden inside a 100-diagnostic cleanup
  is unreviewable.
- `main.ts` and `tests/site_contract_test.ts`. Already type-checked and already
  strict.
- Converting either file to TypeScript. There is no build step; `CLAUDE.md`
  rules out a bundler.
- `any` casts anywhere, per the house rule above.

## Git/workflow guidance

- Branch name: current branch `fix/ux-audit` unless the operator says otherwise.
- Commit style: Conventional Commits. Split into at least two commits: one
  enabling `checkJs` with the `deno.json` change and the annotations that make
  it pass, and separate commits for any file that needs substantial work.
  Suggested first: `chore(types): type-check the client javascript`.
- Do not push, open a PR, or deploy.

## Steps

### Step 1: Confirm the mechanism before doing any work

Enable the flag first and measure, so the size of the job is known before
committing to it.

Add to `deno.json` `compilerOptions`:

```json
"compilerOptions": {
  "strict": true,
  "checkJs": true
}
```

Then run the probe from Why this matters again, from the repository root so
`deno.json` applies, and confirm it now fails. Then run:

```
deno check static/playground.js static/script.js 2>&1 | tee /tmp/checkjs.txt
```

Record the diagnostic count. This number decides how the rest of the plan
proceeds.

**Verify**: the probe file now exits non-zero, and `/tmp/checkjs.txt` contains
real diagnostics for the two client files.

**Decision point**: if the diagnostic count exceeds roughly 40, stop and report
the count and a category breakdown before continuing. A large backlog should be
a scoped follow-up plan, not an open-ended edit inside this one.

### Step 2: Type the wasm bridge

This is the hardest cluster and the one most likely to tempt an `any`. Handle it
deliberately.

`static/playground.js:150` declares `let wasm = null;` and `:165` assigns
`wasm = inst.exports;`. The exports are then used as `wasm.alloc(...)`,
`wasm.analyze(...)`, `wasm.free(...)`, and `wasm.memory.buffer`.

Declare the shape with a JSDoc typedef near the top of the wasm bridge section,
then annotate the binding:

```js
/**
 * @typedef {object} ZtsAnalyzerExports
 * @property {(len: bigint) => bigint} alloc
 * @property {(ptr: bigint, len: bigint, isTsx: number) => bigint} analyze
 * @property {(ptr: bigint, len: bigint) => void} free
 * @property {WebAssembly.Memory} memory
 */

/** @type {ZtsAnalyzerExports | null} */
let wasm = null;
```

The signatures above are read off the call sites at
`static/playground.js:174-180`. Confirm each against those lines before writing
them; do not copy them on trust.

Assigning `inst.exports` to that type needs a narrowing step, not a cast to
`any`. The honest form is a runtime check that also improves the code: verify
the four expected exports exist after instantiation and fail closed if they do
not. That converts a typing problem into a real robustness win, and it composes
with plan 001, which makes a missing export drive the card to `unavailable`
instead of throwing.

If the narrowing cannot be expressed without an `any` cast, stop and report. Do
not reach for `any`.

**Verify**: `deno check static/playground.js` reports no diagnostics in the
`loadWasm` and `analyze` functions.

### Step 3: Narrow the DOM queries

The remaining bulk will be `Element | null` and `Element` versus `HTMLElement`
mismatches.

Prefer, in this order:

1. Existing null guards. Much of this code already checks, for example
   `static/playground.js:13` returns early when `section`, `editor`, or `card`
   is missing, and `static/script.js:10` returns when `button` or `links` is
   missing. Where a guard already exists, TypeScript often needs only a JSDoc
   `@type` on the binding to follow it.
2. A JSDoc `@type` annotation naming the concrete element interface, for example
   `/** @type {HTMLTextAreaElement} */` for `editor` at
   `static/playground.js:11`. This is what makes `editor.value`,
   `editor.selectionStart`, and `editor.readOnly` type-check.
3. A new explicit guard where none exists, which is a real improvement and is
   allowed even though it adds a branch. Adding a guard is not a behavior change
   in the sense this plan forbids, as long as the guarded path was already
   unreachable in practice; if it was reachable, that is a bug to report under
   STOP conditions.

Do not add `?.` chains purely to silence a diagnostic where the value is
genuinely required. That converts a loud failure into a silent no-op, which is
the opposite of what this codebase is for.

**Verify**: `deno check static/playground.js static/script.js` exits 0.

### Step 4: Wire the client files into the gate

Extend the `check` stage of the `verify` task added by plan 005 so it covers the
client files:

```json
"verify": "deno fmt --check && deno lint && deno check main.ts tests/site_contract_test.ts static/script.js static/playground.js && deno task test",
```

Now the command documented in `docs/plan.md:27` and the command CI runs both
mean something.

**Verify**: `deno task verify` exits 0.

### Step 5: Bump versions and confirm nothing moved at runtime

Bump `?v=` for both client files, keeping `script.js` in sync across
`static/index.html:744` and `static/deck.html:983`.

Then run `deno task start` and confirm, in a browser: the playground boots to
`PROVEN`, the perturbation buttons flip the card, the seed tabs switch, the
mobile menu opens, the install Copy button works, and the deck advances. A
typing-only pass must be invisible at runtime.

**Teardown is mandatory.** Kill the server, close the browser, then confirm
`lsof -nP -iTCP:8000 -sTCP:LISTEN` returns no rows.

**Verify**: all behaviors above work, and `lsof -nP -iTCP:8000 -sTCP:LISTEN` ->
no output.

## Test plan

No new application tests. The deliverable is that an existing command stops
lying.

- Acceptance: reintroduce the probe from Why this matters as a temporary file
  inside the repository, confirm `deno check` on it now fails, then delete it.
  This proves `checkJs` is in effect for this project and not just for the files
  that happened to already be clean.
- Regression: `deno task test` still passes, and the manual browser pass in Step
  5 shows no behavior change.
- Existing suite to keep green: `tests/site_contract_test.ts`. Several of its
  tests match exact source strings, including whitespace, at lines 119-121.
  Reformatting during this work can break them. If that happens, fix the test
  string, and note that plan 007 removes this fragility.

## Done criteria

All must hold:

- [ ] `deno.json` `compilerOptions` includes `"checkJs": true`
- [ ] `deno check static/playground.js static/script.js` exits 0 with no
      diagnostics
- [ ] A deliberate type error in a client file now fails `deno check`
- [ ] `deno task verify` includes both client files and exits 0
- [ ] No `any` type and no cast to `any` was introduced anywhere
- [ ] No function's behavior changed, verified by reading the diff
- [ ] The browser pass in Step 5 shows no runtime regression
- [ ] `?v=` bumped for both client files, `script.js` in sync across both
      documents
- [ ] No files outside the in-scope list are modified
- [ ] `:8000` is free and no browser session is left open
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `deno.json` `compilerOptions` is not `{ "strict": true }` at the start.
- Step 1 shows more than roughly 40 diagnostics. Report the count and a
  breakdown; the operator decides whether to continue here or split it out.
- Any diagnostic reveals a genuine runtime bug. Report it as a new finding; do
  not fix behavior inside this pass.
- Passing a diagnostic appears to require `any`, a cast to `any`, or a
  `@ts-ignore`. Report the specific line and the diagnostic text.
- Plan 005 has not landed, so there is no `verify` task to extend in Step 4.
- `deno fmt` reformats a client file in a way that breaks
  `tests/site_contract_test.ts` and the fix is not obvious.

## Maintenance notes

- Once `checkJs` is on, keep it on. Turning it off later to unblock a change
  would silently restore the current situation, where the documented gate
  reports success on unanalyzed code.
- The wasm typedef from Step 2 must be updated whenever the analyzer's exported
  signature changes. `static/zts-analyzer.*.wasm` is built in the zttp
  repository and published here, so the typedef is a copy of a contract owned
  elsewhere. Note that next to the typedef.
- Reviewers should scrutinize Step 3 for `?.` chains added purely to silence
  diagnostics, and Step 2 for any narrowing that is really a disguised cast.
- Deliberately deferred: converting the client files to `.ts` with a build step.
  `CLAUDE.md` rules out a bundler, and JSDoc gets the same checking without one.
