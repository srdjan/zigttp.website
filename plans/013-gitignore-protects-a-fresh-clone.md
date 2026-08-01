# Plan 013: A fresh clone cannot accidentally commit local tooling output

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report; do not improvise around it. When done, update the status row for this
> plan in `plans/README.md`, unless a reviewer says they maintain the index.
>
> **Drift check, run first**:
> `cat .gitignore && git status --porcelain --untracked-files=all | head -20` If
> `.gitignore` does not match the Current state excerpt, stop and report.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/010-remove-unreferenced-media-and-its-server-support.md,
  which removes one stale line from this file
- **Category**: dx
- **Planned at**: commit `63e96ec` and 2026-08-01

## Why this matters

`node_modules/` exists in this checkout and contains a Playwright install. It
stays out of `git status` only because of the current machine's global ignore
file, `/Users/srdjans/.gitignore_global`. The repository's own `.gitignore` does
not mention it. Anyone who clones this repository on a machine without that
global file, including an agent running in a fresh container, sees
`node_modules/` as untracked and can commit it.

A repository should protect itself. Relying on one developer's machine
configuration is a latent, easily avoided problem.

## Current state

`.gitignore` in full:

```
.DS_Store
codedb.snapshot
.codegraph
static/zts_compiler_pipeline.mp4
.playwright-mcp/
```

Facts:

- `git check-ignore -v node_modules` resolves to
  `/Users/srdjans/.gitignore_global:20:node_modules/`, not to a repository rule.
- `node_modules/.deno/playwright-core@1.49.0/` and
  `node_modules/.deno/fsevents@2.3.2/` exist on disk. Neither is a project
  dependency: `deno.json` has no `imports` and the project has no npm
  dependencies. They arrived through tooling.
- `git status --porcelain --untracked-files=all` currently shows only the 11
  modified tracked files and no untracked entries, which confirms the global
  ignore is doing all the work.
- Line 4, `static/zts_compiler_pipeline.mp4`, matches nothing: the tracked file
  is `static/zigts_compiler_pipeline.mp4`, with `zig` not `zts`. Plan 010
  deletes that asset and removes this line. If 010 has already landed, the line
  is gone; do not re-add it.
- Directories present in the checkout and their status: `.codegraph` is ignored,
  `.playwright-mcp/` is ignored, `.claude/settings.local.json` and `.agents/`
  and `.codex/config.toml` are not shown as untracked, so something is already
  covering them. `.codex/config.toml` is in fact tracked.

**Assumption this plan depends on**: nothing in `node_modules/` is intended to
be committed. Confirmed by `deno.json` having no dependencies at all.

## Commands you will need

| Purpose                 | Command                                        | Expected on success                                       |
| ----------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| Install/setup           | n/a                                            | no dependencies                                           |
| Where a rule comes from | `git check-ignore -v <path>`                   | after the fix, `.gitignore:N` rather than the global file |
| Untracked sweep         | `git status --porcelain --untracked-files=all` | no unexpected untracked entries                           |
| Full gate               | `deno task verify`                             | exit 0                                                    |

## Scope

**In scope, the only file to modify:**

- `.gitignore`

**Out of scope, do not touch even if related:**

- `/Users/srdjans/.gitignore_global`. Outside the repository and not this plan's
  to change.
- `.git/info/exclude`. Machine-local by design.
- Deleting `node_modules/` from disk. Untracked files are the developer's to
  manage, and removing a Playwright install could break local tooling.
- `.codex/config.toml`, which is tracked deliberately.
- Any tracked file. This plan adds ignore rules; it does not untrack anything.
  If it turns out something already committed should be ignored, that is a
  separate decision.

## Git/workflow guidance

- Branch name: current branch `fix/ux-audit` unless the operator says otherwise.
- Commit style: Conventional Commits. Suggested:
  `chore: ignore local tooling output in the repo itself`.
- Do not push, open a PR, or deploy.

## Steps

### Step 1: Find out what the global ignore is currently hiding

Before adding rules, see what the repository would look like without the
machine's global file:

```
git -c core.excludesFile=/dev/null status --porcelain --untracked-files=all | grep '^??'
```

