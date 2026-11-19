// Static file server plus /events/:id for the share page.
// Playwright uses this instead of python http.server so the per-event URL
// returns server-rendered HTML. Fixture rows stand in for Supabase.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { handleShareRequest } = require("../lib/event-share-http.js");
const fixtures = require("./fixtures/share-events.json");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

function fixtureFetch(url) {
  const parsed = new URL(url);
  const id = String(parsed.searchParams.get("id") || "").replace(/^eq\./, "");
  const row = fixtures[id];
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async function () { return row ? [row] : []; }
  });
}

function safeFile(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch (err) { return null; }
  if (decoded.includes("\0")) return null;
  const rel = decoded.replace(/^\/+/, "");
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function sendFile(req, res, filePath) {
  const stat = fs.statSync(filePath);
  const type = contentType(filePath);
  const range = req.headers.range;
  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= stat.size || start > end) {
        res.writeHead(416, { "Content-Range": "bytes */" + stat.size });
        res.end();
        return;
      }
      res.writeHead(206, {
        "Content-Type": type,
        "Content-Range": "bytes " + start + "-" + end + "/" + stat.size,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Cache-Control": "no-cache"
      });
      if (req.method === "HEAD") { res.end(); return; }
      fs.createReadStream(filePath, { start: start, end: end }).pipe(res);
      return;
    }
  }
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache"
  });
  if (req.method === "HEAD") { res.end(); return; }
  fs.createReadStream(filePath).pipe(res);
}

function memoryResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: Buffer.alloc(0),
    setHeader: function (name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    end: function (body) { this.body = body ? Buffer.from(body) : Buffer.alloc(0); }
  };
}

const server = http.createServer(async function (req, res) {
  const method = req.method || "GET";
  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end("Method not allowed");
    return;
  }
  const url = new URL(req.url || "/", "http://" + HOST);
  const eventMatch = url.pathname.match(/^\/events\/([^/]+)\/?$/);
  if (eventMatch) {
    let id = eventMatch[1];
    try { id = decodeURIComponent(id); } catch (err) { id = ""; }
    const fake = memoryResponse();
    try {
      await handleShareRequest({ url: req.url, query: { id: id } }, fake, { fetch: fixtureFetch });
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Event page failed");
      return;
    }
    const headers = fake.headers;
    if (method === "HEAD") headers["content-length"] = String(fake.body.length);
    res.writeHead(fake.statusCode || 200, headers);
    res.end(method === "HEAD" ? undefined : fake.body);
    return;
  }

  const filePath = safeFile(url.pathname === "/" ? "/index.html" : url.pathname);
  if (!filePath) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad path");
    return;
  }
  let stat;
  try { stat = fs.statSync(filePath); } catch (err) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  if (stat.isDirectory()) {
    const index = path.join(filePath, "index.html");
    if (fs.existsSync(index)) { sendFile(req, res, index); return; }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  sendFile(req, res, filePath);
});

server.listen(PORT, HOST, function () {
  console.log("dev server http://" + HOST + ":" + PORT);
});
