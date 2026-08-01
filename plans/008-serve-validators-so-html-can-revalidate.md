# Plan 008: HTML revalidates with a 304 instead of re-downloading in full

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report; do not improvise around it. When done, update the status row for this
> plan in `plans/README.md`, unless a reviewer says they maintain the index.
>
> **Drift check, run first**: `sed -n '57,105p' main.ts` If `handleRequest` does
> not match the excerpt under Current state, stop and report.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/005-one-verify-task-and-a-ci-gate.md
- **Category**: perf
- **Planned at**: commit `63e96ec` and 2026-08-01

## Why this matters

HTML is served `no-cache`, which tells the browser to revalidate before reuse.
The server emits no `etag` and no `last-modified`, so there is nothing to
revalidate against and every revalidation is a full `200` with the whole body.
`static/index.html` is 27KB and `static/deck.html` is 43KB. A returning visitor
re-downloads all of it on every navigation, forever, including on slow
connections where it hurts most.

The fix is a validator plus an `if-none-match` branch. It also removes a second
cost: `main.ts:84` reads the entire file from disk on every request, including
the 1.0MB wasm.

Risk is MED for a real reason. A validator that is wrong serves stale HTML,
which is worse than the problem being solved. The plan is ordered so correctness
is verified before caching is added.

## Current state

`handleRequest` in full, `main.ts:57-102`:

```ts
export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let path = url.pathname;

  // 301 redirect duplicate content paths to their canonical URLs.
  if (path === "/index.html") {
    return permanentRedirect("/");
  }
  if (path === "/deck.html") {
    return permanentRedirect("/deck");
  }

  if (path === "/") path = "/index.html";
  if (path === "/deck") path = "/deck.html";

  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    "content-type": getContentType(path),
  };

  const nocache = path.endsWith(".html") || path.endsWith(".txt") ||
    path.endsWith(".xml") || path === "/manifest.json";
  headers["cache-control"] = nocache
    ? "no-cache"
    : "public, max-age=31536000, immutable";

  try {
    const file = await Deno.readFile(`./static${path}`);
    return new Response(file, { headers });
  } catch {
    // Custom 404: keep the status while giving visitors a clear recovery path.
    try {
      const notFound = await Deno.readFile("./static/404.html");
      return new Response(notFound, {
        status: 404,
        headers: {
          ...SECURITY_HEADERS,
          "content-type": getContentType("/404.html"),
          "cache-control": "no-cache",
        },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  }
}
```

Facts that shape the design:

- The asset set is fixed at deploy time. `static/` has 22 files and there is no
  upload path, no generated content, and no backend. `CLAUDE.md`: "No backend,
  no database, no API routes."
- Hosting is Deno Deploy (`deno.json` `deploy` task). The filesystem there is a
  read-only deployment snapshot, so file contents cannot change while the
  process runs.
- Non-HTML assets already carry `public, max-age=31536000, immutable` and are
  cache-busted by a `?v=N` query for CSS and JS, or by a content hash in the
  filename for the wasm. Those paths are already optimal for repeat visits; the
  gap is specifically the `no-cache` group.
- `CLAUDE.md` says the server file is intentionally one file and should not be
  split into modules unless adding genuinely new behavior. Validator support is
  genuinely new behavior, but it fits in `main.ts` and should stay there.
- The existing test at `tests/site_contract_test.ts:29-47` asserts
  `cache-control: no-cache` on the homepage. That assertion must keep passing;
  this plan does not change the cache-control policy, only adds a validator.

## Commands you will need

| Purpose            | Command                                                        | Expected on success                        |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------ |
| Install/setup      | n/a                                                            | no dependencies                            |
| Typecheck          | `deno check main.ts tests/site_contract_test.ts`               | exit 0                                     |
| Tests              | `deno task test`                                               | `ok \| N passed \| 0 failed`               |
| Full gate          | `deno task verify`                                             | exit 0                                     |
| Header inspection  | `curl -sI http://localhost:8000/`                              | `etag:` present, `cache-control: no-cache` |
| Revalidation check | `curl -sI -H 'if-none-match: "<etag>"' http://localhost:8000/` | `HTTP/1.1 304 Not Modified`, no body       |

## Scope

**In scope, the only files to modify:**

