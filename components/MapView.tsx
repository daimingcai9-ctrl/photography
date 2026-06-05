"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Photo } from "@/lib/photos";
import { COLOR_CATEGORY_COLORS, ColorCategory } from "@/lib/colors";

interface MapViewProps {
  photos: Photo[];
  onPhotoClick: (photo: Photo) => void;
}

export default function MapView({ photos, onPhotoClick }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const grouped = useMemo(() => {
    const m: Record<string, Photo[]> = {};
    for (const p of photos) {
      const k = p.location.name || "未知";
      if (!m[k]) m[k] = [];
      m[k].push(p);
    }
    return m;
  }, [photos]);

  // Init map once
  useEffect(() => {
    const c = mapRef.current;
    if (!c || mapInst.current) return;

    let alive = true;

    (async () => {
      const L = (await import("leaflet")).default;
      if (!alive) return;

      // Inject CSS
      if (!document.querySelector("#leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      const map = L.map(c, {
        center: [29.5, 110],
        zoom: 5,
        minZoom: 3,
        maxZoom: 14,
        zoomControl: false,
        attributionControl: false,
      });

      L.control.zoom({ position: "topright" }).addTo(map);

      // Gaode (Amap) tiles - fast in China, no VPN needed
      // Primary: Gaode normal map
      L.tileLayer("https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}", {
        subdomains: ["1", "2", "3", "4"],
        maxZoom: 18,
      }).addTo(map);

      map.whenReady(() => setMapReady(true));

      mapInst.current = map;
    })();

    // Photo click from popup
    const h = (e: Event) => {
      const id = (e as CustomEvent).detail;
      const p = photos.find((x) => x.id === id);
      if (p) onPhotoClick(p);
    };
    window.addEventListener("map-photo", h);

    return () => {
      alive = false;
      window.removeEventListener("map-photo", h);
    };
  }, [photos, onPhotoClick]);

  // Add/refresh markers whenever grouped changes
  useEffect(() => {
    const map = mapInst.current;
    if (!map || !mapReady) return;

    // Clear old markers
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    import("leaflet").then(({ default: L }) => {
      Object.entries(grouped).forEach(([name, locPhotos]) => {
        const { lat, lng } = locPhotos[0].location;
        if (lat === 0 && lng === 0) return;

        const color = COLOR_CATEGORY_COLORS[locPhotos[0].colorCategory as ColorCategory];
        const count = locPhotos.length;

        // Marker: one thumbnail + count badge
        const thumb = locPhotos[0].thumbnail;
        let iconHtml: string;
        let iconSize: [number, number];
        let iconAnchor: [number, number];

        if (count === 1) {
          iconHtml = `<div style="width:36px;height:36px;border-radius:50%;overflow:hidden;border:3px solid #fff;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.4)"><img src="${thumb}" style="width:100%;height:100%;object-fit:cover" /></div>`;
          iconSize = [36, 36];
          iconAnchor = [18, 18];
        } else {
          iconHtml = `
            <div style="position:relative;width:40px;height:40px;cursor:pointer">
              <img src="${thumb}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:block" />
              <div style="position:absolute;bottom:-2px;right:-2px;width:20px;height:20px;border-radius:50%;background:${color};border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,0.3)">${count}</div>
            </div>`;
          iconSize = [46, 46];
          iconAnchor = [23, 23];
        }

        const icon = new L.DivIcon({ iconSize, iconAnchor, html: iconHtml, className: "" });

        const thumbsHtml = locPhotos.map((p) =>
          `<div style="flex-shrink:0;text-align:center;cursor:pointer" onclick="window.dispatchEvent(new CustomEvent('map-photo',{detail:'${p.id}'}))"><img src="${p.thumbnail}" style="width:58px;height:46px;object-fit:cover;border-radius:6px;display:block" /><span style="color:rgba(255,255,255,0.5);font-size:9px;display:block;max-width:58px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px">${p.title}</span></div>`
        ).join("");

        const popup = L.popup({ closeButton: false, className: "dark-popup", maxWidth: 320 })
          .setContent(`<div style="padding:8px;min-width:200px;background:rgba(0,0,0,0.95);border-radius:12px"><div style="color:#fff;font-size:14px;font-weight:600;margin-bottom:2px">${name}</div><div style="color:rgba(255,255,255,0.35);font-size:11px;margin-bottom:8px">${count} 张</div><div style="display:flex;gap:4px;overflow-x:auto;padding-bottom:2px">${thumbsHtml}</div></div>`);

        const marker = new L.Marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(popup)
          .on("click", () => setSelectedLoc(name));

        markersRef.current.push(marker);
      });
    });
  }, [grouped, mapReady]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="absolute inset-0" style={{ background: "#f5f0e8" }} />

      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-20">
          <div className="text-white/40 text-sm">加载地图...</div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-4 left-4 z-[1000] bg-black/70 rounded-xl p-3 max-h-[60vh] overflow-y-auto" suppressHydrationWarning>
        <p className="text-xs text-white/40 mb-2 font-medium">拍摄地点</p>
        {Object.entries(grouped).map(([loc, phs]) => (
          <div key={loc} className="flex items-center gap-2 py-0.5 cursor-pointer hover:opacity-80"
            onClick={() => {
              if (mapInst.current && mapReady) mapInst.current.setView([phs[0].location.lat, phs[0].location.lng], 8, { animate: true });
              setSelectedLoc(loc);
            }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLOR_CATEGORY_COLORS[phs[0].colorCategory as ColorCategory] }} />
            <span className="text-xs text-white/70">{loc}</span>
            <span className="text-xs text-white/30">({phs.length})</span>
          </div>
        ))}
      </div>

      {/* Photo strip */}
      {selectedLoc && grouped[selectedLoc] && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-black/90 rounded-2xl p-4 max-w-2xl w-[95%]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-white font-bold text-lg">{selectedLoc}</span>
              <span className="text-white/40 text-sm ml-2">{grouped[selectedLoc].length} 张</span>
            </div>
            <button onClick={() => setSelectedLoc(null)} className="text-white/40 hover:text-white text-xl leading-none">&times;</button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2" onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; }}>
            {grouped[selectedLoc].map((p) => (
              <div key={p.id} className="flex-shrink-0 w-24 cursor-pointer group" onClick={() => onPhotoClick(p)}>
                <div className="w-24 h-20 rounded-xl overflow-hidden mb-1">
                  <img src={p.thumbnail} alt={p.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" loading="lazy" />
                </div>
                <p className="text-white/80 text-xs text-center truncate">{p.title}</p>
              </div>
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
