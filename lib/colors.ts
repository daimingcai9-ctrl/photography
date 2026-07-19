export type ColorCategory =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "cyan"
  | "blue"
  | "purple"
  | "pink"
  | "brown"
  | "gray"
  | "black"
  | "white";

export interface ColorInfo {
  hex: string;
  h: number;
  s: number;
  l: number;
}

// 12 color categories with their HSL ranges
const COLOR_CATEGORIES: Record<ColorCategory, { h: [number, number]; s: number; l: number }> = {
  red: { h: [345, 15], s: 50, l: 50 },
  orange: { h: [15, 45], s: 50, l: 50 },
  yellow: { h: [45, 75], s: 50, l: 50 },
  green: { h: [75, 165], s: 50, l: 50 },
  cyan: { h: [165, 195], s: 50, l: 50 },
  blue: { h: [195, 255], s: 50, l: 50 },
  purple: { h: [255, 285], s: 50, l: 50 },
  pink: { h: [285, 345], s: 50, l: 50 },
  brown: { h: [15, 45], s: 30, l: 35 },
  gray: { h: [0, 360], s: 10, l: 50 },
  black: { h: [0, 360], s: 0, l: 15 },
  white: { h: [0, 360], s: 0, l: 90 },
};

// Color category display names in Chinese
export const COLOR_CATEGORY_NAMES: Record<ColorCategory, string> = {
  red: "红",
  orange: "橙",
  yellow: "黄",
  green: "绿",
  cyan: "青",
  blue: "蓝",
  purple: "紫",
  pink: "粉",
  brown: "棕",
  gray: "灰",
  black: "黑",
  white: "白",
};

// Color category representative colors
export const COLOR_CATEGORY_COLORS: Record<ColorCategory, string> = {
  red: "#E53E3E",
  orange: "#ED8936",
  yellow: "#ECC94B",
  green: "#48BB78",
  cyan: "#0BC5EA",
  blue: "#4299E1",
  purple: "#9F7AEA",
  pink: "#ED64A6",
  brown: "#A0522D",
  gray: "#A0AEC0",
  black: "#1A202C",
  white: "#F7FAFC",
};

/**
 * Parse hex color to RGB values
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(
  r: number,
  g: number,
  b: number
): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Get color info from hex
 */
export function getColorInfo(hex: string): ColorInfo {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  return { hex, h, s, l };
}

/**
 * Categorize a color into one of 12 categories
 */
export function categorizeColor(hex: string): ColorCategory {
  const { h, s, l } = getColorInfo(hex);

  // Handle grayscale colors first
  if (s < 10) {
    if (l < 20) return "black";
    if (l > 80) return "white";
    return "gray";
  }

  // Handle brown (low saturation orange)
  if (h >= 15 && h < 45 && s < 50 && l < 50) {
    return "brown";
  }

  // Handle other colors based on hue
  for (const [category, range] of Object.entries(COLOR_CATEGORIES)) {
    if (category === "brown" || category === "gray" || category === "black" || category === "white") {
      continue;
    }

    const [minH, maxH] = range.h;
    if (minH > maxH) {
      // Wraps around 360
      if (h >= minH || h <= maxH) {
        return category as ColorCategory;
      }
    } else {
      if (h >= minH && h <= maxH) {
        return category as ColorCategory;
      }
    }
  }

  return "gray";
}

/**
 * Get all color categories with their metadata
 */
export function getColorCategories() {
  return Object.keys(COLOR_CATEGORIES).map((key) => ({
    id: key as ColorCategory,
    name: COLOR_CATEGORY_NAMES[key as ColorCategory],
    color: COLOR_CATEGORY_COLORS[key as ColorCategory],
  }));
}
