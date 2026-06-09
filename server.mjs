import { createServer } from "node:http";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { extname, join, normalize, relative, resolve } from "node:path";
import { URL } from "node:url";

const root = process.cwd();
const port = Number(process.env.PORT || 5173);
const dataRoot = join(root, "data");
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function publicPath(filePath) {
  return `/${relative(root, filePath).replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/")}`;
}

function scanDataFiles() {
  if (!existsSync(dataRoot)) return { csvFiles: [], imageAssets: [] };
  const csvFiles = [];
  const imageAssets = [];
  const pending = [dataRoot];

  while (pending.length) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
        continue;
      }
      if (!entry.isFile()) continue;

      const extension = extname(entry.name).toLowerCase();
      const asset = {
        name: entry.name,
        path: publicPath(absolute),
        size: statSync(absolute).size
      };
      if (extension === ".csv") csvFiles.push(asset);
      if (imageExtensions.has(extension)) imageAssets.push(asset);
    }
  }

  return {
    csvFiles: csvFiles.sort((a, b) => a.path.localeCompare(b.path)),
    imageAssets: imageAssets.sort((a, b) => a.path.localeCompare(b.path))
  };
}

function handleDataset(res) {
  return sendJson(res, 200, scanDataFiles());
}

function serveStatic(reqUrl, res) {
  const pathname = decodeURIComponent(reqUrl.pathname);
  const requested = pathname === "/" ? "/index.html" : pathname;
  const absolute = normalize(resolve(root, `.${requested}`));
  if (!absolute.startsWith(root)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  const exists = existsSync(absolute) && statSync(absolute).isFile();
  if (!exists && (requested.startsWith("/data/") || requested.startsWith("/src/"))) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }
  const filePath = exists ? absolute : join(root, "index.html");
  const ext = extname(filePath);
  const headers = { "Content-Type": mimeTypes[ext] || "application/octet-stream" };
  if ([".html", ".css", ".js"].includes(ext)) headers["Cache-Control"] = "no-store";
  res.writeHead(200, headers);
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  const reqUrl = new URL(req.url || "/", `http://${req.headers.host}`);
  if (reqUrl.pathname === "/api/dataset") return handleDataset(res);
  return serveStatic(reqUrl, res);
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use.\n` +
        `To free it on Windows run: ` +
        `netstat -ano | findstr :${port}  (find PID)\n` +
        `then: taskkill /PID <pid> /F  (kill process)\n` +
        `Or set a different port and restart: set PORT=3000 && npm start`
    );
    process.exit(1);
  }
  console.error("Server error:", err);
  process.exit(1);
});

server.listen(port, () => {
  console.log(`PrimeFlix running at http://localhost:${port}`);
});
