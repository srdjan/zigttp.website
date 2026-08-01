# Plan 007: The contract tests exercise behavior instead of matching source text

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report; do not improvise around it. When done, update the status row for this
> plan in `plans/README.md`, unless a reviewer says they maintain the index.
>
> **Drift check, run first**: `deno task test` All existing tests must pass
> before you start. If any fails, stop and report which one.
>
> **The Decision section is resolved**: Option A, a test-only JSR DOM. No
> further sign-off needed.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/005-one-verify-task-and-a-ci-gate.md
- **Category**: tests
- **Planned at**: commit `63e96ec` and 2026-08-01

## Why this matters

Six tests pass, and not one of them can fail for the right reason. They read
source files as strings and assert that certain substrings are present. That
approach has two costs, both currently being paid.

It misses real defects. Every playground bug found in the audit, including a
fail-open verdict path, a keyboard trap, and a write-through-`readonly` handler,
sat in code these tests already "cover."

It breaks for wrong reasons. `tests/site_contract_test.ts:119-121` matches the
exact string `'syncHighlight();\n  setPlaygroundState("static");'`, including
its two-space indent. A `deno fmt` reflow or an inserted line breaks the test
while the behavior is unchanged. That trains the reader to fix tests rather than
trust them.

## Current state

`tests/site_contract_test.ts` is 166 lines and contains six tests. Two kinds:

1. **Real behavior tests** against the server, and these are good. Lines 11-52
   call `handleRequest` from `main.ts` with a real `Request` and assert on the
   `Response`. Keep this style and extend it.

```ts
Deno.test("unknown routes return a dedicated recovery page", async () => {
  const response = await handleRequest(
    new Request("https://zigttp.timok.com/outside-the-fence"),
  );
  const body = await response.text();
  assert(response.status === 404, "unknown routes must retain status 404");
```

2. **Source-text greps** for everything client-side, lines 54-166. The helper:

```ts
async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(`../${path}`, import.meta.url));
}
```

The most brittle assertion, at lines 119-121:

```ts
const staticSequence = playground.indexOf(
  'syncHighlight();\n  setPlaygroundState("static");',
);
```

Constraints that shape the solution:

- `CLAUDE.md`: no npm, no bundler, no build step, no framework.
  `static/playground.js` and `static/script.js` ship to the browser exactly as
  written.
- `/Users/srdjans/.claude/CLAUDE.md`: test behavior through public APIs, not
  internals; use simple test doubles, not heavy mocking frameworks; tests run in
  under a second individually. The current suite runs in 13ms total and that
  budget should survive.
- `static/playground.js` is one IIFE with no exports (`static/playground.js:8`,
  `:1035`). Nothing in it is reachable from a test today.

Some source-text assertions are legitimately about source and should stay. The
no-JS contract at lines 63-86 asserts that the shipped HTML contains
`class="no-js"` and that the documents do not claim enhancement before the
controller loads. There the markup _is_ the contract, and reading it as text is
the correct test. Do not convert those.

## Decision

Testing DOM behavior in Deno needs a DOM. Three options; the plan recommends the
first.

**Option A, recommended: a test-only DOM.** Add `jsr:@b-fuze/deno-dom` as an
import used only by `tests/`. It is JSR, not npm, and it never reaches the
browser, so the no-bundler and no-framework rules are untouched. It is the
smallest change that makes the existing browser code testable as-is, with no
restructuring of `static/playground.js`.

**Option B: extract pure logic.** Move the state machine and the proof-card
model out of the IIFE into a module both the page and the tests import. This
gives the fastest, most honest tests and needs no dependency, but it changes how
the page loads scripts and is a much larger diff against a file the branch just
rewrote.

**Option C: a browser-driven smoke test.**
`node_modules/.deno/playwright-core@1.49.0` already exists in this checkout, so
the tooling is present. This gives the highest-fidelity coverage and the
slowest, least reliable suite. Best kept as a small separate layer later, not as
the main mechanism.

**DECIDED 2026-08-01: Option A.** The operator selected the test-only DOM. Steps
below are live; no further sign-off is needed for the mechanism. Options B and C
are not authorized. If Option A turns out to be unworkable, stop and report so
the plan can be rewritten rather than improvised into B or C.

## Commands you will need

