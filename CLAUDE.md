# CLAUDE.md

Marketing site for zttp - a restricted-TypeScript ("zts") toolchain with a
compiler-in-the-loop agent for Claude Code. Deno-served static assets, no build
step, no framework.

## Stack

- Runtime: Deno (see `deno.json`). No npm, no bundler.
- Server: single file `main.ts` - serves `static/` with security headers and a
  301 from `/deck.html` to `/deck`.
- Frontend: hand-written HTML, vanilla CSS (`static/style.css`,
  `static/home.css`), vanilla JS (`static/script.js`, `static/playground.js`).
  No framework, no build step.
- Hosting: Deno Deploy (`deno task deploy` runs `deno task verify` first, then
  `deployctl deploy --prod`).

## Layout

- `main.ts` - HTTP server, CSP, content-type and cache-control rules. Edit here
  for routing or headers.
- `static/index.html` - landing page.
- `static/deck.html` - pitch deck. Served at `/deck` (the `.html` form 301s to
  `/deck`); keep that invariant when adding routes.
- `static/style.css` - shared stylesheet (deck plus the homepage base). After
  the recent redesign, pre-v3 hero/CTA, features, modules, CLI, deck warning,
  and entrance-animation styles were dropped. Do not reintroduce dead selectors;
  remove rather than comment out.
- `static/home.css` - homepage-scoped styles, including the `.zp-*`
  proof-playground component.
- `static/script.js` - progressive enhancement only. The page must work without
  JS. On the homepage the no-JS contract is concrete: the playground editor
  ships `readonly` with a pre-rendered proof card, and `playground.js` adds the
  `zp-js` class to upgrade it to an editable, syntax-highlighted state.
- `static/playground.js` - drives the homepage proof playground: loads the wasm
  analyzer, runs it on editor input, renders the proof card. The section
  degrades to a static pre-rendered card without it.
- `static/zts-analyzer.*.wasm` - the zts analyzer compiled to WebAssembly. Built
  in the zttp repo by `zig build wasm` and published here by its
  `scripts/build-wasm-playground.sh`; the content hash in the filename is
  patched into `playground.js`. Do not hand-edit.
- `static/404.html` - the recovery page every unknown path serves. Carries
  `noindex` (`static/404.html:11`); it is a separate document, not the landing
  page.
- `static/*.png`, `*.jpg`, `*.jpeg`, `*.ico` - media. Cache-busted via
  `cache-control: public, max-age=31536000, immutable`.
- `static/robots.txt`, `static/sitemap.xml`, `static/manifest.json` - SEO and
  PWA. Update sitemap when adding routes.
- `tests/site_contract_test.ts` - server and markup contracts: routing, cache
  and security headers, and the no-JS enhancement contract.
- `tests/playground_behavior_test.ts` - boots `static/playground.js` against a
  parsed homepage with in-memory doubles, and asserts on the rendered proof
  card. Test-only DOM; nothing here reaches the browser.
- `docs/` - design.md, plan.md, evolution-log.md, and solutions/. Reference
  these for product intent before reshaping copy or layout.

## Local dev

```
deno task dev    # watch mode on :8000
deno task start  # plain run
```

One command verifies the project:

```
deno task verify   # deno fmt --check, deno lint, deno check, deno task test
```

Run it before committing. `.github/workflows/verify.yml` runs the same single
command on push and pull request, and `deno task deploy` will not ship until it
passes. `deno task test` still runs the suite alone when that is all you need.

Always tear down after testing. When a session starts the server or drives a
browser, kill the server process, close the browser, and confirm the port is
free (`lsof -nP -iTCP:8000 -sTCP:LISTEN`) before reporting the work done. Never
leave `:8000` bound or a browser session open between turns.

## Conventions

- Server file is intentionally one file. Do not split it into modules unless
  adding genuinely new behavior.
- Security headers in `main.ts` (CSP, X-Frame-Options, Referrer-Policy,
  Permissions-Policy) are load-bearing. If you add an external
  script/style/font/media origin, update the matching CSP directive in the same
  change; do not loosen CSP wholesale.
- The CSP grants no `'unsafe-inline'` for script (`main.ts:3`), so an inline
  `<script>` or an `on*=` attribute will not execute. Put behavior in
  `static/script.js` or `static/playground.js`.
- HTML and XML and `manifest.json` are served `no-cache`; everything else is
  immutable-cached. First-party CSS and JS are versioned with a `?v=N` query in
  the HTML references (`main.ts` serves them dynamically, so the browser keys
  its cache on the full URL and a bumped query reliably busts the immutable
  copy); bump the number when the file changes. Rename media and wasm assets on
  content change (content-hash the wasm) rather than query-busting them.
- CSS: redesign is current. Recent commits have been pruning pre-redesign rules
  (see `git log --oneline`). When touching styles, prefer deletion over
  additions; if a selector has no matching markup, drop it.
- No emojis in source, copy, or commit messages. No em dashes - use hyphens or
  colons.
- Prefer editing existing files over creating new ones. New top-level files
  (configs, READMEs, scripts) should be justified.

## Routing rules

- `/` -> `static/index.html`
- `/deck` -> `static/deck.html`
- `/deck.html` -> 301 to `/deck` (canonical form)
- Any other unknown path -> serves `static/404.html` with status 404
  (`main.ts:123-140`), a dedicated recovery page carrying `noindex`, not the
  landing page. `tests/site_contract_test.ts:11-27` pins this. Keep the fallback
  when changing the catch-all.

## When adding a new page

1. Create `static/<name>.html`.
2. Add a route branch in `main.ts` if it needs a clean URL (mirror the `/deck`
   pattern).
3. Update `static/sitemap.xml` and any nav links in `index.html` / `deck.html`.
4. Verify CSP still covers any new external origins.

## Out of scope

- No backend, no database, no API routes. If a feature needs server logic,
  surface that as a question before implementing.
- No client-side framework. Keep JS minimal and progressive.
