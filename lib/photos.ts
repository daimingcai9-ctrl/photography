import photosData from "@/data/photos.json";
import type { ColorCategory } from "./colors";
import { validatePhoto, type Photo } from "./photo-schema";
export type { Photo } from "./photo-schema";

export function getAllPhotos(): Photo[] {
  return photosData.photos.map((photo) => validatePhoto(photo));
}
export function getPhotoById(id: string) { return getAllPhotos().find((p) => p.id === id); }
export function getPhotosByColor(category: ColorCategory) { return getAllPhotos().filter((p) => p.colorCategory === category); }
export function getPhotosByLocation(name: string) { return getAllPhotos().filter((p) => p.location.name === name); }
export function getUniqueLocations() { return [...new Set(getAllPhotos().map((p) => p.location.name))]; }
export function getPhotosGroupedByColor(): Partial<Record<ColorCategory, Photo[]>> {
  const result: Partial<Record<ColorCategory, Photo[]>> = {};
  for (const photo of getAllPhotos()) (result[photo.colorCategory] ||= []).push(photo);
  return result;
}
export function getPhotosGroupedByLocation(): Record<string, Photo[]> {
  const result: Record<string, Photo[]> = Object.create(null);
  for (const photo of getAllPhotos()) (result[photo.location.name] ||= []).push(photo);
  return result;
}
export function photoHref(photo: Photo): string {
  return photo.source === "remote" || photo.source === "draft"
    ? `/photo?id=${encodeURIComponent(photo.id)}`
    : `/photo/${encodeURIComponent(photo.id)}`;
}
