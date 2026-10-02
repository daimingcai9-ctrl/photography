import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createLocalServer } from "../scripts/upload-server";
import { handleApi, type Env } from "../functions/api/[[path]]";
import data from "../data/photos.json";

test("本地模式即使保留云端凭据也不会访问云存储或允许写入", async () => {
  const env = { PHOTO_STORAGE_MODE: "local", ADMIN_PASSWORD: "test-private-password", SESSION_SECRET: "test-session-secret-at-least-32-characters",
    PHOTO_DB: { prepare() { throw new Error("不应该查询云端数据库"); } } } as unknown as Env;
  for (const route of ["photos", "session"]) {
    const response = await handleApi(new Request(`https://example.test/api/${route}`), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).configured, false);
  }
  assert.equal((await handleApi(new Request("https://example.test/api/login", { method: "POST", headers: { Origin: "https://example.test" } }), env)).status, 503);
});

test("本机持久化闭环：登录、来源检查、上传重试、编辑、重启读取与可恢复删除", async () => {
  const root = mkdtempSync(join(tmpdir(), "photo-local-test-"));
  mkdirSync(join(root, "data"));
  writeFileSync(join(root, "data/photos.json"), '{"photos":[]}');
  writeFileSync(join(root, "data/removed-photos.json"), "[]");
  const password = "local-integration-test-password";
  let server = createLocalServer({ root, password });
  let port = 0, cookie = "";
  const listen = async () => {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    assert.ok(address && typeof address === "object"); port = address.port;
  };
  const close = () => new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections(); });
  const call = (route: string, method = "GET", body?: BodyInit, origin = "http://127.0.0.1:3000") => fetch(`http://127.0.0.1:${port}/api/${route}`, {
    method, headers: { Origin: origin, Cookie: cookie, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) }, body,
  });
  const login = async () => {
    const response = await call("login", "POST", JSON.stringify({ password }));
    assert.equal(response.status, 200); cookie = response.headers.get("Set-Cookie")!.split(";")[0];
  };
  try {
    await listen();
    assert.equal((await call("upload", "POST")).status, 401);
    assert.equal((await call("login", "POST", JSON.stringify({ password }), "https://evil.test")).status, 403);
    await login();
    const image = await sharp({ create: { width: 30, height: 20, channels: 3, background: "red" } }).jpeg().withMetadata().toBuffer();
    const requestId = crypto.randomUUID();
    const upload = () => {
      const form = new FormData(); form.set("image", new Blob([new Uint8Array(image)]), "image.jpg");
      form.set("requestId", requestId); form.set("metadata", JSON.stringify(data.photos[0]));
      return call("upload", "POST", form);
    };
    const saved = await upload(); assert.equal(saved.status, 200);
    const photo = (await saved.json()).photo;
    assert.equal((await upload()).status, 200);
    assert.equal(JSON.parse(readFileSync(join(root, "data/photos.json"), "utf8")).photos.length, 1);
    assert.equal((await sharp(join(root, "public", photo.url)).metadata()).exif, undefined);
    assert.equal((await call(`photos/${photo.id}`, "PATCH", JSON.stringify({ ...photo, title: "本机保存测试" }))).status, 200);
    await close();
    server = createLocalServer({ root, password }); await listen();
    assert.equal((await (await call("session")).json()).authenticated, false);
    assert.equal((await (await call("photos")).json()).photos[0].title, "本机保存测试");
    await login();
    assert.equal((await call(`photos/${photo.id}`, "DELETE")).status, 200);
    assert.equal(existsSync(join(root, "public", photo.url)), false);
    assert.equal(readdirSync(join(root, "source-photos/removed")).length, 1);
    assert.ok((await (await call("photos")).json()).deletedIds.includes(photo.id));
    assert.equal((await upload()).status, 409);
    assert.equal(JSON.parse(readFileSync(join(root, "data/photos.json"), "utf8")).photos.length, 0);
  } finally {
    if (server.listening) await close();
    // Only this generated, uniquely named fixture directory is removed.
    rmSync(root, { recursive: true, force: true });
  }
});
