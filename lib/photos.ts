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

/**
 * Get all photos
 */
export function getAllPhotos(): Photo[] {
  return photosData.photos as Photo[];
}

/**
 * Get photo by ID
 */
export function getPhotoById(id: string): Photo | undefined {
  return photosData.photos.find((p) => p.id === id) as Photo | undefined;
}

/**
 * Get photos by color category
 */
export function getPhotosByColor(category: ColorCategory): Photo[] {
  return photosData.photos.filter((p) => p.colorCategory === category) as Photo[];
}

/**
 * Get photos by location name
 */
export function getPhotosByLocation(locationName: string): Photo[] {
  return photosData.photos.filter(
    (p) => p.location.name === locationName
  ) as Photo[];
}

/**
 * Get all unique locations
 */
export function getUniqueLocations(): string[] {
  const locations = new Set(
    photosData.photos.map((p) => (p as Photo).location.name)
  );
  return Array.from(locations);
}

/**
 * Get photos grouped by color category
 */
export function getPhotosGroupedByColor(): Record<ColorCategory, Photo[]> {
  const photos = getAllPhotos();
  const grouped: Partial<Record<ColorCategory, Photo[]>> = {};

  for (const photo of photos) {
    if (!grouped[photo.colorCategory]) {
      grouped[photo.colorCategory] = [];
    }
    grouped[photo.colorCategory]!.push(photo);
  }

  return grouped as Record<ColorCategory, Photo[]>;
}

/**
 * Get photos grouped by location
 */
export function getPhotosGroupedByLocation(): Record<string, Photo[]> {
  const photos = getAllPhotos();
  const grouped: Record<string, Photo[]> = {};

  for (const photo of photos) {
    if (!grouped[photo.location.name]) {
      grouped[photo.location.name] = [];
    }
    grouped[photo.location.name].push(photo);
  }

  return grouped;
}
