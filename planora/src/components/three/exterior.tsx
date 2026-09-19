"use client";

import { useMemo } from "react";
import * as THREE from "three";

import {
  EXTERIOR_PALETTES,
  EXTERIOR_PRESETS,
  type ExteriorPalette,
  type ExteriorPreset,
} from "@/lib/visualization/environment";
import type { ExteriorEnvironment, TimeOfDay } from "@/lib/visualization/types";
import type { QualitySettings } from "@/lib/visualization/quality";

/**
 * הסביבה שמסביב לבניין.
 *
 * הכול נבנה מצורות פשוטות במרחק — זו הדרך שבה הדמיות אדריכליות עובדות:
 * מה שרחוק אינו צריך פרטים, הוא צריך צללית ואווירה נכונות.
 *
 * הנוף אופייני ואינו גיאוגרפי מדויק.
 */

/** מספר פסאודו-אקראי יציב — אותו נוף בכל טעינה */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

// ---------------------------------------------------------------------------
// כיפת שמיים
// ---------------------------------------------------------------------------

const SKY_VERTEX = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 ground;
  uniform float eyeHeight;
  varying vec3 vWorldPosition;

  void main() {
    // המעבר נמדד סביב גובה העין, כך שהאופק נשאר במקומו גם בקומה גבוהה
    float h = (vWorldPosition.y - eyeHeight) / 220.0;
    vec3 color;
    if (h >= 0.0) {
      color = mix(horizon, zenith, clamp(pow(h, 0.42), 0.0, 1.0));
    } else {
      color = mix(horizon, ground, clamp(pow(-h * 3.0, 0.5), 0.0, 1.0));
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

function SkyDome({ palette, eyeHeight }: { palette: ExteriorPalette; eyeHeight: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          zenith: { value: new THREE.Color(palette.zenith) },
          horizon: { value: new THREE.Color(palette.horizon) },
          ground: { value: new THREE.Color(palette.ground) },
          eyeHeight: { value: eyeHeight },
        },
      }),
    [palette.zenith, palette.horizon, palette.ground, eyeHeight],
  );

  return (
    <mesh material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[900, 32, 20]} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// ים
// ---------------------------------------------------------------------------

/**
 * הים.
 *
 * הוא אינו כתם מים על קרקע — הוא המשטח שמגיע עד האופק. רצועת חוף מפרידה
 * בינו לבין הבניין, אחרת הדירה נראית כאילו היא עומדת במים.
 */
function Water({
  palette,
  groundY,
  shoreZ,
}: {
  palette: ExteriorPalette;
  groundY: number;
  /** קו החוף. מעבר לו יש ים, לפניו יש יבשה. */
  shoreZ: number;
}) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY + 0.05, shoreZ - 1100]}>
        <planeGeometry args={[2600, 2200]} />
        {/* חלק ומחזיר — הים מקבל את צבעו מהשמיים שמעליו */}
        <meshStandardMaterial
          color={palette.water}
          roughness={0.1}
          metalness={0.08}
          envMapIntensity={1.6}
        />
      </mesh>

      {/* רצועת החוף */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY + 0.12, shoreZ + 16]}>
        <planeGeometry args={[2600, 34]} />
        <meshStandardMaterial color="#cdc0a6" roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// קו רקיע
// ---------------------------------------------------------------------------

interface Block {
  position: [number, number, number];
  size: [number, number, number];
}

