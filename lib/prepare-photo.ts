"use client";

import { colorFields, MAX_FILE_BYTES, MAX_IMAGE_BYTES, MAX_PIXELS, type Photo } from "./photo-schema";
import { localDate, readPhotoInfo } from "./exif";
import { stripJpegMetadata } from "./jpeg";

export type PreparedPhoto = { image: Blob; thumbnail: Blob; metadata: Omit<Photo, "id" | "url" | "thumbnail"> };
async function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片转换失败")), "image/jpeg", quality));
  return new Blob([stripJpegMetadata(new Uint8Array(await blob.arrayBuffer())) as Uint8Array<ArrayBuffer>], { type: "image/jpeg" });
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.size || file.size > MAX_FILE_BYTES) throw new Error("单张照片最大 25MB");
  if (!/\.(jpe?g|png|webp|heic|heif|avif)$/i.test(file.name) && !/^image\/(jpeg|png|webp|heic|heif|avif)$/.test(file.type)) throw new Error("支持 JPG、PNG、WebP、HEIC 和 AVIF 照片");
  const info = await readPhotoInfo(file).catch(() => ({} as Partial<Photo>));
  if (info.width && info.height && info.width * info.height > MAX_PIXELS) throw new Error("照片超过 6400 万像素，请先缩小后上传");
  let input: Blob = file;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(input, { imageOrientation: "from-image" }); }
  catch {
    if (!/\.(heic|heif)$/i.test(file.name) && !/^image\/hei[cf]$/.test(file.type)) throw new Error("无法读取图片，请确认文件完整");
    const { heicTo } = await import("heic-to/csp");
    input = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
    bitmap = await createImageBitmap(input, { imageOrientation: "from-image" });
  }
  const imageCanvas = document.createElement("canvas");
  const thumbCanvas = document.createElement("canvas");
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS) throw new Error("照片超过 6400 万像素，请先缩小后上传");
    const ratio = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    imageCanvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    imageCanvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = imageCanvas.getContext("2d");
    if (!ctx) throw new Error("当前浏览器无法处理图片");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, imageCanvas.width, imageCanvas.height);
    ctx.drawImage(bitmap, 0, 0, imageCanvas.width, imageCanvas.height);
    bitmap.close();
    let image = await canvasBlob(imageCanvas, 0.88);
    if (image.size > MAX_IMAGE_BYTES) image = await canvasBlob(imageCanvas, 0.72);
    if (image.size > MAX_IMAGE_BYTES) throw new Error("照片压缩后仍超过 8MB，请先缩小图片");
    const thumbRatio = Math.min(1, 400 / Math.max(imageCanvas.width, imageCanvas.height));
    thumbCanvas.width = Math.max(1, Math.round(imageCanvas.width * thumbRatio));
    thumbCanvas.height = Math.max(1, Math.round(imageCanvas.height * thumbRatio));
    const thumbCtx = thumbCanvas.getContext("2d", { willReadFrequently: true });
    if (!thumbCtx) throw new Error("无法生成缩略图");
    thumbCtx.drawImage(imageCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
    const thumbnail = await canvasBlob(thumbCanvas, 0.78);
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = 50; sampleCanvas.height = 50;
    const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true })!;
    sampleCtx.drawImage(thumbCanvas, 0, 0, 50, 50);
    const colors = colorFields(sampleCtx.getImageData(0, 0, 50, 50).data);
    const date = info.date || localDate(new Date(file.lastModified || Date.now()));
    const metadata = {
      title: file.name.replace(/\.[^.]+$/, "").slice(0, 200), date,
      location: info.location || { name: "未知", lat: 0, lng: 0 }, camera: info.camera || "未知", lens: info.lens || "",
      iso: info.iso || 0, aperture: info.aperture || "", shutter: info.shutter || "", tags: [colors.colorCategory],
      width: imageCanvas.width, height: imageCanvas.height, ...colors,
    };
    sampleCanvas.width = sampleCanvas.height = 0;
    return { image, thumbnail, metadata };
  } finally {
    bitmap.close(); imageCanvas.width = imageCanvas.height = 0; thumbCanvas.width = thumbCanvas.height = 0;
  }
}
