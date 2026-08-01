# Plan 001: The proof card never shows a verdict the analyzer did not produce

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report; do not improvise around it. When done, update the status row for this
> plan in `plans/README.md`, unless a reviewer says they maintain the index.
>
> **Drift check, run first**:
> `grep -n "function runAnalysis" -A 10 static/playground.js` If the excerpt
> under Current state does not match the live code, stop and report. The
> repository had 11 uncommitted modified files when this plan was written, so
> `git diff` against `c05521f` is not a reliable drift signal. Use the grep.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `63e96ec` and 2026-08-01

## Why this matters

The homepage playground claims a verdict is earned. Right now, if the wasm
analyzer returns nothing or traps, the card keeps whatever verdict it was
already showing, including a `PROVEN` header over source that was never
analyzed. This is the same failure class the branch just fixed for the load path
in `docs/solutions/ui-bugs/fail-closed-progressive-enhancement.md`, but on the
analyze path. The site's central product claim is that a compiler proof is not a
guess, so a stale green verdict is the worst possible bug on this page.

## Current state

`static/playground.js` is an IIFE that drives the whole playground. Three facts
matter.

1. `analyze()` returns `null` on three distinct failures and can also throw:

```js
// static/playground.js:171-190
function analyze(src) {
  if (!wasm) return null;
  const enc = ENC.encode(src);
  const ptr = wasm.alloc(BigInt(enc.length));
  if (ptr === 0n) return null;
  new Uint8Array(wasm.memory.buffer).set(enc, Number(ptr));
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
```

`wasm.alloc`, `wasm.analyze`, and `wasm.free` are called without existence
checks. A wasm trap or a missing export throws out of this function; only
`JSON.parse` is guarded.

2. `runAnalysis()` renders only on success and has no else branch and no
   try/catch:

```js
// static/playground.js:711-720
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
```

3. `boot()` flips to the interactive state before the first analysis result
   exists:

```js
// static/playground.js:1008-1011
setPlaygroundState("live");
runAnalysis();
setDemoState("proof engine ready");
autoDemo();
```

A null first result therefore leaves the card in the pre-rendered `PROVEN`
state, with the live dot set to safe by `setPlaygroundState("live")`
(`static/playground.js:985-987`) and the status text stuck at
`loading proof engine...` from the earlier `loading` state
(`static/playground.js:963`).

The existing failure state is already built and already correct.
`setPlaygroundState("unavailable")` at `static/playground.js:968-982` clears the
verdict to `UNAVAILABLE`, sets `cardCount` to `proof not run`, hides `cardWhy`,
disables the controls, and reveals the retry button. Reuse it; do not invent a
new state machine.

`runAnalysis` has four call sites: `applyPerturb` (`:762`), `selectSeed`
(`:814`), the debounced input path via `scheduleAnalysis` (`:726`), and `boot`
(`:1009`).

**Convention to match**: this file logs diagnostics with
`console.error("playground: <what happened>", err)` (see `:187` and `:1004`).
Keep that prefix.

**Assumption this plan depends on**: `setPlaygroundState("unavailable")` is a
safe terminal state to enter from `live`. It is: it calls `clearDemoTimers()`
first and disables every control, and the retry button re-enters `boot()`
(`static/playground.js:1014`).

## Commands you will need

| Purpose             | Command                                                         | Expected on success                                |
| ------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| Install/setup       | n/a                                                             | no dependencies                                    |
| Typecheck/compile   | `deno check main.ts`                                            | `Check main.ts`, exit 0                            |
| Tests               | `deno task test`                                                | `ok \| 7 passed \| 0 failed` after Step 3          |
| Lint/format check   | `deno fmt --check && deno lint`                                 | `Checked N files`, exit 0                          |
| Manual verification | `deno task start` then open `http://localhost:8000/#playground` | card reaches `PROVEN` with status `proved in N ms` |

Note: `deno check static/playground.js` currently exits 0 without analyzing
anything, because `deno.json` does not enable `checkJs`. Do not treat it as a
gate here; plan 006 fixes that separately.

## Scope

**In scope, the only files to modify:**

- `static/playground.js` — the fail-open branch lives here.
- `static/index.html` — one line only, to bump the `playground.js?v=` query.
- `tests/site_contract_test.ts` — add the regression assertion described in Test
  plan.

**Out of scope, do not touch even if related:**

- `main.ts` — no server change is needed.
- `static/home.css` — the `unavailable` state is already styled; reuse it.
- The `setPlaygroundState` state names themselves. Do not add a new state;
  `unavailable` already communicates exactly the right thing.
- The `zp-retry` markup and its handler.

## Git/workflow guidance

- Branch name: work on the current branch `fix/ux-audit` unless the operator
  says otherwise.
- Commit style: Conventional Commits, observed in `git log --oneline`
  (`fix(site): make interactive surfaces fail closed`). No emojis, no em dashes.
- Do not push, open a PR, or deploy.

## Steps

### Step 1: Make `runAnalysis` fail closed

Rewrite `runAnalysis` at `static/playground.js:711-720` so that any failure to
produce a result drives the card to the `unavailable` state instead of leaving
the previous verdict standing.

Target shape:

