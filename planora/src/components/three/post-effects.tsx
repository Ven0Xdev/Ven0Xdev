"use client";

import { useMemo } from "react";
import { Bloom, EffectComposer, N8AO, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";

import type { QualitySettings } from "@/lib/visualization/quality";
import type { SceneLightingDescriptor } from "@/lib/visualization/types";

/**
 * עיבוד תמונה — צילום אדריכלי, לא משחק.
 *
 * העקרונות: האפקטים עדינים, והם לא משנים את אמת החומר. הצללה סביבתית מחזירה
 * את הצל הרך בפינות החדר; זוהר קל מסביב לגופי התאורה בלילה; והחשכה עדינה
 * בקצוות ממקדת את המבט בדירה.
 *
 * במצב ביצועים כל זה כבוי — עדיף תצוגה חלקה על פני אפקט.
 */
export function PostEffects({
  quality,
  lighting,
}: {
  quality: QualitySettings;
  lighting: SceneLightingDescriptor;
}) {
  // בלילה הדירה מוארת מבפנים; הזוהר מודגש מעט כדי שגופי התאורה ייראו דולקים
  const bloomIntensity = useMemo(
    () => 0.1 + lighting.cityLights * 0.3,
    [lighting.cityLights],
  );

  if (!quality.postProcessing) return null;

  return (
    <EffectComposer enableNormalPass={quality.ambientOcclusion} multisampling={0}>
      {quality.ambientOcclusion ? (
        <N8AO
          aoRadius={0.75}
          intensity={1.35}
          distanceFalloff={1}
          quality="medium"
          color="#2a2620"
          halfRes
        />
      ) : (
        <></>
      )}
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={0.99}
        luminanceSmoothing={0.3}
        mipmapBlur
      />
      <Vignette offset={0.35} darkness={0.26} blendFunction={BlendFunction.NORMAL} />
    </EffectComposer>
  );
}
