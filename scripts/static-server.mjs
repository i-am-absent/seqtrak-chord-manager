import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
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

function isWithinRoot(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function resolveFileWithinRoot(root, filePath) {
  if (!(await isFile(filePath))) return null;
  try {
    const realFilePath = await realpath(filePath);
    return isWithinRoot(root, realFilePath) ? filePath : null;
  } catch {
    return null;
  }
}

export async function resolveRequestPath(distDir, requestPath) {
  const lexicalRoot = path.resolve(distDir);
  let root;
  try {
    root = await realpath(lexicalRoot);
  } catch {
    return null;
  }
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath.split("?", 1)[0]);
  } catch {
    return null;
  }
  const relativePath = decodedPath.replace(/^\/+/, "");
  const candidate = path.resolve(lexicalRoot, relativePath || "index.html");
  if (!isWithinRoot(lexicalRoot, candidate)) return null;
  if (await isFile(candidate)) return resolveFileWithinRoot(root, candidate);
  const fallback = path.join(lexicalRoot, "index.html");
  return resolveFileWithinRoot(root, fallback);
}

export function createStaticServer(distDir, createFileStream = createReadStream) {
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
    const stream = createFileStream(filePath);
    stream.on("error", () => response.destroy());
    stream.pipe(response);
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
