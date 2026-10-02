import sharp from "sharp";
import { colorFields, MAX_PIXELS } from "../lib/photo-schema";

sharp.cache({ memory: 32, files: 0, items: 32 });
sharp.concurrency(1);

export async function deriveImages(input: Buffer | string) {
  const original = sharp(input, { limitInputPixels: MAX_PIXELS });
  const metadata = await original.metadata();
  if (!["jpeg", "png", "webp", "heif", "tiff", "avif"].includes(metadata.format || "")) throw new Error("不支持该图片的实际格式");
  const image = await original.autoOrient().resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  const thumbnail = await sharp(image).resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
  const pixels = await sharp(thumbnail).resize({ width: 50, height: 50, fit: "inside" }).ensureAlpha().raw().toBuffer();
  const size = await sharp(image).metadata();
  return { image, thumbnail, width: size.width!, height: size.height!, ...colorFields(pixels) };
}
