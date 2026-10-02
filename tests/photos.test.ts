import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { validatePhoto, validateEdit, rgbToHex, extractPalette, validDate } from "../lib/photo-schema";
import { exifDate, approximateLocation, readPhotoInfo } from "../lib/exif";
import { authenticated, createSession, jpegDimensions, limitedBody, sessionCookie } from "../lib/server/auth";
import { deriveImages } from "../scripts/image-pipeline";
import { handleApi, type Env } from "../functions/api/[[path]]";
import data from "../data/photos.json";
import { stripJpegMetadata } from "../lib/jpeg";

test("全部原有元数据、照片和缩略图有效且 ID 唯一", () => {
  assert.equal(new Set(data.photos.map((p) => p.id)).size, data.photos.length);
  for (const item of data.photos) {
    const p = validatePhoto(item);
    for (const url of [p.url, p.thumbnail]) assert.ok(fs.existsSync(`public${url}`));
  }
  assert.equal(rgbToHex(256, -1, 255), "#ff00ff");
  assert.deepEqual(extractPalette(new Uint8Array([255, 255, 255, 255])), ["#f0f0f0"]);
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2024-02-29"), true);
  assert.throws(() => validateEdit({ ...data.photos[0], location: { name: "城市", lat: NaN, lng: 0 } }));
  assert.throws(() => validatePhoto({ ...data.photos[0], palette: ["#100100100"] }));
});
test("日期不跨天，自动地点不会保存精确 GPS", () => {
  assert.equal(exifDate("2026:01:02 00:01:00"), "2026-01-02");
  assert.equal(approximateLocation(29.55123, 106.55321).name, "重庆");
  assert.deepEqual(approximateLocation(0.12345, 0.54321), { name: "拍摄地点 (0.12, 0.54)", lat: 0.12, lng: 0.54 });
});
test("图片正确自动旋转、限制尺寸、移除 EXIF，同时保留识别的信息", async () => {
  const source = await sharp({ create: { width: 120, height: 80, channels: 3, background: "red" } })
    .jpeg().withMetadata({ orientation: 6 }).withExifMerge({ IFD0: { Make: "Test", Model: "Camera", DateTime: "2025:01:02 00:03:00" } }).toBuffer();
  const info = await readPhotoInfo(source);
  assert.equal(info.camera, "Test Camera");
  assert.equal(info.date, "2025-01-02");
  const processed = await deriveImages(source);
  assert.deepEqual([processed.width, processed.height], [80, 120]);
  assert.equal((await sharp(processed.image).metadata()).exif, undefined);
  assert.deepEqual(jpegDimensions(processed.image), { width: 80, height: 120 });
  assert.throws(() => jpegDimensions(source), /元数据/);
  assert.deepEqual(jpegDimensions(stripJpegMetadata(source)), { width: 120, height: 80 });
  assert.equal((await sharp(stripJpegMetadata(source)).metadata()).exif, undefined);
  assert.throws(() => jpegDimensions(new Uint8Array([1, 2, 3])));
  assert.throws(() => jpegDimensions(processed.image.subarray(0, processed.image.length - 2)));
});
test("会话不可伪造、会过期，Cookie 与请求体限制有效", async () => {
  const secret = "test-session-secret-at-least-32-characters";
  const session = await createSession(secret, 1000000);
  const req = new Request("https://example.test/api/session", { headers: { Cookie: sessionCookie(session, true) } });
  assert.equal(await authenticated(req, secret, 1000001), true);
  assert.equal(await authenticated(req, secret + "x", 1000001), false);
  assert.equal(await authenticated(req, secret, 1000000 + 8 * 86400000), false);
  assert.match(sessionCookie(session, true), /HttpOnly; SameSite=Strict.*Secure/);
  await assert.rejects(limitedBody(new Request("https://example.test", { method: "POST", body: "123456" }), 5));
});

