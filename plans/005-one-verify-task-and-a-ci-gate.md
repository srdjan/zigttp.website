# Plan 005: One command verifies the project, and CI runs it on every push

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report; do not improvise around it. When done, update the status row for this
> plan in `plans/README.md`, unless a reviewer says they maintain the index.
>
> **Drift check, run first**: `cat deno.json && ls -a .github 2>&1` If
> `deno.json` does not match the excerpt under Current state, or `.github/`
> already exists with workflows, stop and report.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `63e96ec` and 2026-08-01

## Why this matters

The project has a working test suite that nothing enforces. There is no CI
configuration anywhere in the repository, no `verify` task, and
`deno task deploy` runs `deployctl deploy --prod` with no precondition at all.
`CLAUDE.md` asks a human to remember `deno fmt` and `deno check main.ts` before
committing TypeScript.

This plan is a prerequisite for several others. Plans 006, 007, and 008 all add
or change verification, and each is worth much less without a gate that runs it.
Landing this first means every later plan has somewhere to plug in.

## Current state

`deno.json` in full:

```json
{
  "name": "@srdjan/zttp-website",
  "version": "0.2.0",
  "exports": "./main.ts",
  "tasks": {
    "dev": "deno run --allow-net --allow-read --watch main.ts",
    "start": "deno run --allow-net --allow-read main.ts",
    "test": "deno test --allow-read",
    "deploy": "deployctl deploy --prod"
  },
  "compilerOptions": {
    "strict": true
  }
}
```

Facts:

- `git ls-files` shows no `.github/`, no workflow file, and no CI configuration
  of any kind.
- The four commands that pass today, on Deno 2.9.4: `deno fmt --check`
  (`Checked 20 files`), `deno lint` (`Checked 4 files`), `deno check main.ts`,
  `deno task test` (`ok | 6 passed | 0 failed`).
- `docs/plan.md:23-33` documents a verification block that already lists these
  commands. It is prose, not a task.
- `CLAUDE.md` and `AGENTS.md` both describe verification in prose only, and
  `AGENTS.md` incorrectly says "No tests". Plan 008 reconciles that; this plan
  only needs to not make it worse.
- `deno check main.ts tests/site_contract_test.ts` type-checks the TypeScript.
  `deno check` on `.js` files is currently a silent no-op because
  `compilerOptions` has no `checkJs`; plan 006 addresses that. Do not put `.js`
  paths in the `check` task here, because passing them would imply a guarantee
  the toolchain is not providing.

**Assumption this plan depends on**: the project is hosted on GitHub.
`static/index.html:19` has `<link rel="dns-prefetch" href="https://github.com">`
and the site links to a source repository. Confirm the remote with
`git remote -v` in Step 3; if there is no GitHub remote, see the STOP
conditions.

## Commands you will need

| Purpose       | Command                                          | Expected on success                         |
| ------------- | ------------------------------------------------ | ------------------------------------------- |
| Install/setup | n/a                                              | Deno 2.9.4 already present; no dependencies |
| Format check  | `deno fmt --check`                               | `Checked N files`, exit 0                   |
| Lint          | `deno lint`                                      | `Checked N files`, exit 0                   |
| Typecheck     | `deno check main.ts tests/site_contract_test.ts` | `Check main.ts`, `Check tests/...`, exit 0  |
| Tests         | `deno task test`                                 | `ok \| N passed \| 0 failed`                |
| The new gate  | `deno task verify`                               | all four above, exit 0                      |
| Remote check  | `git remote -v`                                  | a GitHub remote, or none                    |

## Scope

**In scope, the only files to modify or create:**

- `deno.json` — add the `verify` task and make `deploy` depend on it.
- `.github/workflows/verify.yml` — new file, the CI gate.

**Out of scope, do not touch even if related:**

- `compilerOptions`. Enabling `checkJs` is plan 006 and will fail the gate until
  its own fallout is cleared. Landing both at once makes the failure
  unattributable.
- `tests/site_contract_test.ts`. This plan runs the suite; it does not change
  it.
- `CLAUDE.md` and `AGENTS.md`. Plan 008 owns the documentation reconciliation
  and will reference `deno task verify` once it exists.
- Any `static/` file or `main.ts`.
- Deploy credentials, secrets, or a deploy job in CI. This workflow verifies; it
  does not ship.

## Git/workflow guidance

- Branch name: current branch `fix/ux-audit` unless the operator says otherwise.
- Commit style: Conventional Commits. Suggested:
  `chore(ci): add a verify task and run it on push`.
- Do not push, open a PR, or deploy. This plan creates a workflow file; the
  operator decides when it first runs.
- `.github/workflows/verify.yml` is a new top-level path. `CLAUDE.md` says new
  top-level files need justification: the justification is that the test suite
  is currently unenforced and `deploy` has no precondition. Record that in the
  commit body.

## Steps

### Step 1: Add the `verify` task

