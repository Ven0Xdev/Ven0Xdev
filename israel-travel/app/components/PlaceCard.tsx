"use client";
import Image from "next/image";
import { MapPin, CheckCircle, ArrowUpRight } from "lucide-react";
import { Place, categoryColors, categoryIcon } from "@/app/data/places";
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

interface PlaceCardProps {
  place: Place;
  visited: boolean;
  onSelect: (place: Place) => void;
  onToggleVisited: (id: string) => void;
}

export default function PlaceCard({
  place,
  visited,
  onSelect,
  onToggleVisited,
}: PlaceCardProps) {
  const c = categoryColors[place.category];

  return (
    <article
      className="card-hover relative rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)",
        border: visited
          ? "1px solid rgba(125,224,154,0.3)"
          : "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Image */}
      <div
        className="relative h-56 w-full overflow-hidden cursor-pointer"
        onClick={() => onSelect(place)}
      >
        <Image
          src={place.image}
          alt={place.name}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-110"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          unoptimized
        />
        {/* Photo gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#060d1a]/80 via-[#060d1a]/20 to-transparent" />

        {/* Top badges */}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
          {/* Category */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{
              background: c.bg,
              border: `1px solid ${c.border}`,
              color: c.text,
              backdropFilter: "blur(8px)",
            }}
          >
            {iconMap[categoryIcon[place.category]]}
            {place.category}
          </div>

          {/* Visited */}
          {visited && (
            <div
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
              style={{
                background: "rgba(125,224,154,0.2)",
                border: "1px solid rgba(125,224,154,0.5)",
                color: "#7de09a",
                backdropFilter: "blur(8px)",
              }}
            >
              <CheckCircle size={11} strokeWidth={2.5} />
              Visited
            </div>
          )}
        </div>

        {/* Bottom region pill */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
          <MapPin size={11} strokeWidth={2} style={{ color: "rgba(201,168,76,0.8)" }} />
          <span className="text-xs font-medium" style={{ color: "rgba(240,236,228,0.75)" }}>
            {place.region}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 cursor-pointer" onClick={() => onSelect(place)}>
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3
            className="font-display text-lg font-bold leading-tight"
            style={{ color: "#f0ece4", fontFamily: "var(--font-heading)" }}
          >
            {place.name}
          </h3>
          <span
            className="text-xs mt-1 shrink-0 font-hebrew"
            style={{ color: "rgba(201,168,76,0.55)" }}
          >
            {place.hebrewName}
          </span>
        </div>

        <p
          className="text-sm line-clamp-2 leading-relaxed"
          style={{ color: "rgba(240,236,228,0.55)" }}
        >
          {place.description}
        </p>
      </div>

      {/* Footer */}
      <div
        className="px-4 pb-4 flex items-center justify-between"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}
      >
        <button
          onClick={() => onSelect(place)}
          className="flex items-center gap-1 text-sm font-semibold transition-colors duration-200 cursor-pointer"
          style={{ color: "#c9a84c" }}
          aria-label={`View details for ${place.name}`}
        >
          View Details
          <ArrowUpRight size={14} strokeWidth={2.5} />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisited(place.id);
          }}
          className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all duration-200 cursor-pointer"
          style={{
            background: visited ? "rgba(125,224,154,0.12)" : "rgba(255,255,255,0.06)",
            border: visited ? "1px solid rgba(125,224,154,0.3)" : "1px solid rgba(255,255,255,0.1)",
            color: visited ? "#7de09a" : "rgba(240,236,228,0.45)",
          }}
          aria-label={visited ? `Remove ${place.name} from visited` : `Mark ${place.name} as visited`}
        >
          {visited ? "✓ Visited" : "Mark Visited"}
        </button>
      </div>
    </article>
  );
}
