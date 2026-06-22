"use client";
import Image from "next/image";
import { Place, categoryColors, categoryEmoji } from "@/app/data/places";

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
  return (
    <div
      className={`group relative bg-white rounded-2xl overflow-hidden shadow-sm border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer ${
        visited ? "border-green-300 ring-1 ring-green-200" : "border-gray-100"
      }`}
    >
      {/* Image */}
      <div
        className="relative h-52 w-full overflow-hidden"
        onClick={() => onSelect(place)}
      >
        <Image
          src={place.image}
          alt={place.name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          unoptimized
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

        {/* Visited badge */}
        {visited && (
          <div className="absolute top-3 left-3 bg-green-500 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow">
            ✓ Visited
          </div>
        )}

        {/* Category badge */}
        <div
          className={`absolute top-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-full ${categoryColors[place.category]} shadow-sm`}
        >
          {categoryEmoji[place.category]} {place.category}
        </div>
      </div>

      {/* Content */}
      <div className="p-4" onClick={() => onSelect(place)}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-base font-bold text-gray-900 leading-tight group-hover:text-blue-600 transition-colors">
            {place.name}
          </h3>
          <span className="text-xs text-gray-400 font-normal shrink-0 mt-0.5 font-hebrew">
            {place.hebrewName}
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
          <span>📍</span> {place.region}
        </p>
        <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
          {place.description}
        </p>
      </div>

      {/* Footer */}
      <div className="px-4 pb-4 flex items-center justify-between">
        <button
          onClick={() => onSelect(place)}
          className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          View Details →
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisited(place.id);
          }}
          className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors border ${
            visited
              ? "bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
              : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200"
          }`}
        >
          {visited ? "Mark Unvisited" : "Mark Visited"}
        </button>
      </div>
    </div>
  );
}
