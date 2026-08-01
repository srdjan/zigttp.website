# Plan 010: The repository ships only assets the site references

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report; do not improvise around it. When done, update the status row for this
> plan in `plans/README.md`, unless a reviewer says they maintain the index.
>
> **Drift check, run first**:
> `grep -rniE 'mp4|mov|zttp-logo|zigts_compiler' static/ main.ts` If anything
> other than the `CONTENT_TYPES` entries in `main.ts` and the `.gitignore` line
> matches, stop and report: an asset believed unreferenced is in use.
>
> **This plan deletes committed binary files.** Read the Deletion safety section
> before Step 2.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/003-tighten-csp-to-what-the-site-actually-loads.md
- **Category**: tech-debt
- **Planned at**: commit `63e96ec` and 2026-08-01

## Why this matters

Two committed binaries are referenced by nothing:
`static/zigts_compiler_pipeline.mp4` (80KB) and `static/zttp-logo.jpg` (59KB).
They ship with every deploy. Alongside them, `main.ts` carries
`media-src 'self'` in the CSP and `.mp4` and `.mov` content types for a site
with no video element.

The cost is small in bytes and real in signal. `CLAUDE.md` says to prefer
deletion over additions and to drop selectors with no matching markup; the same
discipline applies to assets and to header grants. A CSP directive that permits
something the site never does is the kind of thing that quietly stops being
questioned.

## Current state

Evidence, all reproducible from the repository root:

- `grep -rn "mp4\|zigts_compiler" static/*.html static/*.js static/*.css`
  returns nothing. Nothing links, embeds, or fetches the video.
- `grep -rohE '/(zttp-logo|zttp-og|logo-circle)[a-z.]*' static/*.html | sort -u`
  returns only `/logo-circle.jpeg` and `/zttp-og.jpg`. `zttp-logo.jpg` is
  referenced nowhere.
- `grep -n "<video" static/*.html` returns nothing.
- `git ls-files static/` lists both files as tracked.

Assets that are in use and must not be touched:

| File                                                                            | Referenced by                                                                      |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `logo-circle.jpeg`                                                              | `static/index.html:117` brand image, and the JSON-LD organization logo at `:95-99` |
| `zttp-og.jpg`                                                                   | the `og:image` and `twitter:image` tags                                            |
| `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png` | icon links in all three documents                                                  |
| `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`                         | `static/manifest.json`                                                             |
| `zts-analyzer.4ced20ee19da.wasm`                                                | `WASM_URL` at `static/playground.js:6`                                             |

Server-side support with no consumer:

```ts
// main.ts:7
  "media-src 'self'",
// main.ts:38-39
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
```

One more thing to notice: `.gitignore` line 4 reads
`static/zts_compiler_pipeline.mp4`, with a single `s`, while the tracked file is
`static/zigts_compiler_pipeline.mp4`. The ignore rule does not match the tracked
file. That is a loose end this plan tidies.

**Assumption this plan depends on**: neither binary is needed for an upcoming
change. `docs/plan.md` describes a completed homepage simplification with no
video work outstanding, and there are no TODO or FIXME markers anywhere in the
repository. Confirm with the operator in Step 1 anyway; deletion is the one step
here that is annoying to undo.

## Deletion safety

Both files are tracked in git, so `git checkout` restores either one at any time
and no history is rewritten. Deletion is fully reversible. Do not use
`git filter-branch`, BFG, or any history rewrite: purging the blobs is not the
goal and is not authorized by this plan.

## Commands you will need

| Purpose           | Command                                                                                | Expected on success             |
| ----------------- | -------------------------------------------------------------------------------------- | ------------------------------- |
| Reference sweep   | `grep -rn "zigts_compiler\|zttp-logo" . --exclude-dir=.git --exclude-dir=node_modules` | only `.gitignore` and this plan |
| Tests             | `deno task test`                                                                       | `ok \| N passed \| 0 failed`    |
| Full gate         | `deno task verify`                                                                     | exit 0                          |
| Restore if needed | `git checkout HEAD -- static/<file>`                                                   | file returns                    |
| Header inspection | `curl -sI http://localhost:8000/ \| grep -i content-security-policy`                   | no `media-src`                  |

## Scope

**In scope, the only files to modify or delete:**

- `static/zigts_compiler_pipeline.mp4` — delete.
- `static/zttp-logo.jpg` — delete.
- `main.ts` — remove `media-src 'self'` and the `.mp4` and `.mov` content types.
- `.gitignore` — remove the stale misspelled video line.

**Out of scope, do not touch even if related:**

- Every asset in the Current state table. All are in use.
- The `script-src` and `connect-src` directives. Plan 003 owns those; this plan
  touches only `media-src`. Land 003 first so the two changes to the same array
  do not collide.
- Other `CONTENT_TYPES` entries. `.svg`, `.woff`, and `.woff2` have no current
  consumer either, but they are cheap, conventional, and likely to be needed;
  removing them is churn without benefit. Only the video types go, because they
  pair with the CSP directive being removed.
- Git history.

## Git/workflow guidance

- Branch name: current branch `fix/ux-audit` unless the operator says otherwise.
- Commit style: Conventional Commits. Suggested:
  `chore(site): remove unreferenced media and its server support`.
- Put the deletions and the `main.ts` change in one commit. They are one
  thought, and splitting them leaves a commit where the CSP permits media that
  no longer exists.
- Do not push, open a PR, or deploy.

## Steps

