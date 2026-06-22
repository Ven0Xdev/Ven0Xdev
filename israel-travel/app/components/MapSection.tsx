"use client";
import { useState } from "react";
import { Map as MapIcon, List, Filter } from "lucide-react";
import Map from "@/app/components/Map";
import { Place, places, categories, categoryColors, categoryIcon } from "@/app/data/places";
import { Landmark, MoonStar, Leaf, Waves, Sun, Building2, Pickaxe } from "lucide-react";

const iconMap: Record<string, React.ReactNode> = {
  landmark:    <Landmark   size={11} strokeWidth={2} />,
  "moon-star": <MoonStar   size={11} strokeWidth={2} />,
  leaf:        <Leaf       size={11} strokeWidth={2} />,
  waves:       <Waves      size={11} strokeWidth={2} />,
  sun:         <Sun        size={11} strokeWidth={2} />,
  "building-2":<Building2  size={11} strokeWidth={2} />,
  pickaxe:     <Pickaxe    size={11} strokeWidth={2} />,
};

interface MapSectionProps {
  visited: Set<string>;
  onSelect: (place: Place) => void;
  viewMode: "grid" | "map";
  onViewChange: (mode: "grid" | "map") => void;
}

export default function MapSection({ visited, onSelect, viewMode, onViewChange }: MapSectionProps) {
  const [activeFilter, setActiveFilter] = useState<string>("All");

  const filtered =
    activeFilter === "All"
      ? places
      : places.filter((p) => p.category === activeFilter);

  const visitedCount = filtered.filter((p) => visited.has(p.id)).length;

  return (
    <div
      style={{
        background: "var(--bg-deep)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Map toolbar */}
      <div
        className="sticky z-30 border-b"
        style={{
          top: "64px",
          background: "rgba(6,13,26,0.9)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderColor: "rgba(255,255,255,0.06)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center gap-3">
          {/* View toggle */}
          <div
            className="flex rounded-xl overflow-hidden p-0.5 shrink-0"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <button
              onClick={() => onViewChange("grid")}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer"
              style={{
                background: viewMode === "grid" ? "rgba(201,168,76,0.18)" : "transparent",
                color: viewMode === "grid" ? "#c9a84c" : "rgba(240,236,228,0.45)",
                border: viewMode === "grid" ? "1px solid rgba(201,168,76,0.35)" : "1px solid transparent",
              }}
              aria-label="Grid view"
            >
              <List size={13} strokeWidth={2} />
              Grid
            </button>
            <button
              onClick={() => onViewChange("map")}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer"
              style={{
                background: viewMode === "map" ? "rgba(201,168,76,0.18)" : "transparent",
                color: viewMode === "map" ? "#c9a84c" : "rgba(240,236,228,0.45)",
                border: viewMode === "map" ? "1px solid rgba(201,168,76,0.35)" : "1px solid transparent",
              }}
              aria-label="Map view"
            >
              <MapIcon size={13} strokeWidth={2} />
              Map
            </button>
          </div>

          {/* Category filter (map-specific) */}
          {viewMode === "map" && (
            <div className="flex gap-2 flex-wrap items-center">
              <Filter size={12} strokeWidth={2} style={{ color: "rgba(201,168,76,0.5)" }} />
              <button
                onClick={() => setActiveFilter("All")}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer"
                style={{
                  background: activeFilter === "All" ? "rgba(201,168,76,0.18)" : "rgba(255,255,255,0.05)",
                  border: activeFilter === "All" ? "1px solid rgba(201,168,76,0.4)" : "1px solid rgba(255,255,255,0.08)",
                  color: activeFilter === "All" ? "#c9a84c" : "rgba(240,236,228,0.45)",
                }}
              >
                All
              </button>
              {categories.map((cat) => {
                const active = activeFilter === cat;
                const c = categoryColors[cat];
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveFilter(cat)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer"
                    style={{
                      background: active ? c.bg : "rgba(255,255,255,0.05)",
                      border: active ? `1px solid ${c.border}` : "1px solid rgba(255,255,255,0.08)",
                      color: active ? c.text : "rgba(240,236,228,0.45)",
                    }}
                  >
                    {iconMap[categoryIcon[cat]]}
                    {cat}
                  </button>
                );
              })}
            </div>
          )}

          {/* Stats */}
          {viewMode === "map" && (
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <span className="text-xs" style={{ color: "rgba(240,236,228,0.3)" }}>
                <span style={{ color: "#7de09a", fontWeight: 700 }}>{visitedCount}</span>
                {" / "}
                <span style={{ color: "rgba(240,236,228,0.6)" }}>{filtered.length}</span>
                {" visited"}
              </span>
              {/* Legend */}
              <div className="hidden sm:flex items-center gap-3 text-xs" style={{ color: "rgba(240,236,228,0.4)" }}>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ background: "#c9a84c", boxShadow: "0 0 6px rgba(201,168,76,0.6)" }}
                  />
                  Unvisited
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ background: "#7de09a", boxShadow: "0 0 6px rgba(125,224,154,0.6)" }}
                  />
                  Visited
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Map canvas */}
      {viewMode === "map" && (
        <div style={{ height: "calc(100svh - 130px)", minHeight: "500px", position: "relative" }}>
          <Map places={filtered} visited={visited} onSelect={onSelect} />

          {/* Floating count badge */}
          <div
            className="absolute top-4 left-4 z-10 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold"
            style={{
              background: "rgba(6,13,26,0.85)",
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(12px)",
              color: "rgba(240,236,228,0.7)",
            }}
          >
            <MapIcon size={13} strokeWidth={2} style={{ color: "#c9a84c" }} />
            <span>
              <span style={{ color: "#c9a84c", fontWeight: 700 }}>{filtered.length}</span>
              {" destinations mapped"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
