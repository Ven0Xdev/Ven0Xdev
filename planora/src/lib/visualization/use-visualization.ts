"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createVisualizationProvider, type ApartmentVisualizationProvider } from "./provider";
import { createGeometryProvider } from "@/lib/geometry/provider";
import { detectQualityMode, isWebGLAvailable } from "./quality";
import { registerSupplierAssets, type SupplierAssetSource } from "./asset-registry";
import {
  VisualizationUnsupportedError,
  type ExteriorEnvironment,
  type MaterialAssignment,
  type QualityMode,
  type TimeOfDay,
  type VisualizationState,
} from "./types";
import type { DrawingDocument } from "@/lib/drawing/types";

const INITIAL_STATE: VisualizationState = {
  status: "LOADING",
  apartmentId: null,
  timeOfDay: "MIDDAY",
  qualityMode: "AUTO",
  effectiveQuality: "BALANCED",
  environment: null,
  focusedRoomId: null,
  cameraMode: "ORBIT",
  rooms: [],
  tourPath: [],
  suggestedTour: [],
  presentation: null,
  message: null,
};

function errorMessage(error: unknown): string {
  if (error instanceof VisualizationUnsupportedError) return error.message;
  return "לא ניתן להציג את הדירה כרגע.";
}

/**
 * מחבר מסך React למנוע ההדמיה.
 *
 * המסך אינו מחזיק את מצב התצוגה בעצמו — המנוע הוא מקור האמת, והמסך מאזין לו.
 * כך מעבר למנוע אחר אינו דורש שינוי בקוד המסך.
 */
export function useApartmentVisualization({
  apartmentId,
  document,
  materials,
  environment,
  supplierAssets,
}: {
  apartmentId: string;
  document: DrawingDocument;
  materials: MaterialAssignment[];
  environment?: ExteriorEnvironment | null;
  /** נכסי הספקים שקיימים למוצרים של הדירה הזו */
  supplierAssets?: SupplierAssetSource[];
}) {
  const [provider, setProvider] = useState<ApartmentVisualizationProvider | null>(null);
  const [state, setState] = useState<VisualizationState>(INITIAL_STATE);

  // החומרים מגיעים כמערך חדש בכל רינדור של ההורה. חתימה יציבה מונעת טעינה
  // מחדש של התצורה — וקפיצה של המצלמה — כשדבר לא באמת השתנה.
  const materialsKey = useMemo(() => JSON.stringify(materials), [materials]);
  const autoQuality = useMemo(() => detectQualityMode(), []);

  // הצהרת נכסי הספקים במרשם. אין כאן טעינה — רק רישום, כדי שכתובת נכס לא
  // תיקבר בתוך רכיב תצוגה.
  const assetsKey = useMemo(() => JSON.stringify(supplierAssets ?? []), [supplierAssets]);
  useEffect(() => {
    const declared = JSON.parse(assetsKey) as SupplierAssetSource[];
    if (declared.length > 0) registerSupplierAssets(declared);
  }, [assetsKey]);
  const materialsRef = useRef(materials);
  materialsRef.current = materials;

  useEffect(() => {
    let cancelled = false;
    let instance: ApartmentVisualizationProvider | null = null;

    // מכשיר ללא WebGL אינו מקבל מסך שבור: הוא מקבל הסבר, והמסך מציע את
    // התוכנית הדו-ממדית במקום.
    if (!isWebGLAvailable()) {
      setState((current) => ({
        ...current,
        status: "UNSUPPORTED",
        message: "תצוגת 3D מתקדמת אינה זמינה במכשיר זה.",
      }));
      return;
    }

    createVisualizationProvider()
      .then((created) => {
        if (cancelled) {
          created.dispose();
          return;
        }
        instance = created;
        // ברירת מחדל לפי המכשיר, לפני שהדירה נטענת
        void created.setQualityMode("AUTO").catch(() => undefined);
        setProvider(created);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState((current) => ({ ...current, status: "ERROR", message: errorMessage(error) }));
      });

    return () => {
      cancelled = true;
      instance?.dispose();
      setProvider(null);
    };
  }, []);

  useEffect(() => {
    if (!provider) return;
    const unsubscribe = provider.subscribe(setState);
    return unsubscribe;
  }, [provider]);

  useEffect(() => {
    if (!provider) return;
    let cancelled = false;

    async function load(engine: ApartmentVisualizationProvider) {
      try {
        // התוכנית → גאומטריה מנורמלת → מנוע. התצוגה אינה יודעת מאיפה הגיעה
        // הדירה, וכשייכתב מעבד DWG אמיתי רק השלב הזה יתחלף.
        const geometryProvider = await createGeometryProvider();
        const geometry = await geometryProvider.loadFromPlan({ document, apartmentId });
        if (cancelled) return;
        await engine.loadApartment({ apartmentId, geometry, environment: environment ?? null });
        if (cancelled) return;
        await engine.loadConfiguration({ materials: materialsRef.current });
      } catch (error) {
        if (cancelled) return;
        setState((current) => ({
          ...current,
          status: error instanceof VisualizationUnsupportedError ? "UNSUPPORTED" : "ERROR",
          message: errorMessage(error),
        }));
      }
    }

    void load(provider);
    return () => {
      cancelled = true;
    };
  }, [provider, apartmentId, document, environment]);

  useEffect(() => {
    if (!provider || provider.getState().status !== "READY") return;
    void provider.loadConfiguration({ materials: materialsRef.current }).catch(() => {
      // כשל בהחלת חומרים אינו מפיל את התצוגה; הדירה נשארת במפרט הקודם.
    });
    // התלות היא בחתימת החומרים, לא בזהות המערך
  }, [provider, materialsKey]);

  const setTimeOfDay = useCallback(
    (timeOfDay: TimeOfDay) => {
      void provider?.setTimeOfDay(timeOfDay).catch(() => undefined);
    },
    [provider],
  );

  const focusRoom = useCallback(
    (roomId: string | null) => {
      void provider?.focusRoom(roomId).catch(() => undefined);
    },
    [provider],
  );

  const startWalkthrough = useCallback(
    (options?: { path?: string[]; loop?: boolean; startRoomId?: string | null }) => {
      void provider?.startWalkthrough(options).catch(() => undefined);
    },
    [provider],
  );

  const stopWalkthrough = useCallback(() => {
    void provider?.stopWalkthrough().catch(() => undefined);
  }, [provider]);

  const setQualityMode = useCallback(
    (mode: QualityMode) => {
      void provider?.setQualityMode(mode).catch(() => undefined);
    },
    [provider],
  );

  const resetScene = useCallback(() => {
    void provider?.resetScene().catch(() => undefined);
  }, [provider]);

  return {
    state,
    autoQuality,
    capabilities: provider?.capabilities ?? null,
    providerId: provider?.id ?? null,
    setTimeOfDay,
    focusRoom,
    startWalkthrough,
    stopWalkthrough,
    setQualityMode,
    resetScene,
  };
}
