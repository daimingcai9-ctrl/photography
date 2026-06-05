"use client";

import Hero from "@/components/Hero";
import { getAllPhotos } from "@/lib/photos";

export default function Home() {
  const allPhotos = getAllPhotos();

  return (
    <div className="h-screen overflow-y-scroll snap-y snap-mandatory">
      <section className="h-screen snap-start">
        <Hero />
      </section>

      <section className="h-screen snap-start relative overflow-hidden flex items-center justify-center">
        <div className="w-full h-full relative">
          {/* Static background - no animation */}
          <div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse at 30% 30%, rgba(244,63,94,0.12) 0%, transparent 50%), radial-gradient(ellipse at 70% 70%, rgba(139,92,246,0.12) 0%, transparent 50%)",
            }}
          />

          <div className="relative z-10 h-full flex flex-col items-center justify-center px-4">
            <h2 className="text-4xl md:text-5xl font-bold mb-4 text-center">
              精选作品
            </h2>
            <p className="text-white/70 text-lg mb-12 text-center max-w-xl">
              探索色彩与光影的完美融合
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl w-full">
              {allPhotos.slice(0, 4).map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square rounded-xl overflow-hidden group cursor-pointer"
                >
                  <img
                    src={photo.thumbnail}
                    alt={photo.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                    <div>
                      <p className="text-white font-semibold">{photo.title}</p>
                      <p className="text-white/60 text-sm">{photo.location.name}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <a
              href="/gallery"
              className="mt-10 inline-block px-8 py-3 bg-white text-black rounded-full font-medium hover:bg-white/90 transition-colors"
            >
              查看全部作品
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
