"use client";

import { useState, useMemo, useCallback } from "react";
import { Photo } from "@/lib/photos";
import { ColorCategory, COLOR_CATEGORY_COLORS } from "@/lib/colors";
import { useEditedPhotos } from "@/lib/store";
import ColorBar from "@/components/ColorBar";
import PhotoGrid from "@/components/PhotoGrid";
import PhotoModal from "@/components/PhotoModal";

export default function GalleryPage() {
  const [selectedCategory, setSelectedCategory] = useState<ColorCategory | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [allPhotos, reload] = useEditedPhotos();

  const filteredPhotos = useMemo(() => {
    if (!selectedCategory) return allPhotos;
    return allPhotos.filter((p) => p.colorCategory === selectedCategory);
  }, [allPhotos, selectedCategory]);

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 relative">
      <div
        className="fixed inset-0 opacity-10 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 30% 30%, ${selectedCategory ? COLOR_CATEGORY_COLORS[selectedCategory] : "#9F7AEA"} 0%, transparent 50%)` }}
      />
      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">色彩画廊</h1>
          <p className="text-white/60">用色彩重新定义你的摄影作品 · 共 {allPhotos.length} 张</p>
        </div>
        <ColorBar selectedCategory={selectedCategory} onSelect={setSelectedCategory} />
        <p className="text-center text-white/40 text-sm mb-8">
          {selectedCategory ? `${filteredPhotos.length} 张${selectedCategory}色系照片` : `全部 ${filteredPhotos.length} 张照片`}
        </p>
        <PhotoGrid photos={filteredPhotos} onPhotoClick={setSelectedPhoto} />
      </div>
      <PhotoModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} onChange={reload} />
    </div>
  );
}