### Step 1: Re-verify and confirm intent

Run the reference sweep across the whole repository, not just `static/`:

```
grep -rn "zigts_compiler\|zttp-logo" . --exclude-dir=.git --exclude-dir=node_modules
```

Expect matches only in `.gitignore` (the misspelled line) and in this plan. A
match in `docs/` means the asset is documented as intended for use, which
changes the decision.

Then confirm with the operator that neither file is staged for upcoming work.

**Verify**: the sweep returns only the expected matches, and the operator has
confirmed.

### Step 2: Delete the two files

```
git rm static/zigts_compiler_pipeline.mp4 static/zttp-logo.jpg
```

Use `git rm` rather than a plain filesystem delete so the removal is staged as
one intentional operation.

**Verify**: `git status --short` shows exactly two `D` entries and no other new
changes.

### Step 3: Remove the server-side support

In `main.ts`:

- Delete `"media-src 'self'",` from the `CONTENT_SECURITY_POLICY` array
  (`main.ts:7`).
- Delete the `".mp4"` and `".mov"` entries from `CONTENT_TYPES`
  (`main.ts:38-39`).

Dropping `media-src` leaves media governed by `default-src 'self'`, which is the
correct outcome: the site has no media, and if media is added later, the author
has to make a deliberate choice rather than inherit a stale allowance.

**Verify**: `grep -n "media-src\|mp4\|mov" main.ts` -> no output.

### Step 4: Tidy the stale ignore rule

`.gitignore` line 4 reads `static/zts_compiler_pipeline.mp4` and matches
nothing, since the tracked filename was `zigts_compiler_pipeline.mp4`. Remove
the line.

**Verify**: `grep -n "mp4" .gitignore` -> no output.

### Step 5: Confirm the site is unchanged

Run `deno task start` and check:

1. `/` renders with the brand logo visible and the playground reaching `PROVEN`.
2. `/deck` renders and navigates.
3. `curl -sI http://localhost:8000/ | grep -i content-security-policy` shows no
   `media-src`.
4. The browser console shows zero CSP violations on both pages.
5. `curl -sI http://localhost:8000/zttp-og.jpg` returns `200` with `image/jpeg`,
   proving the surviving images still serve correctly.

**Teardown is mandatory.** Kill the server, close the browser, then confirm
`lsof -nP -iTCP:8000 -sTCP:LISTEN` returns no rows.

**Verify**: all five checks pass, and `lsof -nP -iTCP:8000 -sTCP:LISTEN` -> no
output.

## Test plan

Add to `tests/site_contract_test.ts`, extending the existing header test at
lines 29-47 rather than adding a new one:

```ts
assert(
  !home.headers.get("content-security-policy")?.includes("media-src"),
  "the policy must not grant media the site does not serve",
);
```

Also worth adding, as a cheap guard against reintroducing an unreferenced asset:

```ts
Deno.test("every static image is referenced by a document", async () => {
  const documents = (await Promise.all([
    source("static/index.html"),
    source("static/deck.html"),
    source("static/404.html"),
    source("static/manifest.json"),
  ])).join("\n");

  for await (
    const entry of Deno.readDir(new URL("../static", import.meta.url))
  ) {
    if (!/\.(png|jpe?g|ico)$/.test(entry.name)) continue;
    assert(
      documents.includes(entry.name),
      `static/${entry.name} is not referenced by any document`,
    );
  }
});
```

Check this second test against the current asset list before committing it. If a
legitimately-used image is referenced only from CSS rather than from a document,
extend the source list rather than weakening the assertion. Note that
`deno task test` runs with `--allow-read`, which covers `Deno.readDir`.

Edge cases and regressions:

- `logo-circle.jpeg` is referenced twice, once as an `img` and once inside
  JSON-LD. Both are in `index.html`, so the test finds it.
- The wasm is excluded by the extension filter, correctly: it is referenced from
  `static/playground.js`, not from a document.

## Done criteria

All must hold:

- [ ] `deno task verify` exits 0
- [ ] `grep -rn "zigts_compiler\|zttp-logo" . --exclude-dir=.git --exclude-dir=node_modules`
      returns nothing outside this plan
- [ ] `grep -n "media-src\|mp4\|mov" main.ts` returns nothing
- [ ] `grep -n "mp4" .gitignore` returns nothing
- [ ] Zero CSP console violations on `/` and `/deck`
- [ ] The brand logo and the OG image still serve
- [ ] No files outside the in-scope list are modified
- [ ] No git history was rewritten
- [ ] `:8000` is free and no browser session is left open
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The reference sweep finds either filename anywhere unexpected, especially in
  `docs/`.
- The operator says either asset is staged for upcoming work.
- Plan 003 has not landed. Both plans edit `CONTENT_SECURITY_POLICY`; landing
  this first creates an avoidable conflict.
- The new asset-reference test fails for an image that is genuinely in use.
  Extend the source list and report which file and where it is referenced.
- Any CSP violation appears after removing `media-src`.

## Maintenance notes

- If video returns to the site, `media-src` and the `.mp4` content type come
  back with it, in the same change as the markup that uses them. `CLAUDE.md`
  already states this rule for external origins; it applies to first-party media
  too.
- The asset-reference test from the Test plan is the durable part of this work.
  Deleting two files is a one-time cleanup; the test is what stops the next
  unreferenced asset from settling in.
- Reviewers should confirm no history rewrite was attempted and that the
  surviving image list matches the Current state table.
