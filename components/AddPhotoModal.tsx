"use client";

import { useState, useRef } from "react";
import exifr from "exifr";
import { Photo } from "@/lib/photos";
import { categorizeColor } from "@/lib/colors";
import { savePhotoEdit } from "@/lib/store";

// China city options
const CITY_OPTIONS = [
  { name: "重庆", lat: 29.56, lng: 106.55 },
  { name: "揭阳", lat: 23.55, lng: 116.37 },
  { name: "深圳", lat: 22.54, lng: 114.06 },
  { name: "北京", lat: 39.90, lng: 116.40 },
  { name: "上海", lat: 31.23, lng: 121.47 },
  { name: "广州", lat: 23.13, lng: 113.26 },
  { name: "成都", lat: 30.57, lng: 104.06 },
  { name: "杭州", lat: 30.28, lng: 120.15 },
  { name: "拉萨", lat: 29.65, lng: 91.10 },
  { name: "哈尔滨", lat: 45.80, lng: 126.53 },
  { name: "三亚", lat: 18.25, lng: 109.51 },
  { name: "厦门", lat: 24.48, lng: 118.09 },
  { name: "西安", lat: 34.26, lng: 108.94 },
  { name: "南京", lat: 32.06, lng: 118.80 },
  { name: "武汉", lat: 30.59, lng: 114.31 },
  { name: "昆明", lat: 25.04, lng: 102.70 },
];

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

interface AddPhotoModalProps {
  onClose: () => void;
  onAdd: (photo: Photo) => void;
}

