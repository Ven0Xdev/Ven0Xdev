"use client";
import { useState, useMemo } from "react";
import { places, Place, Category } from "@/app/data/places";
import Header from "@/app/components/Header";
import FilterBar from "@/app/components/FilterBar";
import PlaceCard from "@/app/components/PlaceCard";
import PlaceModal from "@/app/components/PlaceModal";
import { useVisited } from "@/app/hooks/useVisited";

export default function Home() {
  const { visited, toggleVisited } = useVisited();
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category | "All">("All");
  const [showVisitedOnly, setShowVisitedOnly] = useState(false);

  const filtered = useMemo(() => {
    return places.filter((p) => {
      const matchesSearch =
        search.trim() === "" ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.region.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        activeCategory === "All" || p.category === activeCategory;
      const matchesVisited = !showVisitedOnly || visited.has(p.id);
      return matchesSearch && matchesCategory && matchesVisited;
    });
  }, [search, activeCategory, showVisitedOnly, visited]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header total={places.length} visited={visited.size} />

      <FilterBar
        search={search}
        onSearch={setSearch}
        activeCategory={activeCategory}
        onCategory={setActiveCategory}
        showVisited={showVisitedOnly}
        onShowVisited={setShowVisitedOnly}
        resultCount={filtered.length}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">🗺️</p>
            <p className="text-gray-500 text-lg font-medium">No places found</p>
            <p className="text-gray-400 text-sm mt-1">
              Try adjusting your search or filters
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                visited={visited.has(place.id)}
                onSelect={setSelectedPlace}
                onToggleVisited={toggleVisited}
              />
            ))}
          </div>
        )}
      </main>

      <PlaceModal
        place={selectedPlace}
        visited={selectedPlace ? visited.has(selectedPlace.id) : false}
        onClose={() => setSelectedPlace(null)}
        onToggleVisited={toggleVisited}
      />

      <footer className="text-center py-8 text-xs text-gray-400 border-t border-gray-100 mt-8">
        🇮🇱 Israel Travel Tracker — {places.length} destinations across the Holy Land
      </footer>
    </div>
  );
}
