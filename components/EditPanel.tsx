"use client";

import { useRef, useState } from "react";
import { Photo } from "@/lib/photos";
import { deletePhoto, savePhotoEdit } from "@/lib/store";
import { useDialog } from "@/lib/dialog";

// Common camera models
const CAMERA_OPTIONS = [
  { label: "Nikon Z30", value: "NIKON Z30" },
  { label: "Nikon Z50", value: "NIKON Z50" },
  { label: "Nikon Z5", value: "NIKON Z5" },
  { label: "Nikon Z6 III", value: "NIKON Z6III" },
  { label: "Nikon Zf", value: "NIKON Zf" },
  { label: "Xiaomi 15", value: "Xiaomi 15" },
  { label: "Xiaomi 15 Pro", value: "Xiaomi 15 Pro" },
  { label: "Xiaomi 14", value: "Xiaomi 14" },
  { label: "Sony A7M4", value: "ILCE-7M4" },
  { label: "Sony A7C II", value: "ILCE-7CM2" },
  { label: "Canon R6 II", value: "Canon EOS R6 Mark II" },
  { label: "Canon R50", value: "Canon EOS R50" },
  { label: "Fuji X-T5", value: "X-T5" },
  { label: "Fuji X100VI", value: "X100VI" },
  { label: "iPhone 16 Pro", value: "iPhone 16 Pro" },
  { label: "iPhone 15 Pro", value: "iPhone 15 Pro" },
];

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
  const [camera, setCamera] = useState(photo.camera || "");
  const [date, setDate] = useState(photo.date);
  const [tags, setTags] = useState(photo.tags.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, true, () => { if (!busy) onClose(); });

  const handleSelectCity = (city: typeof CITY_SUGGESTIONS[number]) => {
    setLocationName(city.name);
    setLat(String(city.lat));
    setLng(String(city.lng));
  };

  const handleSave = async () => {
    setBusy(true); setError("");
    try { await savePhotoEdit(photo.id, {
      location: {
        name: locationName,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
      },
      title,
      camera: camera || "未知",
      date,
      tags: tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    });
    onChange();
    onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); }
    finally { setBusy(false); }
  };

  const handleReset = () => {
    setLocationName(photo.location.name); setLat(String(photo.location.lat)); setLng(String(photo.location.lng));
    setTitle(photo.title); setCamera(photo.camera); setDate(photo.date); setTags(photo.tags.join(", ")); setError("");
  };

  const handleDelete = async () => {
    if (!confirm("确定从公开相册删除这张照片吗？云端上传的图片也会被删除。")) return;
    setBusy(true); setError("");
    try { await deletePhoto(photo.id);
    onChange();
    onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "删除失败"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" onClick={() => { if (!busy) onClose(); }}>
      <div className="absolute inset-0 bg-black/80" />

      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-photo-title"
        className="relative w-full max-w-md bg-zinc-900 rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 id="edit-photo-title" className="text-xl font-bold text-white">编辑照片信息</h2>
          <button type="button" disabled={busy} onClick={onClose} aria-label="关闭编辑面板" className="text-white/40 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Preview */}
        <div className="aspect-video rounded-xl overflow-hidden mb-4">
          <img src={photo.thumbnail} alt={`${photo.date} · ${photo.location.name}`} className="w-full h-full object-cover" />
        </div>

        <div className="mb-4">
          <label htmlFor="edit-photo-date" className="mb-1 block text-xs text-white/40">拍摄日期</label>
          <input id="edit-photo-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white" />
        </div>
        <div className="mb-4">
          <label htmlFor="edit-photo-tags" className="mb-1 block text-xs text-white/40">标签（逗号分隔）</label>
          <input id="edit-photo-tags" value={tags} onChange={(e) => setTags(e.target.value)} className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white" />
        </div>
        {/* Camera */}
        <div className="mb-4">
          <label htmlFor="edit-photo-camera" className="text-xs text-white/40 mb-1 block">拍摄设备</label>
          <input
            id="edit-photo-camera"
            type="text"
            value={camera}
            onChange={(e) => setCamera(e.target.value)}
            placeholder="选择或输入设备型号"
            className="w-full bg-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/30 mb-2"
          />
          <div className="flex flex-wrap gap-1.5">
            {CAMERA_OPTIONS.map((c) => (
              <button
                type="button"
                key={c.value}
                onClick={() => setCamera(c.value)}
                className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                  camera === c.value ? "bg-white/20 text-white" : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* City quick select */}
        <div className="mb-4">
          <label className="text-xs text-white/40 mb-2 block">快速选择城市</label>
          <div className="flex flex-wrap gap-1.5">
            {CITY_SUGGESTIONS.map((city) => (
              <button
                type="button"
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
          <label htmlFor="edit-photo-location" className="text-xs text-white/40 mb-1 block">地点名称</label>
          <input
            id="edit-photo-location"
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
            <label htmlFor="edit-photo-lat" className="text-xs text-white/40 mb-1 block">纬度 (Lat)</label>
            <input
              id="edit-photo-lat"
              type="number"
              step="0.01"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="w-full bg-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/30 font-mono"
            />
          </div>
          <div>
            <label htmlFor="edit-photo-lng" className="text-xs text-white/40 mb-1 block">经度 (Lng)</label>
            <input
              id="edit-photo-lng"
              type="number"
              step="0.01"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="w-full bg-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/30 font-mono"
            />
          </div>
        </div>

        {error && <p role="alert" className="mb-4 text-sm text-red-300">{error}</p>}
        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSave()}
            className="flex-1 py-2.5 bg-white text-black rounded-full text-sm font-medium hover:bg-white/90 transition-colors"
          >
            {busy ? "正在保存…" : "保存并同步"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={busy}
            className="px-4 py-2.5 bg-white/10 text-white/60 rounded-full text-sm hover:bg-white/20 transition-colors"
          >
            撤销输入
          </button>
          {(
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDelete()}
              className="px-4 py-2.5 bg-red-500/20 text-red-400 rounded-full text-sm hover:bg-red-500/30 transition-colors"
            >
              删除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
