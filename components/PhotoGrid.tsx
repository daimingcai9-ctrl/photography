"use client";

import { Photo } from "@/lib/photos";
import PhotoCard from "./PhotoCard";

interface PhotoGridProps {
  photos: Photo[];
  onPhotoClick: (photo: Photo) => void;
}

export default function PhotoGrid({ photos, onPhotoClick }: PhotoGridProps) {
  if (photos.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-white/40 text-lg">该色系暂无照片</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {photos.map((photo, index) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          index={index}
          onClick={() => onPhotoClick(photo)}
        />
      ))}
    </div>
  );
}
