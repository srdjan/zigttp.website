const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "content-security-policy": CONTENT_SECURITY_POLICY,
};

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function getContentType(path: string): string {
  const ext = path.substring(path.lastIndexOf("."));
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

type Asset = { readonly bytes: Uint8Array<ArrayBuffer>; readonly etag: string };

// A strong validator derived from content, not from mtime: mtime is unreliable
// across a deploy snapshot, and a content hash is correct by construction. The
// quotes are part of the ETag syntax; an unquoted value is malformed and gets
// ignored. 16 bytes of SHA-256 is ample for a fixed set of static files.
async function etagFor(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `"${hex}"`;
}

async function readAsset(path: string): Promise<Asset | null> {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await Deno.readFile(path);
  } catch {
    return null;
  }
  return { bytes, etag: await etagFor(bytes) };
}

// Browsers echo back exactly the validator they were served, so an exact match
// is the only case worth handling. A weak `W/` prefix or a comma-separated list
// falls through to a full 200, which is always correct, only less economical.
function matchesValidator(req: Request, etag: string): boolean {
  return req.headers.get("if-none-match") === etag;
}

function permanentRedirect(location: string): Response {
  return new Response(null, {
    status: 301,
    headers: {
      ...SECURITY_HEADERS,
      "location": location,
    },
  });
}

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

  const asset = await readAsset(`./static${path}`);
  if (asset) {
    headers["etag"] = asset.etag;
    // A 304 carries the headers the 200 would have carried, security headers
    // included, and no body.
    if (matchesValidator(req, asset.etag)) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(asset.bytes, { headers });
  }

  // Custom 404: keep the status while giving visitors a clear recovery path.
  const notFound = await readAsset("./static/404.html");
  if (!notFound) {
    return new Response("Not Found", { status: 404 });
  }

  const notFoundHeaders: Record<string, string> = {
    ...SECURITY_HEADERS,
    "content-type": getContentType("/404.html"),
    "cache-control": "no-cache",
    "etag": notFound.etag,
  };
  if (matchesValidator(req, notFound.etag)) {
    return new Response(null, { status: 304, headers: notFoundHeaders });
  }
  return new Response(notFound.bytes, {
    status: 404,
    headers: notFoundHeaders,
  });
}

if (import.meta.main) Deno.serve({ port: 8000 }, handleRequest);
