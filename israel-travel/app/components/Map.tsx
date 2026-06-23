"use client";
import dynamic from "next/dynamic";
import { Place } from "@/app/data/places";
import { Map as MapIcon } from "lucide-react";

// Load Leaflet only client-side (it accesses window/document)
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center h-full"
      style={{ background: "#060d1a" }}
    >
      <div className="flex flex-col items-center gap-3">
        <MapIcon
          size={32}
          strokeWidth={1.2}
          style={{ color: "rgba(201,168,76,0.4)" }}
        />
        <p className="text-sm" style={{ color: "rgba(240,236,228,0.35)" }}>
          Loading map…
        </p>
      </div>
    </div>
  ),
});

interface MapProps {
  places: Place[];
  visited: Set<string>;
  onSelect: (place: Place) => void;
}

export default function Map(props: MapProps) {
  return <MapView {...props} />;
}
