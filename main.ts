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
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function getContentType(path: string): string {
  const ext = path.substring(path.lastIndexOf("."));
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

Deno.serve({ port: 8000 }, async (req: Request) => {
  const url = new URL(req.url);
  let path = url.pathname;

  if (path === "/") path = "/index.html";

  // 301 redirect /deck.html to /deck to avoid duplicate content
  if (path === "/deck.html") {
    return new Response(null, {
      status: 301,
      headers: { "location": "/deck" },
    });
  }
  if (path === "/deck") path = "/deck.html";

  const headers: Record<string, string> = {
    "content-type": getContentType(path),
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  };

  const nocache = path.endsWith(".html") || path.endsWith(".txt")
    || path.endsWith(".xml") || path === "/manifest.json";
  headers["cache-control"] = nocache
    ? "no-cache"
    : "public, max-age=31536000, immutable";

  try {
    const file = await Deno.readFile(`./static${path}`);
    return new Response(file, { headers });
  } catch {
    // Custom 404: serve index.html with 404 status
    try {
      const index = await Deno.readFile("./static/index.html");
      return new Response(index, {
        status: 404,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-content-type-options": "nosniff",
          "x-frame-options": "DENY",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "camera=(), microphone=(), geolocation=()",
        },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  }
});
