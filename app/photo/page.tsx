"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PhotoDetailClient from "./[id]/client";

function RemotePhoto() {
  const params = useSearchParams();
  return <PhotoDetailClient id={params.get("id") || ""} />;
}
export default function PhotoPage() {
  return <Suspense fallback={<div className="min-h-screen pt-24 text-center text-white/50">正在加载照片…</div>}><RemotePhoto /></Suspense>;
}
