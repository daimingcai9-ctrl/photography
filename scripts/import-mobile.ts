/** Safe, explicit bridge from the offline APK's Git ZIP to the existing local gallery. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { validatePhoto, MAX_IMAGE_BYTES, type Photo } from "../lib/photo-schema";
import { deriveImages } from "./image-pipeline";

export async function importMobile(archive: string, root: string, save = false) {
  const readEntry = (name: string, maximum: number) => execFileSync("unzip", ["-p", resolve(archive), name], { maxBuffer: maximum, stdio: ["ignore", "pipe", "pipe"] });
  const value = JSON.parse(readEntry("data/photos.json", 16 * 1024 * 1024).toString("utf8"));
  if (!Array.isArray(value.photos) || value.photos.length > 10000) throw new Error("无效的手机发布包");
  const incoming = value.photos.map((item: unknown) => validatePhoto(item)) as Photo[];
  if (new Set(incoming.map((p) => p.id)).size !== incoming.length) throw new Error("发布包的照片 ID 重复");
  for (const photo of incoming) if (!/^mobile-[a-f0-9]{64}$/.test(photo.id) || photo.url !== `/photos/${photo.id}.jpg` || photo.thumbnail !== `/thumbnails/${photo.id}.jpg`) throw new Error("不是受支持的手机 Git 发布包");
  const metadata = join(root, "data/photos.json"), original = readFileSync(metadata, "utf8");
  const current = JSON.parse(original).photos.map(validatePhoto) as Photo[];
  const removed = JSON.parse(readFileSync(join(root, "data/removed-photos.json"), "utf8")) as string[];
  const known = new Set([...current.map((p) => p.id), ...removed]);
  const additions = incoming.filter((p) => !known.has(p.id));
  if (!save || !additions.length) return { imported: additions.length, skipped: incoming.length - additions.length, saved: false };
  const recovery = join(root, "source-photos", `mobile-import-${randomUUID()}`); mkdirSync(recovery, { recursive: true });
  const created: string[] = [], photos: Photo[] = [];
  try {
    for (const photo of additions) {
      const input = readEntry(`public/photos/${photo.id}.jpg`, MAX_IMAGE_BYTES);
      const processed = await deriveImages(input);
      for (const [url, bytes] of [[photo.url, processed.image], [photo.thumbnail, processed.thumbnail]] as const) {
        const file = join(root, "public", url); mkdirSync(join(root, "public", url.startsWith("/photos/") ? "photos" : "thumbnails"), { recursive: true });
        if (existsSync(file)) throw new Error("同名文件已存在，未覆盖，请检查之前的导入");
        writeFileSync(file, bytes, { flag: "wx" }); created.push(file);
      }
      photos.push(validatePhoto({ ...photo, ...processed, image: undefined, thumbnail: photo.thumbnail, source: "static" }));
    }
    if (readFileSync(metadata, "utf8") !== original) throw new Error("相册在导入期间被修改，请停止管理服务后重试");
    copyFileSync(metadata, join(recovery, "metadata-before-import.json"), constants.COPYFILE_EXCL);
    const temporary = join(recovery, "photos.json"); writeFileSync(temporary, JSON.stringify({ photos: [...current, ...photos] }, null, 2) + "\n");
    renameSync(temporary, metadata);
    return { imported: photos.length, skipped: incoming.length - photos.length, saved: true };
  } catch (error) {
    for (const file of created) renameSync(file, join(recovery, (file.includes("thumbnails") ? "thumb-" : "") + basename(file)));
    throw error;
  }
}
if (basename(process.argv[1] || "") === "import-mobile.ts") {
  const archive = process.argv[2];
  if (!archive) { console.error("用法：pnpm photos:import <手机导出的 ZIP> [--save]；默认只预览，--save 仅合并到电脑，不发布"); process.exitCode = 1; }
  else importMobile(archive, process.cwd(), process.argv.includes("--save")).then((r) => {
    console.log(`${r.saved ? "已合并到本机" : "预览，未保存"}：新增 ${r.imported} 张，已有或删除标记跳过 ${r.skipped} 张。不会自动提交 Git 或发布。`);
  }).catch((error) => { console.error(error instanceof Error ? error.message : "手机发布包导入失败"); process.exitCode = 1; });
}
