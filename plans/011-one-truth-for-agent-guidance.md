# Plan 011: Both agent guidance files describe the same, correct project

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report; do not improvise around it. When done, update the status row for this
> plan in `plans/README.md`, unless a reviewer says they maintain the index.
>
> **Drift check, run first**:
> `diff <(sed -n '1,200p' CLAUDE.md) <(sed -n '1,200p' AGENTS.md) | head -60`
> Confirm the divergences listed under Current state are still present before
> changing anything.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/005-one-verify-task-and-a-ci-gate.md,
  plans/010-remove-unreferenced-media-and-its-server-support.md
- **Category**: docs
- **Planned at**: commit `63e96ec` and 2026-08-01

## Why this matters

`CLAUDE.md` and `AGENTS.md` are near-duplicates that have drifted apart. Claude
reads one, Codex reads the other, and they now disagree on a convention that
changes what gets committed. Both are also wrong about routing, and both omit
files that exist.

Two agents working from contradictory rules is not a documentation nit; it
produces conflicting changes to the same repository. The duplication is the root
cause, so this plan removes the duplication rather than syncing two copies that
will drift again.

## Current state

Three concrete divergences, each verified against the code.

**1. Cache-busting convention, direct contradiction.**

`AGENTS.md`, Conventions:

> HTML and XML and `manifest.json` are served `no-cache`; everything else is
> immutable-cached. Rename assets when content changes rather than busting via
> query string.

`CLAUDE.md`, Conventions:

> First-party CSS and JS are versioned with a `?v=N` query in the HTML
> references (`main.ts` serves them dynamically, so the browser keys its cache
> on the full URL and a bumped query reliably busts the immutable copy); bump
> the number when the file changes. Rename media and wasm assets on content
> change (content-hash the wasm) rather than query-busting them.

The code agrees with `CLAUDE.md`: `static/index.html:106-107` and `:744-745` use
`?v=N` for CSS and JS, while the wasm carries a content hash in its filename
(`static/zts-analyzer.4ced20ee19da.wasm`). An agent following `AGENTS.md` would
rename `home.css` on every change, which is wrong.

**2. "No tests", false in both files.**

Both Local dev sections say:

> No tests, no linter config beyond Deno defaults.

`tests/site_contract_test.ts` exists with 6 passing tests and `deno.json`
defines a `test` task. After plan 005 lands there is also a `verify` task and a
CI workflow, which neither file will mention.

**3. Routing rule, wrong in both files.**

Both Routing rules sections say:

> Any other unknown path -> serves `index.html` with status 404 (custom 404
> page).

`main.ts:88-97` reads `./static/404.html`, not `index.html`. `static/404.html`
is a separate 2.3KB document with its own copy and `noindex` meta. The behavior
is right; both descriptions are wrong. `tests/site_contract_test.ts:11-27`
already asserts the real behavior.

**Also missing from the Layout section of both files:** `static/404.html` and
`tests/`.

**Also missing from `AGENTS.md` only:** the mandatory teardown rule that
`CLAUDE.md` carries, requiring any session that starts a server or drives a
browser to kill the process, close the browser, and confirm `:8000` is free
before reporting the work done. Codex reads `AGENTS.md` and never sees it.

**Also stale after plan 010:** both files list `static/*.mp4` under Layout, and
plan 010 deletes the only video asset.

**Also stale after plan 003:** neither file mentions that the CSP no longer
permits inline script, which is now a constraint worth stating.

## Commands you will need

| Purpose               | Command                    | Expected on success                                 |
| --------------------- | -------------------------- | --------------------------------------------------- |
| Install/setup         | n/a                        | no dependencies                                     |
| Compare the files     | `diff CLAUDE.md AGENTS.md` | after this plan, only the intended difference       |
| Format check          | `deno fmt --check`         | `Checked N files`, exit 0 (it formats markdown too) |
| Full gate             | `deno task verify`         | exit 0                                              |
| Behavior confirmation | `deno task test`           | `ok \| N passed \| 0 failed`                        |

## Scope

**In scope, the only files to modify:**

- `CLAUDE.md` — becomes the single source of truth.
- `AGENTS.md` — becomes a pointer, or a synchronized copy; see the Decision in
  Step 1.

**Out of scope, do not touch even if related:**

- `docs/design.md`, `docs/plan.md`, `docs/evolution-log.md`, `docs/solutions/`.
  Those are product and decision records with a different purpose, and all four
  were rewritten in commit `63e96ec`.
- `main.ts` and anything in `static/`. This plan corrects documentation to match
  the code, never the reverse. If something reads as a code bug, report it; do
  not fix it here.
- `/Users/srdjans/.claude/CLAUDE.md`, the user's global instructions. Out of the
  repository and out of scope.
- `plans/`. Owned by the advisor.

## Git/workflow guidance

- Branch name: current branch `fix/ux-audit` unless the operator says otherwise.
- Commit style: Conventional Commits. Suggested:
  `docs: make agent guidance match the code`.
- Do not push, open a PR, or deploy.

## Steps

### Step 1: Apply the chosen structure

Two shapes were considered; the operator chose A.

**Option A, recommended: `AGENTS.md` becomes a pointer.** Reduce it to a few
lines: what the project is, and "the canonical guidance is in `CLAUDE.md`; read
it." One file to maintain, drift structurally impossible. Codex reads
`AGENTS.md`, follows the pointer, and gets the same rules.

**Option B: keep both full copies, synchronized.** Needed only if a tool
requires `AGENTS.md` to be self-contained. It restores exactly the drift this
plan is fixing, so take it only for a stated reason.

**DECIDED 2026-08-01: Option A.** `AGENTS.md` becomes a pointer. Option B is not
authorized.

