"use client";

import { Photo } from "@/lib/photos";
import { COLOR_CATEGORY_COLORS, ColorCategory } from "@/lib/colors";

export default function Hero({ photos }: { photos: Photo[] }) {
  const uniqueColors = [...new Set(photos.map((p) => p.colorCategory))];
  const colors = uniqueColors.map((cat) => COLOR_CATEGORY_COLORS[cat as ColorCategory]);

  const c1 = colors[0] || "#E53E3E";
  const c2 = colors[1] || "#9F7AEA";

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* Static gradient background - no animation */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 30% 40%, ${c1}44 0%, transparent 60%), radial-gradient(ellipse at 70% 60%, ${c2}44 0%, transparent 60%)`,
        }}
      />

      <div className="absolute inset-0 bg-black/40" />

      <div className="relative z-10 flex flex-col items-center justify-center h-full text-white px-4">
        <h1 className="text-6xl md:text-8xl font-bold mb-6 text-center animate-fadeIn">
          光影视界
        </h1>

        <p className="text-xl md:text-2xl text-white/80 mb-12 text-center max-w-2xl animate-fadeIn animate-delay-200">
          用色彩定义每一帧，用镜头记录每一刻
        </p>

        <div className="absolute bottom-10 animate-fadeIn animate-delay-600">
          <div className="flex flex-col items-center">
            <span className="text-sm text-white/50 mb-2">向下滚动</span>
            <svg className="w-6 h-6 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
