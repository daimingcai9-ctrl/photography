"use client";

import { getColorCategories, ColorCategory } from "@/lib/colors";

interface ColorBarProps {
  selectedCategory: ColorCategory | null;
  onSelect: (category: ColorCategory | null) => void;
}

export default function ColorBar({ selectedCategory, onSelect }: ColorBarProps) {
  const categories = getColorCategories();

  return (
    <div className="flex flex-wrap gap-3 justify-center py-6">
      {/* All button */}
      <button
        onClick={() => onSelect(null)}
        className={`px-4 py-2 rounded-full text-sm font-medium transition-all hover:scale-105 ${
          selectedCategory === null
            ? "bg-white text-black shadow-lg"
            : "bg-white/10 text-white/70 hover:bg-white/20"
        }`}
      >
        全部
      </button>

      {/* Color category buttons */}
      {categories.map((category) => {
        const isSelected = selectedCategory === category.id;
        return (
          <button
            key={category.id}
            onClick={() => onSelect(isSelected ? null : category.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all hover:scale-105"
            style={{
              backgroundColor: isSelected
                ? category.color
                : `${category.color}22`,
              color: isSelected ? "#fff" : category.color,
              border: `1px solid ${isSelected ? category.color : `${category.color}44`}`,
            }}
          >
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            {category.name}
          </button>
        );
      })}
    </div>
  );
}
