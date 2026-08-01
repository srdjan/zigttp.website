# Plan 012: The sitemap reports a `lastmod` that matches the content

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report; do not improvise around it. When done, update the status row for this
> plan in `plans/README.md`, unless a reviewer says they maintain the index.
>
> **Drift check, run first**: `cat static/sitemap.xml` If it does not match the
> Current state excerpt, stop and report.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none. Land last among the content-changing plans, so the date
  it records is the real one.
- **Category**: docs
- **Planned at**: commit `63e96ec` and 2026-08-01

## Why this matters

The sitemap claims both pages were last modified on 2026-07-24. Both were
rewritten substantially since: the working tree holds 1210 changed lines in
`static/index.html` and 8 in `static/deck.html`, and both files carry a
2026-08-01 mtime. A `lastmod` that trails the content tells crawlers to
deprioritize a recrawl of a page that has in fact been rewritten.

The date is a small thing. The recurring failure is not: this file is updated by
hand and there is nothing that notices when it falls behind.

## Current state

`static/sitemap.xml` in full:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://zigttp.timok.com/</loc>
    <lastmod>2026-07-24</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://zigttp.timok.com/deck</loc>
    <lastmod>2026-07-24</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
</urlset>
```

Supporting facts:

- `static/index.html` and `static/deck.html` both show mtime 2026-08-01.
- `git diff --stat` shows 1210 changed lines in `index.html` and 8 in
  `deck.html`, all uncommitted.
- The two URLs are correct and complete. `main.ts` serves exactly two canonical
  pages: `/` and `/deck`. The 404 page is `noindex` (`static/404.html:11`) and
  correctly absent.
- `static/robots.txt` points at the sitemap and needs no change.
- `main.ts:77-78` serves `.xml` as `no-cache`, so an updated sitemap is picked
  up without a cache-bust.
- Both `CLAUDE.md` and `AGENTS.md` say to update the sitemap when adding routes.
  Neither says to update `lastmod` when content changes, which is why it
  drifted.

## Commands you will need

| Purpose       | Command                                                                                                                                  | Expected on success              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Install/setup | n/a                                                                                                                                      | no dependencies                  |
| Current dates | `ls -l --time-style=+%Y-%m-%d static/index.html static/deck.html` or `stat -f '%Sm %N' -t '%Y-%m-%d' static/index.html static/deck.html` | the real mtimes                  |
| Full gate     | `deno task verify`                                                                                                                       | exit 0                           |
| Serve check   | `curl -s http://localhost:8000/sitemap.xml`                                                                                              | the updated XML                  |
| Content type  | `curl -sI http://localhost:8000/sitemap.xml \| grep -i content-type`                                                                     | `application/xml; charset=utf-8` |

## Scope

**In scope, the only files to modify:**

- `static/sitemap.xml` — the two `lastmod` values.
- `CLAUDE.md`, and `AGENTS.md` if plan 011 kept it as a full copy — one line
  added to the convention that says when to update `lastmod`.

**Out of scope, do not touch even if related:**

- `<loc>`, `<changefreq>`, and `<priority>`. All are correct for a two-page
  site.
- `static/robots.txt`.
- Adding URLs. There are exactly two canonical routes.
- Generating the sitemap at build or request time. There is no build step, and
  `CLAUDE.md` keeps `main.ts` to one file; a generator is a much larger decision
  than this plan.

## Git/workflow guidance

- Branch name: current branch `fix/ux-audit` unless the operator says otherwise.
- Commit style: Conventional Commits. Suggested:
  `chore(seo): refresh sitemap lastmod`.
- Land this after the other content-changing plans so the recorded date is not
  immediately stale again.
- Do not push, open a PR, or deploy.

## Steps

### Step 1: Determine the real dates

Get the actual last-modified date for each document. Prefer the date of the
commit that last changed the file over the filesystem mtime, since mtime changes
on checkout:

```
git log -1 --format=%cs -- static/index.html
git log -1 --format=%cs -- static/deck.html
```

Important: the working tree currently has uncommitted changes to both files. If
the pending work is committed as part of this branch, use the date it is
committed, not the date of the previous commit. Coordinate with the operator on
which is correct rather than picking silently.

