import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

export function contentType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

export async function resolveRequestPath(distDir, requestPath) {
  const root = path.resolve(distDir);
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath.split("?", 1)[0]);
  } catch {
    return null;
  }
  const relativePath = decodedPath.replace(/^\/+/, "");
  const candidate = path.resolve(root, relativePath || "index.html");
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;
  if (await isFile(candidate)) return candidate;
  const fallback = path.join(root, "index.html");
  return (await isFile(fallback)) ? fallback : null;
}

export function createStaticServer(distDir) {
  return http.createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method Not Allowed");
      return;
    }
    const filePath = await resolveRequestPath(distDir, request.url ?? "/");
    if (!filePath) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not Found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentType(filePath),
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin"
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  });
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const repositoryRoot = path.resolve(path.dirname(modulePath), "..");
  const distDir = path.resolve(process.env.DIST_DIR ?? path.join(repositoryRoot, "dist"));
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number.parseInt(process.env.PORT ?? "4173", 10);
  const server = createStaticServer(distDir);
  server.listen(port, host, () => {
    console.log(`SEQTRAK Chord Manager listening on http://${host}:${port}`);
  });
}
