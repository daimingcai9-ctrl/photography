/**
 * Local management service only. Never expose this process on a public network.
 * Browser origins are validated before parsing; all writes require a signed session.
 */
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { authenticated, constantEqual, createSession, sessionCookie } from "../lib/server/auth";
import { MAX_IMAGE_BYTES, MAX_THUMB_BYTES, validateEdit, validatePhoto, validId, type Photo } from "../lib/photo-schema";
import { deriveImages } from "./image-pipeline";

const ROOT = process.cwd();
const OUTPUT_FILE = path.join(ROOT, "data/photos.json");
const REMOVED_FILE = path.join(ROOT, "data/removed-photos.json");
const PORT = 3001;
const PASSWORD = process.env.PHOTO_ADMIN_PASSWORD || randomBytes(18).toString("base64url");
const SECRET = randomBytes(32).toString("hex");
const allowedOrigins = new Set(["http://localhost:3000", "http://localhost:3002", "http://127.0.0.1:3000", "http://127.0.0.1:3002"]);
let processing = false;
let attempts = 0;
let resetAt = Date.now() + 600000;
function readPhotos() { return (JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8")) as { photos: Photo[] }).photos.map(validatePhoto); }
function savePhotos(photos: Photo[]) {
  fs.mkdirSync(path.join(ROOT, "source-photos"), { recursive: true });
  fs.copyFileSync(OUTPUT_FILE, path.join(ROOT, "source-photos", "metadata-before-management.json"));
  const temporary = `${OUTPUT_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ photos }, null, 2) + "\n");
  fs.renameSync(temporary, OUTPUT_FILE);
}
function readBody(req: http.IncomingMessage, limit: number) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0, failed = false;
    req.on("data", (chunk: Buffer) => {
      if (failed) return;
      total += chunk.length;
      if (total > limit) { failed = true; chunks.length = 0; reject(new Error("请求超过大小限制")); return; }
      chunks.push(chunk);
    });
    req.on("end", () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
    req.on("aborted", () => reject(new Error("上传已取消")));
  });
}
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const send = (value: unknown, status = 200) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); };
  if (!origin || !allowedOrigins.has(origin)) { send({ error: "请求来源不允许" }, 403); return; }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const route = req.url?.split("?")[0] || "";
  const request = new Request(`http://localhost:${PORT}${route}`, { headers: { Cookie: req.headers.cookie || "" } });
  try {
    const loggedIn = await authenticated(request, SECRET);
    if (route === "/api/session" && req.method === "GET") { send({ configured: true, authenticated: loggedIn }); return; }
    if (route === "/api/photos" && req.method === "GET") { send({ photos: readPhotos(), deletedIds: JSON.parse(fs.readFileSync(REMOVED_FILE, "utf8")), configured: true }); return; }
    if (route === "/api/login" && req.method === "POST") {
      if (Date.now() > resetAt) { attempts = 0; resetAt = Date.now() + 600000; }
      if (++attempts > 10) { send({ error: "请 10 分钟后重试" }, 429); return; }
      const body = JSON.parse((await readBody(req, 2048)).toString("utf8"));
      if (typeof body.password !== "string" || body.password.length > 200 || !await constantEqual(body.password, PASSWORD)) { send({ error: "管理密码不正确" }, 401); return; }
      attempts = 0;
      res.setHeader("Set-Cookie", sessionCookie(await createSession(SECRET), false));
      send({ success: true }); return;
    }
    if (route === "/api/logout" && req.method === "POST") { res.setHeader("Set-Cookie", sessionCookie("", false, true)); send({ success: true }); return; }
    if (!loggedIn) { send({ error: "请先登录本地相册管理" }, 401); return; }
    if (route === "/api/upload" && req.method === "POST") {
      if (processing) { send({ error: "正在处理另一张照片，请稍后重试" }, 429); return; }
      processing = true;
      try {
        const body = await readBody(req, MAX_IMAGE_BYTES + MAX_THUMB_BYTES + 32768);
        const form = await new Response(new Uint8Array(body), { headers: { "Content-Type": req.headers["content-type"] || "" } }).formData();
        const file = form.get("image"), meta = form.get("metadata"), requestId = form.get("requestId");
        if (!(file instanceof Blob) || !file.size || file.size > MAX_IMAGE_BYTES || typeof meta !== "string" || typeof requestId !== "string" || !/^[a-f0-9-]{36}$/.test(requestId)) throw new Error("上传内容不正确");
        const id = `upload-${requestId}`;
        const exists = readPhotos().find((p) => p.id === id);
        if (exists) { send({ photo: exists }); return; }
        const processed = await deriveImages(Buffer.from(await file.arrayBuffer()));
        const filename = `${id}.jpg`;
        const photo = validatePhoto({ ...JSON.parse(meta), id, url: `/photos/${filename}`, thumbnail: `/thumbnails/${filename}`, source: "static", width: processed.width, height: processed.height, dominantColor: processed.dominantColor, palette: processed.palette, colorCategory: processed.colorCategory });
        fs.mkdirSync(path.join(ROOT, "public/photos"), { recursive: true });
        fs.mkdirSync(path.join(ROOT, "public/thumbnails"), { recursive: true });
        const imagePath = path.join(ROOT, "public/photos", filename), thumbPath = path.join(ROOT, "public/thumbnails", filename);
        try {
          fs.writeFileSync(imagePath, processed.image, { flag: "wx" });
          fs.writeFileSync(thumbPath, processed.thumbnail, { flag: "wx" });
          savePhotos([...readPhotos(), photo]);
        } catch (error) {
          // Generated files belong to this request; keep failed writes out of the public directory.
          const recovery = path.join(ROOT, "source-photos", "failed-uploads");
          fs.mkdirSync(recovery, { recursive: true });
          for (const filePath of [imagePath, thumbPath]) if (fs.existsSync(filePath)) fs.renameSync(filePath, path.join(recovery, path.basename(filePath) + (filePath === thumbPath ? ".thumb" : "")));
          throw error;
        }
        send({ photo }); return;
      } finally { processing = false; }
    }
    const match = /^\/api\/photos\/([A-Za-z0-9_-]{1,100})$/.exec(route);
    if (match && validId(match[1])) {
      const photos = readPhotos(), index = photos.findIndex((p) => p.id === match[1]);
      if (index < 0) { send({ error: "照片未找到" }, 404); return; }
      if (req.method === "PATCH") {
        const edit = validateEdit(JSON.parse((await readBody(req, 8192)).toString("utf8")));
        photos[index] = validatePhoto({ ...photos[index], ...edit });
        savePhotos(photos); send({ photo: photos[index] }); return;
      }
      if (req.method === "DELETE") {
        const deleted = photos[index];
        const removed = JSON.parse(fs.readFileSync(REMOVED_FILE, "utf8")) as string[];
        fs.writeFileSync(REMOVED_FILE, JSON.stringify([...new Set([...removed, deleted.id])]) + "\n");
        savePhotos(photos.filter((p) => p.id !== deleted.id));
        const recovery = path.join(ROOT, "source-photos", "removed", `${Date.now()}-${deleted.id}`);
        fs.mkdirSync(recovery, { recursive: true });
        for (const url of [deleted.url, deleted.thumbnail]) {
          if (!/^\/(photos|thumbnails)\/[^/]+$/.test(url)) continue;
          const src = path.join(ROOT, "public", url);
          if (fs.existsSync(src)) fs.renameSync(src, path.join(recovery, url.startsWith("/thumbnails/") ? "thumbnail-" + path.basename(url) : path.basename(url)));
        }
        send({ success: true }); return;
      }
    }
    send({ error: "接口未找到" }, 404);
  } catch (error) {
    send({ error: error instanceof Error ? error.message : "保存失败" }, error instanceof Error && /请求超过/.test(error.message) ? 413 : 400);
  }
});
server.requestTimeout = 120000;
server.headersTimeout = 15000;
server.listen(PORT, "127.0.0.1", () => {
  console.log(`本地管理服务：http://localhost:${PORT}（仅本机）`);
  console.log(`本地管理密码：${PASSWORD}`);
});
