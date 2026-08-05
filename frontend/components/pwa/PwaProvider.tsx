"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa";
import { OfflineBanner } from "./OfflineBanner";

export function PwaProvider() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return <OfflineBanner />;
}
