const encoder = new TextEncoder();
const COOKIE = "photo_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;

function hex(buffer: ArrayBuffer) { return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join(""); }
async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
export async function constantEqual(a: string, b: string) {
  const left = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(a)));
  const right = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(b)));
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
export async function createSession(secret: string, now = Date.now()) {
  const expires = Math.floor(now / 1000) + SESSION_SECONDS;
  const value = `${expires}.${crypto.randomUUID()}`;
  return `${value}.${await hmac(value, secret)}`;
}
export async function authenticated(request: Request, secret?: string, now = Date.now()) {
  if (!secret || secret.length < 32) return false;
  const cookie = request.headers.get("Cookie")?.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!cookie || cookie.length > 180) return false;
  const parts = cookie.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[a-f0-9-]{36}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) return false;
  const expires = Number(parts[0]);
  if (expires <= Math.floor(now / 1000) || expires > Math.floor(now / 1000) + SESSION_SECONDS + 60) return false;
  return constantEqual(parts[2], await hmac(`${parts[0]}.${parts[1]}`, secret));
}
export function sessionCookie(value: string, secure: boolean, clear = false) {
  return `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : SESSION_SECONDS}${secure ? "; Secure" : ""}`;
}

export async function limitedBody(request: Request, limit: number): Promise<Uint8Array> {
  if (Number(request.headers.get("Content-Length")) > limit) throw new Error("请求超过大小限制");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) { await reader.cancel(); throw new Error("请求超过大小限制"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

/** Public objects must be metadata-free JPEGs, not merely labelled image/jpeg. */
export function jpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("图片必须转换为 JPEG");
  let offset = 2;
  let width = 0, height = 0;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error("JPEG 文件损坏");
    let marker = bytes[offset + 1];
    while (marker === 0xff) { offset++; marker = bytes[offset + 1]; }
    offset += 2;
    if (marker === 0xda) {
      if (!width || !height || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error("JPEG 文件不完整");
      return { width, height };
    }
    if (marker === 0xd9) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new Error("JPEG 文件损坏");
    if ((marker >= 0xe1 && marker <= 0xed) || marker === 0xfe) throw new Error("上传图片仍包含元数据，请重新选择照片");
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) throw new Error("JPEG 文件损坏");
      height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      width = (bytes[offset + 5] << 8) | bytes[offset + 6];
    }
    offset += length;
  }
  throw new Error("无法读取 JPEG 尺寸");
}