Add to the `tasks` block in `deno.json`:

```json
"verify": "deno fmt --check && deno lint && deno check main.ts tests/site_contract_test.ts && deno task test",
```

Order matters. Format and lint are the fastest and the most likely to fail on a
fresh change, so they run first and give the quickest feedback. Type checking
precedes tests because a type error makes a test failure hard to read.

**Verify**: `deno task verify` -> exits 0, and its output shows all four stages
running in that order.

### Step 2: Make `deploy` depend on the gate

Change the `deploy` task from:

```json
"deploy": "deployctl deploy --prod"
```

to:

```json
"deploy": "deno task verify && deployctl deploy --prod"
```

This is the change with the most value per character in this plan. It makes it
impossible to ship a red tree by muscle memory.

**Verify**: `grep -n '"deploy"' deno.json` -> the task includes
`deno task verify &&`. Do not actually run `deno task deploy`.

### Step 3: Confirm the remote before writing the workflow

Run `git remote -v`. If the remote is GitHub, continue to Step 4. If there is no
remote, or it is not GitHub, stop and report; see STOP conditions. Do not write
a workflow for a platform the project does not use.

**Verify**: `git remote -v` -> a `github.com` remote.

### Step 4: Add the CI workflow

Create `.github/workflows/verify.yml`:

```yaml
name: verify

on:
  push:
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
      - run: deno task verify
```

Notes on the choices, so a reviewer does not have to guess:

- `deno-version: v2.x` tracks the local toolchain, which is Deno 2.9.4. Pinning
  an exact patch would mean a maintenance chore with no benefit for a project
  with no dependencies.
- No cache step: the project has no third-party dependencies, so there is
  nothing to cache. Adding one would be pure ceremony.
- The job runs `deno task verify` and nothing else. Keeping CI and local
  verification the same single command is the whole point; if they drift, CI
  stops being a useful signal.
- No deploy job. Deploying from CI needs credentials and a decision that is not
  this plan's to make.

**Verify**: `deno task verify` still exits 0 locally, and the workflow file is
valid YAML. Check with
`deno eval "import { parse } from 'jsr:@std/yaml'; parse(await Deno.readTextFile('.github/workflows/verify.yml')); console.log('ok')"`
if a parser is wanted; otherwise visual inspection is acceptable for a file this
small.

### Step 5: Confirm the gate actually catches something

A gate that has never failed is not known to work. Temporarily introduce a
formatting error in a scratch edit, for example add trailing whitespace to a
line in `main.ts`, and confirm `deno task verify` fails at the
`deno fmt --check` stage. Then revert the edit and confirm it passes again.

Use `git diff` to confirm the revert left the tree exactly as it was. The
working tree already has 11 modified files, so be precise about what you revert.

**Verify**: `deno task verify` fails with the deliberate error, then exits 0
after revert, and `git status --porcelain | wc -l` returns the same count as
before Step 5.

## Test plan

This plan adds no application tests; it adds the mechanism that runs them.

- Existing suite to keep green: `tests/site_contract_test.ts`, 6 tests at the
  time of writing.
- The verification of this plan is Step 5: the gate must fail on a deliberately
  broken tree and pass on a clean one.
- Regression case: `deno task test` must still work standalone. Some workflows
  call it directly; `verify` is additive, not a replacement.

## Done criteria

All must hold:

- [ ] `deno task verify` exits 0 on the current tree
- [ ] `deno task verify` fails on a deliberately malformatted tree, then passes
      after revert
- [ ] `deno task test` still works standalone
- [ ] `deno task deploy` is gated behind `deno task verify`
- [ ] `.github/workflows/verify.yml` exists, is valid YAML, and runs
      `deno task verify`
- [ ] `git status --porcelain` shows only the two in-scope paths added or
      changed by this plan
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `deno.json` does not match the Current state excerpt.
- `.github/` already exists with a workflow. Merge into it rather than creating
  a competing one, and report what you found.
- `git remote -v` shows no remote or a non-GitHub host. The `verify` task from
  Steps 1 and 2 is still worth landing on its own; land it, skip Step 4, and
  report so the operator can choose a CI platform.
- `deno task verify` fails on the current tree before you have changed anything.
  Report which stage failed; do not fix unrelated failures inside this plan.
- Any stage of `verify` is flaky across repeated local runs.

## Maintenance notes

- Every later plan that adds verification should extend `deno task verify`
  rather than adding a parallel command. One gate, one name, used identically by
  humans and CI.
- Plan 006 will add `checkJs`, which changes what the `check` stage covers. Plan
  007 will add behavioral tests to the `test` stage. Both plug into this task
  without touching the workflow file.
- Reviewers should confirm CI runs the same command a developer runs. A workflow
  that inlines its own step list is the failure mode to watch for.
- Deliberately deferred: a deploy job in CI, dependency caching, and a matrix
  across Deno versions. None are justified for a project with no dependencies
  and one supported runtime.
