"use client";
import { Search, CheckCircle, Circle, Landmark, MoonStar, Leaf, Waves, Sun, Building2, Pickaxe } from "lucide-react";
import { categories, categoryColors, Category } from "@/app/data/places";

const iconMap: Record<string, React.ReactNode> = {
  landmark:    <Landmark   size={12} strokeWidth={2} />,
  "moon-star": <MoonStar   size={12} strokeWidth={2} />,
  leaf:        <Leaf       size={12} strokeWidth={2} />,
  waves:       <Waves      size={12} strokeWidth={2} />,
  sun:         <Sun        size={12} strokeWidth={2} />,
  "building-2":<Building2  size={12} strokeWidth={2} />,
  pickaxe:     <Pickaxe    size={12} strokeWidth={2} />,
};

import { categoryIcon } from "@/app/data/places";

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
    <div
      className="sticky z-30 border-b"
      style={{
        top: "64px",
        background: "rgba(6,13,26,0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderColor: "rgba(255,255,255,0.06)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-3">
        {/* Search + toggle row */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search
              size={15}
              strokeWidth={2}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "rgba(240,236,228,0.35)" }}
            />
            <input
              type="text"
              placeholder="Search destinations…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-200"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.09)",
                color: "#f0ece4",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(201,168,76,0.5)";
                e.currentTarget.style.background = "rgba(255,255,255,0.09)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)";
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              }}
            />
          </div>

          <button
            onClick={() => onShowVisited(!showVisited)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap cursor-pointer"
            style={{
              background: showVisited ? "rgba(125,224,154,0.15)" : "rgba(255,255,255,0.06)",
              border: showVisited ? "1px solid rgba(125,224,154,0.4)" : "1px solid rgba(255,255,255,0.09)",
              color: showVisited ? "#7de09a" : "rgba(240,236,228,0.55)",
            }}
          >
            {showVisited
              ? <CheckCircle size={14} strokeWidth={2} />
              : <Circle size={14} strokeWidth={2} />}
            {showVisited ? "Visited Only" : "All Places"}
          </button>
        </div>

        {/* Category chips */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => onCategory("All")}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer"
            style={{
              background: activeCategory === "All" ? "rgba(201,168,76,0.2)" : "rgba(255,255,255,0.05)",
              border: activeCategory === "All" ? "1px solid rgba(201,168,76,0.5)" : "1px solid rgba(255,255,255,0.08)",
              color: activeCategory === "All" ? "#c9a84c" : "rgba(240,236,228,0.5)",
            }}
          >
            All
          </button>

          {categories.map((cat) => {
            const active = activeCategory === cat;
            const c = categoryColors[cat];
            return (
              <button
                key={cat}
                onClick={() => onCategory(cat)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer"
                style={{
                  background: active ? c.bg : "rgba(255,255,255,0.05)",
                  border: active ? `1px solid ${c.border}` : "1px solid rgba(255,255,255,0.08)",
                  color: active ? c.text : "rgba(240,236,228,0.5)",
                }}
              >
                {iconMap[categoryIcon[cat]]}
                {cat}
              </button>
            );
          })}
        </div>

        <p className="text-xs" style={{ color: "rgba(240,236,228,0.3)" }}>
          {resultCount} destination{resultCount !== 1 ? "s" : ""} found
        </p>
      </div>
    </div>
  );
}