That lists everything currently protected only by the global ignore. It is the
exact list a fresh clone would show as untracked, and it is the real input to
this plan.

**Verify**: a list. Expect `node_modules/` and possibly editor or OS artifacts.
Review each entry before deciding.

### Step 2: Add the missing rules

Add rules covering what Step 1 found. At minimum:

```
node_modules/
```

Add others only if Step 1 actually surfaced them. Do not paste a generic
multi-language ignore template; rules for tools this project does not use are
noise, and `CLAUDE.md` asks for new top-level content to be justified.

Two judgment calls worth stating:

- Keep the trailing slash on `node_modules/` so it matches only a directory.
  That is the accurate rule.
- If Step 1 surfaces `.claude/settings.local.json`, treat it carefully:
  `.claude/` may hold shared project configuration that should be committed
  while `settings.local.json` should not. Ignore the specific file, not the
  directory, and confirm with the operator.

**Verify**: `git check-ignore -v node_modules` -> resolves to `.gitignore:N`,
not to the global file.

### Step 3: Remove the stale video line

If plan 010 has already landed, this line is gone; skip the step. If it has not,
remove `static/zts_compiler_pipeline.mp4`. It matches nothing, because the real
filename is `zigts_compiler_pipeline.mp4`.

Do not fix the spelling. Plan 010 deletes that asset, so an ignore rule for it
is pointless in either spelling.

**Verify**: `grep -n mp4 .gitignore` -> no output.

### Step 4: Confirm a fresh clone is now clean

Repeat the Step 1 command and confirm the untracked list is empty or contains
only entries the operator has explicitly decided to leave unignored:

```
git -c core.excludesFile=/dev/null status --porcelain --untracked-files=all | grep '^??'
```

This is the acceptance test for the plan: the repository must be
self-sufficient, with no dependence on a machine-local ignore file.

**Verify**: the command returns nothing, or only deliberately-unignored entries.

### Step 5: Confirm nothing tracked was affected

Adding an ignore rule does not untrack an already-tracked file, but confirm no
tracked file has become invisible:

```
git status --porcelain | wc -l
git ls-files | wc -l
```

The tracked file count must be unchanged from before this plan, aside from any
change plan 010 made.

**Verify**: `git ls-files | wc -l` matches the pre-plan count, and
`git status --porcelain` shows only the expected modifications.

## Test plan

No automated test. Ignore rules are configuration, and a test that asserts a
file is ignored would only restate the rule.

The acceptance check is Step 4, run with the global ignore disabled. That is the
only way to see what a fresh clone sees, and it should be re-run whenever new
tooling is introduced.

Edge cases:

- A tracked file matching a new rule stays tracked. Verified in Step 5.
- `node_modules/` remains on disk and continues to work for local tooling. This
  plan changes only what git reports.

## Done criteria

All must hold:

- [ ] `git check-ignore -v node_modules` resolves to `.gitignore`, not to a
      global file
- [ ] `git -c core.excludesFile=/dev/null status --porcelain --untracked-files=all`
      shows no unexpected untracked entries
- [ ] The stale `mp4` line is gone
- [ ] `git ls-files | wc -l` is unchanged, aside from plan 010's deletions
- [ ] No rules were added for tooling this project does not use
- [ ] `deno task verify` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `.gitignore` does not match the Current state excerpt.
- Step 1 surfaces something that looks like it should be tracked but is not, for
  example project configuration under `.claude/` or `.agents/`.
- Step 1 surfaces a file containing credentials or tokens. Report the location
  and type only. Do not copy the contents anywhere, and do not commit it.
- A tracked file would be affected by a new rule.
- `git ls-files | wc -l` changes unexpectedly.

## Maintenance notes

- The durable habit: when a new tool writes into the repository, add its output
  to `.gitignore` in the same change, not to a personal global ignore. The Step
  1 command is the quick way to check whether that habit is holding.
- Reviewers should run the Step 4 command themselves. On a machine with a global
  ignore, the repository looks clean whether or not this plan worked.
- Deliberately deferred: whether `node_modules/` should exist here at all.
  `deno.json` declares no dependencies, so it is tooling residue, but removing
  it could break a local Playwright setup and that is the operator's call.
