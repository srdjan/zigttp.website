# Plan 016: New JavaScript is type-checked by default, not by memory

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report; do not improvise around it. When done, update the status row for this
> plan in `plans/README.md`, unless a reviewer says they maintain the index.
>
> **Drift check, run first**:
> `head -1 static/script.js static/playground.js && deno check static/script.js static/playground.js`
> Both files must carry `// @ts-check` and the check must exit 0. If either is
> untrue, plans 014 and 015 have not both landed; stop and report.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/014-typecheck-script-js.md,
  plans/015-typecheck-playground-js.md
- **Category**: dx
- **Planned at**: commit `874afb0` and 2026-08-01
- **Supersedes**: the final step of
  `plans/006-typecheck-the-client-javascript-for-real.md`, which is marked
  SUPERSEDED

## Why this matters

Plans 014 and 015 check the two client files that exist today, each opted in by
a `// @ts-check` pragma. That leaves one hole: a `.js` file added tomorrow is
unchecked unless whoever adds it remembers the pragma. Relying on memory for a
safety property is the same failure mode as the original finding, where
`deno check` reported success on unanalyzed code.

Flipping `checkJs` on makes checking the default and the pragma redundant. It is
a three-line change that is only safe once both files are already clean, which
is why it is last rather than first. Attempting it first is exactly what stopped
plan 006.

## Current state

To be re-confirmed by the drift check before starting, because this plan is
meaningless if its dependencies have not landed.

After 014 and 015:

- `deno.json` `compilerOptions` is
  `{ "strict": true, "lib": ["deno.window", "dom", "dom.iterable", "esnext"] }`.
- `static/script.js` and `static/playground.js` each start with `// @ts-check`.
- The `verify` task's check stage names both files explicitly.
- `deno check static/script.js static/playground.js` exits 0.

Facts measured at commit `874afb0`, still relevant here:

- With `checkJs` off, an unpragma'd `.js` file exits 0 from `deno check`
  regardless of content. Verified: a scratch file calling `toUpperCase()` on a
  number and invoking an undeclared function passes.
- With the pragma, the same file exits 1.
- The `lib` array is required. Without `dom`, both client files produce 24
  spurious `TS2584 cannot find name 'document'` diagnostics; without
  `deno.window` first, `main.ts` loses the `Deno` namespace.

The only client `.js` files in the project are those two. `tests/` and `main.ts`
are TypeScript and already checked.

## Commands you will need

| Purpose                | Command                                            | Expected on success           |
| ---------------------- | -------------------------------------------------- | ----------------------------- |
| Install/setup          | n/a                                                | no dependencies               |
| Check the client files | `deno check static/script.js static/playground.js` | exit 0                        |
| Full gate              | `deno task verify`                                 | exit 0                        |
| Tests                  | `deno task test`                                   | `ok \| 19 passed \| 0 failed` |

## Scope

**In scope, the only files to modify:**

- `deno.json` — add `"checkJs": true`.
- `static/script.js` and `static/playground.js` — remove the now-redundant
  `// @ts-check` line from each.
- `CLAUDE.md` — one line recording that client JavaScript is type-checked.

**Out of scope, do not touch even if related:**

- Any annotation added by plans 014 or 015. If flipping the flag surfaces a new
  diagnostic, that is a STOP, not an invitation to keep annotating; it would
  mean the pragma and the global flag disagree, which needs explaining before it
  needs fixing.
- Behavior, in any file.
- The `verify` task's explicit file list. It stays as 014 and 015 left it.
  Naming the files is not redundant with `checkJs`: the flag decides whether a
  checked file is analyzed, and the task decides which files get checked at all.

## Git/workflow guidance

- Branch: work directly on local `main`.
- Commit style: Conventional Commits. Suggested:
  `chore(types): check client javascript by default`.
- One commit is right for this plan; it is a single thought.
- Do not push or deploy.

## Steps

### Step 1: Flip the flag with the pragmas still in place

Add `"checkJs": true` to `deno.json` `compilerOptions`, leaving both pragmas
alone for now:

```json
"compilerOptions": {
  "strict": true,
  "checkJs": true,
  "lib": ["deno.window", "dom", "dom.iterable", "esnext"]
}
```

Doing the flag before the pragma removal means that if anything breaks, only one
thing changed.

**Verify**: `deno task verify` -> exit 0. If any diagnostic appears, STOP: the
global flag and the per-file pragma are producing different results, which
contradicts the measured behavior and needs investigating before anything else.

### Step 2: Remove the redundant pragmas

Delete the `// @ts-check` first line from `static/script.js` and from
`static/playground.js`.

Note that removing a line from `static/playground.js` shifts `WASM_URL` back to
the line it occupied before plan 015. If `scripts/build-wasm-playground.sh` in
the zttp repository patches that constant by line number rather than by pattern,
this matters; plan 015's Step 1 should already have established which. If it was
never established, stop and check now.

**Verify**: `grep -c '@ts-check' static/script.js static/playground.js` -> 0 for
both. `deno task verify` -> exit 0, proving the checking survives the pragma
removal and therefore comes from the flag.

### Step 3: Prove the default applies to a new file

The point of this plan is files that do not exist yet, so test exactly that.

Create a scratch `static/probe.js` containing `const n = 1; n.toUpperCase();`
and confirm `deno check static/probe.js` exits 1 with a real diagnostic. Then
delete it.

This is the acceptance test. Without it the plan has only proven that two
already-clean files stay clean.

**Verify**: the probe fails the check, then `git status --porcelain` shows no
trace of it.

### Step 4: Record it

Add one line to the verification section of `CLAUDE.md` stating that `.js` under
`static/` is type-checked by `deno task verify` and that annotations are JSDoc
because there is no build step.

`AGENTS.md` is a pointer to `CLAUDE.md` and needs nothing.

**Verify**: `deno fmt --check` -> exit 0. `deno task verify` -> exit 0.

## Test plan

No new application tests.

- **Acceptance**: Step 3. A brand new `.js` file under `static/` is checked with
  no pragma and no task edit.
- **Regression**: `deno task test` passes 19; no `?v=` bump is needed because
  neither client file's shipped bytes change except for the removed comment
  line. Bump anyway if the pragma removal is the only change to a file, since
  the served bytes did change.
- Confirm `deno fmt --check` still passes; removing a first line can affect
  nothing else, but the gate is cheap.

## Done criteria

- [ ] `deno.json` has `"checkJs": true` alongside `strict` and the `lib` array
- [ ] Neither client file contains `@ts-check`
- [ ] A new unpragma'd `.js` file under `static/` fails `deno check` on a type
      error
- [ ] `deno task verify` exits 0
- [ ] `deno task test` passes 19
- [ ] `CLAUDE.md` records the rule
- [ ] No file outside the in-scope list is modified, and no scratch probe is
      left behind
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Either client file lacks its pragma, or `deno check` on them does not exit 0
  at the start.
- Step 1 surfaces any diagnostic that the pragma did not.
- Step 3's probe passes the check, which would mean the flag is not taking
  effect.
- `scripts/build-wasm-playground.sh` patches `WASM_URL` by line number.

## Maintenance notes

- After this lands, `checkJs` is a safety property of the project. Turning it
  off to unblock a change silently restores the original finding, where the
  documented gate reported success on unanalyzed code. If it ever must come off,
  that is a decision worth a note in `docs/`.
- The three-plan sequence 014, 015, 016 is the shape to reuse for any future
  incremental type migration: per-file pragma, one file at a time behind a real
  gate, global flag last. Plan 006 failed because it tried all three at once.
- Reviewers should check Step 3 was actually performed. It is the only step that
  tests what the plan is for.
