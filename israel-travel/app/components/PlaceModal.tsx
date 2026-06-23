"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { X, MapPin, Clock, Ticket, Navigation, CheckCircle, Star, Landmark, MoonStar, Leaf, Waves, Sun, Building2, Pickaxe } from "lucide-react";
import { Place, categoryColors, categoryIcon } from "@/app/data/places";

const iconMap: Record<string, React.ReactNode> = {
  landmark:    <Landmark   size={12} strokeWidth={2} />,
  "moon-star": <MoonStar   size={12} strokeWidth={2} />,
  leaf:        <Leaf       size={12} strokeWidth={2} />,
  waves:       <Waves      size={12} strokeWidth={2} />,
  sun:         <Sun        size={12} strokeWidth={2} />,
  "building-2":<Building2  size={12} strokeWidth={2} />,
  pickaxe:     <Pickaxe    size={12} strokeWidth={2} />,
};

interface PlaceModalProps {
  place: Place | null;
  visited: boolean;
  onClose: () => void;
  onToggleVisited: (id: string) => void;
}

export default function PlaceModal({ place, visited, onClose, onToggleVisited }: PlaceModalProps) {
  const [activePhoto, setActivePhoto] = useState(0);

  useEffect(() => {
    if (place) {
      setActivePhoto(0);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [place]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!place) return null;

  const allPhotos = [place.image, ...place.gallery.slice(1)];
  const c = categoryColors[place.category];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Details for ${place.name}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 cursor-pointer"
        style={{ background: "rgba(6,13,26,0.85)", backdropFilter: "blur(12px)" }}
        onClick={onClose}
      />

      {/* Modal panel */}
      <div
        className="relative w-full sm:max-w-4xl max-h-[96dvh] flex flex-col sm:rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #0e1e38 0%, #0a1628 60%, #060d1a 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(201,168,76,0.15)",
        }}
      >
        {/* ── Hero photo area ── */}
        <div className="relative h-72 sm:h-96 shrink-0 overflow-hidden">
          <Image
            src={allPhotos[activePhoto]}
            alt={place.name}
            fill
            className="object-cover transition-opacity duration-500"
            unoptimized
            key={activePhoto}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#060d1a] via-[#060d1a]/30 to-transparent" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-200 cursor-pointer"
            style={{ background: "rgba(6,13,26,0.7)", border: "1px solid rgba(255,255,255,0.12)" }}
            aria-label="Close modal"
          >
            <X size={16} strokeWidth={2} style={{ color: "rgba(240,236,228,0.8)" }} />
          </button>

          {/* Visited badge */}
          {visited && (
            <div
              className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
              style={{
                background: "rgba(125,224,154,0.2)",
                border: "1px solid rgba(125,224,154,0.5)",
                color: "#7de09a",
              }}
            >
              <CheckCircle size={12} strokeWidth={2.5} />
              Visited
            </div>
          )}

          {/* Title overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-3"
              style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
            >
              {iconMap[categoryIcon[place.category]]}
              {place.category}
            </div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2
                  className="font-display text-3xl sm:text-4xl font-bold leading-tight"
                  style={{ color: "#f0ece4", fontFamily: "var(--font-heading)" }}
                >
                  {place.name}
                </h2>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={13} strokeWidth={2} style={{ color: "#c9a84c" }} />
                    <span className="text-sm" style={{ color: "rgba(240,236,228,0.6)" }}>
                      {place.region}
                    </span>
                  </div>
                  <span style={{ color: "rgba(201,168,76,0.4)" }}>·</span>
                  <span className="font-hebrew text-sm" style={{ color: "rgba(201,168,76,0.6)" }}>
                    {place.hebrewName}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Photo dots */}
          {allPhotos.length > 1 && (
            <div className="absolute bottom-5 right-6 flex gap-1.5">
              {allPhotos.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActivePhoto(i)}
                  className="rounded-full transition-all duration-200 cursor-pointer"
                  style={{
                    width: i === activePhoto ? "20px" : "6px",
                    height: "6px",
                    background: i === activePhoto ? "#c9a84c" : "rgba(255,255,255,0.35)",
                  }}
                  aria-label={`Photo ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Photo strip ── */}
        <div className="flex gap-2 px-6 pt-4 pb-0 overflow-x-auto shrink-0">
          {allPhotos.map((src, i) => (
            <button
              key={i}
              onClick={() => setActivePhoto(i)}
              className="relative w-20 h-14 rounded-xl overflow-hidden shrink-0 transition-all duration-200 cursor-pointer"
              style={{
                opacity: i === activePhoto ? 1 : 0.45,
                transform: i === activePhoto ? "scale(1.05)" : "scale(1)",
                outline: i === activePhoto ? "2px solid #c9a84c" : "none",
                outlineOffset: "2px",
              }}
              aria-label={`Select photo ${i + 1}`}
            >
              <Image src={src} alt="" fill className="object-cover" unoptimized />
            </button>
          ))}
        </div>

        {/* ── Scrollable content ── */}
        <div className="overflow-y-auto flex-1 px-6 pt-5 pb-6">
          {/* Description */}
          <p
            className="text-base leading-relaxed mb-6"
            style={{ color: "rgba(240,236,228,0.7)", lineHeight: 1.75 }}
          >
            {place.details}
          </p>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <InfoCard icon={<Clock size={16} strokeWidth={1.5} />} label="Best Time" value={place.bestTime} />
            <InfoCard icon={<Ticket size={16} strokeWidth={1.5} />} label="Entry Fee" value={place.entryFee} />
            <InfoCard icon={<MapPin size={16} strokeWidth={1.5} />} label="Region" value={place.region} />
            <InfoCard
              icon={<Navigation size={16} strokeWidth={1.5} />}
              label="Coordinates"
              value={`${place.lat.toFixed(3)}°N · ${place.lng.toFixed(3)}°E`}
            />
          </div>

          {/* Highlights */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Star size={14} strokeWidth={2} style={{ color: "#c9a84c" }} />
              <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: "#c9a84c" }}>
                Highlights
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {place.highlights.map((h) => (
                <span
                  key={h}
                  className="text-xs px-3 py-1.5 rounded-full font-medium"
                  style={{
                    background: "rgba(201,168,76,0.1)",
                    border: "1px solid rgba(201,168,76,0.2)",
                    color: "rgba(232,201,107,0.85)",
                  }}
                >
                  {h}
                </span>
              ))}
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={() => onToggleVisited(place.id)}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            style={
              visited
                ? {
                    background: "rgba(220,38,38,0.1)",
                    border: "1px solid rgba(220,38,38,0.25)",
                    color: "#fca5a5",
                  }
                : {
                    background: "linear-gradient(135deg, #c9a84c 0%, #a07830 100%)",
                    border: "none",
                    color: "#060d1a",
                    boxShadow: "0 8px 24px rgba(201,168,76,0.25)",
                  }
            }
          >
            {visited ? (
              <>
                <X size={14} strokeWidth={2.5} />
                Remove from Visited
              </>
            ) : (
              <>
                <CheckCircle size={14} strokeWidth={2.5} />
                Mark as Visited
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl p-3.5"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <span style={{ color: "#c9a84c", marginTop: "1px" }}>{icon}</span>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color: "rgba(201,168,76,0.6)" }}>
          {label}
        </p>
        <p className="text-sm font-medium" style={{ color: "rgba(240,236,228,0.85)" }}>
          {value}
        </p>
      </div>
    </div>
  );
}
