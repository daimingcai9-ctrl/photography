"use client";

export type GallerySort = "newest" | "oldest" | "title";

interface GalleryFiltersProps {
  query: string;
  location: string;
  camera: string;
  sort: GallerySort;
  locations: string[];
  cameras: string[];
  onQueryChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onCameraChange: (value: string) => void;
  onSortChange: (value: GallerySort) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
}

const fieldClass =
  "h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition focus:border-white/30 focus:bg-white/10";

export default function GalleryFilters({
  query,
  location,
  camera,
  sort,
  locations,
  cameras,
  onQueryChange,
  onLocationChange,
  onCameraChange,
  onSortChange,
  onReset,
  hasActiveFilters,
}: GalleryFiltersProps) {
  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-md">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_180px_220px_150px_auto]">
        <label className="relative">
          <span className="sr-only">搜索照片</span>
          <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-white/35" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" strokeWidth="2" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索标题、地点或标签"
            className={`${fieldClass} w-full pl-9`}
          />
        </label>

        <label>
          <span className="sr-only">按地点筛选</span>
          <select value={location} onChange={(event) => onLocationChange(event.target.value)} className={`${fieldClass} w-full`}>
            <option value="">全部地点</option>
            {locations.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <label>
          <span className="sr-only">按设备筛选</span>
          <select value={camera} onChange={(event) => onCameraChange(event.target.value)} className={`${fieldClass} w-full`}>
            <option value="">全部设备</option>
            {cameras.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <label>
          <span className="sr-only">照片排序</span>
          <select value={sort} onChange={(event) => onSortChange(event.target.value as GallerySort)} className={`${fieldClass} w-full`}>
            <option value="newest">最新拍摄</option>
            <option value="oldest">最早拍摄</option>
            <option value="title">标题排序</option>
          </select>
        </label>

        <button type="button" onClick={onReset} disabled={!hasActiveFilters} className="h-11 rounded-xl border border-white/10 px-4 text-sm text-white/60 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30">
          清除
        </button>
      </div>
    </div>
  );
}