**Verify**: the commit message records that Option A was the operator's choice.

### Step 2: Fix the three factual errors in `CLAUDE.md`

Regardless of the option chosen, `CLAUDE.md` is the file that must be right.

1. **Routing.** Replace "serves `index.html` with status 404" with the truth:
   any unknown path serves `static/404.html` with status 404, and that page is a
   dedicated recovery page carrying `noindex`. Cite `main.ts:88-97` and note
   that `tests/site_contract_test.ts:11-27` pins it.

2. **Tests.** Replace "No tests, no linter config beyond Deno defaults" with the
   real verification story: `deno task test` runs the contract suite, and, once
   plan 005 has landed, `deno task verify` is the single gate that runs format,
   lint, typecheck, and tests, and `deploy` is gated behind it. State the one
   command, not four, so there is one thing to remember.

3. **Layout.** Add `static/404.html` and `tests/site_contract_test.ts` with
   one-line descriptions matching the style of the existing entries.

The cache-busting paragraph in `CLAUDE.md` is already correct. Leave it exactly
as written; it is the wording `AGENTS.md` must adopt.

**Verify**: every claim in `CLAUDE.md` about routing, tests, and layout matches
a `file:line` you can point at.

### Step 3: Reconcile `AGENTS.md`

Under Option A, replace the body with the pointer. Keep the one-line project
description, since the current `AGENTS.md` opening usefully says
"compiler-in-the-loop agent for Codex" where `CLAUDE.md` says "for Claude Code";
generalize that line rather than losing it.

Under Option B, copy the corrected `CLAUDE.md` content wholesale, including the
teardown rule that `AGENTS.md` currently lacks, and add a note at the top of
both files saying they must be changed together.

Either way, the teardown rule must reach Codex. That is the single highest-value
correction in this plan, because a Codex session that leaves `:8000` bound
blocks the next session.

**Verify**: under Option A, `AGENTS.md` is short and names `CLAUDE.md`. Under
Option B, `diff CLAUDE.md AGENTS.md` shows only the intended header difference.

### Step 4: Reflect the changes from the plans that landed first

This plan depends on 005 and 010 so that the documentation describes the
finished state rather than needing a second pass.

- From plan 005: document `deno task verify` as the gate and note that CI runs
  the same command.
- From plan 010: remove `static/*.mp4` from the Layout media line if the video
  was deleted.
- From plan 003, if it has landed: add one line to the security-headers
  convention noting the CSP permits no inline script, so any new inline
  `<script>` will be blocked. That is exactly the kind of constraint an agent
  needs stated up front.

If 003 has not landed, skip that line rather than describing a future state.

**Verify**: no statement in either file describes behavior that does not exist
at the current commit.

### Step 5: Check every remaining claim

Both files are short. Read each one end to end and confirm every factual claim
against the code. Specific items worth re-checking, since they are easy to get
wrong:

- `deno task dev` and `deno task start` port and flags, against `deno.json`.
- The `/deck.html` to `/deck` 301 invariant, against `main.ts:65-67`.
- The `no-js` and `zp-js` progressive-enhancement description, against
  `static/script.js:3` and `static/playground.js:16`.
- The claim that the wasm is content-hashed and must not be hand-edited, against
  `static/playground.js:5-6`.

**Verify**: a written list confirming each claim, with the `file:line` that
supports it.

## Test plan

Documentation has no unit tests, so the verification is a re-read plus one
guard.

- Every claim in Step 5 must be checkable against a `file:line`.
- `deno fmt --check` covers markdown in this project and must pass.
- Consider adding a small test that asserts the routing claim is consistent, for
  example that `CLAUDE.md` does not contain the string `serves \`index.html\`
  with status 404`. This is cheap and prevents the exact regression being fixed.
  Add it only if it reads as a genuine contract rather than trivia; the
  operator's call.
- Regression: `deno task verify` must still pass. Nothing in this plan touches
  code, so a failure means something outside scope was modified.

## Done criteria

All must hold:

- [x] The operator has chosen Option A, decided 2026-08-01
- [ ] `CLAUDE.md` describes the 404 route correctly, naming `static/404.html`
- [ ] Neither file claims the project has no tests
- [ ] Both files describe the same cache-busting convention, matching the code
- [ ] `static/404.html` and `tests/` appear in the Layout section
- [ ] The teardown rule is present in whatever file Codex reads
- [ ] Every claim checked in Step 5 has a supporting `file:line`
- [ ] `deno fmt --check` exits 0
- [ ] `deno task verify` exits 0
- [ ] No code file was modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The divergences under Current state are no longer present, meaning someone
  already reconciled the files.
- Something requires `AGENTS.md` to be self-contained, which would defeat Option
  A. Report it rather than switching to Option B unilaterally.
- A documentation claim turns out to describe correct intent that the code does
  not implement. That is a code finding; report it rather than documenting the
  bug as if intended.
- Plan 005 has not landed, so there is no `verify` task to document.
- Correcting a statement would require changing `main.ts` or anything in
  `static/`.

## Maintenance notes

- Under Option A the drift cannot recur, which is the point. Under Option B it
  will recur, so the note requiring both files to change together is
  load-bearing.
- The rule worth stating in whichever file survives: guidance claims are
  checkable. Every statement about routing, caching, or verification should be
  traceable to a `file:line`, and anything that is not traceable is probably
  stale.
- Reviewers should spot-check three claims at random against the code rather
  than reading for plausibility. Plausible-but-wrong is how all three of these
  errors survived.
- Deliberately deferred: `docs/design.md`, `docs/plan.md`, and
  `docs/evolution-log.md` were not audited for staleness. All three have
  uncommitted changes, so reviewing them now would be reviewing a moving target.
