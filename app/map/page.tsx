"use client";

import { useState, useMemo } from "react";
import { Photo } from "@/lib/photos";
import { useEditedPhotos } from "@/lib/store";
import MapView from "@/components/MapView";
import PhotoModal from "@/components/PhotoModal";

export default function MapPage() {
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [allPhotos, reload] = useEditedPhotos();

  return (
    <div className="h-screen pt-16 flex flex-col">
      <div className="px-6 py-4 bg-black/50 backdrop-blur-md z-10">
        <h1 className="text-2xl font-bold">拍摄地点</h1>
        <p className="text-white/60 text-sm">点击标记查看照片 · 共 {allPhotos.length} 张</p>
      </div>
      <div className="flex-1 relative">
        <MapView photos={allPhotos} onPhotoClick={setSelectedPhoto} />
      </div>
      <PhotoModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} onChange={reload} />
    </div>
  );
}
