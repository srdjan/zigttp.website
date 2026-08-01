import { handleRequest } from "../main.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(`../${path}`, import.meta.url));
}

Deno.test("unknown routes return a dedicated recovery page", async () => {
  const response = await handleRequest(
    new Request("https://zigttp.timok.com/outside-the-fence"),
  );
  const body = await response.text();

  assert(response.status === 404, "unknown routes must retain status 404");
  assert(
    response.headers.get("content-type") === "text/html; charset=utf-8",
    "the recovery page must be served as HTML",
  );
  assert(
    body.includes("That path is outside the fence"),
    "the 404 response must explain what happened",
  );
  assert(body.includes('href="/"'), "the 404 response must link home");
});

Deno.test("canonical routes retain redirect, cache, and security contracts", async () => {
  const redirect = await handleRequest(
    new Request("https://zigttp.timok.com/deck.html"),
  );
  assert(responseIsRedirectTo(redirect, "/deck"), "deck.html must redirect");

  const home = await handleRequest(new Request("https://zigttp.timok.com/"));
  assert(home.status === 200, "the homepage must remain available");
  assert(
    home.headers.get("cache-control") === "no-cache",
    "HTML must retain the no-cache policy",
  );
  assert(
    home.headers.get("content-security-policy")?.includes(
      "frame-ancestors 'none'",
    ),
    "the homepage must retain its anti-framing policy",
  );

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
  assert(
    !csp.includes("media-src"),
    "the policy must not grant media the site does not serve",
  );
});

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

function responseIsRedirectTo(response: Response, location: string): boolean {
  return response.status === 301 &&
    response.headers.get("location") === location;
}

Deno.test("homepage and deck are usable before enhancement", async () => {
  const [home, deck, script, homeCss, sharedCss] = await Promise.all([
    source("static/index.html"),
    source("static/deck.html"),
    source("static/script.js"),
    source("static/home.css"),
    source("static/style.css"),
  ]);

  assert(home.includes('<html class="no-js"'), "homepage needs a no-js root");
  assert(deck.includes('<html class="no-js"'), "deck needs a no-js root");
  assert(
    !home.includes('classList.replace("no-js", "js")') &&
      !deck.includes('classList.replace("no-js", "js")'),
    "documents must not claim enhancement before the controller loads",
  );
  assert(
    script.includes('classList.replace("no-js", "js")'),
    "the shared controller must activate enhanced navigation",
  );
  assert(
    homeCss.includes(".js .z-menu-button"),
    "homepage must expose the mobile menu button only after enhancement",
  );
  assert(
    sharedCss.includes(".no-js .deck-slide"),
    "deck must expose every slide without JavaScript",
  );
  assert(
    homeCss.includes(".z-playground:not(.zp-js) .zp-tabs"),
    "playground controls must stay hidden until their controller loads",
  );
});

Deno.test("playground load failure cannot retain a proven verdict", async () => {
  const [home, playground] = await Promise.all([
    source("static/index.html"),
    source("static/playground.js"),
  ]);

  assert(
    home.includes("zp-retry"),
    "the playground must expose a retry control",
  );
  assert(
    playground.includes('setPlaygroundState("unavailable")'),
    "load failures must enter the unavailable state",
  );
  assert(
    playground.includes('cardVerdict.textContent = "UNAVAILABLE"'),
    "the unavailable state must replace the proven verdict",
  );
  assert(
    playground.includes(
      'setProofDetailsVisible(state === "static" || state === "live")',
    ),
    "loading and unavailable states must hide stale proof details",
  );
});

Deno.test("a failed analysis cannot retain a proven verdict", async () => {
  const playground = await source("static/playground.js");

  assert(
    /function runAnalysis\(\)[\s\S]*?if \(!result\) \{\s*setPlaygroundState\("unavailable"\);/
      .test(playground),
    "a null analyzer result must drive the card to the unavailable state",
  );
  assert(
    /function runAnalysis\(\)[\s\S]*?catch \(err\) \{/.test(playground),
    "a throwing analyzer call must be caught rather than left uncaught",
  );
});

Deno.test("the editor never traps keyboard focus and never writes when read-only", async () => {
  const playground = await source("static/playground.js");

  assert(
    playground.includes('if (e.key !== "Tab" || e.shiftKey) return;'),
    "Shift+Tab must always leave the editor",
  );
  assert(
    playground.includes("if (editor.readOnly) return;"),
    "a read-only editor must reject the indent handler",
  );
});

Deno.test("playground static enhancement stays visible and truthful", async () => {
  const [playground, homeCss] = await Promise.all([
    source("static/playground.js"),
    source("static/home.css"),
  ]);
  const staticSequence = playground.indexOf(
    'syncHighlight();\n  setPlaygroundState("static");',
  );
  const lazyObserver = playground.lastIndexOf("new IntersectionObserver");

  assert(
    /\.zp-why\[hidden\]\s*\{[^}]*display:\s*none;?[^}]*\}/.test(homeCss),
    "hidden diagnostics must remain out of layout after a proven rerender",
  );
  assert(
    staticSequence !== -1 && staticSequence < lazyObserver,
    "the highlighted source must be seeded before static state and lazy boot",
  );
});

Deno.test("an optional enhancement cannot abort deck navigation", async () => {
  const script = await source("static/script.js");
  const spyIndex = script.indexOf("new IntersectionObserver");
  const deckIndex = script.indexOf('document.getElementById("deck")');

  assert(
    spyIndex !== -1 && deckIndex !== -1 && spyIndex < deckIndex,
    "the scroll spy still precedes deck navigation in the same scope",
  );
  assert(
    script.includes("scroll spy unavailable"),
    "a failing scroll spy must be caught, not left to abort the file",
  );
});

Deno.test("deck navigation exposes current and announced state", async () => {
  const [deck, script, sharedCss] = await Promise.all([
    source("static/deck.html"),
    source("static/script.js"),
    source("static/style.css"),
  ]);

  assert(
    deck.includes('aria-live="polite"'),
    "slide changes must be announced",
  );
  assert(
    deck.includes('aria-current="step"'),
    "the initial slide control must expose current state",
  );
  assert(
    script.includes("#slide-"),
    "deck navigation must preserve the active slide in the URL",
  );
  assert(
    deck.includes('href="/#workflow"') &&
      !deck.includes('href="/#expert"') &&
      !deck.includes('href="/#ship"'),
    "deck links must target current homepage sections",
  );
  assert(
    /@media \(max-width: 480px\)[\s\S]*?\.deck-dots\s*\{[^}]*justify-content:\s*safe center;/
      .test(
        sharedCss,
      ),
    "overflowing mobile deck dots must keep their leading controls reachable",
  );
});
