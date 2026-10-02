/** Generated signing material is local/ignored; only encrypted GitHub Secrets receive it. */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const folder = resolve("source-photos");
const key = join(folder, "offline-signing.p12"), passwordFile = join(folder, "offline-signing-password.txt");
try {
  if (JSON.parse(readFileSync("package.json", "utf8")).name !== "personal-photograph-show") throw new Error("请在相册项目根目录运行");
  mkdirSync(folder, { recursive: true });
  if (existsSync(key) !== existsSync(passwordFile)) throw new Error("签名备份不完整，请恢复原来的密钥和密码；不能静默更换签名");
  if (!existsSync(key)) {
    const temporary = mkdtempSync(join(tmpdir(), "hhs-signing-"));
    try {
      writeFileSync(passwordFile, randomBytes(32).toString("base64url") + "\n", { mode: 0o600, flag: "wx" });
      execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:3072", "-nodes", "-sha256", "-days", "3650", "-subj", "/CN=Photography Offline Personal/O=Private Album", "-keyout", join(temporary, "key.pem"), "-out", join(temporary, "certificate.pem")], { stdio: "pipe" });
      execFileSync("openssl", ["pkcs12", "-export", "-inkey", join(temporary, "key.pem"), "-in", join(temporary, "certificate.pem"), "-name", "photography-offline", "-out", key, "-passout", `file:${passwordFile}`], { stdio: "pipe" });
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }
  execFileSync("openssl", ["pkcs12", "-in", key, "-info", "-noout", "-passin", `file:${passwordFile}`], { stdio: "pipe" });
  chmodSync(key, 0o600); chmodSync(passwordFile, 0o600);
  if (process.argv.includes("--upload")) {
    const repo = "daimingcai9-ctrl/photography";
    execFileSync("gh", ["secret", "set", "HHS_ANDROID_KEYSTORE", "--repo", repo], { input: readFileSync(key).toString("base64"), stdio: ["pipe", "pipe", "pipe"] });
    execFileSync("gh", ["secret", "set", "HHS_ANDROID_SIGNING_PASSWORD", "--repo", repo], { input: readFileSync(passwordFile, "utf8").trim(), stdio: ["pipe", "pipe", "pipe"] });
    console.log("APK 固定签名已设置到该仓库的加密 Secrets，没有提交到 Git。");
  }
  console.log("请妥善备份 source-photos/offline-signing.p12 和 offline-signing-password.txt；以后升级必须保持相同签名。");
} catch { console.error("签名准备/上传失败，请检查 openssl、GitHub 登录和本机签名备份；不会输出密钥或密码。"); process.exitCode = 1; }
