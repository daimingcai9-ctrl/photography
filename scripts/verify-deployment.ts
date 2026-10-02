import { execFileSync } from "node:child_process";
import photos from "../data/photos.json";
import { readFileSync } from "node:fs";
import { createPublicKey } from "node:crypto";
import { verifyUiUpdate, digest } from "./lib/android-ui-update.mjs";

const origin = "https://photography-hhs.pages.dev";
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
async function fetchChecked(route: string, asset = false) {
  const response = await fetch(`${origin}${route}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (response.status !== 200) throw new Error(`${route}: HTTP ${response.status}`);
  if (asset && !/javascript|text\/css/.test(response.headers.get("Content-Type") || "")) throw new Error(`${route}: 资源类型错误`);
  console.log(`200 ${route}`);
  return response;
}
async function main() {
  const sample = photos.photos[0];
  if (!sample) throw new Error("相册没有照片，无法验证详情页");
  const marker = await (await fetchChecked(`/build-info.json?revision=${revision}`)).json();
  if (marker.revision !== revision || marker.features !== "local-studio-v1") throw new Error("新构建尚未上线");
  let gallery = "";
  for (const route of ["/", "/gallery", "/map", "/analytics", `/photo/${encodeURIComponent(sample.id)}`, "/studio", "/photo"]) {
    const response = await fetchChecked(route);
    if (route === "/gallery") gallery = await response.text();
    if (route === "/studio" && !(await response.text()).includes("本地相册管理")) throw new Error("线上管理说明未更新");
  }
  const assets = [...new Set(Array.from(gallery.matchAll(/(?:src|href)="([^"?#]*\/_next\/static\/[^"?#]+\.(?:js|css))[^\"]*"/g), (m) => m[1]))];
  if (!assets.length) throw new Error("画廊未引用静态 JS/CSS");
  for (const asset of assets) await fetchChecked(asset, true);
  const update = await fetchChecked("/app-updates/stable.json");
  if (!/no-store/.test(update.headers.get("Cache-Control") || "")) throw new Error("热更新未禁用缓存");
  const updateBytes = Buffer.from(await update.arrayBuffer());
  const key = createPublicKey({key: Buffer.from(readFileSync("android/app/src/main/assets/updates/public-key.txt", "utf8").trim(), "base64"), format:"der", type:"spki"});
  const ui = verifyUiUpdate(updateBytes, key);
  if (digest(updateBytes) !== digest(readFileSync("public/app-updates/stable.json"))) throw new Error("新的签名界面尚未上线");
  const session = await (await fetchChecked("/api/session")).json();
  const listing = await (await fetchChecked("/api/photos")).json();
  if (session.configured || session.authenticated || listing.photos.length) throw new Error("线上未正确关闭云端管理");
  console.log(JSON.stringify({ revision, builtAt: marker.builtAt, checkedAssets: assets.length, uiRelease:ui.pack.release, uiVersion:ui.pack.version, uploadConfigured: session.configured, anonymousAuthenticated: session.authenticated, remotePhotos: listing.photos.length }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "部署验证失败"); process.exitCode = 1; });
