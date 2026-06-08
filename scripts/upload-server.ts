/**
 * Photo Upload Server
 * Accepts photo uploads from the browser, saves originals, generates thumbnails,
 * extracts EXIF/colors, and appends to data/photos.json.
 *
 * Run: npx tsx scripts/upload-server.ts
 * Listens on http://localhost:3001
 */

import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import sharp from "sharp";
import exifr from "exifr";

const PORT = 3001;
const PHOTOS_DIR = path.join(__dirname, "..", "public", "photos");
const THUMBS_DIR = path.join(__dirname, "..", "public", "thumbnails");
const OUTPUT_FILE = path.join(__dirname, "..", "data", "photos.json");

// ============================================================
// Color helpers (same as extract-colors.ts)
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

// ============================================================
// Process uploaded photo
// ============================================================
async function processUpload(dataUrl: string, meta: {
  title?: string;
  date?: string;
  city?: { name: string; lat: number; lng: number };
  camera?: string;
}): Promise<any> {
  // Decode data URL
  const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid data URL");
  const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
  const buffer = Buffer.from(matches[2], "base64");

  // Generate unique filename
  const id = crypto.randomUUID().slice(0, 8).toUpperCase();
  const filename = `upload-${id}.${ext}`;
  const filePath = path.join(PHOTOS_DIR, filename);
  const thumbFilename = `upload-${id}.jpg`;
  const thumbPath = path.join(THUMBS_DIR, thumbFilename);

  // Save original
  fs.writeFileSync(filePath, buffer);
  console.log(`  ✓ Original saved: public/photos/${filename}`);

  // Generate thumbnail
  await sharp(buffer)
    .resize({ width: 400, withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toFile(thumbPath);
  console.log(`  ✓ Thumbnail saved: public/thumbnails/${thumbFilename}`);

  // Extract dominant color from thumbnail
  const raw = await sharp(thumbPath).raw().ensureAlpha().resize(1, 1).toBuffer();
  const dominantColor = rgbToHex({ r: raw[0], g: raw[1], b: raw[2] });

  // Extract palette
  const paletteBuf = await sharp(thumbPath).raw().ensureAlpha().resize({ width: 50 }).toBuffer();
  const palette = extractPalette(paletteBuf);

  // Extract EXIF
  let exif: any = {};
  try {
    exif = await exifr.parse(filePath, {
      pick: ["DateTimeOriginal", "Make", "Model", "LensModel", "ISO", "FNumber", "ExposureTime",
             "GPSLatitude", "GPSLongitude", "GPSLatitudeRef", "GPSLongitudeRef"],
    });
  } catch {}

  const cameraStr = meta.camera || (exif?.Model ? `${exif.Make || ""} ${exif.Model}`.trim() : "未知");
  const lens = exif?.LensModel || "";
  const iso = exif?.ISO || 0;
  const aperture = exif?.FNumber ? `f/${exif.FNumber}` : "";
  const shutter = exif?.ExposureTime
    ? exif.ExposureTime >= 1 ? `${exif.ExposureTime}s` : `1/${Math.round(1 / exif.ExposureTime)}s`
    : "";
  const dateTaken = meta.date || (exif?.DateTimeOriginal
    ? (typeof exif.DateTimeOriginal === "string" ? exif.DateTimeOriginal : (exif.DateTimeOriginal as Date).toISOString()).slice(0, 10)
    : new Date().toISOString().slice(0, 10));

  const location = meta.city || { name: "未知", lat: 0, lng: 0 };

  const photo = {
    id: `upload-${id}`,
    url: `/photos/${filename}`,
    thumbnail: `/thumbnails/${thumbFilename}`,
    title: meta.title || filename,
    date: dateTaken,
    location,
    dominantColor,
    palette,
    colorCategory: categorizeColor(dominantColor),
    camera: cameraStr,
    lens,
    iso,
    aperture,
    shutter,
    tags: [categorizeColor(dominantColor)],
  };

  return photo;
}

// ============================================================
// HTTP Server
// ============================================================
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/upload") {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", async () => {
      try {
        const { dataUrl, title, date, city, camera } = JSON.parse(body);
        if (!dataUrl) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing dataUrl" }));
          return;
        }

        console.log(`\n📸 Processing upload: ${title || "untitled"}`);
        const photo = await processUpload(dataUrl, { title, date, city, camera });

        // Read existing photos.json and append
        const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
        existing.photos.push(photo);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existing, null, 2));
        console.log(`  ✓ Added to photos.json (${existing.photos.length} total)`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, photo }));
      } catch (err: any) {
        console.error(`  ✗ Error: ${err.message}`);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n🚀 Photo upload server running on http://localhost:${PORT}`);
  console.log(`   POST /api/upload with { dataUrl, title, date, city, camera }`);
  console.log(`\n   Waiting for uploads...\n`);
});
