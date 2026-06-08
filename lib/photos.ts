import { ColorCategory } from "./colors";
import photosData from "@/data/photos.json";

export interface Photo {
  id: string;
  url: string;
  thumbnail: string;
  title: string;
  date: string;
  location: {
    name: string;
    lat: number;
    lng: number;
  };
  dominantColor: string;
  palette: string[];
  colorCategory: ColorCategory;
  camera: string;
  lens: string;
  iso: number;
  aperture: string;
  shutter: string;
  tags: string[];
}

/** Read custom photos from localStorage */
function getCustomPhotos(): Photo[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("custom-photos") || "[]");
  } catch {
    return [];
  }
}

/**
 * Get all photos — static photos.json + custom photos from localStorage.
 * Deduplicates by id so the same photo is never returned twice.
 */
export function getAllPhotos(): Photo[] {
  const base = photosData.photos as Photo[];
  const custom = getCustomPhotos();
  if (custom.length === 0) return base;
  const seen = new Set(base.map((p) => p.id));
  return [...base, ...custom.filter((p) => !seen.has(p.id))];
}

/**
 * Get photo by ID
 */
export function getPhotoById(id: string): Photo | undefined {
  return getAllPhotos().find((p) => p.id === id);
}

/**
 * Get photos by color category
 */
export function getPhotosByColor(category: ColorCategory): Photo[] {
  return getAllPhotos().filter((p) => p.colorCategory === category);
}

/**
 * Get photos by location name
 */
export function getPhotosByLocation(locationName: string): Photo[] {
  return getAllPhotos().filter((p) => p.location.name === locationName);
}

/**
 * Get all unique locations
 */
export function getUniqueLocations(): string[] {
  return [...new Set(getAllPhotos().map((p) => p.location.name))];
}

/**
 * Get photos grouped by color category
 */
export function getPhotosGroupedByColor(): Record<ColorCategory, Photo[]> {
  const grouped: Partial<Record<ColorCategory, Photo[]>> = {};
  for (const photo of getAllPhotos()) {
    if (!grouped[photo.colorCategory]) grouped[photo.colorCategory] = [];
    grouped[photo.colorCategory]!.push(photo);
  }
  return grouped as Record<ColorCategory, Photo[]>;
}

/**
 * Get photos grouped by location
 */
export function getPhotosGroupedByLocation(): Record<string, Photo[]> {
  const grouped: Record<string, Photo[]> = {};
  for (const photo of getAllPhotos()) {
    if (!grouped[photo.location.name]) grouped[photo.location.name] = [];
    grouped[photo.location.name].push(photo);
  }
  return grouped;
}
