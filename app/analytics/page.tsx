"use client";

import { getAllPhotos } from "@/lib/photos";
import {
  MonthlyChart,
  SeasonChart,
  ColorChart,
  LocationChart,
  CameraChart,
} from "@/components/Charts";

export default function AnalyticsPage() {
  const allPhotos = getAllPhotos();

  const uniqueLocations = new Set(allPhotos.map((p) => p.location.name)).size;
  const uniqueCameras = new Set(allPhotos.map((p) => p.camera)).size;
  const uniqueColors = new Set(allPhotos.map((p) => p.colorCategory)).size;

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 relative">
      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">数据分析</h1>
          <p className="text-white/60">深入了解你的摄影习惯与偏好</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <div className="bg-white/5 rounded-xl p-6 text-center">
            <p className="text-4xl font-bold text-blue-400">{allPhotos.length}</p>
            <p className="text-white/60 text-sm mt-1">总照片数</p>
          </div>
          <div className="bg-white/5 rounded-xl p-6 text-center">
            <p className="text-4xl font-bold text-green-400">{uniqueLocations}</p>
            <p className="text-white/60 text-sm mt-1">拍摄地点</p>
          </div>
          <div className="bg-white/5 rounded-xl p-6 text-center">
            <p className="text-4xl font-bold text-purple-400">{uniqueCameras}</p>
            <p className="text-white/60 text-sm mt-1">使用设备</p>
          </div>
          <div className="bg-white/5 rounded-xl p-6 text-center">
            <p className="text-4xl font-bold text-pink-400">{uniqueColors}</p>
            <p className="text-white/60 text-sm mt-1">色彩种类</p>
          </div>
        </div>

        {/* Charts grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MonthlyChart />
          <SeasonChart />
          <ColorChart />
          <LocationChart />
          <div className="lg:col-span-2">
            <CameraChart />
          </div>
        </div>
      </div>
    </div>
  );
}
