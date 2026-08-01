// Behavioral tests for static/playground.js. The file ships to the browser as
// one IIFE with no exports, so the harness below evaluates its source against a
// parsed homepage and a set of in-memory doubles for the globals it touches:
// document, fetch, WebAssembly, IntersectionObserver, matchMedia, performance,
// navigator, setTimeout and clearTimeout. Every double is a seam the real
// browser owns; keeping them here makes that coupling visible.
import { DOMParser, type Element } from "@b-fuze/deno-dom";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// What the stubbed analyzer hands back: a JSON envelope, or null for "the
// analyzer produced no result". A stub that throws models a failing call.
type Analyzer = () => string | null;

type Editor = Element & {
  value: string;
  readOnly: boolean;
  selectionStart: number;
  selectionEnd: number;
};

type Options = { analyzer?: Analyzer; wasmLoads?: boolean };

const PAGE = await Deno.readTextFile(
  new URL("../static/index.html", import.meta.url),
);
const SOURCE = await Deno.readTextFile(
  new URL("../static/playground.js", import.meta.url),
);
const evaluatePlayground = new Function(
  "env",
  `const {\ndocument, fetch, WebAssembly, IntersectionObserver,\nperformance, navigator, setTimeout, clearTimeout, globalThis\n} = env;\n${SOURCE}`,
) as unknown as (env: Record<string, unknown>) => void;

const PROVEN_ENVELOPE = JSON.stringify({
  success: true,
  proof: {
    properties: {
      deterministic: true,
      read_only: true,
      state_isolated: true,
      injection_safe: true,
    },
  },
  diagnostics: [],
});

// The analyzer's pointer protocol, backed by a plain ArrayBuffer: alloc hands
// out a fixed slot, analyze writes a length-prefixed JSON envelope at
// RESULT_PTR, and a zero return means "no result", exactly as the wasm does.
function analyzerExports(analyzer: Analyzer) {
  const memory = { buffer: new ArrayBuffer(65536) };
  const RESULT_PTR = 4096;
  return {
    memory,
    alloc: () => 16n,
    free: () => {},
    analyze: () => {
      const json = analyzer();
      if (json === null) return 0n;
      const bytes = new TextEncoder().encode(json);
      new DataView(memory.buffer).setUint32(RESULT_PTR, bytes.length, true);
      new Uint8Array(memory.buffer).set(bytes, RESULT_PTR + 4);
      return BigInt(RESULT_PTR);
    },
  };
}

// deno-dom parses markup but implements no form-control behavior, so the four
// textarea properties the editor drives are installed here.
function asEditor(node: Element | null): Editor {
  assert(node, "the page must carry the playground editor");
  let value = node.textContent ?? "";
  Object.defineProperties(node, {
    value: { get: () => value, set: (next: string) => value = next },
    readOnly: { get: () => node.hasAttribute("readonly") },
    selectionStart: { value: 0, writable: true },
    selectionEnd: { value: 0, writable: true },
  });
  return node as Editor;
}

