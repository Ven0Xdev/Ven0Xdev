import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // React's native <ViewTransition> (app/layout.tsx / AppShell.tsx) drives
    // route/panel crossfades via the browser's View Transitions API —
    // unsupported browsers simply render without animating (see Next's own
    // guide: node_modules/next/dist/docs/01-app/02-guides/view-transitions.md).
    viewTransition: true,
  },
  async headers() {
    return [
      {
        // Never let the browser HTTP-cache the service worker itself —
        // otherwise a new deploy's cache-cleanup logic in sw.js (the
        // CACHE_VERSION bump) can't reach clients for a long time.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