- `main.ts` — validator computation, the `if-none-match` branch, and the
  response cache.
- `tests/site_contract_test.ts` — new assertions for the 304 path.

**Out of scope, do not touch even if related:**

- The `cache-control` values. `no-cache` for HTML is correct and stays; this
  plan makes revalidation cheap, it does not make it rarer.
- The `?v=N` convention for CSS and JS, and the content hash for the wasm. Both
  are working and documented in `CLAUDE.md`.
- The redirect branches and the 404 fallback shape. Behavior there must be
  byte-identical after this plan.
- Compression. Deno Deploy compresses at the edge; adding manual compression
  here is unmeasured and out of scope.
- Splitting `main.ts` into modules.

## Git/workflow guidance

- Branch name: current branch `fix/ux-audit` unless the operator says otherwise.
- Commit style: Conventional Commits. Suggested:
  `perf(server): serve etags so html can revalidate`.
- Land Step 1 and Step 2 as one commit and Step 3 as a second. The validator is
  the correctness-sensitive part and deserves its own reviewable diff.
- Do not push, open a PR, or deploy.

## Steps

### Step 1: Compute a content-derived validator

Add a helper that returns a strong ETag derived from file content, not from
mtime. Content hashing is the right choice here: the asset set is small and
fixed, mtime is unreliable across a deploy snapshot, and a content hash is
correct by construction.

Shape:

```ts
async function etagFor(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `"${hex}"`;
}
```

Details that matter:

- The quotes are part of the ETag syntax. An unquoted value is malformed and
  browsers will ignore it.
- 16 bytes of SHA-256 is ample for 22 static files; a full 32-byte hex string is
  just a longer header.
- `crypto.subtle` is available in Deno and on Deno Deploy with no import.

Emit the header for every successful file response, and for the 404 body too,
since `404.html` is also `no-cache`.

**Verify**: `deno task start`, then
`curl -sI http://localhost:8000/ | grep -i etag` -> a quoted hex value. Run it
twice; the value must be identical across requests.

### Step 2: Answer `if-none-match` with a 304

Read the request header and short-circuit when it matches:

```ts
const inm = req.headers.get("if-none-match");
if (inm && inm === etag) {
  return new Response(null, { status: 304, headers });
}
```

Rules to get right:

- A 304 must carry the same `etag` and `cache-control` the 200 would have
  carried, and must not carry a body. Keep the security headers on it too; every
  other branch in this file spreads `SECURITY_HEADERS`, and the 304 should not
  be the exception.
- Compare after the file is read, against the freshly computed ETag. Do not
  trust a cached mapping until Step 3 introduces one deliberately.
- Handle the `W/` weak prefix and comma-separated lists defensively, or document
  that only the exact single-value case is handled. Browsers send back exactly
  what was served, so the simple comparison is correct in practice; if you keep
  it simple, say so in a comment rather than leaving it implicit.

**Verify**: capture the ETag from Step 1, then
`curl -sI -H 'if-none-match: "<value>"' http://localhost:8000/` -> `304`, no
body, `etag` and `cache-control` present. Then request with a wrong ETag ->
`200` with the full body.

### Step 3: Cache file bytes and their validator in memory

Only after Steps 1 and 2 are verified. Add a
`Map<string, { bytes: Uint8Array; etag: string }>` populated lazily on first
read.

This is safe here for a specific reason worth writing in a comment: the
deployment filesystem is immutable for the life of the process, so a cached body
cannot go stale. That assumption is what makes the cache correct, and if it ever
stops holding, the cache is the first thing to remove.

It also removes the repeated 1.0MB read of
`static/zts-analyzer.4ced20ee19da.wasm`.

Note the local-development consequence: `deno task dev` runs with `--watch`,
which restarts the process on file change, so the cache is discarded and edits
still appear. Confirm this by editing `static/index.html` while `deno task dev`
runs and reloading. If a stale body appears, the cache must be disabled outside
production rather than shipped as-is.

**Verify**: with `deno task dev` running, edit a visible string in
`static/index.html`, reload, and see the change. Then confirm the ETag changed
too.

### Step 4: Confirm no behavior regressed

Check every branch of `handleRequest`, since this plan touches its core:

