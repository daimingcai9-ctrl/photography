import { categorizeColor, COLOR_CATEGORY_COLORS, type ColorCategory } from "./colors";

export interface Photo {
  id: string;
  url: string;
  thumbnail: string;
  title: string;
  date: string;
  location: { name: string; lat: number; lng: number };
  dominantColor: string;
  palette: string[];
  colorCategory: ColorCategory;
  camera: string;
  lens: string;
  iso: number;
  aperture: string;
  shutter: string;
  tags: string[];
  source?: "static" | "remote" | "draft";
  width?: number;
  height?: number;
}

export type PhotoEdit = Pick<Photo, "title" | "date" | "location" | "camera" | "tags">;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_THUMB_BYTES = 512 * 1024;
export const MAX_BATCH_SIZE = 100;
export const MAX_PIXELS = 64_000_000;
export const validId = (id: string) => /^[A-Za-z0-9_-]{1,100}$/.test(id);
export const validColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function text(value: unknown, name: string, max = 200): string {
  if (typeof value !== "string" || value.length > max) throw new Error(`${name}格式不正确`);
  return value.trim();
}

export function validateEdit(value: unknown): PhotoEdit {
  if (!value || typeof value !== "object") throw new Error("照片信息格式不正确");
  const v = value as Record<string, unknown>;
  const title = text(v.title, "标题");
  if (!title) throw new Error("请填写标题");
  if (!validDate(v.date)) throw new Error("拍摄日期不正确");
  if (!v.location || typeof v.location !== "object") throw new Error("地点格式不正确");
  const loc = v.location as Record<string, unknown>;
  const name = text(loc.name, "地点", 100);
  const { lat, lng } = loc;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("经纬度超出有效范围");
  if (!Array.isArray(v.tags) || v.tags.length > 20) throw new Error("标签格式不正确");
  const tags = [...new Set(v.tags.map((tag) => text(tag, "标签", 40)).filter(Boolean))];
  return { title, date: v.date, location: { name: name || "未知", lat, lng }, camera: text(v.camera, "设备") || "未知", tags };
}

export function validatePhoto(value: unknown): Photo {
  const edit = validateEdit(value);
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !validId(v.id)) throw new Error("照片 ID 不正确");
  for (const key of ["url", "thumbnail"]) {
    if (typeof v[key] !== "string" || !(v[key] as string).startsWith("/") || (v[key] as string).startsWith("//")) throw new Error("图片地址不正确");
  }
  if (!validColor(v.dominantColor) || !Array.isArray(v.palette) || v.palette.length === 0 || v.palette.length > 8 || !v.palette.every(validColor)) throw new Error("色板格式不正确");
  if (typeof v.colorCategory !== "string" || !Object.hasOwn(COLOR_CATEGORY_COLORS, v.colorCategory)) throw new Error("色系不正确");
  if (typeof v.iso !== "number" || !Number.isFinite(v.iso) || v.iso < 0 || v.iso > 10_000_000) throw new Error("ISO 不正确");
  const dimensions: { width?: number; height?: number } = {};
  for (const key of ["width", "height"] as const) {
    if (v[key] !== undefined) {
      if (typeof v[key] !== "number" || !Number.isInteger(v[key]) || (v[key] as number) <= 0 || (v[key] as number) > 64000) throw new Error("图片尺寸不正确");
      dimensions[key] = v[key] as number;
    }
  }
  return {
    ...edit, ...dimensions, id: v.id, url: v.url as string, thumbnail: v.thumbnail as string,
    dominantColor: v.dominantColor, palette: [...new Set(v.palette as string[])], colorCategory: v.colorCategory as ColorCategory,
    iso: v.iso, lens: text(v.lens, "镜头"), aperture: text(v.aperture, "光圈", 30), shutter: text(v.shutter, "快门", 30),
    source: v.source === "remote" || v.source === "draft" ? v.source : "static",
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
}

export function extractPalette(pixels: Uint8Array | Uint8ClampedArray): string[] {
  const buckets = new Map<string, number>();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const channels = [pixels[i], pixels[i + 1], pixels[i + 2]].map((n) => Math.floor(n / 32) * 32 + 16);
    const color = rgbToHex(channels[0], channels[1], channels[2]);
    buckets.set(color, (buckets.get(color) || 0) + 1);
  }
  return [...buckets].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([hex]) => hex);
}

export function colorFields(pixels: Uint8Array | Uint8ClampedArray) {
  const palette = extractPalette(pixels);
  const dominantColor = palette[0] || "#808080";
  const colorCategory = categorizeColor(dominantColor);
  return { dominantColor, palette: palette.length ? palette : [dominantColor], colorCategory };
}
