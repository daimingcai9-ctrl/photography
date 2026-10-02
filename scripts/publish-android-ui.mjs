// Only this explicit publisher reads the ignored private signing key.
import { generateKeyPairSync, createPublicKey, sign } from "node:crypto";
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import path from "node:path";
import { UI_FILES, UI_PROTOCOL, digest, verifyUiUpdate } from "./lib/android-ui-update.mjs";

const root = process.cwd(), assets = path.join(root, "android/app/src/main/assets");
const secret = path.join(root, "source-photos/ui-update-private.pem");
const pinFile = path.join(assets, "updates/public-key.txt");
const output = path.join(root, "public/app-updates/stable.json");
await mkdir(path.dirname(secret), { recursive: true });
await mkdir(path.dirname(pinFile), { recursive: true });
await mkdir(path.dirname(output), { recursive: true });
let privateKey;
try { privateKey = await readFile(secret); } catch (error) {
  if (error.code !== "ENOENT" || !process.argv.includes("--init-key")) throw Error("Missing private UI key; restore source-photos/ui-update-private.pem (never rotate the installed app's pinned key).");
  // Never silently replace the public key trusted by an installed APK.
  try { await readFile(pinFile); throw Error("Pinned public key already exists; restore its private key instead of generating a new one."); }
  catch (pinError) { if (pinError.code !== "ENOENT") throw pinError; }
  privateKey = generateKeyPairSync("ec", { namedCurve: "prime256v1", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey;
  await writeFile(secret, privateKey, { mode: 0o600, flag: "wx" });
}
await chmod(secret, 0o600);
const publicKey = createPublicKey(privateKey), pin = publicKey.export({ type: "spki", format: "der" }).toString("base64");
try { if ((await readFile(pinFile, "utf8")).trim() !== pin) throw Error("Private UI key doesn't match the APK's pinned key."); }
catch (error) { if (error.code !== "ENOENT") throw error; await writeFile(pinFile, pin + "\n"); }
let previous;
try { previous = verifyUiUpdate(await readFile(output), publicKey).pack; } catch (error) { if (error.code !== "ENOENT") throw error; }
const files = await Promise.all(UI_FILES.map(async (name) => {
  const content = await readFile(path.join(assets, "ui", name));
  return { name, size: content.length, sha256: digest(content), content: content.toString("base64") };
}));
if (previous && !process.argv.includes("--force") && previous.protocol === UI_PROTOCOL
  && files.every((file) => previous.files.some((old) => old.name === file.name && old.sha256 === file.sha256))) {
  console.log("UI unchanged; keeping the existing signed version.");
} else {
  const version = Math.max(Date.now(), (previous?.version || 0) + 1);
  const notesAt = process.argv.indexOf("--notes"), notes = notesAt >= 0 ? process.argv[notesAt + 1] : "界面优化与修复";
  if (!notes || notes.length > 500) throw Error("Release notes must contain 1–500 characters");
  const release = new Date(version).toISOString().slice(0, 10) + " · " + digest(Buffer.from(files.map((f) => f.sha256).join(""))).slice(0, 8);
  const payload = JSON.stringify({ format: "hhs-ui-v1", protocol: UI_PROTOCOL, version, release, notes, files });
  const bytes = Buffer.from(JSON.stringify({ payload, signature: sign("sha256", Buffer.from(payload), privateKey).toString("base64") }) + "\n");
  verifyUiUpdate(bytes, publicKey);
  // Generated, signed public artifacts contain only app UI, never photos/URIs/credentials.
  await writeFile(output, bytes);
  await writeFile(path.join(assets, "updates/builtin.json"), JSON.stringify({ version, release, protocol: UI_PROTOCOL }) + "\n");
  console.log(JSON.stringify({ release, version, bytes: bytes.length, endpoint: "/app-updates/stable.json" }));
}
