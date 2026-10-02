/**
 * Refresh derived colours/thumbnails while preserving manually maintained metadata.
 * Backups are saved before replacement. Existing photo IDs and URLs remain stable.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { deriveImages } from "./image-pipeline";
import { localDate, readPhotoInfo } from "../lib/exif";
import { validatePhoto, type Photo } from "../lib/photo-schema";

const ROOT = process.cwd();
const PHOTOS_DIR = path.join(ROOT, "public/photos");
const THUMBS_DIR = path.join(ROOT, "public/thumbnails");
const OUTPUT_FILE = path.join(ROOT, "data/photos.json");
const EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tiff", ".heic", ".heif", ".avif"]);

async function main() {
  fs.mkdirSync(THUMBS_DIR, { recursive: true });
  const previous = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8")) as { photos: Photo[] };
  const byUrl = new Map(previous.photos.map((p) => [p.url, p]));
  const byId = new Set(previous.photos.map((p) => p.id));
  const next = new Map(previous.photos.map((p) => [p.url, p]));
  let failures = 0;
  for (const filename of fs.readdirSync(PHOTOS_DIR).filter((name) => EXTENSIONS.has(path.extname(name).toLowerCase())).sort()) {
    const url = `/photos/${filename}`;
    const old = byUrl.get(url);
    try {
      const processed = await deriveImages(path.join(PHOTOS_DIR, filename));
      const name = path.parse(filename).name;
      const thumbnail = old?.thumbnail || `/thumbnails/${name}.jpg`;
      if (!thumbnail.startsWith("/thumbnails/") || path.basename(thumbnail) !== thumbnail.slice("/thumbnails/".length)) throw new Error("缩略图地址超出允许目录");
      fs.writeFileSync(path.join(ROOT, "public", thumbnail), processed.thumbnail);
      const info = await readPhotoInfo(path.join(PHOTOS_DIR, filename)).catch(() => ({}));
      let id = old?.id || name.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
      if (!old && (!id || byId.has(id))) id = `photo-${createHash("sha256").update(filename).digest("hex").slice(0, 24)}`;
      byId.add(id);
      const photo = validatePhoto({
        id, url, thumbnail, title: name.slice(0, 200), date: localDate(fs.statSync(path.join(PHOTOS_DIR, filename)).mtime),
        location: { name: "未知", lat: 0, lng: 0 }, camera: "未知", lens: "", iso: 0, aperture: "", shutter: "", tags: [],
        ...info, ...old,
        dominantColor: processed.dominantColor, palette: processed.palette, colorCategory: processed.colorCategory,
      });
      next.set(url, photo);
      console.log(`✓ ${filename}${old ? "（保留人工信息）" : "（新增）"}`);
    } catch (error) { failures++; console.error(`✗ ${filename}: ${error instanceof Error ? error.message : "处理失败"}`); }
  }
  // Existing rows are never silently dropped when a decoder or source file fails.
  const output = [...next.values()].sort((a, b) => b.date.localeCompare(a.date));
  for (const photo of output) validatePhoto(photo);
  const backup = path.join(ROOT, "source-photos", `metadata-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(OUTPUT_FILE, backup);
  const temp = `${OUTPUT_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ photos: output }, null, 2) + "\n");
  fs.renameSync(temp, OUTPUT_FILE);
  console.log(`保留/更新 ${output.length} 张照片，备份：${backup}`);
  if (failures) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
