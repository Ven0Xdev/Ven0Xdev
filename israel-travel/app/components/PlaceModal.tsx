"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Place, categoryColors, categoryEmoji } from "@/app/data/places";

interface PlaceModalProps {
  place: Place | null;
  visited: boolean;
  onClose: () => void;
  onToggleVisited: (id: string) => void;
}

export default function PlaceModal({
  place,
  visited,
  onClose,
  onToggleVisited,
}: PlaceModalProps) {
  const [activePhoto, setActivePhoto] = useState(0);

  useEffect(() => {
    if (place) {
      setActivePhoto(0);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [place]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!place) return null;

  const allPhotos = [place.image, ...place.gallery.slice(1)];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white w-full sm:max-w-3xl sm:rounded-3xl overflow-hidden shadow-2xl max-h-[95dvh] flex flex-col">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center text-lg hover:bg-black/70 transition-colors"
          aria-label="Close"
        >
          ×
        </button>

        {/* Hero photo */}
        <div className="relative h-64 sm:h-80 w-full shrink-0">
          <Image
            src={allPhotos[activePhoto]}
            alt={place.name}
            fill
            className="object-cover"
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

          {/* Title overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div
                  className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full mb-2 ${categoryColors[place.category]}`}
                >
                  {categoryEmoji[place.category]} {place.category}
                </div>
                <h2 className="text-2xl font-bold text-white leading-tight">
                  {place.name}
                </h2>
                <p className="text-white/80 text-sm mt-0.5 font-hebrew">
                  {place.hebrewName} · {place.region}
                </p>
              </div>
              {visited && (
                <div className="bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 shrink-0 shadow">
                  ✓ Visited
                </div>
              )}
            </div>
          </div>

          {/* Photo thumbnails */}
          {allPhotos.length > 1 && (
            <div className="absolute bottom-4 right-4 flex gap-1.5">
              {allPhotos.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActivePhoto(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === activePhoto ? "bg-white scale-125" : "bg-white/50 hover:bg-white/80"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Photo strip */}
        <div className="flex gap-2 px-5 pt-4 pb-1 overflow-x-auto shrink-0">
          {allPhotos.map((src, i) => (
            <button
              key={i}
              onClick={() => setActivePhoto(i)}
              className={`relative w-16 h-12 rounded-lg overflow-hidden shrink-0 transition-all ${
                i === activePhoto
                  ? "ring-2 ring-blue-500 scale-105"
                  : "opacity-60 hover:opacity-90"
              }`}
            >
              <Image
                src={src}
                alt=""
                fill
                className="object-cover"
                unoptimized
              />
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 pb-6 pt-4">
          <p className="text-gray-700 text-sm leading-relaxed mb-5">
            {place.details}
          </p>

          {/* Info grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            <InfoRow icon="🕐" label="Best Time" value={place.bestTime} />
            <InfoRow icon="🎟️" label="Entry Fee" value={place.entryFee} />
            <InfoRow icon="📍" label="Region" value={place.region} />
            <InfoRow
              icon="🗺️"
              label="Coordinates"
              value={`${place.lat.toFixed(4)}°N, ${place.lng.toFixed(4)}°E`}
            />
          </div>

          {/* Highlights */}
          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
              ⭐ Highlights
            </h3>
            <div className="flex flex-wrap gap-2">
              {place.highlights.map((h) => (
                <span
                  key={h}
                  className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full border border-blue-100 font-medium"
                >
                  {h}
                </span>
              ))}
            </div>
          </div>

          {/* Visit button */}
          <button
            onClick={() => onToggleVisited(place.id)}
            className={`w-full py-3 rounded-2xl font-semibold text-sm transition-colors ${
              visited
                ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                : "bg-green-600 text-white hover:bg-green-700 shadow-sm"
            }`}
          >
            {visited ? "✗ Remove from Visited" : "✓ Mark as Visited"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5 bg-gray-50 rounded-xl p-3">
      <span className="text-base mt-0.5">{icon}</span>
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {label}
        </p>
        <p className="text-sm text-gray-800 font-medium mt-0.5">{value}</p>
      </div>
    </div>
  );
}
