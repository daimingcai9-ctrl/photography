import { getAllPhotos } from "@/lib/photos";
import PhotoDetailClient from "./client";

export async function generateStaticParams() {
  return getAllPhotos().map((p) => ({ id: p.id }));
}

export default async function PhotoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PhotoDetailClient id={id} />;
}
