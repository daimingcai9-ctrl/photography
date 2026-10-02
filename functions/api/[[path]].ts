import type { D1Database, R2Bucket, PagesFunction } from "@cloudflare/workers-types";
import photosData from "../../data/photos.json";
import { MAX_IMAGE_BYTES, MAX_THUMB_BYTES, validateEdit, validatePhoto, validId, type Photo } from "../../lib/photo-schema";
import { authenticated, constantEqual, createSession, jpegDimensions, limitedBody, sessionCookie } from "../../lib/server/auth";

export interface Env {
  PHOTO_STORAGE_MODE?: string;
  PHOTO_DB?: D1Database;
  PHOTO_BUCKET?: R2Bucket;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
}

function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });
}
function configured(env: Env) { return !!(env.PHOTO_DB && env.PHOTO_BUCKET && (env.ADMIN_PASSWORD?.length || 0) >= 12 && (env.SESSION_SECRET?.length || 0) >= 32); }
function rowPhoto(row: { metadata: string }) { return validatePhoto(JSON.parse(row.metadata)); }

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname.slice("/api/".length);
  const method = request.method;
  try {
    if (!["GET", "HEAD", "POST", "PATCH", "DELETE"].includes(method)) return json({ error: "不支持的请求方法" }, 405);
    if (method !== "GET" && method !== "HEAD" && request.headers.get("Origin") !== url.origin) return json({ error: "请求来源不允许" }, 403);
    // Local-first deployments never read/write cloud storage, even if old bindings exist.
    if (env.PHOTO_STORAGE_MODE !== "cloud") {
      if (route === "session" && method === "GET") return json({ configured: false, authenticated: false });
      if (route === "photos" && method === "GET") return json({ photos: [], deletedIds: [], configured: false });
      return json({ error: "当前使用本地存储，请在电脑上运行 pnpm studio" }, 503);
    }
    if (route === "session" && method === "GET") return json({ configured: configured(env), authenticated: await authenticated(request, env.SESSION_SECRET) });
    if (route === "logout" && method === "POST") return json({ success: true }, 200, { "Set-Cookie": sessionCookie("", url.protocol === "https:", true) });
    if (route === "photos" && method === "GET") {
      if (!env.PHOTO_DB) return json({ photos: [], deletedIds: [], configured: false });
      const rows = await env.PHOTO_DB.prepare("SELECT metadata FROM photos WHERE deleted = 0 ORDER BY updated_at DESC LIMIT 5000").all<{ metadata: string }>();
      const deleted = await env.PHOTO_DB.prepare("SELECT id FROM photos WHERE deleted = 1").all<{ id: string }>();
      return json({ photos: rows.results.map(rowPhoto), deletedIds: deleted.results.map((r) => r.id), configured: configured(env) });
    }
    if (route.startsWith("media/") && (method === "GET" || method === "HEAD")) {
      const match = /^media\/(cloud-[a-f0-9-]{36})\/(image|thumbnail)\.jpg$/.exec(route);
      if (!match || !env.PHOTO_BUCKET || !env.PHOTO_DB) return json({ error: "图片未找到" }, 404);
      const row = await env.PHOTO_DB.prepare("SELECT id FROM photos WHERE id = ? AND deleted = 0").bind(match[1]).first();
      if (!row) return json({ error: "图片未找到" }, 404);
      const object = await env.PHOTO_BUCKET.get(`${match[1]}/${match[2]}.jpg`);
      if (!object) return json({ error: "图片未找到" }, 404);
      const headers = { "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=0, must-revalidate", "ETag": object.httpEtag };
      if (request.headers.get("If-None-Match") === object.httpEtag) return new Response(null, { status: 304, headers });
      return new Response(method === "HEAD" ? null : object.body as unknown as ReadableStream, { headers });
    }
    if (!configured(env)) return json({ error: "上传服务尚未配置，请联系站点管理员完成云端连接" }, 503);
    const db = env.PHOTO_DB!, bucket = env.PHOTO_BUCKET!;
    if (route === "login" && method === "POST") {
      const key = request.headers.get("CF-Connecting-IP") || "local";
      const now = Math.floor(Date.now() / 1000);
      await db.prepare("INSERT INTO login_limits (key, attempts, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN reset_at < ? THEN 1 ELSE attempts + 1 END, reset_at = CASE WHEN reset_at < ? THEN excluded.reset_at ELSE reset_at END").bind(key, now + 600, now, now).run();
      const limit = await db.prepare("SELECT attempts FROM login_limits WHERE key = ?").bind(key).first<{ attempts: number }>();
      if ((limit?.attempts || 0) > 10) return json({ error: "尝试次数过多，请 10 分钟后重试" }, 429);
      const body = JSON.parse(new TextDecoder().decode(await limitedBody(request, 2048))) as { password?: unknown };
      if (typeof body.password !== "string" || body.password.length > 200 || !await constantEqual(body.password, env.ADMIN_PASSWORD!)) return json({ error: "管理密码不正确" }, 401);
      await db.prepare("DELETE FROM login_limits WHERE key = ? OR reset_at < ?").bind(key, now).run();
      return json({ success: true }, 200, { "Set-Cookie": sessionCookie(await createSession(env.SESSION_SECRET!), url.protocol === "https:") });
    }
    if (!await authenticated(request, env.SESSION_SECRET)) return json({ error: "请先登录相册管理" }, 401);
    if (route === "upload" && method === "POST") {
      const bytes = await limitedBody(request, MAX_IMAGE_BYTES + MAX_THUMB_BYTES + 32768);
      const form = await new Response(bytes as unknown as BodyInit, { headers: { "Content-Type": request.headers.get("Content-Type") || "" } }).formData();
      const image = form.get("image"), thumbnail = form.get("thumbnail"), meta = form.get("metadata"), requestId = form.get("requestId");
      if (!(image instanceof Blob) || !(thumbnail instanceof Blob) || typeof meta !== "string" || meta.length > 16384 || typeof requestId !== "string" || !/^[a-f0-9-]{36}$/.test(requestId)) return json({ error: "上传文件或照片信息不完整" }, 400);
      if (!image.size || image.size > MAX_IMAGE_BYTES || !thumbnail.size || thumbnail.size > MAX_THUMB_BYTES) return json({ error: "处理后的图片超过大小限制" }, 413);
      const id = `cloud-${requestId}`;
      const existing = await db.prepare("SELECT metadata, deleted FROM photos WHERE id = ?").bind(id).first<{ metadata: string; deleted: number }>();
      if (existing && !existing.deleted) return json({ photo: rowPhoto(existing) });
      if (existing?.deleted) return json({ error: "该上传记录已删除，请重新选择照片" }, 409);
      const imageBytes = new Uint8Array(await image.arrayBuffer()), thumbBytes = new Uint8Array(await thumbnail.arrayBuffer());
      const size = jpegDimensions(imageBytes), thumbSize = jpegDimensions(thumbBytes);
      if (Math.max(size.width, size.height) > 2560 || Math.max(thumbSize.width, thumbSize.height) > 400) return json({ error: "图片未正确缩放" }, 400);
      const photo = validatePhoto({ ...JSON.parse(meta), ...size, id, url: `/api/media/${id}/image.jpg`, thumbnail: `/api/media/${id}/thumbnail.jpg`, source: "remote" });
      const keys = [`${id}/image.jpg`, `${id}/thumbnail.jpg`];
      try {
        await bucket.put(keys[0], imageBytes, { httpMetadata: { contentType: "image/jpeg" } });
        await bucket.put(keys[1], thumbBytes, { httpMetadata: { contentType: "image/jpeg" } });
        await db.prepare("INSERT INTO photos (id, metadata, deleted, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(id) DO NOTHING").bind(id, JSON.stringify(photo), Date.now()).run();
      } catch (error) {
        // Another idempotent retry may already have committed this photo.
        const committed = await db.prepare("SELECT id FROM photos WHERE id = ? AND deleted = 0").bind(id).first();
        if (!committed) await bucket.delete(keys).catch(() => undefined);
        throw error;
      }
      return json({ photo });
    }
    const match = /^photos\/([A-Za-z0-9_-]{1,100})$/.exec(route);
    if (match && validId(match[1])) {
      const id = match[1];
      const stored = await db.prepare("SELECT metadata, deleted FROM photos WHERE id = ?").bind(id).first<{ metadata: string; deleted: number }>();
      const base = photosData.photos.find((p) => p.id === id) as Photo | undefined;
      if (method === "PATCH") {
        if (stored?.deleted || (!stored && !base)) return json({ error: "照片未找到" }, 404);
        const edit = validateEdit(JSON.parse(new TextDecoder().decode(await limitedBody(request, 8192))));
        const photo = validatePhoto({ ...(stored ? rowPhoto(stored) : base), ...edit });
        await db.prepare("INSERT INTO photos (id, metadata, deleted, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(id) DO UPDATE SET metadata = excluded.metadata, deleted = 0, updated_at = excluded.updated_at").bind(id, JSON.stringify(photo), Date.now()).run();
        return json({ photo });
      }
      if (method === "DELETE") {
        if (!stored && !base) return json({ error: "照片未找到" }, 404);
        await db.prepare("INSERT INTO photos (id, metadata, deleted, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(id) DO UPDATE SET deleted = 1, updated_at = excluded.updated_at").bind(id, stored?.metadata || JSON.stringify(base), Date.now()).run();
        // Tombstone immediately removes the photo from every device; remove its remote objects too.
        if (id.startsWith("cloud-")) await bucket.delete([`${id}/image.jpg`, `${id}/thumbnail.jpg`]);
        return json({ success: true });
      }
    }
    return json({ error: "接口未找到" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/请求超过/.test(message)) return json({ error: message }, 413);
    if (error instanceof SyntaxError || /不正确|不完整|损坏|无法读取|仍包含|超过大小|请填写|超出有效|必须转换/.test(message)) return json({ error: message || "照片信息不正确" }, 400);
    console.error("Photo API request failed", request.method, new URL(request.url).pathname);
    return json({ error: "保存失败，请稍后重试；照片尚未发布" }, 500);
  }
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => handleApi(request as unknown as Request, env) as unknown as Promise<import("@cloudflare/workers-types").Response>;