1. `curl -sI http://localhost:8000/index.html` -> `301` to `/`
2. `curl -sI http://localhost:8000/deck.html` -> `301` to `/deck`
3. `curl -sI http://localhost:8000/deck` -> `200`, `text/html; charset=utf-8`,
   `no-cache`
4. `curl -sI http://localhost:8000/style.css` -> `200`,
   `public, max-age=31536000, immutable`
5. `curl -sI http://localhost:8000/nope` -> `404`, `text/html; charset=utf-8`
6. `curl -s http://localhost:8000/nope | grep "outside the fence"` -> the
   recovery copy
7. Every response above carries `content-security-policy`

**Teardown is mandatory.** Kill the server, close the browser, then confirm
`lsof -nP -iTCP:8000 -sTCP:LISTEN` returns no rows.

**Verify**: all seven checks pass, and `lsof -nP -iTCP:8000 -sTCP:LISTEN` -> no
output.

## Test plan

Add to `tests/site_contract_test.ts`, in the style of the existing server tests
at lines 11-52 which call `handleRequest` directly:

```ts
Deno.test("html revalidates with a 304 instead of resending the body", async () => {
  const first = await handleRequest(new Request("https://zigttp.timok.com/"));
  const etag = first.headers.get("etag");
  await first.text();

  assert(
    etag !== null && etag.startsWith('"'),
    "html must carry a quoted etag",
  );

  const second = await handleRequest(
    new Request("https://zigttp.timok.com/", {
      headers: { "if-none-match": etag },
    }),
  );

  assert(second.status === 304, "a matching validator must produce a 304");
  assert(second.body === null, "a 304 must not carry a body");
  assert(
    second.headers.get("cache-control") === "no-cache",
    "a 304 must repeat the cache policy",
  );
  assert(
    second.headers.get("content-security-policy") !== null,
    "a 304 must still carry the security headers",
  );
});

Deno.test("a stale validator still gets the full body", async () => {
  const response = await handleRequest(
    new Request("https://zigttp.timok.com/", {
      headers: { "if-none-match": '"0000000000000000"' },
    }),
  );
  const body = await response.text();

  assert(response.status === 200, "a mismatched validator must not 304");
  assert(body.length > 0, "a 200 must carry the body");
});
```

Note: the existing tests do not always consume the response body. Consume it in
new tests so the resource is released and the suite stays clean.

Edge cases and regressions:

- Two identical requests return the same ETag. Different files return different
  ETags.
- The immutable-cached assets also get an ETag; harmless, and it makes the code
  uniform.
- The 404 body carries an ETag and can 304 as well.
- The existing `cache-control: no-cache` assertion at line 38 must still pass.

## Done criteria

All must hold:

- [ ] `deno task verify` exits 0
- [ ] `curl -sI /` shows a quoted `etag`, stable across repeated requests
- [ ] A matching `if-none-match` returns `304` with no body, with `etag`,
      `cache-control`, and CSP present
- [ ] A mismatched `if-none-match` returns `200` with the full body
- [ ] All seven checks in Step 4 pass
- [ ] `deno task dev` still reflects edits to `static/index.html` on reload
- [ ] The existing `cache-control: no-cache` assertion still passes
- [ ] No files outside the in-scope list are modified
- [ ] `:8000` is free and no browser session is left open
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The `handleRequest` excerpt does not match the live code.
- A stale body is served after an edit under `deno task dev`. Report it; do not
  ship the Step 3 cache with a workaround.
- Any check in Step 4 differs from its stated expectation.
- The 304 path drops any header the 200 path carries.
- `crypto.subtle.digest` is unavailable in the target runtime.
- Implementing this appears to require splitting `main.ts` into modules.

## Maintenance notes

- The Step 3 cache is correct only while the deployed filesystem is immutable
  for the process lifetime. Write that as a comment next to the cache, not just
  here. Anything that introduces generated or user-uploaded content invalidates
  the assumption, and the cache is then the first thing to remove.
- Reviewers should scrutinize the 304 header set. Dropping CSP on the 304 path
  is the easy mistake, and it is invisible in a browser because the cached body
  is reused.
- Deliberately deferred: `last-modified` and `if-modified-since` add a second
  validator with no extra benefit once a strong ETag exists. Compression stays
  with the edge. Neither is in this plan.