function environment() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(fs.readFileSync("migrations/0001_photos.sql", "utf8"));
  const objects = new Map<string, Uint8Array>();
  const db = { prepare(sql: string) {
    let values: (string | number)[] = [];
    const statement = { bind(...args: (string | number)[]) { values = args; return statement; },
      async first() { return sqlite.prepare(sql).get(...values) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async run() { return sqlite.prepare(sql).run(...values); } };
    return statement;
  } };
  const bucket = { async put(key: string, value: Uint8Array) { objects.set(key, value); }, async get(key: string) {
    const bytes = objects.get(key); return bytes ? { body: new Blob([new Uint8Array(bytes)]).stream(), httpEtag: '"test"' } : null;
  }, async delete(keys: string | string[]) { for (const key of typeof keys === "string" ? [keys] : keys) objects.delete(key); } };
  const env = { PHOTO_DB: db, PHOTO_BUCKET: bucket, ADMIN_PASSWORD: "test-private-password", SESSION_SECRET: "test-session-secret-at-least-32-characters" } as unknown as Env;
  return { env, sqlite, objects };
}
test("云端完整上传闭环：授权、CSRF、重试幂等、读取、编辑、删除及限流", async () => {
  const { env, sqlite, objects } = environment();
  let cookie = "";
  const call = (route: string, method = "GET", body?: BodyInit, origin = "https://example.test") => handleApi(new Request(`https://example.test/api/${route}`, {
    method, headers: { Origin: origin, Cookie: cookie, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) }, body,
  }), env);
  assert.equal((await call("upload", "POST")).status, 401);
  assert.equal((await call("login", "POST", JSON.stringify({ password: env.ADMIN_PASSWORD }), "https://evil.test")).status, 403);
  const login = await call("login", "POST", JSON.stringify({ password: env.ADMIN_PASSWORD }));
  assert.equal(login.status, 200);
  cookie = login.headers.get("Set-Cookie")!.split(";")[0];
  assert.equal((await (await call("session")).json()).authenticated, true);
  const image = await deriveImages(await sharp({ create: { width: 20, height: 10, channels: 3, background: "blue" } }).png().toBuffer());
  const requestId = crypto.randomUUID();
  const upload = () => { const form = new FormData(); form.set("image", new Blob([new Uint8Array(image.image)]), "image.jpg"); form.set("thumbnail", new Blob([new Uint8Array(image.thumbnail)]), "thumbnail.jpg"); form.set("requestId", requestId); form.set("metadata", JSON.stringify(data.photos[0])); return call("upload", "POST", form); };
  const saved = await upload(); assert.equal(saved.status, 200);
  const photo = (await saved.json()).photo;
  assert.equal(photo.source, "remote");
  assert.equal((await upload()).status, 200);
  assert.equal(objects.size, 2);
  assert.equal((await (await call("photos")).json()).photos.length, 1);
  assert.equal((await handleApi(new Request(`https://example.test${photo.url}`), env)).status, 200);
  const edit = { ...photo, title: "修改已同步", date: "2026-02-01" };
  assert.equal((await call(`photos/${photo.id}`, "PATCH", JSON.stringify(edit))).status, 200);
  assert.equal((await (await call("photos")).json()).photos[0].title, "修改已同步");
  assert.equal((await call(`photos/${photo.id}`, "DELETE")).status, 200);
  assert.equal(objects.size, 0);
  assert.equal((await handleApi(new Request(`https://example.test${photo.url}`), env)).status, 404);
  assert.ok((await (await call("photos")).json()).deletedIds.includes(photo.id));
  assert.equal((await upload()).status, 409);
  // Existing Git photos use overrides instead of mutating their original metadata.
  assert.equal((await call(`photos/${data.photos[0].id}`, "PATCH", JSON.stringify({ ...data.photos[0], title: "原照片覆盖测试" }))).status, 200);
  assert.equal((await call(`photos/${data.photos[0].id}`, "DELETE")).status, 200);
  for (let i = 0; i < 10; i++) assert.equal((await call("login", "POST", '{"password":"wrong"}')).status, 401);
  assert.equal((await call("login", "POST", '{"password":"wrong"}')).status, 429);
  sqlite.close();
});