```js
function runAnalysis() {
  if (!wasm) return;
  const t0 = performance.now();
  let result = null;
  try {
    result = analyze(editor.value);
  } catch (err) {
    console.error("playground: analyzer call failed", err);
  }
  const elapsed = performance.now() - t0;
  if (!result) {
    setPlaygroundState("unavailable");
    return;
  }
  render(result);
  setStatus("proved in " + fmtMs(elapsed), "");
}
```

Two details that are load-bearing:

- The `try` wraps only the `analyze` call, not `render`. A render bug must not
  be reported as an analyzer failure.
- `setPlaygroundState` is declared with `function` at
  `static/playground.js:938`, so it is hoisted and callable from `runAnalysis`
  even though it appears later in the file. No reordering is needed.

**Verify**: `grep -n "setPlaygroundState(\"unavailable\")" static/playground.js`
-> three matches (the existing `boot` guards at the
`WebAssembly === "undefined"` check and the `loadWasm` catch, plus the new one
in `runAnalysis`).

### Step 2: Bump the cache-bust version

`static/index.html:745` currently reads:

```html
<script src="/playground.js?v=12" defer></script>
```

Change `v=12` to `v=13`. Per `CLAUDE.md`, first-party JS is versioned with a
`?v=N` query and the number is bumped when the file changes, because the file
itself is served `immutable`.

`static/playground.js` is referenced from `static/index.html` only.
`static/deck.html` and `static/404.html` do not load it; confirm with the verify
command before assuming.

**Verify**: `grep -rn "playground.js?v=" static/` -> exactly one line,
`static/index.html`, reading `v=13`.

### Step 3: Add the regression test

See Test plan. Add the case to `tests/site_contract_test.ts`.

**Verify**: `deno task test` -> `ok | 7 passed | 0 failed`.

### Step 4: Confirm the happy path still works

Start the server, load the homepage, scroll to the playground, and confirm the
card reaches `PROVEN` with a `proved in N ms` status. Then type a character into
the editor and confirm the card re-proves rather than going unavailable. A
working analyzer must not trip the new branch.

**Teardown is mandatory.** `CLAUDE.md` requires it: kill the server, close the
browser, and confirm the port is free with `lsof -nP -iTCP:8000 -sTCP:LISTEN`
returning no rows.

**Verify**: `lsof -nP -iTCP:8000 -sTCP:LISTEN` -> no output.

## Test plan

The existing suite reads source text rather than running behavior (see plan 007,
which replaces this approach). Until that lands, match the house style in this
file so the regression is pinned now.

Add to `tests/site_contract_test.ts`, modeled on the existing
`playground load failure cannot retain a proven verdict` test at lines 88-112:

```ts
Deno.test("a failed analysis cannot retain a proven verdict", async () => {
  const playground = await source("static/playground.js");

  assert(
    /function runAnalysis\(\)[\s\S]*?if \(!result\) \{\s*setPlaygroundState\("unavailable"\);/
      .test(playground),
    "a null analyzer result must drive the card to the unavailable state",
  );
  assert(
    /function runAnalysis\(\)[\s\S]*?catch \(err\) \{/.test(playground),
    "a throwing analyzer call must be caught rather than left uncaught",
  );
});
```

Edge cases the change must handle, all reachable through the same branch:

- `wasm.alloc` returns `0n` (allocation failure).
- `wasm.analyze` returns `0` (no result pointer).
- The analyzer emits malformed JSON.
- A wasm trap or a missing export throws.
- First analysis after `boot` fails, so the card must not keep the pre-rendered
  `PROVEN`.

Regression case: a successful analysis must still render and set
`proved in N ms`. Step 4 covers this manually.

## Done criteria

All must hold:

- [ ] `deno fmt --check` exits 0
- [ ] `deno lint` exits 0
- [ ] `deno check main.ts` exits 0
- [ ] `deno task test` exits 0 with `7 passed | 0 failed`
- [ ] A null or throwing `analyze` result drives the card to `UNAVAILABLE`,
      verified by reading the new `runAnalysis`
- [ ] `static/index.html` references `playground.js?v=13`
- [ ] No files outside the in-scope list are modified
- [ ] `:8000` is free and no browser session is left open
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The `runAnalysis` excerpt under Current state does not match the live code.
- `setPlaygroundState` is no longer a hoisted `function` declaration, or the
  `unavailable` branch at `static/playground.js:968-982` has changed shape.
- `deno task test` fails twice after reasonable local correction.
- The fix appears to require changes to `static/home.css` or `main.ts`.
- The assumption that `unavailable` is reachable from `live` turns out to be
  false, for example because entering it from `live` leaves a control stuck
  disabled with no path back.

## Maintenance notes

- Anything that adds a new terminal state to the playground should route through
  `setPlaygroundState`, not through direct DOM writes to `cardVerdict`. That
  single choke point is what makes this fix small.
- Reviewers should check that the `try` does not swallow render errors, and that
  the status text is not left reading `loading proof engine...` after entering
  `unavailable`.
- Deliberately deferred: `render()` itself still trusts the analyzer envelope
  shape (`result.proof.properties` and friends are read with `||` fallbacks but
  no validation). That is a separate hardening question and is not in this plan.
