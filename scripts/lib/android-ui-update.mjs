import { createHash, verify } from "node:crypto";

export const UI_FILES = ["index.html", "app.js", "style.css", "brand.svg", "world-land.geojson"];
export const UI_PROTOCOL = 1;
export const MAX_UPDATE_BYTES = 3 * 1024 * 1024;
export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function verifyUiUpdate(bytes, publicKey) {
  if (bytes.length > MAX_UPDATE_BYTES) throw Error("Update exceeds download limit");
  const envelope = JSON.parse(bytes.toString("utf8"));
  if (typeof envelope.payload !== "string" || envelope.payload.length > 2 * 1024 * 1024
    || typeof envelope.signature !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.signature)) throw Error("Invalid envelope");
  if (!verify("sha256", Buffer.from(envelope.payload), publicKey, Buffer.from(envelope.signature, "base64"))) throw Error("Invalid UI signature");
  const pack = JSON.parse(envelope.payload);
  if (pack.format !== "hhs-ui-v1" || pack.protocol !== UI_PROTOCOL || !Number.isSafeInteger(pack.version) || pack.version < 1
    || typeof pack.release !== "string" || pack.release.length > 100 || typeof pack.notes !== "string" || pack.notes.length > 500
    || !Array.isArray(pack.files) || pack.files.length !== UI_FILES.length) throw Error("Invalid UI manifest or native protocol");
  const files = new Map(); let size = 0;
  for (const file of pack.files) {
    if (!UI_FILES.includes(file.name) || files.has(file.name) || typeof file.content !== "string"
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(file.content) || !/^[a-f0-9]{64}$/.test(file.sha256)
      || !Number.isInteger(file.size) || file.size < 1 || file.size > 1024 * 1024) throw Error("Invalid UI file");
    const content = Buffer.from(file.content, "base64");
    if (content.length !== file.size || digest(content) !== file.sha256) throw Error("UI file hash mismatch");
    size += content.length; if (size > 1536 * 1024) throw Error("UI exceeds storage limit");
    files.set(file.name, content);
  }
  return { pack, files, envelopeHash: digest(bytes) };
}
