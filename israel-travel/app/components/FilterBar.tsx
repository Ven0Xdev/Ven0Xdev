"use client";
import { categories, categoryEmoji, Category } from "@/app/data/places";

interface FilterBarProps {
  search: string;
  onSearch: (v: string) => void;
  activeCategory: Category | "All";
  onCategory: (c: Category | "All") => void;
  showVisited: boolean;
  onShowVisited: (v: boolean) => void;
  resultCount: number;
}

export default function FilterBar({
  search,
  onSearch,
  activeCategory,
  onCategory,
  showVisited,
  onShowVisited,
  resultCount,
}: FilterBarProps) {
  return (
    <div className="bg-white border-b border-gray-100 sticky top-[73px] z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-3">
        {/* Search + visited toggle */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search places…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
            />
          </div>
          <button
            onClick={() => onShowVisited(!showVisited)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors whitespace-nowrap ${
              showVisited
                ? "bg-green-600 text-white border-green-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            <span>{showVisited ? "✅" : "📋"}</span>
            {showVisited ? "Visited Only" : "Show All"}
          </button>
        </div>

        {/* Category chips */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => onCategory("All")}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
              activeCategory === "All"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => onCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors border flex items-center gap-1 ${
                activeCategory === cat
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              <span>{categoryEmoji[cat]}</span>
              {cat}
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-400">
          {resultCount} place{resultCount !== 1 ? "s" : ""} found
        </p>
      </div>
    </div>
  );
}
