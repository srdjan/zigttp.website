# Plan 015: `static/playground.js` is type-checked

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report; do not improvise around it. When done, update the status row for this
> plan in `plans/README.md`, unless a reviewer says they maintain the index.
>
> **Drift check, run first**:
> `head -3 static/playground.js && grep -n '"lib"' deno.json` The `lib` array
> from plan 014 must be present and `static/playground.js` must not already
> carry a `// @ts-check` pragma. If either differs, stop and report.
>
> **This is the largest plan in the backlog: 139 diagnostics.** Read the Working
> method section before Step 2. Do not attempt it in one pass.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/014-typecheck-script-js.md
- **Category**: dx
- **Planned at**: commit `874afb0` and 2026-08-01
- **Supersedes**: the bulk of
  `plans/006-typecheck-the-client-javascript-for-real.md`, which is marked
  SUPERSEDED

## Why this matters

`static/playground.js` is 1030 lines driving the site's central product
demonstration, and no tool inspects it. Every defect the audit found in it was
found by reading: a fail-open verdict path, a keyboard trap, a write that
bypassed `readonly`. Two of those three were the kind a type checker does not
catch, which is worth saying plainly: this plan does not promise to prevent that
class of bug. What it buys is that the next null-dereference or misspelled
property fails at check time rather than in a visitor's browser, and that the
command `CLAUDE.md` tells contributors to run finally means something for this
file.

Risk is MED because the file is large, the diagnostics are spread evenly rather
than clustered, and an annotation pass on 139 sites has real opportunity to
change behavior by accident. The working method below exists to contain that.

## Current state

Measured on Deno 2.9.4 at commit `874afb0`, with the `lib` array plan 014 adds.

**139 diagnostics, by kind:**

| Code                     | Count | What it is                               | Fix pattern                                  |
| ------------------------ | ----- | ---------------------------------------- | -------------------------------------------- |
| TS7006                   | 50    | parameter implicitly `any`               | JSDoc `@param`                               |
| TS18047                  | 47    | value possibly null                      | existing guard plus `@type`, or a new guard  |
| TS2339                   | 18    | property does not exist                  | `Element` vs `HTMLElement`; the wasm exports |
| TS7005                   | 10    | variable implicitly `any`                | JSDoc `@type` on the binding                 |
| TS7053                   | 6     | implicit `any` from index access         | index signature in a typedef                 |
| TS7034                   | 5     | variable implicitly `any` from inference | JSDoc `@type`                                |
| TS2771 / TS2769 / TS2322 | 3     | one each                                 | reason individually                          |

**They do not cluster.** Counted in 150-line bands: 1, 30, 17, 35, 16, 17, 22.
So there is no hot spot to attack first, and splitting this plan by line range
would be arbitrary. Split by diagnostic kind instead, which is what the steps
below do: each step is one mechanical pattern applied repeatedly, which is far
easier to review than a slice of the file containing every pattern at once.

**The hardest cluster is the wasm bridge**, and it is the one most likely to
tempt a forbidden `any`. `static/playground.js:150` declares `let wasm = null;`
and `:165` assigns `wasm = inst.exports;`. The exports are then used as
`wasm.alloc(...)`, `wasm.analyze(...)`, `wasm.free(...)`, and
`wasm.memory.buffer` at lines 174-183. TypeScript sees `WebAssembly.Exports`
values as `WebAssembly.ExportValue`, so every one of those is a TS2339.

**Constraints:**

- `CLAUDE.md`: no build step. This file ships to the browser as written, so
  annotations are JSDoc only.
- `/Users/srdjans/.claude/CLAUDE.md`: never use `any`, never cast to `any`. Use
  `unknown` with narrowing. `@ts-ignore` is equally out. This rule is the whole
  difficulty of the wasm step, and it is not negotiable.
- `tests/playground_behavior_test.ts` boots this file through `new Function`
  with injected globals. If the annotations change the file's top-level shape,
  that harness is what will tell you.
- Referenced only by `static/index.html:746`, currently `playground.js?v=15`.

## Working method

Do not run one 139-diagnostic edit. Work in the step order below, and after each
step:

1. Run `deno check static/playground.js 2>&1 | grep -cE '^TS[0-9]+'` and confirm
   the count dropped by roughly the expected amount.
2. Run `deno task test` and confirm 19 still pass.
3. Commit that step.

Six or seven small commits are the deliverable shape. One large commit is a
review failure regardless of whether it works, because nobody can check 139
annotation sites for a smuggled behavior change in a single diff.

## Commands you will need

