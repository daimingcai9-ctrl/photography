"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useEditedPhotos } from "@/lib/store";
import { COLOR_CATEGORY_COLORS, ColorCategory } from "@/lib/colors";

export default function PhotoDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [shareStatus, setShareStatus] = useState("");
  const [photos] = useEditedPhotos();
  const photoIndex = photos.findIndex((item) => item.id === id);
  const photo = photoIndex >= 0 ? photos[photoIndex] : undefined;

  if (!photo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/60 mb-4">照片未找到</p>
          <Link href="/gallery" className="text-white/40 hover:text-white text-sm">← 返回画廊</Link>
        </div>
      </div>
    );
  }

  const categoryColor = COLOR_CATEGORY_COLORS[photo.colorCategory as ColorCategory];
  const previousPhoto = photoIndex > 0 ? photos[photoIndex - 1] : null;
  const nextPhoto = photoIndex < photos.length - 1 ? photos[photoIndex + 1] : null;

  const handleShare = async () => {
    const url = window.location.href;
    try {
      const canShare = typeof navigator.share === "function";
      if (canShare) await navigator.share({ title: photo.title, url });
      else await navigator.clipboard.writeText(url);
      setShareStatus(canShare ? "已分享" : "链接已复制");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareStatus("分享失败");
    }
  };

  return (
    <div className="min-h-screen pb-12 pt-20">
      <div className="mx-auto mb-6 flex max-w-7xl items-center justify-between px-4">
        <button type="button" onClick={() => router.back()} className="flex items-center gap-2 text-white/60 transition-colors hover:text-white">
          <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          返回
        </button>
        <div className="flex items-center gap-3">
          {shareStatus && <span className="text-xs text-white/40">{shareStatus}</span>}
          <button type="button" onClick={handleShare} className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white">分享</button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4">
        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="lg:w-2/3">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-zinc-950">
              <img src={photo.url} alt={photo.title} className="h-full w-full object-contain" />
            </div>
            <nav aria-label="照片翻页" className="mt-4 flex justify-between gap-4">
              {previousPhoto ? <Link href={`/photo/${previousPhoto.id}`} className="max-w-[45%] truncate text-sm text-white/50 transition hover:text-white">← {previousPhoto.title}</Link> : <span />}
              {nextPhoto && <Link href={`/photo/${nextPhoto.id}`} className="max-w-[45%] truncate text-right text-sm text-white/50 transition hover:text-white">{nextPhoto.title} →</Link>}
            </nav>
          </div>

          <div className="lg:w-1/3">
            <h1 className="mb-2 text-3xl font-bold">{photo.title}</h1>
            <p className="mb-6 text-white/60">{photo.location.name} · {photo.date}</p>

            <div className="mb-8">
              <p className="mb-3 text-sm text-white/50">色彩</p>
              <div className="flex gap-3">
                {photo.palette.map((color) => (
                  <div key={color} className="text-center"><div className="mb-1 h-14 w-14 rounded-xl" style={{ backgroundColor: color }} /><span className="font-mono text-xs text-white/40">{color}</span></div>
                ))}
              </div>
            </div>

            <dl className="mb-6 space-y-3 rounded-xl bg-white/5 p-6">
              <div className="flex justify-between gap-4"><dt className="text-white/60">设备</dt><dd className="text-right text-white">{photo.camera}</dd></div>
              {photo.lens && photo.lens !== "未知" && <div className="flex justify-between gap-4"><dt className="text-white/60">镜头</dt><dd className="text-right text-white">{photo.lens}</dd></div>}
              {photo.iso > 0 && <div className="flex justify-between"><dt className="text-white/60">ISO</dt><dd className="font-mono text-white">{photo.iso}</dd></div>}
              {photo.aperture && photo.aperture !== "未知" && <div className="flex justify-between"><dt className="text-white/60">光圈</dt><dd className="font-mono text-white">{photo.aperture}</dd></div>}
              {photo.shutter && photo.shutter !== "未知" && <div className="flex justify-between"><dt className="text-white/60">快门</dt><dd className="font-mono text-white">{photo.shutter}</dd></div>}
            </dl>

            {photo.tags.length > 0 && (
              <div><p className="mb-3 text-sm text-white/50">标签</p><div className="flex flex-wrap gap-2">{photo.tags.map((tag) => <span key={tag} className="rounded-full border px-4 py-2 text-sm" style={{ backgroundColor: `${categoryColor}22`, color: categoryColor, borderColor: `${categoryColor}44` }}>{tag}</span>)}</div></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
