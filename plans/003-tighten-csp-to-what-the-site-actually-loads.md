# Plan 003: The CSP grants only the origins and capabilities the site actually uses

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report; do not improvise around it. When done, update the status row for this
> plan in `plans/README.md`, unless a reviewer says they maintain the index.
>
> **Drift check, run first**: `sed -n '1,13p' main.ts` If the
> `CONTENT_SECURITY_POLICY` array does not match the excerpt under Current
> state, stop and report.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `63e96ec` and 2026-08-01

## Why this matters

The policy grants `'unsafe-inline'` for scripts and allows
`https://cdn.jsdelivr.net` as both a script source and a fetch destination.
Nothing on the site loads from jsdelivr, and nothing executes an inline script.
Those grants buy nothing and cost the page its main defense against injected
script, plus an open outbound channel to a third-party CDN. For a product whose
homepage claims injection safety as a compiler guarantee, an unnecessary
`'unsafe-inline'` in its own headers is the wrong advertisement.

`CLAUDE.md` names these headers load-bearing and says to keep CSP directives
matched to the origins actually used. This plan does exactly that; it does not
loosen anything.

## Current state

`main.ts:1-13`:

```ts
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "media-src 'self'",
  "connect-src 'self' https://cdn.jsdelivr.net",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
```

Evidence that the grants are unused, all reproducible:

- `grep -rE 'jsdelivr' static/` returns nothing. The only external origins
  referenced anywhere in `static/` are `fonts.googleapis.com` and
  `fonts.gstatic.com` (`static/index.html:20-23`, `static/deck.html:22-25`,
  `static/404.html:14-18`).
- The only `<script>` elements with inline content are
  `type="application/ld+json"` (`static/index.html:67`, `:88`,
  `static/deck.html:72`). Those are data blocks, not executable script, so they
  do not need a script-src grant.
- `grep -nE ' on(click|load|error|change|submit|input)=' static/*.html` returns
  nothing. There are no inline event handlers.
- `grep -cE 'style="' static/index.html static/deck.html static/404.html`
  returns 0 for all three, and there are no `<style>` blocks. `style-src`
  correctly has no `'unsafe-inline'` today and must keep not having one.

Directives that must be preserved and why:

- `'wasm-unsafe-eval'` in `script-src` — required by `WebAssembly.compile` at
  `static/playground.js:155`. Removing it breaks the playground.
- `connect-src 'self'` — required by the same-origin wasm fetch at
  `static/playground.js:153`.
- `style-src https://fonts.googleapis.com` and
  `font-src https://fonts.gstatic.com` — required by the Google Fonts stylesheet
  link on all three pages.
- `img-src 'self' data:` — required by the SVG noise texture data URI at
  `static/style.css:72`.

`media-src 'self'` is a separate question; plan 010 removes it together with the
unreferenced video assets. Do not touch it here.

The policy is served on every response, including redirects (`main.ts:47-55`)
and both 404 branches (`main.ts:86-100`), because `SECURITY_HEADERS` is spread
into each.

## Commands you will need

| Purpose           | Command                                                                                     | Expected on success                                       |
| ----------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Install/setup     | n/a                                                                                         | no dependencies                                           |
| Typecheck/compile | `deno check main.ts`                                                                        | `Check main.ts`, exit 0                                   |
| Tests             | `deno task test`                                                                            | `ok \| N passed \| 0 failed`                              |
| Lint/format check | `deno fmt --check && deno lint`                                                             | `Checked N files`, exit 0                                 |
| Header inspection | `deno task start` then `curl -sI http://localhost:8000/ \| grep -i content-security-policy` | the new policy, with no `unsafe-inline` and no `jsdelivr` |

## Scope

**In scope, the only files to modify:**

- `main.ts` — the `CONTENT_SECURITY_POLICY` array, two lines.
- `tests/site_contract_test.ts` — assertions pinning the tightened directives.

**Out of scope, do not touch even if related:**

- `media-src` — owned by plan 010.
- Every other entry in `SECURITY_HEADERS` (`main.ts:15-22`). HSTS,
  `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy` are correct as
  written.
- `style-src` and `font-src` — the Google Fonts grants are in use.
- Any `static/` file. This plan changes headers only.

## Git/workflow guidance

- Branch name: current branch `fix/ux-audit` unless the operator says otherwise.
- Commit style: Conventional Commits. Suggested:
  `fix(security): drop unused CSP grants`.
- Do not push, open a PR, or deploy.

