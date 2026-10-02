/** Explicit Git adapter. Never called by the browser or upload endpoint. */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { validatePhoto } from "../lib/photo-schema";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const allowed = (file: string) => file === "data/photos.json" || file === "data/removed-photos.json" || /^public\/(photos|thumbnails)\/[^/]+\.(jpg|jpeg|png|webp|avif)$/i.test(file);

async function ensureStudioStopped() {
  for (const port of [3000, 3001]) await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); reject(new Error("请先停止本地开发/管理服务，再发布，避免构建冲突或上传途中发布")); });
    socket.once("error", (error: NodeJS.ErrnoException) => error.code === "ECONNREFUSED" ? resolve() : reject(error));
    socket.setTimeout(2000, () => { socket.destroy(); reject(new Error("无法确认本机服务是否停止，取消发布")); });
  });
}

async function main() {
  if (git("rev-parse", "--show-toplevel") !== process.cwd()) throw new Error("请在相册项目根目录运行");
  if (git("branch", "--show-current") !== "main") throw new Error("请先切换到 main 分支");
  const changed = [...new Set([
    ...git("diff", "HEAD", "--name-only", "-z").split("\0"),
    ...git("ls-files", "--others", "--exclude-standard", "-z").split("\0"),
  ].filter(Boolean))];
  const photos = changed.filter(allowed);
  console.log(`Git 接口：origin/main；待发布相册文件 ${photos.length} 个。`);
  for (const file of photos) console.log(`  ${file}`);
  if (!process.argv.includes("--publish")) {
    console.log("仅预览，没有提交、上传或修改 Git。确认这些照片可以公开后，再运行 pnpm photos:sync --publish。");
    if (changed.some((file) => !allowed(file))) console.log("注意：还有非相册改动，发布前需先单独处理。");
    return;
  }
  if (process.argv.slice(2).some((arg) => arg !== "--publish")) throw new Error("不支持的参数");
  if (!photos.length) throw new Error("没有待发布的照片改动");
  if (changed.some((file) => !allowed(file))) throw new Error("存在非相册改动，请先处理，避免混入本次发布");
  if (git("diff", "--cached", "--name-only")) throw new Error("暂存区已有内容，请先处理；不会覆盖现有暂存操作");
  await ensureStudioStopped();
  const items = JSON.parse(readFileSync("data/photos.json", "utf8")).photos.map(validatePhoto);
  if (new Set(items.map((p: { id: string }) => p.id)).size !== items.length) throw new Error("照片 ID 重复");
  for (const photo of items) for (const url of [photo.url, photo.thumbnail]) {
    if (!/^\/(photos|thumbnails)\/[^/]+$/.test(url) || !existsSync(resolve(`public${url}`))) throw new Error("相册含非本地或缺失图片，不能发布");
  }
  // --publish is deliberate authorization to make all selected image changes public.
  // Refuse to push old local commits or merge/diverge silently.
  git("fetch", "origin", "main");
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) throw new Error("本地与 origin/main 不一致，请先检查并同步；不会自动合并或推送已有提交");
  console.log("将公开以上照片，Git 历史会保留旧版本；请确保已备份原片并检查隐私。开始验证…");
  const env = { ...process.env, NEXT_PUBLIC_ENABLE_LOCAL_STUDIO: "false", NEXT_PUBLIC_ENABLE_REMOTE_STUDIO: "false" };
  for (const args of [["lint"], ["exec", "tsc", "--noEmit"], ["test"], ["audit", "--prod"], ["build"]]) execFileSync("pnpm", args, { stdio: "inherit", env });
  git("add", "--", ...photos);
  git("commit", "-m", "feat: publish selected local photos");
  git("push", "origin", "main");
  console.log("已推送，正在等待 Cloudflare 构建；将验证新版本和页面资源后再确认上线。");
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const result = execFileSync(process.execPath, ["--import", "tsx", "scripts/verify-deployment.ts"], { encoding: "utf8", timeout: 90000 });
      console.log(result); console.log("新版本已上线并通过页面和静态资源检查。"); return;
    } catch { console.log("新版本暂未通过线上验证，15 秒后重试…"); await delay(15000); }
  }
  throw new Error("Git 已推送，但 10 分钟内未确认部署成功；请检查 Cloudflare 构建日志，不要重复提交照片");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Git 同步失败"); process.exitCode = 1; });
