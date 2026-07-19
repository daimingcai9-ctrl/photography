"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ColorCategory, COLOR_CATEGORY_COLORS } from "@/lib/colors";
import { useEditedPhotos } from "@/lib/store";
import { LOCAL_STUDIO_ENABLED } from "@/lib/config";
import ColorBar from "@/components/ColorBar";
import PhotoGrid from "@/components/PhotoGrid";
import PhotoModal from "@/components/PhotoModal";
import AddPhotoModal from "@/components/AddPhotoModal";
import GalleryFilters, { GallerySort } from "@/components/GalleryFilters";

function GalleryContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("color");
  const selectedCategory = categoryParam && categoryParam in COLOR_CATEGORY_COLORS
    ? categoryParam as ColorCategory
    : null;
  const query = searchParams.get("q") || "";
  const selectedLocation = searchParams.get("location") || "";
  const selectedCamera = searchParams.get("camera") || "";
  const sortParam = searchParams.get("sort");
  const sort: GallerySort = sortParam === "oldest" || sortParam === "title" ? sortParam : "newest";
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [allPhotos, reload] = useEditedPhotos();

  const updateFilter = useCallback((key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const filteredPhotos = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    const result = allPhotos.filter((photo) => {
      if (selectedCategory && photo.colorCategory !== selectedCategory) return false;
      if (selectedLocation && photo.location.name !== selectedLocation) return false;
      if (selectedCamera && photo.camera !== selectedCamera) return false;
      if (!normalizedQuery) return true;
      const searchable = [
        photo.title,
        photo.location.name,
        photo.camera,
        photo.lens,
        ...photo.tags,
      ].join(" ").toLocaleLowerCase("zh-CN");
      return searchable.includes(normalizedQuery);
    });

    return result.sort((a, b) => {
      if (sort === "oldest") return a.date.localeCompare(b.date);
      if (sort === "title") return a.title.localeCompare(b.title, "zh-CN");
      return b.date.localeCompare(a.date);
    });
  }, [allPhotos, query, selectedCamera, selectedCategory, selectedLocation, sort]);

  const locations = useMemo(
    () => [...new Set(allPhotos.map((photo) => photo.location.name))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [allPhotos],
  );
  const cameras = useMemo(
    () => [...new Set(allPhotos.map((photo) => photo.camera))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [allPhotos],
  );
  const selectedPhoto = selectedPhotoId
    ? allPhotos.find((photo) => photo.id === selectedPhotoId) || null
    : null;
  const selectedIndex = selectedPhoto
    ? filteredPhotos.findIndex((photo) => photo.id === selectedPhoto.id)
    : -1;

  const resetFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  const hasActiveFilters = Boolean(
    selectedCategory || query || selectedLocation || selectedCamera || sort !== "newest",
  );

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 relative">
      <div
        className="fixed inset-0 opacity-10 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 30% 30%, ${selectedCategory ? COLOR_CATEGORY_COLORS[selectedCategory] : "#9F7AEA"} 0%, transparent 50%)` }}
      />
      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex-1 text-center">
            <h1 className="mb-2 text-4xl font-bold">色彩画廊</h1>
            <p className="text-white/60">用色彩重新发现每一张作品 · 共 {allPhotos.length} 张</p>
          </div>
          {LOCAL_STUDIO_ENABLED && (
            <button type="button" onClick={() => setShowAddModal(true)} className="ml-4 flex-shrink-0 rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90">
              + 本地添加
            </button>
          )}
        </div>

        <GalleryFilters
          query={query}
          location={selectedLocation}
          camera={selectedCamera}
          sort={sort}
          locations={locations}
          cameras={cameras}
          onQueryChange={(value) => updateFilter("q", value)}
          onLocationChange={(value) => updateFilter("location", value)}
          onCameraChange={(value) => updateFilter("camera", value)}
          onSortChange={(value) => updateFilter("sort", value === "newest" ? null : value)}
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters}
        />
        <ColorBar selectedCategory={selectedCategory} onSelect={(value) => updateFilter("color", value)} />
        <p className="mb-8 text-center text-sm text-white/40">找到 {filteredPhotos.length} 张照片</p>
        <PhotoGrid photos={filteredPhotos} onPhotoClick={(photo) => setSelectedPhotoId(photo.id)} />
      </div>

      <PhotoModal
        key={selectedPhoto?.id}
        photo={selectedPhoto}
        onClose={() => setSelectedPhotoId(null)}
        onChange={reload}
        allowEditing={LOCAL_STUDIO_ENABLED}
        onPrevious={selectedIndex > 0 ? () => setSelectedPhotoId(filteredPhotos[selectedIndex - 1].id) : undefined}
        onNext={selectedIndex >= 0 && selectedIndex < filteredPhotos.length - 1 ? () => setSelectedPhotoId(filteredPhotos[selectedIndex + 1].id) : undefined}
      />

      {LOCAL_STUDIO_ENABLED && showAddModal && (
        <AddPhotoModal onClose={() => setShowAddModal(false)} onAdd={reload} />
      )}
    </div>
  );
}

export default function GalleryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-24 text-center text-white/50">正在加载画廊…</div>}>
      <GalleryContent />
    </Suspense>
  );
}
