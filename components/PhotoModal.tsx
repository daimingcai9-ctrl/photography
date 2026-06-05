"use client";

import { useState } from "react";
import { Photo } from "@/lib/photos";
import { COLOR_CATEGORY_COLORS, ColorCategory } from "@/lib/colors";
import EditPanel from "./EditPanel";

interface PhotoModalProps {
  photo: Photo | null;
  onClose: () => void;
  onChange?: () => void;
}

export default function PhotoModal({ photo, onClose, onChange }: PhotoModalProps) {
  const [editing, setEditing] = useState(false);

  if (!photo) return null;

  const categoryColor = COLOR_CATEGORY_COLORS[photo.colorCategory as ColorCategory];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" />

      {/* Modal content */}
      <div
        className="relative max-w-5xl w-full max-h-[90vh] overflow-auto bg-zinc-900 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top buttons */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          {onChange && (
            <button
              onClick={() => setEditing(true)}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              title="编辑"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col md:flex-row">
          {/* Image */}
          <div className="relative aspect-[4/3] md:aspect-auto md:w-2/3 flex-shrink-0">
            <img
              src={photo.url}
              alt={photo.title}
              className="w-full h-full object-cover rounded-t-2xl md:rounded-l-2xl md:rounded-tr-none"
            />
          </div>

          {/* Info panel */}
          <div className="p-6 md:w-1/3">
            <h2 className="text-2xl font-bold text-white mb-4">{photo.title}</h2>

            {/* Color palette */}
            <div className="mb-6">
              <p className="text-sm text-white/50 mb-2">色彩</p>
              <div className="flex gap-2">
                {photo.palette.map((color, i) => (
                  <div
                    key={i}
                    className="w-10 h-10 rounded-lg"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Location */}
            <div className="mb-6">
              <p className="text-sm text-white/50 mb-1">拍摄地点</p>
              <p className="text-white">{photo.location.name}</p>
              {photo.location.lat !== 0 && (
                <p className="text-white/30 text-xs font-mono mt-0.5">
                  {photo.location.lat.toFixed(2)}, {photo.location.lng.toFixed(2)}
                </p>
              )}
            </div>

            {/* Date */}
            <div className="mb-6">
              <p className="text-sm text-white/50 mb-1">拍摄时间</p>
              <p className="text-white">{photo.date}</p>
            </div>

            {/* Camera info */}
            <div className="mb-6">
              <p className="text-sm text-white/50 mb-1">设备</p>
              <p className="text-white">{photo.camera}</p>
              <p className="text-white/70 text-sm">{photo.lens}</p>
            </div>

            {/* EXIF */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <p className="text-xs text-white/50">ISO</p>
                <p className="text-white font-mono">{photo.iso}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">光圈</p>
                <p className="text-white font-mono">{photo.aperture}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">快门</p>
                <p className="text-white font-mono">{photo.shutter}</p>
              </div>
            </div>

            {/* Tags */}
            <div>
              <p className="text-sm text-white/50 mb-2">标签</p>
              <div className="flex flex-wrap gap-2">
                {photo.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full text-xs"
                    style={{
                      backgroundColor: `${categoryColor}22`,
                      color: categoryColor,
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

      {/* Edit panel overlay */}
      {editing && onChange && (
        <EditPanel
          photo={photo}
          onClose={() => setEditing(false)}
          onChange={onChange}
        />
      )}
    </div>
  );
}
