"use client";

import { useState } from "react";
import { Photo } from "@/lib/photos";
import { savePhotoEdit } from "@/lib/store";

// Common Chinese cities with coordinates
const CITY_SUGGESTIONS = [
  { name: "重庆", lat: 29.56, lng: 106.55 },
  { name: "揭阳", lat: 23.55, lng: 116.37 },
  { name: "深圳", lat: 22.54, lng: 114.06 },
  { name: "北京", lat: 39.90, lng: 116.40 },
  { name: "上海", lat: 31.23, lng: 121.47 },
  { name: "广州", lat: 23.13, lng: 113.26 },
  { name: "杭州", lat: 30.28, lng: 120.15 },
  { name: "成都", lat: 30.57, lng: 104.06 },
  { name: "昆明", lat: 25.04, lng: 102.70 },
  { name: "拉萨", lat: 29.65, lng: 91.10 },
  { name: "哈尔滨", lat: 45.80, lng: 126.53 },
  { name: "三亚", lat: 18.25, lng: 109.51 },
  { name: "厦门", lat: 24.48, lng: 118.09 },
  { name: "大理", lat: 25.59, lng: 100.22 },
  { name: "西安", lat: 34.26, lng: 108.94 },
  { name: "南京", lat: 32.06, lng: 118.80 },
  { name: "武汉", lat: 30.59, lng: 114.31 },
  { name: "长沙", lat: 28.23, lng: 112.93 },
  { name: "郑州", lat: 34.75, lng: 113.62 },
  { name: "青岛", lat: 36.07, lng: 120.38 },
];

interface EditPanelProps {
  photo: Photo;
  onClose: () => void;
  onChange: () => void;
}

export default function EditPanel({ photo, onClose, onChange }: EditPanelProps) {
  const [locationName, setLocationName] = useState(photo.location.name || "");
  const [lat, setLat] = useState(String(photo.location.lat || 0));
  const [lng, setLng] = useState(String(photo.location.lng || 0));
  const [title, setTitle] = useState(photo.title);
  const [saved, setSaved] = useState(false);

  const handleSelectCity = (city: typeof CITY_SUGGESTIONS[number]) => {
    setLocationName(city.name);
    setLat(String(city.lat));
    setLng(String(city.lng));
  };

  const handleSave = () => {
    savePhotoEdit(photo.id, {
      location: {
        name: locationName,
        lat: parseFloat(lat) || 0,
        lng: parseFloat(lng) || 0,
      },
      title,
    });
    setSaved(true);
    onChange();
    setTimeout(() => setSaved(false), 1500);
  };

  const handleDelete = () => {
    try {
      const edits = JSON.parse(localStorage.getItem("photo-edits") || "{}");
      delete edits[photo.id];
      localStorage.setItem("photo-edits", JSON.stringify(edits));
    } catch {}
    onChange();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80" />

      <div
        className="relative w-full max-w-md bg-zinc-900 rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">编辑照片信息</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Preview */}
        <div className="aspect-video rounded-xl overflow-hidden mb-4">
          <img src={photo.thumbnail} alt={photo.title} className="w-full h-full object-cover" />
        </div>

        {/* Title */}
        <div className="mb-4">
          <label className="text-xs text-white/40 mb-1 block">标题</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/30"
          />
        </div>

        {/* City quick select */}
        <div className="mb-4">
          <label className="text-xs text-white/40 mb-2 block">快速选择城市</label>
          <div className="flex flex-wrap gap-1.5">
            {CITY_SUGGESTIONS.map((city) => (
              <button
                key={city.name}
                onClick={() => handleSelectCity(city)}
                className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                  locationName === city.name
                    ? "bg-white/20 text-white"
                    : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80"
                }`}
              >
                {city.name}
              </button>
            ))}
          </div>
        </div>

        {/* Location name */}
        <div className="mb-4">
          <label className="text-xs text-white/40 mb-1 block">地点名称</label>
          <input
            type="text"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            placeholder="例如：重庆解放碑"
            className="w-full bg-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/30"
          />
        </div>

        {/* Coordinates */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div>
            <label className="text-xs text-white/40 mb-1 block">纬度 (Lat)</label>
            <input
              type="number"
              step="0.01"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="w-full bg-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/30 font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-white/40 mb-1 block">经度 (Lng)</label>
            <input
              type="number"
              step="0.01"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="w-full bg-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/30 font-mono"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 bg-white text-black rounded-full text-sm font-medium hover:bg-white/90 transition-colors"
          >
            {saved ? "✓ 已保存" : "保存"}
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2.5 bg-red-500/20 text-red-400 rounded-full text-sm hover:bg-red-500/30 transition-colors"
          >
            重置
          </button>
        </div>
      </div>
    </div>
  );
}