| Purpose         | Command                                                        | Expected on success                            |
| --------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| Check this file | `deno check static/playground.js`                              | exit 0 at the end                              |
| Count remaining | `deno check static/playground.js 2>&1 \| grep -cE '^TS[0-9]+'` | decreasing, 0 at the end                       |
| Count one kind  | `deno check static/playground.js 2>&1 \| grep -c TS7006`       | 0 after its step                               |
| Tests           | `deno task test`                                               | `ok \| 19 passed \| 0 failed` after every step |
| Full gate       | `deno task verify`                                             | exit 0                                         |

Deno caches type-check results. A second identical `deno check` can print
nothing and exit 0 while the first reported errors. If output looks suspiciously
empty, touch the file before believing it.

## Scope

**In scope, the only files to modify:**

- `static/playground.js` — the pragma and its annotations.
- `deno.json` — extend the `verify` check stage to include this file, in the
  final step only.
- `static/index.html` — the `playground.js?v=` bump.

**Out of scope, do not touch even if related:**

- Behavior. No function may change what it does. This is the rule that matters
  most here; see STOP conditions.
- `"checkJs": true`. That is plan 016.
- `static/script.js`. Plan 014 owns it.
- `tests/`. If a test starts failing, that is a signal you changed behavior, not
  an invitation to edit the test.
- Refactoring. Extracting a function to make it easier to type is a
  behavior-risk change in disguise. If a site cannot be typed without
  restructuring, stop and report it.

## Git/workflow guidance

- Branch: work directly on local `main`.
- Commit style: Conventional Commits, one per step. Suggested:
  `chore(types): annotate the playground wasm bridge`,
  `chore(types): narrow playground dom queries`, and so on.
- Do not push or deploy.

## Steps

### Step 1: Turn checking on for this file

Add `// @ts-check` as the first line of `static/playground.js`, above the
existing comment block. Note that `WASM_URL` at line 6 is patched by a script in
the zttp repository; adding a line above it shifts that line number, so check
whether `scripts/build-wasm-playground.sh` there matches by line or by pattern.
If it matches by line number, stop and report: this plan would break the wasm
publish step.

**Verify**: `deno check static/playground.js 2>&1 | grep -cE '^TS[0-9]+'`
-> 139. A materially different number means the measurement is stale; report the
new count and breakdown before continuing.

### Step 2: Type the wasm bridge

The 18 TS2339 are concentrated here and this is the step that decides whether
the plan stays honest.

Declare the shape as a JSDoc typedef near the wasm bridge section, then annotate
the binding:

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

Read those four signatures off the actual call sites at lines 174-183 and
confirm each before writing it. Do not copy them from this plan on trust.

Assigning `inst.exports` to that type needs narrowing, not a cast. The honest
form is a runtime check after instantiation that the four expected exports exist
and are functions, failing closed if they do not. That turns a typing obstacle
into a real robustness gain, and it composes with the fail-closed behavior plan
001 already landed: a missing export becomes an `unavailable` card instead of a
thrown `TypeError`.

Adding that guard is the one behavior change this plan permits, because it
converts an unhandled crash into an already-designed failure state. Call it out
explicitly in the commit body.

If the narrowing cannot be expressed without `any`, stop and report.

**Verify**: `deno check static/playground.js 2>&1 | grep -c TS2339` -> 0.
`deno task test` -> 19 pass.

### Step 3: Annotate callback and function parameters

The 50 TS7006 are the largest group and the most mechanical. Most are callback
parameters in `forEach`, `filter`, `map`, and event listeners, plus the render
helpers that take an analyzer envelope.

Where several functions share a data shape, declare one typedef and reference
it, rather than repeating an inline shape. The analyzer envelope, the proof
trace, and the counterexample are each used by more than one function.

**Verify**: `deno check static/playground.js 2>&1 | grep -c TS7006` -> 0.
`deno task test` -> 19 pass.

### Step 4: Narrow the DOM queries

The 47 TS18047 are `querySelector` and `getElementById` results. Prefer, in this
order:

1. **An existing guard.** This file already checks in many places, notably `:13`
   returning early when `section`, `editor`, or `card` is missing. A JSDoc
   `@type` on the binding is often all TypeScript needs to follow an existing
   guard.
2. **A JSDoc `@type` naming the concrete interface**, for example
   `/** @type {HTMLTextAreaElement} */` for `editor`, which is what makes
   `.value`, `.readOnly`, and `.selectionStart` type-check.
3. **A new guard** only where none exists and the value is genuinely optional.

