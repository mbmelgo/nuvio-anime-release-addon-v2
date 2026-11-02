import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import home from "../api/home-selector.js";
import manifest from "../api/resolver-manifest.js";
import catalog from "../api/catalog-source.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT || 3000);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function responseAdapter(nodeResponse) {
  return {
    status(code) {
      nodeResponse.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      nodeResponse.setHeader(name, value);
    },
    send(body) {
      nodeResponse.end(body);
    },
    json(body) {
      nodeResponse.setHeader("Content-Type", "application/json; charset=utf-8");
      nodeResponse.end(JSON.stringify(body));
    },
  };
}

async function serveAsset(pathname, response) {
  const relative = pathname.slice("/assets/".length);
  const filePath = normalize(join(root, "assets", relative));
  if (!filePath.startsWith(join(root, "assets"))) return false;
  try {
    const body = await readFile(filePath);
    response.statusCode = 200;
    response.setHeader("Content-Type", mimeTypes[extname(filePath)] || "application/octet-stream");
    response.end(body);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/assets/") && await serveAsset(url.pathname, response)) return;

  const req = { method: request.method, url: url.toString(), query: Object.fromEntries(url.searchParams) };
  const res = responseAdapter(response);
  try {
    if (url.pathname === "/") return home(req, res);
    if (url.pathname === "/manifest.json") return manifest(req, res);
    if (url.pathname === "/version") return version(req, res);
    if (url.pathname.startsWith("/catalog/")) return catalog(req, res);
    response.statusCode = 404;
    response.end("Not found");
  } catch (error) {
    console.error("[dev-server] request failed", error);
    response.statusCode = 500;
    response.end("Internal server error");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`AniBloom preview server listening on http://localhost:${port}`);
});
