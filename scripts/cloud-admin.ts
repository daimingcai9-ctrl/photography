/** Fixed-target administration. Credentials are never printed or committed. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";

const account = "fdec6d21264c32dcfe24baee8a544172";
const project = "photography";
const oauth = readFileSync("/Users/cdm/Library/Preferences/.wrangler/config/default.toml", "utf8").match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if (!oauth) throw new Error("请先 wrangler login");
async function api(route: string, method = "GET", body?: unknown) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${project}${route}`, {
    method, headers: { Authorization: `Bearer ${oauth}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`Cloudflare 请求失败：${response.status} ${JSON.stringify(data.errors)}`);
  return data.result;
}
async function main() {
const mode = process.argv[2];
if (mode === "inspect") {
  const p = await api("");
  console.log(JSON.stringify({ name: p.name, subdomain: p.subdomain, source: p.source, build_config: p.build_config,
    environments: Object.fromEntries(Object.entries(p.deployment_configs).map(([key, value]) => {
      const v = value as Record<string, unknown>;
      const vars = v.env_vars as Record<string, { type: string; value?: string }>;
      return [key, { ...v, env_vars: Object.fromEntries(Object.entries(vars || {}).map(([k, x]) => [k, { type: x.type, value: x.type === "plain_text" ? x.value : "[secret]" }])) }];
    })) }, null, 2));
} else if (mode === "secrets") {
  const p = await api("");
  if (p.subdomain !== "photography-hhs.pages.dev") throw new Error("相册项目域名不匹配");
  const root = process.cwd();
  const destination = path.join(root, "source-photos", "private-upload-access.txt");
  const saved = existsSync(destination) ? readFileSync(destination, "utf8") : "";
  const secrets = { ADMIN_PASSWORD: saved.match(/管理密码：([^\n]+)/)?.[1] || randomBytes(18).toString("base64url"), SESSION_SECRET: saved.match(/会话密钥：([^\n]+)/)?.[1] || randomBytes(32).toString("hex") };
  mkdirSync(path.dirname(destination), { recursive: true });
  // Local handoff only. Never embed these values in a build or an APK.
  if (!saved) writeFileSync(destination, `管理地址：https://photography-hhs.pages.dev/studio\n管理密码：${secrets.ADMIN_PASSWORD}\n\n仅个人保管。会话密钥：${secrets.SESSION_SECRET}\n`, { mode: 0o600, flag: "wx" });
  execFileSync("pnpm", ["exec", "wrangler", "pages", "secret", "bulk", "--project-name", project], { cwd: root, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account }, input: JSON.stringify(secrets), stdio: ["pipe", "pipe", "pipe"] });
  console.log(`管理凭据已保存到 ${destination}；两个 Cloudflare secrets 已设置。`);
} else if (mode === "status") {
  const deployments = await api("/deployments");
  console.log(JSON.stringify(deployments.slice(0, 3).map((d: Record<string, unknown>) => ({ id: d.id, url: d.url, environment: d.environment, deployment_trigger: d.deployment_trigger, latest_stage: d.latest_stage })), null, 2));
} else if (mode === "build-config") {
  const p = await api("");
  if (p.subdomain !== "photography-hhs.pages.dev") throw new Error("相册项目域名不匹配");
  const env_vars = { NODE_VERSION: { type: "plain_text", value: "22" }, PNPM_VERSION: { type: "plain_text", value: "11.3.0" }, NEXT_PUBLIC_ENABLE_LOCAL_STUDIO: { type: "plain_text", value: "false" } };
  await api("", "PATCH", { deployment_configs: { production: { env_vars }, preview: { env_vars } } });
  console.log("Cloudflare 构建版本和公开模式已设置。");
} else throw new Error("用法：node --import tsx scripts/cloud-admin.ts inspect|secrets|status|build-config");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "管理命令失败"); process.exitCode = 1; });
