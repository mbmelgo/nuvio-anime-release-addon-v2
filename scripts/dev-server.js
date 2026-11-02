import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import manifest from "../api/resolver-manifest.js";
import catalog from "../api/catalog-source.js";
import { ADDON_VERSION } from "../api/version.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
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
  let relative;
  try {
    relative = decodeURIComponent(pathname.slice("/assets/".length));
  } catch {
    return false;
  }
  const assetsRoot = resolve(root, "assets");
  const filePath = resolve(assetsRoot, relative);
  if (filePath !== assetsRoot && !filePath.startsWith(assetsRoot + sep)) return false;
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

export function createPreviewServer() {
  return createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/assets/") && await serveAsset(url.pathname, response)) return;

  const req = { method: request.method, url: url.toString(), query: Object.fromEntries(url.searchParams) };
  const res = responseAdapter(response);
  try {
    if (url.pathname === "/") {
      const { default: home } = await import(`../api/home-selector.js?preview=${Date.now()}`);
      return home(req, res);
    }
    if (url.pathname === "/manifest.json") return manifest(req, res);
    if (url.pathname === "/version") return res.json({ version: ADDON_VERSION });
    if (url.pathname.startsWith("/catalog/")) return catalog(req, res);
    response.statusCode = 404;
    response.end("Not found");
  } catch (error) {
    console.error("[dev-server] request failed", error);
    response.statusCode = 500;
    response.end("Internal server error");
  }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createPreviewServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`AniBloom preview server listening on http://localhost:${port}`);
  });
}
