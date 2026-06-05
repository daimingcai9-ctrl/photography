"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { getPhotoById } from "@/lib/photos";
import { COLOR_CATEGORY_COLORS, ColorCategory } from "@/lib/colors";

export default function PhotoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const photo = getPhotoById(id);

  if (!photo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/60">照片未找到</p>
      </div>
    );
  }

  const categoryColor = COLOR_CATEGORY_COLORS[photo.colorCategory as ColorCategory];

  return (
    <div className="min-h-screen pt-20 pb-12">
      {/* Back button */}
      <div className="max-w-7xl mx-auto px-4 mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Image */}
          <div className="lg:w-2/3">
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden">
              <img
                src={photo.url}
                alt={photo.title}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Info panel */}
          <div className="lg:w-1/3">
            <h1 className="text-3xl font-bold mb-2">{photo.title}</h1>

            <div className="flex items-center gap-4 text-white/60 mb-6">
              <span>{photo.location.name}</span>
              <span>·</span>
              <span>{photo.date}</span>
            </div>

            {/* Color palette */}
            <div className="mb-8">
              <p className="text-sm text-white/50 mb-3">色彩</p>
              <div className="flex gap-3">
                {photo.palette.map((color, i) => (
                  <div key={i} className="text-center">
                    <div
                      className="w-14 h-14 rounded-xl mb-1"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs text-white/40 font-mono">
                      {color}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Camera info */}
            <div className="bg-white/5 rounded-xl p-6 mb-6">
              <p className="text-sm text-white/50 mb-4">拍摄参数</p>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-white/60">设备</span>
                  <span className="text-white">{photo.camera}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">镜头</span>
                  <span className="text-white">{photo.lens}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">ISO</span>
                  <span className="text-white font-mono">{photo.iso}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">光圈</span>
                  <span className="text-white font-mono">{photo.aperture}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">快门</span>
                  <span className="text-white font-mono">{photo.shutter}</span>
                </div>
              </div>
            </div>

            {/* Location info */}
            <div className="bg-white/5 rounded-xl p-6 mb-6">
              <p className="text-sm text-white/50 mb-4">拍摄地点</p>
              <p className="text-lg text-white mb-2">{photo.location.name}</p>
              <p className="text-sm text-white/40 font-mono">
                {photo.location.lat.toFixed(4)}°N, {photo.location.lng.toFixed(4)}°E
              </p>
            </div>

            {/* Tags */}
            <div>
              <p className="text-sm text-white/50 mb-3">标签</p>
              <div className="flex flex-wrap gap-2">
                {photo.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-4 py-2 rounded-full text-sm"
                    style={{
                      backgroundColor: `${categoryColor}22`,
                      color: categoryColor,
                      border: `1px solid ${categoryColor}44`,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