export default function AddPhotoModal({ onClose, onAdd }: AddPhotoModalProps) {
  const [imageUrl, setImageUrl] = useState("");
  const [title, setTitle] = useState("");
  const [city, setCity] = useState(CITY_OPTIONS[0]);
  const [camera, setCamera] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [useUrl, setUseUrl] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [exifLoaded, setExifLoaded] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const extractColor = async (src: string): Promise<string> => {
    let color = "#888888";
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = src;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      if (ctx && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        color = "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
      }
    } catch {}
    return color;
  };

  const parseExif = async (file: File) => {
    try {
      const exif = await exifr.parse(file, {
        pick: ["DateTimeOriginal", "CreateDate", "DateTime", "Make", "Model"],
      });
      if (!exif) { setExifLoaded(true); return; }

      // Date
      const exifDate = exif.DateTimeOriginal || exif.CreateDate || exif.DateTime;
      if (exifDate instanceof Date && !isNaN(exifDate.getTime())) {
        setDate(exifDate.toISOString().slice(0, 10));
      }

      // Camera model
      const make = exif.Make || "";
      const model = exif.Model || "";
      if (model) {
        // Clean up: some cameras store "NIKON CORPORATION" as Make and "NIKON Z30" as Model
        const cleanModel = model.trim();
        setCamera(cleanModel);

        // Auto-generate title from date + model
        const dateStr = exifDate instanceof Date && !isNaN(exifDate.getTime())
          ? exifDate.toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);
        setTitle(`${dateStr} ${cleanModel}`);
      } else {
        // No EXIF camera info — auto-title with date only
        const dateStr = exifDate instanceof Date && !isNaN(exifDate.getTime())
          ? exifDate.toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);
        setTitle(dateStr);
      }
    } catch {
      // EXIF parsing failed, use defaults
      setTitle(new Date().toISOString().slice(0, 10));
    }
    setExifLoaded(true);
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX = 1200;
          let w = img.naturalWidth;
          let h = img.naturalHeight;
          if (w > MAX || h > MAX) {
            if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
            else { w = Math.round(w * MAX / h); h = MAX; }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve(e.target?.result as string); return; }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.onerror = () => resolve(e.target?.result as string);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setError("");
    const compressed = await compressImage(file);
    if (!compressed) { setError("图片读取失败"); return; }
    setImageUrl(compressed);
    parseExif(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleUrlConfirm = () => {
    if (urlInput.trim()) {
      setImageUrl(urlInput.trim());
      setTitle(new Date().toISOString().slice(0, 10));
      setExifLoaded(true);
    }
  };

  const handleAdd = async () => {
    if (!imageUrl || !title.trim()) return;
    setAdding(true);
    setError("");

    const color = await extractColor(imageUrl);
    const id = "new-" + Date.now();
    const newPhoto: Photo = {
      id,
      url: imageUrl,
      thumbnail: imageUrl,
      title,
      date,
      location: city,
      dominantColor: color,
      palette: [color, color, color, color],
      colorCategory: categorizeColor(color),
      camera: camera || "未知",
      lens: "",
      iso: 0,
      aperture: "",
      shutter: "",
      tags: [categorizeColor(color)],
    };

    savePhotoEdit(id, {
      location: city,
      title,
      tags: [categorizeColor(color)],
    });

    try {
      const existing = JSON.parse(localStorage.getItem("custom-photos") || "[]");
      existing.push(newPhoto);
      localStorage.setItem("custom-photos", JSON.stringify(existing));
    } catch (e) {
      setAdding(false);
      setError("保存失败：存储空间可能已满，请删除一些旧照片后重试");
      return;
    }

    onAdd(newPhoto);
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
          <h2 className="text-xl font-bold text-white">添加照片</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Drop zone or preview */}
        {!imageUrl ? (
          <>
            {!useUrl ? (
              <div
                className={`mb-4 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  dragging ? "border-white/60 bg-white/10" : "border-white/20 hover:border-white/40"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                <div className="text-3xl mb-2">📷</div>
                <p className="text-white/60 text-sm">拖拽照片到这里，或点击选择文件</p>
                <p className="text-white/30 text-xs mt-1">支持 JPG、PNG、WebP 等格式</p>
              </div>
            ) : (
              <div className="mb-4">
                <label className="text-xs text-white/40 mb-1 block">图片 URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://你的图床/照片.jpg"
                    className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/30"
                  />
                  <button onClick={handleUrlConfirm} className="px-4 py-2 bg-white/10 rounded-lg text-white/80 text-sm hover:bg-white/20">确认</button>
                </div>
              </div>
            )}
            <button onClick={() => setUseUrl(!useUrl)} className="text-xs text-white/30 hover:text-white/60 mb-4">
              {useUrl ? "← 拖拽上传" : "通过 URL 添加 →"}
            </button>
          </>
        ) : (
          <div className="mb-4">
            <div className="aspect-video rounded-xl overflow-hidden bg-black/50 relative group">
              <img src={imageUrl} alt="preview" className="w-full h-full object-cover" />
              <button
                onClick={() => { setImageUrl(""); setExifLoaded(false); setCamera(""); setTitle(""); }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white/80 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                &times;
              </button>
            </div>
            {imageUrl && !exifLoaded && (
              <p className="text-white/40 text-xs mt-2 text-center">正在读取 EXIF 信息...</p>
            )}
          </div>
        )}

        {/* Title */}
        <div className="mb-4">
          <label className="text-xs text-white/40 mb-1 block">标题 <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="给照片取个名字"
            className="w-full bg-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/30"
          />
        </div>

        {/* Date */}
        <div className="mb-4">
          <label className="text-xs text-white/40 mb-1 block">拍摄日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/30"
          />
        </div>

        {/* City */}
        <div className="mb-4">
          <label className="text-xs text-white/40 mb-2 block">拍摄城市</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {CITY_OPTIONS.map((c) => (
              <button
                key={c.name}
                onClick={() => setCity(c)}
                className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                  city.name === c.name ? "bg-white/20 text-white" : "bg-white/5 text-white/50 hover:bg-white/10"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Camera */}
        <div className="mb-4">
          <label className="text-xs text-white/40 mb-1 block">拍摄设备</label>
          <input
            type="text"
            value={camera}
            onChange={(e) => setCamera(e.target.value)}
            placeholder="选择或输入设备型号"
            className="w-full bg-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/30 mb-2"
          />
          <div className="flex flex-wrap gap-1.5">
            {CAMERA_OPTIONS.map((c) => (
              <button
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

        {error && (
          <p className="text-red-400 text-xs mb-3 text-center">{error}</p>
        )}

        <button
          onClick={handleAdd}
          disabled={adding || !imageUrl || !title.trim()}
          className="w-full py-3 bg-white text-black rounded-full text-sm font-medium hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {adding ? "添加中..." : "添加照片"}
        </button>
      </div>
    </div>
  );
}