| Purpose       | Command                                              | Expected on success          |
| ------------- | ---------------------------------------------------- | ---------------------------- |
| Install/setup | n/a for Option A beyond the `deno.json` import entry | —                            |
| Tests         | `deno task test`                                     | `ok \| N passed \| 0 failed` |
| Full gate     | `deno task verify`                                   | exit 0                       |
| Timing check  | `deno task test`                                     | total runtime under 1s       |
| Format check  | `deno fmt --check`                                   | `Checked N files`, exit 0    |

## Scope

**In scope, the only files to modify or create:**

- `tests/site_contract_test.ts` — replace the brittle client-side greps.
- `tests/playground_behavior_test.ts` — new file for the DOM-driven cases.
- `deno.json` — the test-only import entry, under Option A.

**Out of scope, do not touch even if related:**

- `static/playground.js` and `static/script.js`. This plan tests them; it does
  not restructure them. If a test cannot be written without changing the source,
  that is the Option B conversation, not an improvisation.
- `main.ts`. Its tests are already behavioral.
- The no-JS markup assertions at `tests/site_contract_test.ts:63-86`. Source
  text is the right test there.
- Any assertion added by plans 001 through 004. Those pin fixes that are landing
  now; converting them is a follow-up once this mechanism exists.

## Git/workflow guidance

- Branch name: current branch `fix/ux-audit` unless the operator says otherwise.
- Commit style: Conventional Commits. Suggested:
  `test(site): drive the playground through a real dom`.
- Do not push, open a PR, or deploy.

## Steps

### Step 1: Wire the DOM and prove the mechanism

Add the Option A import to `deno.json` and prove the mechanism with one trivial
test that parses `static/index.html` and finds `#zp-src`. Do not write ten tests
before knowing the harness works.

**Verify**: `deno task test` -> the new trivial test passes, total runtime still
under 1s.

### Step 2: Build a load harness

Write a helper in `tests/playground_behavior_test.ts` that parses
`static/index.html` into a document, installs the globals `static/playground.js`
expects, and evaluates the file.

The globals the IIFE touches, all findable by reading the file: `document`,
`globalThis.matchMedia` (`static/playground.js:249`), `IntersectionObserver`
(`:1022`), `WebAssembly` (`:997`), `fetch` (`:153`), `performance.now` (`:713`),
`navigator.clipboard` (`:695`), `setTimeout` and `clearTimeout`.

Every one of those is a seam. Provide simple in-memory doubles, per the house
rule against heavy mocking. Two matter most:

- A fake analyzer. Rather than instantiating real wasm, stub the module load so
  `wasm` resolves to an object whose `alloc`, `analyze`, `free`, and `memory`
  you control. That lets a test return a chosen JSON envelope, or return zero,
  or throw.
- A controllable `IntersectionObserver` so a test can trigger the lazy boot
  deterministically instead of waiting.

Keep the harness under about 80 lines. If it grows past that, the friction is
telling you Option B was the right call; stop and report.

**Verify**: a test can load the page, trigger boot with a stubbed analyzer
returning a success envelope, and read `PROVEN` from the `.zp-verdict` element.

### Step 3: Write the cases that would have caught the real bugs

Each case below corresponds to a defect the current suite missed. Name them so a
failure is self-explaining.

- **A null analyzer result cannot leave a proven verdict.** Stub `analyze` to
  return zero, boot, assert the verdict is `UNAVAILABLE` and not `PROVEN`. This
  is plan 001's fix, tested for real.
- **A throwing analyzer call cannot leave a proven verdict.** Stub the analyzer
  to throw. Same assertion.
- **Malformed analyzer JSON cannot leave a proven verdict.** Return bytes that
  are not valid JSON. Same assertion.
- **A read-only editor rejects the indent handler.** Set `readonly`, dispatch a
  `Tab` keydown, assert `editor.value` is byte-identical and that the demo state
  was not set to `manual control`. This is plan 002.
- **Shift+Tab is not intercepted.** Dispatch `Tab` with `shiftKey`, assert
  `preventDefault` was not called.
- **A load failure clears the pre-rendered verdict.** Make the wasm fetch
  reject, assert the verdict is `UNAVAILABLE`, the retry button is visible, and
  the proof detail panes are hidden. This is the contract
  `docs/solutions/ui-bugs/fail-closed-progressive-enhancement.md` describes,
  currently only grep-tested at `tests/site_contract_test.ts:88-112`.
