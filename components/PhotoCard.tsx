"use client";

import { Photo } from "@/lib/photos";
import { COLOR_CATEGORY_COLORS, ColorCategory } from "@/lib/colors";

interface PhotoCardProps {
  photo: Photo;
  index: number;
  onClick: () => void;
}

export default function PhotoCard({ photo, index, onClick }: PhotoCardProps) {
  const categoryColor = COLOR_CATEGORY_COLORS[photo.colorCategory as ColorCategory];

  return (
    <button
      type="button"
      className="group block w-full cursor-pointer animate-fadeIn rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-4 focus-visible:ring-offset-black"
      style={{ animationDelay: `${index * 0.05}s` }}
      onClick={onClick}
      aria-label={`查看照片：${photo.title}，拍摄于${photo.location.name}`}
    >
      <div className="relative overflow-hidden rounded-xl bg-white/5 backdrop-blur-sm hover:transform hover:scale-105 transition-all duration-300">
        {/* Image */}
        <div className="aspect-[4/3] relative overflow-hidden">
          <img
            src={photo.thumbnail}
            alt={photo.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
          />

          {/* Overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="absolute bottom-4 left-4 right-4">
              <h3 className="text-white font-semibold text-lg mb-1">
                {photo.title}
              </h3>
              <p className="text-white/70 text-sm">
                {photo.location.name} · {photo.date}
              </p>
            </div>
          </div>

          {/* Color indicator */}
          <div
            className="absolute top-3 right-3 w-4 h-4 rounded-full border-2 border-white/50 shadow-lg"
            style={{ backgroundColor: photo.dominantColor }}
          />
        </div>

        {/* Info bar */}
        <div className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60 truncate">{photo.title}</span>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: `${categoryColor}22`,
                color: categoryColor,
              }}
            >
              {photo.colorCategory}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
