"use client";
import Image from "next/image";
import { MapPin, Compass } from "lucide-react";
import { HERO_IMAGE } from "@/app/data/places";

interface HeroProps {
  total: number;
  visited: number;
  onExplore: () => void;
}

export default function Hero({ total, visited, onExplore }: HeroProps) {
  return (
    <section className="relative h-[100svh] min-h-[600px] flex flex-col overflow-hidden">
      {/* 4K background */}
      <Image
        src={HERO_IMAGE}
        alt="Jerusalem Old City panorama"
        fill
        priority
        className="object-cover"
        unoptimized
      />

      {/* Layered gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#060d1a]/70 via-[#0a1628]/40 to-[#060d1a]/95" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#060d1a]/50 via-transparent to-transparent" />

      {/* Ambient glow blobs */}
      <div
        className="blob-1 absolute top-1/4 left-1/3 w-96 h-96 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(201,168,76,0.12) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      <div
        className="blob-2 absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(94,106,210,0.1) 0%, transparent 70%)",
          filter: "blur(50px)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 text-center">
        {/* Eyebrow */}
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-8 text-xs font-semibold tracking-widest uppercase"
          style={{
            background: "rgba(201,168,76,0.1)",
            borderColor: "rgba(201,168,76,0.35)",
            color: "#c9a84c",
          }}
        >
          <MapPin size={12} strokeWidth={2.5} />
          Discover the Holy Land
        </div>

        {/* Headline */}
        <h1
          className="font-display text-5xl sm:text-7xl lg:text-8xl font-bold leading-[0.95] mb-6"
          style={{ color: "#f0ece4", fontFamily: "var(--font-heading)" }}
        >
          <span className="block">Travel</span>
          <span className="block text-gold-gradient" style={{
            background: "linear-gradient(135deg, #e8c96b 0%, #c9a84c 60%, #a07830 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            Israel
          </span>
        </h1>

        {/* Subheadline */}
        <p
          className="text-lg sm:text-xl max-w-2xl leading-relaxed mb-10"
          style={{ color: "rgba(240,236,228,0.65)" }}
        >
          {total} breathtaking destinations across the world's most storied land.
          Track your journey through ancient history, sacred sites, and natural wonders.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <button
            onClick={onExplore}
            className="flex items-center gap-2.5 px-8 py-4 rounded-full font-semibold text-sm transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer"
            style={{
              background: "linear-gradient(135deg, #c9a84c 0%, #a07830 100%)",
              color: "#060d1a",
              boxShadow: "0 8px 32px rgba(201,168,76,0.35)",
            }}
            aria-label="Explore all destinations"
          >
            <Compass size={16} strokeWidth={2.5} />
            Explore Destinations
          </button>

          {visited > 0 && (
            <div
              className="flex items-center gap-2 px-6 py-4 rounded-full text-sm font-medium"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(240,236,228,0.8)",
              }}
            >
              <span style={{ color: "#7de09a" }}>●</span>
              {visited} of {total} visited
            </div>
          )}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="relative z-10 flex justify-center pb-8">
        <button
          onClick={onExplore}
          className="flex flex-col items-center gap-1.5 cursor-pointer group"
          aria-label="Scroll to destinations"
        >
          <span
            className="text-xs tracking-widest uppercase font-semibold"
            style={{ color: "rgba(201,168,76,0.6)" }}
          >
            Scroll
          </span>
          <div
            className="w-px h-10 rounded-full group-hover:h-14 transition-all duration-500"
            style={{ background: "linear-gradient(to bottom, rgba(201,168,76,0.6), transparent)" }}
          />
        </button>
      </div>
    </section>
  );
}
