const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "media-src 'self'",
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
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

function getContentType(path: string): string {
  const ext = path.substring(path.lastIndexOf("."));
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
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

if (import.meta.main) Deno.serve({ port: 8000 }, handleRequest);
