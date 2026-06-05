import { Photo } from "./photos";
import { ColorCategory, COLOR_CATEGORY_NAMES } from "./colors";

/**
 * Get photo count by month
 */
export function getPhotosByMonth(photos: Photo[]): { month: string; count: number }[] {
  const monthMap = new Map<string, number>();

  for (const photo of photos) {
    const date = new Date(photo.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + 1);
  }

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));
}

/**
 * Get photo count by season
 */
export function getPhotosBySeason(photos: Photo[]): { season: string; count: number }[] {
  const seasonMap = new Map<string, number>();

  for (const photo of photos) {
    const date = new Date(photo.date);
    const month = date.getMonth() + 1;
    let season: string;

    if (month >= 3 && month <= 5) season = "春季";
    else if (month >= 6 && month <= 8) season = "夏季";
    else if (month >= 9 && month <= 11) season = "秋季";
    else season = "冬季";

    seasonMap.set(season, (seasonMap.get(season) || 0) + 1);
  }

  return Array.from(seasonMap.entries()).map(([season, count]) => ({
    season,
    count,
  }));
}

/**
 * Get color distribution
 */
export function getColorDistribution(
  photos: Photo[]
): { category: ColorCategory; name: string; count: number }[] {
  const colorMap = new Map<ColorCategory, number>();

  for (const photo of photos) {
    colorMap.set(photo.colorCategory, (colorMap.get(photo.colorCategory) || 0) + 1);
  }

  return Array.from(colorMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([category, count]) => ({
      category,
      name: COLOR_CATEGORY_NAMES[category],
      count,
    }));
}

/**
 * Get location statistics
 */
export function getLocationStats(
  photos: Photo[]
): { location: string; count: number }[] {
  const locationMap = new Map<string, number>();

  for (const photo of photos) {
    locationMap.set(
      photo.location.name,
      (locationMap.get(photo.location.name) || 0) + 1
    );
  }

  return Array.from(locationMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([location, count]) => ({ location, count }));
}

/**
 * Get camera usage statistics
 */
export function getCameraStats(
  photos: Photo[]
): { camera: string; count: number }[] {
  const cameraMap = new Map<string, number>();

  for (const photo of photos) {
    cameraMap.set(photo.camera, (cameraMap.get(photo.camera) || 0) + 1);
  }

  return Array.from(cameraMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([camera, count]) => ({ camera, count }));
}
