"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Photo } from "@/lib/photos";
import { COLOR_CATEGORY_COLORS, ColorCategory } from "@/lib/colors";
import EditPanel from "./EditPanel";

interface PhotoModalProps {
  photo: Photo | null;
  onClose: () => void;
  onChange?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  allowEditing?: boolean;
}

export default function PhotoModal({
  photo,
  onClose,
  onChange,
  onPrevious,
  onNext,
  allowEditing = false,
}: PhotoModalProps) {
  const [editing, setEditing] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!photo) return;
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (editing) return;
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onPrevious?.();
      if (event.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [editing, onClose, onNext, onPrevious, photo]);

  if (!photo) return null;

  const categoryColor = COLOR_CATEGORY_COLORS[photo.colorCategory as ColorCategory];

  const handleShare = async () => {
    const url = `${window.location.origin}/photo/${photo.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: photo.title, text: `${photo.title} · ${photo.location.name}`, url });
        setShareStatus("已分享");
      } else {
        await navigator.clipboard.writeText(url);
        setShareStatus("链接已复制");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareStatus("分享失败");
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 animate-fadeIn" onClick={onClose}>
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-modal-title"
        tabIndex={-1}
        className="relative max-h-[94vh] w-full max-w-5xl overflow-auto rounded-2xl bg-zinc-900 shadow-2xl outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute right-3 top-3 z-20 flex items-center gap-2 sm:right-4 sm:top-4">
          {shareStatus && <span className="rounded-full bg-black/70 px-3 py-2 text-xs text-white/70">{shareStatus}</span>}
          <button type="button" onClick={handleShare} aria-label="分享这张照片" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80">
            <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12v7a1 1 0 001 1h8a1 1 0 001-1v-7M12 16V4m0 0L8 8m4-4 4 4" /></svg>
          </button>
          {allowEditing && onChange && (
            <button type="button" onClick={() => setEditing(true)} aria-label="编辑照片信息" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80">
              <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="关闭照片" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80">
            <svg aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex flex-col md:flex-row">
          <div className="relative aspect-[4/3] flex-shrink-0 md:aspect-auto md:min-h-[640px] md:w-2/3">
            <img src={photo.url} alt={photo.title} className="h-full w-full rounded-t-2xl object-contain bg-black md:rounded-l-2xl md:rounded-tr-none" />
            {onPrevious && (
              <button type="button" onClick={onPrevious} aria-label="上一张照片" className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-2xl text-white transition hover:bg-black/80">‹</button>
            )}
            {onNext && (
              <button type="button" onClick={onNext} aria-label="下一张照片" className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-2xl text-white transition hover:bg-black/80">›</button>
            )}
          </div>

          <div className="p-6 md:w-1/3 md:pt-20">
            <h2 id="photo-modal-title" className="mb-2 text-2xl font-bold text-white">{photo.title}</h2>
            <p className="mb-6 text-sm text-white/50">{photo.location.name} · {photo.date}</p>

            <div className="mb-6">
              <p className="mb-2 text-sm text-white/50">色彩</p>
              <div className="flex gap-2">
                {photo.palette.map((color) => <div key={color} className="h-10 w-10 rounded-lg" style={{ backgroundColor: color }} title={color} />)}
              </div>
            </div>

            <dl className="mb-6 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-white/5 p-4 text-sm">
              <div><dt className="text-white/40">设备</dt><dd className="mt-1 text-white">{photo.camera}</dd></div>
              <div><dt className="text-white/40">镜头</dt><dd className="mt-1 text-white">{photo.lens || "未知"}</dd></div>
              {photo.iso > 0 && <div><dt className="text-white/40">ISO</dt><dd className="mt-1 font-mono text-white">{photo.iso}</dd></div>}
              {photo.aperture && photo.aperture !== "未知" && <div><dt className="text-white/40">光圈</dt><dd className="mt-1 font-mono text-white">{photo.aperture}</dd></div>}
              {photo.shutter && photo.shutter !== "未知" && <div><dt className="text-white/40">快门</dt><dd className="mt-1 font-mono text-white">{photo.shutter}</dd></div>}
            </dl>

            {photo.tags.length > 0 && (
              <div className="mb-7">
                <p className="mb-2 text-sm text-white/50">标签</p>
                <div className="flex flex-wrap gap-2">
                  {photo.tags.map((tag) => <span key={tag} className="rounded-full px-3 py-1 text-xs" style={{ backgroundColor: `${categoryColor}22`, color: categoryColor }}>{tag}</span>)}
                </div>
              </div>
            )}

            <Link href={`/photo/${photo.id}`} className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white">
              打开独立页面 <span aria-hidden="true">→</span>
            </Link>
            <p className="mt-4 hidden text-xs text-white/25 sm:block">使用 ← → 切换，Esc 关闭</p>
          </div>
        </div>
      </div>

      {editing && allowEditing && onChange && (
        <EditPanel photo={photo} onClose={() => setEditing(false)} onChange={onChange} />
      )}
    </div>
  );
}
