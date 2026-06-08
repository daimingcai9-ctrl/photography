"use client";

import { useState, useMemo, useCallback } from "react";
import { Photo } from "@/lib/photos";
import { ColorCategory, COLOR_CATEGORY_COLORS } from "@/lib/colors";
import { useEditedPhotos } from "@/lib/store";
import ColorBar from "@/components/ColorBar";
import PhotoGrid from "@/components/PhotoGrid";
import PhotoModal from "@/components/PhotoModal";
import AddPhotoModal from "@/components/AddPhotoModal";

export default function GalleryPage() {
  const [selectedCategory, setSelectedCategory] = useState<ColorCategory | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [allPhotos, reload] = useEditedPhotos();

  const filteredPhotos = useMemo(() => {
    if (!selectedCategory) return allPhotos;
    return allPhotos.filter((p) => p.colorCategory === selectedCategory);
  }, [allPhotos, selectedCategory]);

  const handleAddPhoto = useCallback((photo: Photo) => {
    // Force reload to include new photo
    reload();
  }, [reload]);

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 relative">
      <div
        className="fixed inset-0 opacity-10 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 30% 30%, ${selectedCategory ? COLOR_CATEGORY_COLORS[selectedCategory] : "#9F7AEA"} 0%, transparent 50%)` }}
      />
      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="text-center flex-1">
            <h1 className="text-4xl font-bold mb-2">色彩画廊</h1>
            <p className="text-white/60">用色彩重新定义你的摄影作品 · 共 {allPhotos.length} 张</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-shrink-0 ml-4 px-4 py-2 bg-white text-black rounded-full text-sm font-medium hover:bg-white/90 transition-colors"
          >
            + 添加照片
          </button>
        </div>

        <ColorBar selectedCategory={selectedCategory} onSelect={setSelectedCategory} />
        <p className="text-center text-white/40 text-sm mb-8">
          {selectedCategory ? `${filteredPhotos.length} 张${selectedCategory}色系照片` : `全部 ${filteredPhotos.length} 张照片`}
        </p>
        <PhotoGrid photos={filteredPhotos} onPhotoClick={setSelectedPhoto} />
      </div>

      <PhotoModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} onChange={reload} />

      {showAddModal && (
        <AddPhotoModal onClose={() => setShowAddModal(false)} onAdd={handleAddPhoto} />
      )}
    </div>
  );
}
