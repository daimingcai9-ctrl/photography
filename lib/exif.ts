import type { Photo } from "./photo-schema";
import { validDate } from "./photo-schema";

export const CITIES = [
  { name: "重庆", lat: 29.56, lng: 106.55 }, { name: "揭阳", lat: 23.55, lng: 116.37 },
  { name: "深圳", lat: 22.54, lng: 114.06 }, { name: "北京", lat: 39.90, lng: 116.40 },
  { name: "上海", lat: 31.23, lng: 121.47 }, { name: "广州", lat: 23.13, lng: 113.26 },
  { name: "成都", lat: 30.57, lng: 104.06 }, { name: "杭州", lat: 30.28, lng: 120.15 },
  { name: "拉萨", lat: 29.65, lng: 91.10 }, { name: "哈尔滨", lat: 45.80, lng: 126.53 },
  { name: "三亚", lat: 18.25, lng: 109.51 }, { name: "厦门", lat: 24.48, lng: 118.09 },
  { name: "西安", lat: 34.26, lng: 108.94 }, { name: "南京", lat: 32.06, lng: 118.80 },
  { name: "武汉", lat: 30.59, lng: 114.31 }, { name: "昆明", lat: 25.04, lng: 102.70 },
  { name: "大理", lat: 25.59, lng: 100.22 }, { name: "长沙", lat: 28.23, lng: 112.93 },
];

/** EXIF timestamps describe camera wall-clock time; UTC conversion can shift the day. */
export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function exifDate(value: unknown): string | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) return localDate(value);
  if (typeof value === "string") {
    const date = value.slice(0, 10).replaceAll(":", "-");
    if (validDate(date)) return date;
  }
}

export function approximateLocation(lat: number, lng: number): Photo["location"] {
  const distances = CITIES.map((city) => ({ city, distance: Math.hypot((city.lat - lat) * 111, (city.lng - lng) * 111 * Math.cos(lat * Math.PI / 180)) }));
  distances.sort((a, b) => a.distance - b.distance);
  if (distances[0].distance < 70) return { ...distances[0].city };
  const roundedLat = Math.round(lat * 100) / 100, roundedLng = Math.round(lng * 100) / 100;
  return { name: `拍摄地点 (${roundedLat}, ${roundedLng})`, lat: roundedLat, lng: roundedLng };
}

export async function readPhotoInfo(input: Blob | Uint8Array | string): Promise<Partial<Photo>> {
  const m = await import("exifr");
  const parser = m.default || m;
  const exif = await parser.parse(input, { reviveValues: false }).catch(() => null);
  if (!exif) return {};
  const result: Partial<Photo> = {};
  const date = exifDate(exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate || exif.DateTime);
  if (date) result.date = date;
  if (typeof exif.Model === "string") result.camera = [exif.Make, exif.Model].filter((s) => typeof s === "string").join(" ").trim();
  if (typeof exif.LensModel === "string") result.lens = exif.LensModel;
  if (typeof exif.ISO === "number" && Number.isFinite(exif.ISO)) result.iso = exif.ISO;
  if (typeof exif.FNumber === "number") result.aperture = `f/${exif.FNumber}`;
  if (typeof exif.ExposureTime === "number" && exif.ExposureTime > 0) result.shutter = exif.ExposureTime >= 1 ? `${exif.ExposureTime}s` : `1/${Math.round(1 / exif.ExposureTime)}s`;
  if (Number.isFinite(exif.latitude) && Number.isFinite(exif.longitude)) result.location = approximateLocation(exif.latitude, exif.longitude);
  const width = exif.ExifImageWidth || exif.ImageWidth;
  const height = exif.ExifImageHeight || exif.ImageHeight;
  if (Number.isFinite(width) && Number.isFinite(height)) { result.width = width; result.height = height; }
  return result;
}
