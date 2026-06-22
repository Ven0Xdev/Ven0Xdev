"use client";
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, ZoomControl } from "react-leaflet";
import L from "leaflet";
import { Place, categoryColors } from "@/app/data/places";

// Fix Leaflet's default icon path issue with Next.js
const fixLeafletIcons = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
};

function makeIcon(color: string, visited: boolean) {
  const fill = visited ? "#7de09a" : color;
  const glow = visited ? "rgba(125,224,154,0.5)" : "rgba(201,168,76,0.5)";
  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:36px;height:44px;">
        <div style="
          position:absolute;
          bottom:0;left:50%;
          transform:translateX(-50%);
          width:36px;height:36px;
          background:${fill};
          border:2.5px solid rgba(255,255,255,0.85);
          border-radius:50% 50% 50% 0;
          transform:translateX(-50%) rotate(-45deg);
          box-shadow:0 4px 14px ${glow}, 0 2px 6px rgba(0,0,0,0.5);
          cursor:pointer;
        "></div>
        <div style="
          position:absolute;
          bottom:0;left:50%;
          transform:translateX(-50%);
          width:8px;height:8px;
          background:rgba(6,13,26,0.8);
          border-radius:50%;
        "></div>
      </div>`,
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -46],
  });
}

interface MapViewProps {
  places: Place[];
  visited: Set<string>;
  onSelect: (place: Place) => void;
}

export default function MapView({ places, visited, onSelect }: MapViewProps) {
  useEffect(() => {
    fixLeafletIcons();
  }, []);

  // Israel center
  const center: [number, number] = [31.5, 35.2];

  return (
    <MapContainer
      center={center}
      zoom={7}
      style={{ height: "100%", width: "100%", background: "#060d1a" }}
      zoomControl={false}
      attributionControl={false}
    >
      {/* CartoDB Dark Matter tiles */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
      />

      <ZoomControl position="bottomright" />

      {/* Attribution */}
      <div
        style={{
          position: "absolute",
          bottom: "8px",
          left: "8px",
          zIndex: 1000,
          fontSize: "10px",
          color: "rgba(240,236,228,0.35)",
        }}
      >
        © OpenStreetMap · CARTO
      </div>

      {places.map((place) => {
        const c = categoryColors[place.category];
        const isVisited = visited.has(place.id);
        const icon = makeIcon(c.text, isVisited);

        return (
          <Marker
            key={place.id}
            position={[place.lat, place.lng]}
            icon={icon}
            eventHandlers={{
              click: () => onSelect(place),
            }}
          >
            <Popup
              className="dark-popup"
              closeButton={false}
              offset={[0, -8]}
            >
              <div
                style={{
                  background: "linear-gradient(135deg,#0e1e38,#0a1628)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  minWidth: "180px",
                  boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
                  cursor: "pointer",
                }}
                onClick={() => onSelect(place)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  {isVisited && (
                    <span style={{ color: "#7de09a", fontSize: "11px", fontWeight: 700 }}>✓</span>
                  )}
                  <span
                    style={{
                      color: "#f0ece4",
                      fontWeight: 700,
                      fontSize: "14px",
                      fontFamily: "var(--font-heading, Georgia, serif)",
                    }}
                  >
                    {place.name}
                  </span>
                </div>
                <div style={{ color: "rgba(240,236,228,0.5)", fontSize: "11px", marginBottom: "8px" }}>
                  📍 {place.region}
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "3px 10px",
                    borderRadius: "99px",
                    fontSize: "11px",
                    fontWeight: 600,
                    background: c.bg,
                    border: `1px solid ${c.border}`,
                    color: c.text,
                  }}
                >
                  {place.category}
                </div>
                <div style={{ marginTop: "8px", color: "#c9a84c", fontSize: "11px", fontWeight: 600 }}>
                  Tap for details →
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
