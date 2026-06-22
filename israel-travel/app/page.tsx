"use client";
import { useRef, useState, useMemo } from "react";
import { places, Place, Category } from "@/app/data/places";
import Header from "@/app/components/Header";
import Hero from "@/app/components/Hero";
import FilterBar from "@/app/components/FilterBar";
import MapSection from "@/app/components/MapSection";
import PlaceCard from "@/app/components/PlaceCard";
import PlaceModal from "@/app/components/PlaceModal";
import { useVisited } from "@/app/hooks/useVisited";
import { MapPin } from "lucide-react";

type ViewMode = "grid" | "map";

export default function Home() {
  const { visited, toggleVisited } = useVisited();
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category | "All">("All");
  const [showVisitedOnly, setShowVisitedOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const sectionRef = useRef<HTMLDivElement>(null);

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

  const scrollToSection = () => {
    sectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-deep)" }}>
      {/* Sticky glass nav */}
      <div className="sticky top-0 z-40">
        <Header total={places.length} visited={visited.size} />
      </div>

      {/* Full-screen hero */}
      <div style={{ marginTop: "-64px" }}>
        <Hero total={places.length} visited={visited.size} onExplore={scrollToSection} />
      </div>

      {/* Main content section */}
      <div ref={sectionRef} style={{ background: "var(--bg-base)" }}>

        {/* Map/Grid toolbar + Map canvas (always rendered at top of section) */}
        <MapSection
          visited={visited}
          onSelect={setSelectedPlace}
          viewMode={viewMode}
          onViewChange={setViewMode}
        />

        {/* Grid view */}
        {viewMode === "grid" && (
          <>
            <FilterBar
              search={search}
              onSearch={setSearch}
              activeCategory={activeCategory}
              onCategory={setActiveCategory}
              showVisited={showVisitedOnly}
              onShowVisited={setShowVisitedOnly}
              resultCount={filtered.length}
            />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
              {filtered.length === 0 ? (
                <div className="text-center py-24">
                  <MapPin
                    size={40}
                    strokeWidth={1.2}
                    className="mx-auto mb-4"
                    style={{ color: "rgba(201,168,76,0.4)" }}
                  />
                  <p className="text-xl font-semibold mb-2" style={{ color: "rgba(240,236,228,0.6)" }}>
                    No destinations found
                  </p>
                  <p className="text-sm" style={{ color: "rgba(240,236,228,0.3)" }}>
                    Try adjusting your search or filters
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
          </>
        )}

        {/* Footer */}
        <footer
          className="text-center py-10 text-xs"
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            color: "rgba(240,236,228,0.25)",
          }}
        >
          <span
            className="font-display"
            style={{ color: "rgba(201,168,76,0.5)", fontFamily: "var(--font-heading)" }}
          >
            Eretz·IL
          </span>
          {" "}— {places.length} destinations across the Holy Land
        </footer>
      </div>

      <PlaceModal
        place={selectedPlace}
        visited={selectedPlace ? visited.has(selectedPlace.id) : false}
        onClose={() => setSelectedPlace(null)}
        onToggleVisited={toggleVisited}
      />
    </div>
  );
}