**Verify**: two dates in `YYYY-MM-DD` form, each justified by a commit or by
pending work about to be committed.

### Step 2: Update the two values

Replace each `<lastmod>` with the date from Step 1. The two pages may
legitimately carry different dates; do not force them to match.

Keep the format as `YYYY-MM-DD`. The sitemap protocol accepts full W3C datetime,
but the file uses date-only consistently and there is no reason to change that.

**Verify**: `grep -n lastmod static/sitemap.xml` -> two lines with the intended
dates.

### Step 3: Write down the rule so it stops drifting

Add one line to the sitemap convention in `CLAUDE.md`, next to the existing
instruction about updating the sitemap when adding routes:

> Update `lastmod` in `static/sitemap.xml` when the content of a listed page
> changes, not only when a route is added.

If plan 011 chose Option B and `AGENTS.md` is still a full copy, add the same
line there. If it chose Option A, `AGENTS.md` points at `CLAUDE.md` and needs
nothing.

This is the part of the plan with lasting value. The date fix alone is undone by
the next content change.

**Verify**: `grep -n "lastmod" CLAUDE.md` -> one match.

### Step 4: Confirm it serves

Run `deno task start` and check:

1. `curl -s http://localhost:8000/sitemap.xml` returns the updated XML.
2. `curl -sI http://localhost:8000/sitemap.xml | grep -i content-type` returns
   `application/xml; charset=utf-8`.
3. `curl -sI http://localhost:8000/sitemap.xml | grep -i cache-control` returns
   `no-cache`.
4. The XML is well formed. `deno eval "new DOMParser()"` is not available; a
   simple check is that the file starts with the XML declaration and that
   opening and closing `<url>` counts match.

**Teardown is mandatory.** Kill the server, then confirm
`lsof -nP -iTCP:8000 -sTCP:LISTEN` returns no rows.

**Verify**: all four checks pass, and `lsof -nP -iTCP:8000 -sTCP:LISTEN` -> no
output.

## Test plan

A test that pins a hard-coded date would need editing on every content change,
which is the opposite of useful. If a guard is wanted, assert the structure
rather than the values:

```ts
Deno.test("the sitemap lists every canonical route with a lastmod", async () => {
  const sitemap = await source("static/sitemap.xml");

  assert(
    sitemap.includes("<loc>https://zigttp.timok.com/</loc>"),
    "home must be listed",
  );
  assert(
    sitemap.includes("<loc>https://zigttp.timok.com/deck</loc>"),
    "deck must be listed",
  );
  assert(
    (sitemap.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) ?? []).length ===
      2,
    "every listed route needs a well-formed lastmod",
  );
});
```

This catches a malformed or missing `lastmod` and a route added without a
sitemap entry. It cannot catch staleness; nothing automated can, short of
generating the file. Say so rather than implying the test covers more than it
does.

Edge cases:

- Adding a third route later must fail this test until the sitemap is updated.
  That is the intended behavior.
- The count assertion must be updated alongside any new route, which is an
  acceptable and visible cost.

## Done criteria

All must hold:

- [ ] Both `lastmod` values reflect the real last-modified date of their page
- [ ] The rule about updating `lastmod` on content change is written in
      `CLAUDE.md`
- [ ] The sitemap serves as `application/xml; charset=utf-8` with `no-cache`
- [ ] The XML is well formed and lists exactly the two canonical routes
- [ ] `deno task verify` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `:8000` is free
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `static/sitemap.xml` does not match the Current state excerpt.
- It is unclear whether the pending uncommitted changes are landing on this
  branch, which decides the date to record.
- A route exists in `main.ts` that the sitemap does not list, or vice versa.
  That is a routing finding beyond this plan.
- `deno task verify` fails.

## Maintenance notes

- Hand-maintained metadata drifts. If the sitemap falls behind again after this
  fix, generating it at request time from file mtimes is the real answer, and
  that is a `main.ts` change worth planning properly rather than improvising.
- Reviewers should confirm the date is justified rather than plausible, and that
  Step 3 actually landed. The convention line is the durable half of this plan.
- Deliberately deferred: `<changefreq>` and `<priority>` are advisory and widely
  ignored by crawlers. Leave them alone.
