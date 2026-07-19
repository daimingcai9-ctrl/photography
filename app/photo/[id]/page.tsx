import type { Metadata } from "next";
import { getAllPhotos, getPhotoById } from "@/lib/photos";
import PhotoDetailClient from "./client";

export async function generateStaticParams() {
  return getAllPhotos().map((p) => ({ id: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const photo = getPhotoById(id);
  if (!photo) return { title: "照片未找到" };

  const description = `${photo.title}，拍摄于${photo.location.name}，${photo.date}`;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const imageUrl = siteUrl ? new URL(photo.url, siteUrl).toString() : undefined;
  return {
    title: photo.title,
    description,
    openGraph: {
      type: "article",
      title: photo.title,
      description,
      images: imageUrl ? [{ url: imageUrl, alt: photo.title }] : undefined,
    },
  };
}

export default async function PhotoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PhotoDetailClient id={id} />;
}