function Skyline({
  preset,
  palette,
  groundY,
  detail,
  shoreZ,
}: {
  preset: ExteriorPreset;
  palette: ExteriorPalette;
  groundY: number;
  detail: number;
  shoreZ: number | null;
}) {
  const blocks = useMemo<Block[]>(() => {
    const random = makeRandom(9176);
    const count = Math.round(preset.skylineDensity * detail);
    const result: Block[] = [];

    for (let index = 0; index < count; index += 1) {
      // המבנים מסודרים בקשת מאחורי הדירה, בשני עומקים
      const angle = (random() - 0.5) * Math.PI * 1.35 - Math.PI / 2;
      const ring = random() < 0.45 ? 1 : 1.55;
      const distance = preset.distanceM * ring * (0.85 + random() * 0.4);
      const height = preset.skylineHeightM * (0.45 + random() * 1.1);
      const width = 9 + random() * 16;

      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      // אין בניינים בתוך הים
      if (shoreZ !== null && z < shoreZ) continue;

      result.push({
        position: [x, groundY + height / 2, z],
        size: [width, height, width * (0.7 + random() * 0.6)],
      });
    }

    return result;
  }, [preset.skylineDensity, preset.skylineHeightM, preset.distanceM, groundY, detail, shoreZ]);

  if (blocks.length === 0) return null;

  return (
    <group>
      {blocks.map((block, index) => (
        <mesh key={index} position={block.position}>
          <boxGeometry args={block.size} />
          <meshStandardMaterial
            color={palette.buildings}
            roughness={0.85}
            metalness={0.02}
            // חלונות דולקים — בלילה קו הרקיע הוא מה שנותן עומק לנוף
            // חלונות דולקים, לא מבנים זוהרים: עוצמה נמוכה וגוון קריר יותר
            emissive={palette.windowLight > 0 ? "#f2cf9a" : "#000000"}
            emissiveIntensity={palette.windowLight * 0.085}
          />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// צמחייה והרים
// ---------------------------------------------------------------------------

function Greenery({
  preset,
  palette,
  groundY,
  detail,
  shoreZ,
}: {
  preset: ExteriorPreset;
  palette: ExteriorPalette;
  groundY: number;
  detail: number;
  shoreZ: number | null;
}) {
  const trees = useMemo(() => {
    const random = makeRandom(4421);
    const count = Math.round(preset.greenery * detail * 1.4);
    const result: { position: [number, number, number]; radius: number }[] = [];

    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2;
      const distance = preset.distanceM * (0.55 + random() * 0.8);
      const radius = 2.4 + random() * 2.6;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      // אין עצים בתוך הים
      if (shoreZ !== null && z < shoreZ) continue;

      result.push({ position: [x, groundY + radius * 0.9, z], radius });
    }

    return result;
  }, [preset.greenery, preset.distanceM, groundY, detail, shoreZ]);

  if (trees.length === 0) return null;

  return (
    <group>
      {trees.map((tree, index) => (
        <mesh key={index} position={tree.position}>
          <sphereGeometry args={[tree.radius, 8, 6]} />
          <meshStandardMaterial color={palette.greenery} roughness={0.95} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

function Hills({
  preset,
  palette,
  groundY,
}: {
  preset: ExteriorPreset;
  palette: ExteriorPalette;
  groundY: number;
}) {
  const hills = useMemo(() => {
    const random = makeRandom(1337);
    return Array.from({ length: 9 }, (_, index) => {
      const angle = -Math.PI / 2 + (index - 4) * 0.28;
      const distance = preset.distanceM * (1.3 + random() * 0.5);
      const height = 40 + random() * 70;
      return {
        position: [Math.cos(angle) * distance, groundY + height / 2, Math.sin(angle) * distance] as [
          number,
          number,
          number,
        ],
        radius: 60 + random() * 50,
        height,
      };
    });
  }, [preset.distanceM, groundY]);

  return (
    <group>
      {hills.map((hill, index) => (
        <mesh key={index} position={hill.position}>
          <coneGeometry args={[hill.radius, hill.height, 7]} />
          <meshStandardMaterial color={palette.greenery} roughness={1} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------

export function Exterior({
  environment,
  timeOfDay,
  quality,
  apartmentSpanM,
}: {
  environment: ExteriorEnvironment | null;
  timeOfDay: TimeOfDay;
  quality: QualitySettings;
  apartmentSpanM: number;
}) {
  const preset = EXTERIOR_PRESETS[environment?.viewType ?? "OTHER"];
  const palette = EXTERIOR_PALETTES[timeOfDay];

  // גובה הקומה קובע את מיקום הקרקע ביחס לדירה — ומכאן את קו האופק
  const floorHeight = environment?.floorHeightM ?? 0;
  const groundY = -Math.max(0, floorHeight);

  // הנוף מסובב כך שהמרפסת פונה אליו
  const rotation = ((environment?.balconyDirection ?? environment?.orientation ?? 0) * Math.PI) / 180;

  // כמות פרטים לפי רמת האיכות — נוף רחוק אינו שווה ירידה בקצב התצוגה
  const detail = quality.postProcessing ? (quality.ambientOcclusion ? 46 : 32) : 18;

  // העולם מחולק בקו החוף: לפניו יבשה, מעבר לו ים. בלי החלוקה הזו הבניין
  // נראה כאילו הוא עומד במים.
  const shoreZ = preset.water ? -preset.distanceM * 0.8 : null;

  return (
    <group>
      <SkyDome palette={palette} eyeHeight={apartmentSpanM * 0.2} />

      <group rotation={[0, rotation, 0]}>
        {/* הקרקע שמתחת לבניין — נראית כאשר הדירה בקומה גבוהה */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, groundY, shoreZ === null ? 0 : shoreZ + 1150]}
        >
          <planeGeometry args={[2600, shoreZ === null ? 2600 : 2300]} />
          <meshStandardMaterial color={palette.ground} roughness={1} metalness={0} />
        </mesh>

        {shoreZ !== null ? (
          <Water palette={palette} groundY={groundY} shoreZ={shoreZ} />
        ) : null}
        <Skyline
          preset={preset}
          palette={palette}
          groundY={groundY}
          detail={detail}
          shoreZ={shoreZ}
        />
        <Greenery
          preset={preset}
          palette={palette}
          groundY={groundY}
          detail={detail}
          shoreZ={shoreZ}
        />
        {preset.hills ? <Hills preset={preset} palette={palette} groundY={groundY} /> : null}
      </group>

    </group>
  );
}