function load(options: Options = {}) {
  const analyzer = options.analyzer ?? (() => PROVEN_ENVELOPE);
  const doc = new DOMParser().parseFromString(PAGE, "text/html");
  assert(doc, "the homepage must parse");
  const editor = asEditor(doc.getElementById("zp-src"));
  let intersect:
    | ((entries: Array<{ isIntersecting: boolean }>) => void)
    | null = null;

  class TestObserver {
    constructor(
      callback: (entries: Array<{ isIntersecting: boolean }>) => void,
    ) {
      intersect = callback;
    }
    observe() {}
    disconnect() {}
  }

  evaluatePlayground({
    document: doc,
    fetch: () =>
      options.wasmLoads === false
        ? Promise.reject(new Error("offline"))
        : Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        }),
    WebAssembly: {
      compile: () => Promise.resolve({}),
      Module: { imports: () => [] },
      instantiate: () =>
        Promise.resolve({ exports: analyzerExports(analyzer) }),
    },
    IntersectionObserver: TestObserver,
    performance: { now: () => 0 },
    navigator: {},
    // Scheduled demo beats are recorded and never run, so every assertion below
    // reads a settled card instead of racing an animation.
    setTimeout: () => 0,
    clearTimeout: () => {},
    globalThis: { IntersectionObserver: TestObserver },
  });

  const text = (selector: string): string =>
    doc.querySelector(selector)?.textContent ?? "";
  const hidden = (selector: string): boolean =>
    (doc.querySelector(selector) as (Element & { hidden?: boolean }) | null)
      ?.hidden === true;

  return {
    doc,
    editor,
    text,
    hidden,
    state: () => doc.getElementById("playground")?.getAttribute("data-state"),
    keydown: (key: string, shiftKey: boolean) => {
      const event = Object.assign(new Event("keydown", { cancelable: true }), {
        key,
        shiftKey,
      });
      editor.dispatchEvent(event);
      return event;
    },
    boot: async () => {
      assert(intersect, "the playground must observe its section to lazy boot");
      intersect([{ isIntersecting: true }]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

Deno.test("a successful analysis renders a proven card", async () => {
  const page = load();
  await page.boot();

  assert(
    page.state() === "live",
    "a loaded analyzer must reach the live state",
  );
  assert(
    page.text(".zp-verdict") === "PROVEN",
    "a successful envelope must render PROVEN",
  );
  assert(
    page.text(".zp-status").includes("proved in"),
    "a successful analysis must report how long the proof took",
  );
  assert(
    page.doc.querySelectorAll(".zp-chip.on").length === 4,
    "the proven chip count must match the properties in the envelope",
  );
});

Deno.test("a null analyzer result cannot leave a proven verdict", async () => {
  const page = load({ analyzer: () => null });
  await page.boot();

  assert(
    page.text(".zp-verdict") === "UNAVAILABLE",
    "an analyzer that returns nothing must drive the card to UNAVAILABLE",
  );
  assert(page.state() === "unavailable", "the section must fail closed");
});

Deno.test("a throwing analyzer call cannot leave a proven verdict", async () => {
  const page = load({
    analyzer: () => {
      throw new Error("analyzer trapped");
    },
  });
  await page.boot();

  assert(
    page.text(".zp-verdict") === "UNAVAILABLE",
    "a throwing analyzer must drive the card to UNAVAILABLE",
  );
});

Deno.test("malformed analyzer output cannot leave a proven verdict", async () => {
  const page = load({ analyzer: () => "{not json" });
  await page.boot();

  assert(
    page.text(".zp-verdict") === "UNAVAILABLE",
    "unparseable analyzer output must drive the card to UNAVAILABLE",
  );
});

Deno.test("a load failure clears the pre-rendered verdict", async () => {
  const page = load({ wasmLoads: false });
  await page.boot();

  assert(
    page.text(".zp-verdict") === "UNAVAILABLE",
    "a failed load must replace the pre-rendered proven verdict",
  );
  assert(!page.hidden(".zp-retry"), "the retry control must become visible");
  assert(
    page.hidden(".zp-lensbar") && page.hidden(".zp-lens"),
    "stale proof details must be hidden while no proof has run",
  );
});

Deno.test("Tab moves focus onward before the analyzer boots", () => {
  const page = load();
  const before = page.editor.value;

  assert(page.editor.readOnly, "the pre-boot editor must ship read-only");
  const event = page.keydown("Tab", false);

  assert(
    !event.defaultPrevented,
    "Tab must reach the browser so focus can leave the editor",
  );
  assert(
    page.editor.value === before,
    "a read-only editor must not be written through",
  );
  assert(
    page.text(".zp-demo-state") !== "manual control",
    "a keystroke the page ignores must not count as taking manual control",
  );
});

Deno.test("Tab moves focus onward once the playground is live", async () => {
  const page = load();
  await page.boot();
  const before = page.editor.value;

  for (const shift of [false, true]) {
    const event = page.keydown("Tab", shift);
    assert(
      !event.defaultPrevented,
      `Tab${shift ? " with Shift" : ""} must always leave the editor`,
    );
  }

  assert(
    page.editor.value === before,
    "Tab must not write to the editor in any direction",
  );
});