## Steps

### Step 1: Remove the unused script-src grants

Change `main.ts:3` from:

```ts
"script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
```

to:

```ts
"script-src 'self' 'wasm-unsafe-eval'",
```

Keep `'wasm-unsafe-eval'`. It is not optional; the playground calls
`WebAssembly.compile`.

**Verify**: `grep -n "script-src" main.ts` -> one line, containing neither
`unsafe-inline` nor `jsdelivr`.

### Step 2: Remove the unused connect-src grant

Change `main.ts:8` from:

```ts
"connect-src 'self' https://cdn.jsdelivr.net",
```

to:

```ts
"connect-src 'self'",
```

**Verify**: `grep -rn "jsdelivr" main.ts static/` -> no output.

### Step 3: Confirm nothing broke in a real browser

CSP violations do not fail a build; they fail silently at runtime and surface
only in the console. A curl check is not sufficient here.

Run `deno task start` and load, with the browser devtools console open:

1. `http://localhost:8000/` — fonts render in Outfit and JetBrains Mono, the
   mobile menu opens, the install Copy button works, the playground boots to
   `PROVEN`, and the console shows zero `Content Security Policy` violation
   reports.
2. `http://localhost:8000/deck` — slides advance with arrow keys and the dots
   respond.
3. `http://localhost:8000/does-not-exist` — the 404 page renders styled.

A blocked font or a blocked wasm compile is the failure mode to watch for. Both
would appear as console CSP violations.

**Teardown is mandatory.** Kill the server, close the browser, then confirm
`lsof -nP -iTCP:8000 -sTCP:LISTEN` returns no rows.

**Verify**: zero CSP violations in the console across all three pages, and
`lsof -nP -iTCP:8000 -sTCP:LISTEN` -> no output.

## Test plan

Extend the existing header test rather than adding a parallel one.
`tests/site_contract_test.ts:29-47` already asserts on the response CSP; add to
that test:

```ts
const csp = home.headers.get("content-security-policy") ?? "";
assert(
  !csp.includes("'unsafe-inline'"),
  "the policy must not grant inline script execution",
);
assert(
  !csp.includes("jsdelivr"),
  "the policy must not grant a CDN the site does not load from",
);
assert(
  csp.includes("'wasm-unsafe-eval'"),
  "the playground needs wasm compilation to stay permitted",
);
```

Note the first assertion is deliberately written against the whole policy
string, not just `script-src`. `style-src` must never gain `'unsafe-inline'`
either, and this assertion catches both.

Edge cases and regressions:

- The redirect responses and both 404 branches carry the same headers because
  they spread `SECURITY_HEADERS`. No separate assertion is needed, but do not
  refactor that spread.
- If a future change adds an inline script, this test fails loudly, which is the
  intent.

## Done criteria

All must hold:

- [ ] `deno fmt --check` exits 0
- [ ] `deno lint` exits 0
- [ ] `deno check main.ts` exits 0
- [ ] `deno task test` exits 0 with the three new assertions passing
- [ ] `grep -rn "jsdelivr" main.ts static/` returns no output
- [ ] Zero CSP console violations on `/`, `/deck`, and a 404 path in a real
      browser
- [ ] The playground still reaches `PROVEN`, proving `'wasm-unsafe-eval'`
      survived
- [ ] No files outside the in-scope list are modified
- [ ] `:8000` is free and no browser session is left open
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The `CONTENT_SECURITY_POLICY` excerpt does not match the live code.
- A browser reports any CSP violation after the change. Report the exact
  directive and blocked URI; do not re-add a grant to make it go away without
  saying so.
- Any inline `<script>` with executable content, or any `style=` attribute, is
  found in `static/` during this work. That would mean the Current state
  evidence is stale and the plan needs rewriting.
- `deno task test` fails twice after reasonable local correction.

## Maintenance notes

- `CLAUDE.md` already states the rule this plan enforces: adding an external
  script, style, font, or media origin means updating the matching directive in
  the same change. After this plan the policy is tight enough that violations
  are informative, so keep it that way.
- Reviewers should confirm `'wasm-unsafe-eval'` survived and that `style-src`
  did not silently gain `'unsafe-inline'`.
- Deliberately deferred: `Cross-Origin-Opener-Policy` and
  `Cross-Origin-Resource-Policy` are absent. Adding them is defensible hardening
  but is a separate decision with its own compatibility questions, and this plan
  is strictly about removing grants that are provably unused.
