import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { importMobile } from "../scripts/import-mobile";
import data from "../data/photos.json";

function zip(entries: [string, Buffer][]) {
  const locals: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const [name, bytes] of entries) {
    const label = Buffer.from(name); let crc = 0xffffffff;
    for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt32LE(crc, 14); header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(label.length, 26);
    locals.push(header, label, bytes);
    const record = Buffer.alloc(46); record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt32LE(crc, 16); record.writeUInt32LE(bytes.length, 20); record.writeUInt32LE(bytes.length, 24); record.writeUInt16LE(label.length, 28); record.writeUInt32LE(offset, 42);
    central.push(record, label); offset += header.length + label.length + bytes.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test("手机 Git 包桥接：默认预览、显式合并、保留旧照片、重复跳过、拒绝恶意图片路径", async () => {
  const root = mkdtempSync(join(tmpdir(), "mobile-git-test-"));
  try {
    mkdirSync(join(root, "data")); writeFileSync(join(root, "data/photos.json"), JSON.stringify(data)); writeFileSync(join(root, "data/removed-photos.json"), "[]");
    const id = `mobile-${"a".repeat(64)}`;
    const photo = { ...data.photos[0], id, title: "手机导出测试", url: `/photos/${id}.jpg`, thumbnail: `/thumbnails/${id}.jpg` };
    const image = await sharp({ create: { width: 60, height: 40, channels: 3, background: "red" } }).jpeg().withMetadata().toBuffer();
    const archive = join(root, "phone.zip");
    writeFileSync(archive, zip([["data/photos.json", Buffer.from(JSON.stringify({ photos: [photo] }))], [`public/photos/${id}.jpg`, image]]));
    assert.equal((await importMobile(archive, root)).saved, false);
    assert.equal(JSON.parse(readFileSync(join(root, "data/photos.json"), "utf8")).photos.length, data.photos.length);
    assert.equal((await importMobile(archive, root, true)).imported, 1);
    const saved = JSON.parse(readFileSync(join(root, "data/photos.json"), "utf8")).photos;
    assert.equal(saved.length, data.photos.length + 1); assert.equal(saved.at(-1).title, "手机导出测试");
    assert.equal((await sharp(join(root, "public", photo.url)).metadata()).exif, undefined);
    assert.equal((await importMobile(archive, root, true)).skipped, 1);
    writeFileSync(archive, zip([["data/photos.json", Buffer.from(JSON.stringify({ photos: [{ ...photo, url: "/photos/../../escape.jpg" }] }))]]));
    await assert.rejects(importMobile(archive, root, true), /手机 Git 发布包/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
