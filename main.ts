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
};

function getContentType(path: string): string {
  const ext = path.substring(path.lastIndexOf("."));
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

Deno.serve({ port: 8000 }, async (req: Request) => {
  const url = new URL(req.url);
  let path = url.pathname;

  if (path === "/") path = "/index.html";
  if (path === "/deck") path = "/deck.html";

  const headers: Record<string, string> = {
    "content-type": getContentType(path),
  };

  // Cache static assets aggressively, HTML not at all
  if (path.endsWith(".html")) {
    headers["cache-control"] = "no-cache";
  } else {
    headers["cache-control"] = "public, max-age=31536000, immutable";
  }

  try {
    const file = await Deno.readFile(`./static${path}`);
    return new Response(file, { headers });
  } catch {
    // SPA fallback: serve index.html for clean URLs
    try {
      const index = await Deno.readFile("./static/index.html");
      return new Response(index, {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  }
});