Do not add `?.` to silence a diagnostic on a value the code requires. The card
elements resolved at lines 238-247 are required; if one is missing the page is
broken and should say so, not silently no-op.

**Verify**: `deno check static/playground.js 2>&1 | grep -c TS18047` -> 0.
`deno task test` -> 19 pass.

### Step 5: Clear the implicit-any variables and index access

The 10 TS7005, 5 TS7034, and 6 TS7053. The TS7053 group is index access into an
object literal used as a lookup table; `REPAIR_PLANS` at `:57` and the `props`
lookups are the likely sites. A typedef with an index signature, or a
`Record<string, ...>` in JSDoc, clears these.

**Verify**:
`deno check static/playground.js 2>&1 | grep -cE 'TS7005|TS7034|TS7053'` -> 0.
`deno task test` -> 19 pass.

### Step 6: Reason about the remaining three individually

TS2771, TS2769, and TS2322, one each. Fix the cause, not the symptom. If any
needs `any` or `@ts-ignore`, stop and report the line and the diagnostic text.

**Verify**: `deno check static/playground.js` -> exit 0, no output.

### Step 7: Wire it into the gate and confirm no runtime change

Extend the `verify` check stage to include `static/playground.js`, so the file
stays checked:

```json
"verify": "deno fmt --check && deno lint && deno check main.ts tests/site_contract_test.ts static/script.js static/playground.js && deno task test",
```

Bump `playground.js?v=` in `static/index.html:746` from `v=15` to the next
number.

Then run `deno task start` and confirm in a browser: the playground boots to
`PROVEN`; each of the three perturbation buttons flips the card red and back;
both seed tabs switch; a proof-trace chip expands and collapses; the lens tabs
switch panes; the certificate Copy button works; the attract demo runs on first
view and is cancelled by interaction; and the retry control appears if the wasm
fails to load.

That list is long on purpose. This file has more interactive surface than the
rest of the site combined, and a typing pass that quietly broke one branch would
otherwise ship.

**Teardown is mandatory.** Kill the server, close the browser, then confirm
`lsof -nP -iTCP:8000 -sTCP:LISTEN` returns no rows.

**Verify**: every behavior above works, `deno task verify` exits 0, and
`lsof -nP -iTCP:8000 -sTCP:LISTEN` -> no output.

## Test plan

No new application tests; `tests/playground_behavior_test.ts` already covers the
failure paths and is the safety net for this work.

- **Acceptance**: with the pragma present, a deliberate type error fails
  `deno task verify`. Without it, the same error passes.
- **Regression, run after every step**: `deno task test` -> 19 pass. The seven
  behavior tests boot this exact file, so a step that breaks the module's shape
  fails immediately rather than at the end.
- **Manual**: the Step 7 browser list. The behavior suite covers the failure
  paths, not the interactive ones.

## Done criteria

- [ ] `static/playground.js` starts with `// @ts-check`
- [ ] `deno check static/playground.js` exits 0 with no diagnostics
- [ ] `deno task verify` includes the file and exits 0
- [ ] A deliberate type error fails the gate; removing the pragma makes it pass
- [ ] No `any`, no cast to `any`, no `@ts-ignore` anywhere
- [ ] The only behavior change is the Step 2 export guard, and it is called out
      in its commit
- [ ] `deno task test` passes 19 after every step, not only at the end
- [ ] The work landed as six or seven commits, not one
- [ ] Every item in the Step 7 browser list works
- [ ] `playground.js?v=` bumped
- [ ] `:8000` free, no browser session left open
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Plan 014 has not landed, so the `lib` array is absent.
- Step 1 reports materially more or fewer than 139 diagnostics.
- `scripts/build-wasm-playground.sh` in the zttp repository patches `WASM_URL`
  by line number rather than by pattern.
- Any diagnostic reveals a genuine runtime bug. Report it; do not fix behavior
  here.
- Clearing a diagnostic appears to require `any`, a cast to `any`, `@ts-ignore`,
  or restructuring a function.
- `deno task test` drops below 19 at any step.
- Any item in the Step 7 browser list misbehaves.

## Maintenance notes

- The `ZtsAnalyzerExports` typedef is a copy of a contract owned by the zttp
  repository, where the wasm is built. It must be updated when the analyzer's
  exported signature changes. Write that next to the typedef, not only here.
- Reviewers should read the diff for behavior changes rather than for type
  correctness. The compiler already checked the types; what it cannot check is
  whether an added `?.` turned a required element into an optional one.
- Deliberately deferred: the global `checkJs` flip is plan 016. Until it lands,
  a newly added `.js` file is unchecked unless someone remembers the pragma.
