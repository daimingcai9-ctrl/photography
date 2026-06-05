/**
 * Photo Processing Script
 * Scans public/photos/, generates thumbnails, extracts colors & EXIF
 * Output: data/photos.json
 *
 * Run: npx tsx scripts/extract-colors.ts
 */

import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import exifr from "exifr";

const PHOTOS_DIR = path.join(__dirname, "..", "public", "photos");
const THUMBS_DIR = path.join(__dirname, "..", "public", "thumbnails");
const OUTPUT_FILE = path.join(__dirname, "..", "data", "photos.json");

// ============================================================
// Color helpers
// ============================================================
function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
}

function categorizeColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2, d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max !== min) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  h *= 360;
  if (s < 0.1) { if (l < 0.2) return "black"; if (l > 0.8) return "white"; return "gray"; }
  if (h >= 15 && h < 45 && s < 0.5 && l < 0.5) return "brown";
  if (h >= 345 || h < 15) return "red";
  if (h >= 15 && h < 45) return "orange";
  if (h >= 45 && h < 75) return "yellow";
  if (h >= 75 && h < 165) return "green";
  if (h >= 165 && h < 195) return "cyan";
  if (h >= 195 && h < 255) return "blue";
  if (h >= 255 && h < 285) return "purple";
  if (h >= 285 && h < 345) return "pink";
  return "gray";
}

// ============================================================
// Image extensions
// ============================================================
const IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".tiff", ".heic"]);

function getPhotos(): string[] {
  return fs.readdirSync(PHOTOS_DIR).filter((f) => {
    return IMG_EXT.has(path.extname(f).toLowerCase());
  });
}

// ============================================================
// Main processing
// ============================================================
async function processPhoto(filename: string): Promise<any | null> {
  const filePath = path.join(PHOTOS_DIR, filename);
  const nameNoExt = path.parse(filename).name;
  const thumbPath = path.join(THUMBS_DIR, `${nameNoExt}.jpg`);

  try {
    // Generate thumbnail — preserve aspect ratio, max width 400px
    await sharp(filePath)
      .resize({ width: 400, withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toFile(thumbPath);

    // Extract dominant color from thumbnail
    const { dominant } = await sharp(thumbPath).stats();
    const raw = await sharp(thumbPath).raw().ensureAlpha().resize(1, 1).toBuffer();
    const r = raw[0], g = raw[1], b = raw[2];
    const dominantColor = rgbToHex({ r, g, b });

    // Extract palette (quantize to ~4 colors)
    const paletteBuf = await sharp(thumbPath)
      .raw()
      .ensureAlpha()
      .resize({ width: 50 })
      .toBuffer();

    // Simple palette: sample from resized image
    const palette = extractPalette(paletteBuf);

    // Extract EXIF
    let exif: any = {};
    try {
      exif = await exifr.parse(filePath, {
        pick: ["DateTimeOriginal", "Make", "Model", "LensModel", "ISO", "FNumber", "ExposureTime", "GPSLatitude", "GPSLongitude", "GPSLatitudeRef", "GPSLongitudeRef"],
      });
    } catch { /* no EXIF */ }

    const camera = exif?.Make && exif?.Model ? `${exif.Make} ${exif.Model}`.trim() : "未知";
    const lens = exif?.LensModel || "未知";
    const iso = exif?.ISO || 0;
    const aperture = exif?.FNumber ? `f/${exif.FNumber}` : "未知";
    const shutter = exif?.ExposureTime
      ? exif.ExposureTime >= 1 ? `${exif.ExposureTime}s` : `1/${Math.round(1 / exif.ExposureTime)}s`
      : "未知";
    const dateTaken = exif?.DateTimeOriginal
      ? (typeof exif.DateTimeOriginal === "string" ? exif.DateTimeOriginal : (exif.DateTimeOriginal as Date).toISOString()).slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    let lat = 0, lng = 0, locationName = "未知";
    if (exif?.GPSLatitude && exif?.GPSLongitude) {
      lat = exif.GPSLatitude;
      lng = exif.GPSLongitude;
      if (exif.GPSLatitudeRef === "S") lat = -lat;
      if (exif.GPSLongitudeRef === "W") lng = -lng;
      locationName = `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    }

    return {
      id: nameNoExt.slice(0, 10),
      url: `/photos/${filename}`,
      thumbnail: `/thumbnails/${nameNoExt}.jpg`,
      title: nameNoExt,
      date: dateTaken,
      location: { name: locationName, lat, lng },
      dominantColor,
      palette,
      colorCategory: categorizeColor(dominantColor),
      camera,
      lens,
      iso,
      aperture,
      shutter,
      tags: [],
    };
  } catch (err) {
    console.error(`  ✗ ${filename}: ${err}`);
    return null;
  }
}

function extractPalette(buffer: Buffer): string[] {
  const colorMap = new Map<string, number>();
  for (let i = 0; i < buffer.length; i += 4) {
    const r = buffer[i], g = buffer[i + 1], b = buffer[i + 2];
    const key = `${Math.round(r / 32)},${Math.round(g / 32)},${Math.round(b / 32)}`;
    colorMap.set(key, (colorMap.get(key) || 0) + 1);
  }
  const sorted = [...colorMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  return sorted.map(([key]) => {
    const [r, g, b] = key.split(",").map((n) => parseInt(n) * 32);
    return rgbToHex({ r, g, b });
  });
}

async function main() {
  console.log("Photo Processing Script\n");

  // Ensure thumbnails dir
  if (!fs.existsSync(THUMBS_DIR)) {
    fs.mkdirSync(THUMBS_DIR, { recursive: true });
  }

  const files = getPhotos();
  console.log(`Found ${files.length} photos\n`);

  const photos: any[] = [];
  let success = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    console.log(`[${i + 1}/${files.length}] ${filename}`);
    const result = await processPhoto(filename);
    if (result) {
      photos.push(result);
      const exifInfo = result.camera !== "未知" ? result.camera : "";
      console.log(`  ✓ ${result.dominantColor} | ${exifInfo}`);
      success++;
    }
  }

  // Sort by date descending
  photos.sort((a, b) => b.date.localeCompare(a.date));

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ photos }, null, 2));

  console.log(`\n✓ ${success}/${files.length} photos processed`);
  console.log(`✓ Thumbnails: ${THUMBS_DIR}`);
  console.log(`✓ Output: ${OUTPUT_FILE}`);
}

main().catch(console.error);
