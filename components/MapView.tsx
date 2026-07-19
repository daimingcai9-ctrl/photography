"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import { Photo } from "@/lib/photos";
import { COLOR_CATEGORY_COLORS, ColorCategory } from "@/lib/colors";

interface MapViewProps {
  photos: Photo[];
  onPhotoClick: (photo: Photo) => void;
}

function makeImage(src: string, alt: string, cssText: string) {
  const image = document.createElement("img");
  image.src = src;
  image.alt = alt;
  image.style.cssText = cssText;
  return image;
}

export default function MapView({ photos, onPhotoClick }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletMarker[]>([]);
  const onPhotoClickRef = useRef(onPhotoClick);
  const [selectedLoc, setSelectedLoc] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const grouped = useMemo(() => {
    const result: Record<string, Photo[]> = {};
    for (const photo of photos) {
      const key = photo.location.name || "未知";
      if (!result[key]) result[key] = [];
      result[key].push(photo);
    }
    return result;
  }, [photos]);

  useEffect(() => {
    onPhotoClickRef.current = onPhotoClick;
  }, [onPhotoClick]);

  useEffect(() => {
    const container = mapRef.current;
    if (!container || mapInst.current) return;
    let alive = true;

    void import("leaflet").then(({ default: L }) => {
      if (!alive) return;
      const map = L.map(container, {
        center: [29.5, 110],
        zoom: 5,
        minZoom: 3,
        maxZoom: 14,
        zoomControl: false,
        attributionControl: false,
      });
      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer("https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}", {
        subdomains: ["1", "2", "3", "4"],
        maxZoom: 18,
      }).addTo(map);
      map.whenReady(() => {
        if (alive) setMapReady(true);
      });
      mapInst.current = map;
    });

    return () => {
      alive = false;
      markersRef.current = [];
      mapInst.current?.remove();
      mapInst.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInst.current;
    if (!map || !mapReady) return;
    let alive = true;

    markersRef.current.forEach((marker) => map.removeLayer(marker));
    markersRef.current = [];

    void import("leaflet").then(({ default: L }) => {
      if (!alive) return;
      Object.entries(grouped).forEach(([name, locationPhotos]) => {
        const { lat, lng } = locationPhotos[0].location;
        if (lat === 0 && lng === 0) return;

        const color = COLOR_CATEGORY_COLORS[locationPhotos[0].colorCategory as ColorCategory];
        const count = locationPhotos.length;
        const markerRoot = document.createElement("div");
        markerRoot.style.cssText = `position:relative;width:${count === 1 ? 36 : 40}px;height:${count === 1 ? 36 : 40}px;cursor:pointer`;
        markerRoot.appendChild(makeImage(
          locationPhotos[0].thumbnail,
          "",
          "width:100%;height:100%;border-radius:50%;object-fit:cover;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);display:block",
        ));

        if (count > 1) {
          const badge = document.createElement("span");
          badge.textContent = String(count);
          badge.style.cssText = `position:absolute;bottom:-2px;right:-2px;width:20px;height:20px;border-radius:50%;background:${color};border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.3)`;
          markerRoot.appendChild(badge);
        }

        const size = count === 1 ? 36 : 46;
        const icon = new L.DivIcon({
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          html: markerRoot,
          className: "",
        });

        const popupRoot = document.createElement("div");
        popupRoot.style.cssText = "padding:8px;min-width:200px;background:rgba(0,0,0,.95);border-radius:12px";
        const title = document.createElement("div");
        title.textContent = name;
        title.style.cssText = "color:#fff;font-size:14px;font-weight:600;margin-bottom:2px";
        const summary = document.createElement("div");
        summary.textContent = `${count} 张`;
        summary.style.cssText = "color:rgba(255,255,255,.35);font-size:11px;margin-bottom:8px";
        const strip = document.createElement("div");
        strip.style.cssText = "display:flex;gap:4px;overflow-x:auto;padding-bottom:2px";

        locationPhotos.forEach((photo) => {
          const button = document.createElement("button");
          button.type = "button";
          button.setAttribute("aria-label", `查看照片：${photo.title}`);
          button.style.cssText = "flex-shrink:0;text-align:center;cursor:pointer;background:none;border:0;padding:0";
          button.appendChild(makeImage(photo.thumbnail, photo.title, "width:58px;height:46px;object-fit:cover;border-radius:6px;display:block"));
          const label = document.createElement("span");
          label.textContent = photo.title;
          label.style.cssText = "color:rgba(255,255,255,.5);font-size:9px;display:block;max-width:58px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px";
          button.appendChild(label);
          button.addEventListener("click", () => onPhotoClickRef.current(photo));
          strip.appendChild(button);
        });

        popupRoot.append(title, summary, strip);
        const popup = L.popup({ closeButton: false, className: "dark-popup", maxWidth: 320 }).setContent(popupRoot);
        const marker = L.marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(popup)
          .on("click", () => setSelectedLoc(name));
        markersRef.current.push(marker);
      });
    });

    return () => {
      alive = false;
    };
  }, [grouped, mapReady]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} aria-label="照片拍摄地点地图" className="absolute inset-0" style={{ background: "#f5f0e8" }} />

      {!mapReady && <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/80"><div className="text-sm text-white/40">加载地图...</div></div>}

      <div className="absolute left-4 top-4 z-[1000] max-h-[60vh] overflow-y-auto rounded-xl bg-black/70 p-3" suppressHydrationWarning>
        <p className="mb-2 text-xs font-medium text-white/40">拍摄地点</p>
        {Object.entries(grouped).map(([location, locationPhotos]) => (
          <button
            type="button"
            key={location}
            className="flex w-full items-center gap-2 py-0.5 text-left hover:opacity-80"
            onClick={() => {
              const { lat, lng } = locationPhotos[0].location;
              if (mapInst.current && mapReady && (lat !== 0 || lng !== 0)) mapInst.current.setView([lat, lng], 8, { animate: true });
              setSelectedLoc(location);
            }}
          >
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: COLOR_CATEGORY_COLORS[locationPhotos[0].colorCategory as ColorCategory] }} />
            <span className="text-xs text-white/70">{location}</span>
            <span className="text-xs text-white/30">({locationPhotos.length})</span>
          </button>
        ))}
      </div>

      {selectedLoc && grouped[selectedLoc] && (
        <div className="absolute bottom-4 left-1/2 z-[1000] w-[95%] max-w-2xl -translate-x-1/2 rounded-2xl bg-black/90 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div><span className="text-lg font-bold text-white">{selectedLoc}</span><span className="ml-2 text-sm text-white/40">{grouped[selectedLoc].length} 张</span></div>
            <button type="button" onClick={() => setSelectedLoc(null)} aria-label="关闭地点照片列表" className="text-xl leading-none text-white/40 hover:text-white">&times;</button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2" onWheel={(event) => { event.currentTarget.scrollLeft += event.deltaY; }}>
            {grouped[selectedLoc].map((photo) => (
              <button type="button" key={photo.id} className="group w-24 flex-shrink-0 cursor-pointer" onClick={() => onPhotoClickRef.current(photo)}>
                <span className="mb-1 block h-20 w-24 overflow-hidden rounded-xl"><img src={photo.thumbnail} alt={photo.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110" loading="lazy" /></span>
                <span className="block truncate text-center text-xs text-white/80">{photo.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .dark-popup .leaflet-popup-content-wrapper { background: transparent !important; box-shadow: none !important; padding: 0 !important; border-radius: 12px !important; }
        .dark-popup .leaflet-popup-content { margin: 0 !important; }
        .dark-popup .leaflet-popup-tip { background: rgba(0,0,0,0.95) !important; }
        .leaflet-container { background: #f5f0e8 !important; }
      `}</style>
    </div>
  );
}
