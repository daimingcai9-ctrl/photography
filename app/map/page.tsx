"use client";

import { useState } from "react";
import { useEditedPhotos } from "@/lib/store";
import { LOCAL_STUDIO_ENABLED } from "@/lib/config";
import MapView from "@/components/MapView";
import PhotoModal from "@/components/PhotoModal";

export default function MapPage() {
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [allPhotos, reload] = useEditedPhotos();
  const selectedPhoto = selectedPhotoId
    ? allPhotos.find((photo) => photo.id === selectedPhotoId) || null
    : null;

  return (
    <div className="h-screen pt-16 flex flex-col">
      <div className="px-6 py-4 bg-black/50 backdrop-blur-md z-10">
        <h1 className="text-2xl font-bold">拍摄地点</h1>
        <p className="text-white/60 text-sm">点击标记查看照片 · 共 {allPhotos.length} 张</p>
      </div>
      <div className="flex-1 relative">
        <MapView photos={allPhotos} onPhotoClick={(photo) => setSelectedPhotoId(photo.id)} />
      </div>
      <PhotoModal
        key={selectedPhoto?.id}
        photo={selectedPhoto}
        onClose={() => setSelectedPhotoId(null)}
        onChange={reload}
        allowEditing={LOCAL_STUDIO_ENABLED}
      />
    </div>
  );
}