- **A successful analysis renders the card.** The regression case. Assert
  `PROVEN`, a `proved in` status, and a chip count matching the envelope.

**Verify**: `deno task test` -> all new cases pass, and each fails when its fix
is reverted. Check at least two by temporarily reverting the corresponding
source change.

### Step 4: Delete the assertions the new tests replace

Remove from `tests/site_contract_test.ts`:

- Lines 88-112, `playground load failure cannot retain a proven verdict`, now
  covered behaviorally.
- Lines 114-132, `playground static enhancement stays visible and truthful`,
  including the exact-whitespace `staticSequence` match at 119-121, which is the
  most brittle assertion in the file.

Keep lines 11-52 (server behavior), lines 54-86 (no-JS markup contract), and
lines 134-166 (deck markup and CSS contract). The CSS regex assertions at 125
and 160-165 assert that a stylesheet contains a rule; that is a source contract
and stays until there is a way to test computed layout, which this plan does not
add.

Deleting is the point. Leaving both layers means the brittle one keeps breaking
builds while the good one does the work.

**Verify**: `deno task test` -> the removed test names no longer appear, the
remaining suite passes, and `deno task verify` exits 0.

### Step 5: Confirm the suite is still fast

The current suite runs in 13ms. The house rule is that tests run in under a
second individually.

**Verify**: `deno task test` -> total runtime under 1s. If a single test exceeds
200ms, find out why before finishing; a slow DOM harness usually means real wasm
is being loaded by accident.

## Test plan

This plan is the test plan. What it must produce:

- New file `tests/playground_behavior_test.ts` with the seven cases in Step 3.
- Structure modeled on the existing server tests at
  `tests/site_contract_test.ts:11-52`: `Deno.test` with a descriptive
  sentence-shaped name, the local `assert` helper with a message that reads as
  the contract being asserted.
- The local `assert` helper at lines 3-5 can be shared; move it to a small
  `tests/assert.ts` if both files need it, rather than duplicating.
- Edge cases beyond the seven: boot called twice, which is guarded at
  `static/playground.js:991-993`; retry after unavailable, which re-enters
  `boot`; a seed tab switch resetting an active perturbation.
- Regression: every test that survives Step 4 must still pass unchanged.

## Done criteria

All must hold:

- [x] The operator has chosen an option from the Decision section: Option A,
      decided 2026-08-01
- [ ] `tests/playground_behavior_test.ts` exists with the seven cases from Step
      3
- [ ] At least two new cases were confirmed to fail when their fix is reverted
- [ ] The exact-whitespace assertion at the old
      `tests/site_contract_test.ts:119-121` is gone
- [ ] `deno task test` exits 0
- [ ] `deno task verify` exits 0
- [ ] Total test runtime is under 1s
- [ ] No `static/` source file was modified
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Option A proves unworkable, for example if the DOM library cannot parse
  `static/index.html` or cannot support the events the tests dispatch. Report
  it; do not fall back to Option B or C on your own.
- The Step 2 harness passes roughly 80 lines, or needs to stub more than the
  globals listed. That is the signal that `static/playground.js` needs
  restructuring first.
- A test can only be made to pass by editing `static/playground.js` or
  `static/script.js`.
- Any existing test at `tests/site_contract_test.ts:11-52` or `:134-166` starts
  failing. Those are not in scope and a failure means something else changed.
- Total suite runtime exceeds 1s and the cause is not obvious.

## Maintenance notes

- The seam list in Step 2 is the real interface between `static/playground.js`
  and the browser. When the file gains a new global dependency, the harness
  needs it too, and that friction is useful: it makes the coupling visible.
- Prefer adding to `tests/playground_behavior_test.ts` over adding source greps
  to `tests/site_contract_test.ts`. Once the harness exists, a new source grep
  is almost always the wrong choice.
- Reviewers should check that Step 4 actually deleted the replaced assertions,
  and that new tests fail for the right reason, not just pass.
- Deliberately deferred: computed-layout and responsive assertions still have no
  mechanism, so the CSS regex checks at `tests/site_contract_test.ts:125` and
  `:160-165` stay as source contracts. A Playwright layer (Option C) is the
  eventual answer and is out of this plan.
