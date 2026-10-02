/** One local-only entry point. No environment file or cloud account is needed. */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { createLocalServer } from "./upload-server";

async function checkPort(port: number) {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", () => reject(new Error(`端口 ${port} 已被占用，请先停止原来的服务；不会自动改用其他端口。`)));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve()));
  });
}

async function main() {
  const root = process.cwd();
  if (JSON.parse(readFileSync("package.json", "utf8")).name !== "personal-photograph-show") throw new Error("请在相册项目目录运行 pnpm studio");
  await checkPort(3000);
  await checkPort(3001);
  const password = process.env.PHOTO_ADMIN_PASSWORD || randomBytes(18).toString("base64url");
  const server = createLocalServer({ root, password });
  let child: ChildProcess | null = null;
  let stopping = false;
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    if (child?.pid) {
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already exited. */ }
    }
    server.close();
    server.closeAllConnections();
    // Keep this timer alive even if pnpm exits before its Next.js workers do.
    setTimeout(() => {
      if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already exited. */ } }
    }, 5000);
  };
  process.once("SIGINT", () => stop());
  process.once("SIGTERM", () => stop());
  server.on("error", (error) => { console.error(error.message); stop(1); });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3001, "127.0.0.1", resolve);
  });
  console.log("\n本地相册管理：http://127.0.0.1:3000/studio");
  console.log(`本地管理密码：${password}`);
  console.log("照片仅保存到本机，不自动发布；按 Ctrl+C 同时停止两个服务。\n");
  const nodeOptions = process.env.NODE_OPTIONS || "";
  child = spawn("pnpm", ["dev", "--hostname", "127.0.0.1", "--port", "3000"], {
    cwd: root, stdio: "inherit", detached: true,
    env: { ...process.env, NEXT_PUBLIC_ENABLE_LOCAL_STUDIO: "true", NEXT_PUBLIC_ENABLE_REMOTE_STUDIO: "false",
      NODE_OPTIONS: /--max[-_]old[-_]space[-_]size/.test(nodeOptions) ? nodeOptions : `${nodeOptions} --max-old-space-size=2048`.trim() },
  });
  child.once("error", (error) => { console.error(error.message); stop(1); });
  child.once("exit", (code) => stop(code ?? (stopping ? 0 : 1)));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "启动失败"); process.exitCode = 1; });
