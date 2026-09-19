"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Html, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three-stdlib";

import {
  disposeProceduralTextures,
  getProceduralTextures,
} from "@/lib/three/procedural-textures";
import type { MaterialSlot, SceneBox, SceneModel } from "@/lib/three/scene-model";
import { CameraRig, type CameraMode } from "./camera-rig";
import { BALCONY_LIGHT_COLOR, INTERIOR_LIGHT_COLOR } from "@/lib/visualization/lighting";
import type { QualitySettings } from "@/lib/visualization/quality";
import type { ResolvedMaterial, SceneLightingDescriptor } from "@/lib/visualization/types";
import { PostEffects } from "./post-effects";

export type { CameraMode };

interface SceneProps {
  model: SceneModel;
  materials: Record<MaterialSlot, ResolvedMaterial>;
  lighting: SceneLightingDescriptor;
  quality: QualitySettings;
  cameraMode: CameraMode;
  focusedRoomId: string | null;
  /** מסלול הסיור הקולנועי. ריק = אין סיור פעיל. */
  tourRoomIds: string[];
  selectedCategory: string | null;
  onSelect?: (category: string, label: string) => void;
  showRoomLabels: boolean;
}

/**
 * מותח את קואורדינטות המרקם לפי מידות התיבה.
 *
 * בלי זה, אריח על קיר באורך 6 מ' נמתח לאורך כל הקיר ונראה כמו כתם. המתיחה
 * נעשית על הגאומטריה ולא על הטקסטורה, כדי שכל המשטחים יחלקו מרקם אחד בזיכרון.
 */
function scaleFaceUvs(geometry: THREE.BoxGeometry, size: [number, number, number], scaleM: number) {
  const uv = geometry.attributes.uv;
  const [width, height, depth] = size;
  // סדר הפאות ב-BoxGeometry: +X, -X, +Y, -Y, +Z, -Z — ארבע נקודות לכל פאה
  const faceSpans: [number, number][] = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ];

  for (let face = 0; face < 6; face += 1) {
    const [spanU, spanV] = faceSpans[face];
    const repeatU = Math.max(0.25, spanU / scaleM);
    const repeatV = Math.max(0.25, spanV / scaleM);

    for (let corner = 0; corner < 4; corner += 1) {
      const index = face * 4 + corner;
      uv.setXY(index, uv.getX(index) * repeatU, uv.getY(index) * repeatV);
    }
  }

  uv.needsUpdate = true;
}

/**
 * מתיחת מרקם אחידה — לגאומטריה שאינה תיבה פשוטה.
 * פחות מדויק ממתיחה לפי פאה, אבל מספיק לבד ולעץ על רהיט.
 */
function scaleUniformUvs(geometry: THREE.BufferGeometry, span: number, scaleM: number) {
  const uv = geometry.attributes.uv;
  if (!uv) return;
  const repeat = Math.max(0.5, span / scaleM);
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, uv.getX(index) * repeat, uv.getY(index) * repeat);
  }
  uv.needsUpdate = true;
}

/** משטח בודד בסצנה */
function Surface({
  box,
  material,
  highlighted,
  quality,
  onSelect,
}: {
  box: SceneBox;
  material: ResolvedMaterial;
  highlighted: boolean;
  quality: QualitySettings;
  onSelect?: (category: string, label: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isInteractive = box.selectable && Boolean(onSelect) && Boolean(box.category);
  const transparent = material.opacity !== undefined;

  const textures = useMemo(
    () =>
      getProceduralTextures(
        material.texture,
        material.baseColor,
        material.normalStrength ?? 0,
        Math.min(quality.maxTextureSize, 1024),
      ),
    [material.texture, material.baseColor, material.normalStrength, quality.maxTextureSize],
  );

  const geometry = useMemo(() => {
    const [width, height, depth] = box.size;
    const scaleM = material.texture?.scaleM ?? 1;

    if (box.shape === "CYLINDER") {
      const geo = new THREE.CylinderGeometry(width / 2, width / 2, height, 20);
      return geo;
    }

    if (box.shape === "SPHERE") {
      // כדור רחב מעט מגובהו — צמרת של צמח אינה כדור מושלם
      const geo = new THREE.SphereGeometry(0.5, 20, 14);
      geo.scale(width, height, depth);
      return geo;
    }

    if (box.shape === "ROUNDED") {
      // פינות מעוגלות תופסות אור לאורך הקצה. בלי זה כל רהיט נראה כמו קופסה.
      const radius = Math.min(
        box.cornerRadius ?? 0.03,
        Math.min(width, height, depth) / 2 - 0.001,
      );
      const geo = new RoundedBoxGeometry(width, height, depth, 3, Math.max(0.002, radius));
      if (textures.map) scaleUniformUvs(geo, Math.max(width, height, depth), scaleM);
      return geo;
    }

    const geo = new THREE.BoxGeometry(width, height, depth);
    if (textures.map) scaleFaceUvs(geo, box.size, scaleM);
    return geo;
  }, [box.size, box.shape, box.cornerRadius, textures.map, material.texture?.scaleM]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // כאשר יש מרקם, הגוון כבר צבוע בתוכו. הכפלה נוספת בצבע החומר הייתה מכהה
  // כל משטח פי שניים — ריצוף בטון אפור היה מופיע שחור.
  const active = hovered || highlighted;
  const tint = textures.map
    ? active
      ? "#ffffff"
      : "#ffffff"
    : active
      ? lighten(material.baseColor)
      : material.baseColor;
  const usePhysical = material.family === "GLASS" || (material.clearcoat ?? 0) > 0;

  const common = {
    color: tint,
    roughness: material.roughness,
    metalness: material.metalness,
    map: textures.map,
    normalMap: quality.shadows ? textures.normalMap : null,
    roughnessMap: textures.roughnessMap,
    envMapIntensity: material.envIntensity ?? 0.5,
    transparent,
    opacity: material.opacity ?? 1,
    // הדגשה נעשית באור עצמי ולא בשינוי הגוון, כדי שהחומר שנבחר יישאר נאמן.
    // גוף תאורה נושא אור עצמי משלו, ואין להחליף אותו בכחול ההדגשה.
    emissive: active ? "#2f5d99" : (material.emissive ?? "#000000"),
    emissiveIntensity: highlighted
      ? 0.22
      : active
        ? 0.1
        : (material.emissiveIntensity ?? 0),
  };

  return (
    <mesh
      geometry={geometry}
      position={box.position}
      castShadow={box.kind !== "FLOOR"}
      receiveShadow
      onPointerOver={(event) => {
        if (!isInteractive) return;
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        if (!isInteractive) return;
        setHovered(false);
        document.body.style.cursor = "";
      }}
      onClick={(event) => {
        if (!isInteractive || !box.category) return;
        event.stopPropagation();
        onSelect?.(box.category, box.label ?? "");
      }}
    >
      {usePhysical ? (
        <meshPhysicalMaterial
          {...common}
          clearcoat={material.clearcoat ?? 0}
          clearcoatRoughness={0.15}
          transmission={material.family === "GLASS" ? 0.6 : 0}
          thickness={material.family === "GLASS" ? 0.02 : 0}
          ior={1.45}
        />
      ) : (
        <meshStandardMaterial {...common} />
      )}
    </mesh>
  );
}

function lighten(hex: string): string {
  const value = hex.replace("#", "");
  if (value.length !== 6) return hex;
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16);
    return Math.min(255, Math.round(channel + (255 - channel) * 0.18));
  });
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * מפת סביבה מחושבת.
 *
 * אין כאן HDRI מהרשת: הסביבה נבנית מגופי אור וירטואליים ומצולמת לקובייה פעם
 * אחת. התוצאה היא השתקפויות אמינות בשיש, בזכוכית ובמתכת — בלי הורדת קובץ,
 * ובלי לשלוח דבר החוצה.
 */
function SceneEnvironment({ lighting }: { lighting: SceneLightingDescriptor }) {
  const exposure = lighting.exposure;
  return (
    <Environment frames={1} resolution={128} background={false}>
      {/* כיפת שמיים */}
      <Lightformer
        form="ring"
        intensity={lighting.ambientIntensity * 2.4 * exposure}
        color={lighting.skyColor}
        scale={30}
        position={[0, 12, 0]}
        rotation-x={Math.PI / 2}
      />
      {/*
        השמש במפת הסביבה קיימת בשביל ההשתקפויות בלבד — עוצמת האור עצמה מגיעה
        מה-directionalLight. עוצמה גבוהה כאן יצרה כתם זוהר על קירות מט.
      */}
      <Lightformer
        form="ring"
        intensity={lighting.sunIntensity * 0.45 * exposure}
        color={lighting.sunColor}
        scale={8}
        position={lighting.sunPosition}
      />
      {/* ערפילי האופק — נותנים לזכוכית קו רקיע להחזיר */}
      <Lightformer
        form="rect"
        intensity={lighting.envIntensity * 1.6 * exposure}
        color={lighting.horizonColor}
        scale={[40, 6, 1]}
        position={[0, 1.5, -22]}
      />
      <Lightformer
        form="rect"
        intensity={lighting.envIntensity * 1.2 * exposure}
        color={lighting.horizonColor}
        scale={[40, 6, 1]}
        position={[0, 1.5, 22]}
        rotation-y={Math.PI}
      />
      {/* קרקע */}
      <Lightformer
        form="rect"
        intensity={lighting.ambientIntensity * exposure}
        color={lighting.groundColor}
        scale={40}
        position={[0, -6, 0]}
        rotation-x={-Math.PI / 2}
      />
    </Environment>
  );
}

/**
 * תאורה פנימית.
 *
 * גוף תאורה לכל חדר, בגובה התקרה. בלילה זה מה שהופך את הדירה למוארת מבפנים
 * ולא לקופסה חשוכה.
 */
function InteriorLights({
  rooms,
  lighting,
  maxLights,
  exposure,
}: {
  rooms: SceneModel["rooms"];
  lighting: SceneLightingDescriptor;
  maxLights: number;
  exposure: number;
}) {
  // באור יום מלא לא מדליקים את האור בבית. גוף תאורה דולק בצהריים יצר כתם
  // זוהר על הקיר הקרוב ונראה כמו תקלה — אלא אם החדר סגור בתקרה.
  if (lighting.interiorIntensity < 0.2) return null;

  // חדרים גדולים ראשונים — כשיש תקציב אורות מוגבל, הם אלה שנראים
  const lit = [...rooms].sort((a, b) => b.area - a.area).slice(0, Math.min(maxLights, 4));

  return (
    <>
      {lit.map((room) => {
        const outdoor = room.isOutdoor;
        const intensity = outdoor ? lighting.balconyIntensity : lighting.interiorIntensity;
        if (intensity < 0.05) return null;

        return (
          <pointLight
            key={room.id}
            position={[room.center[0], outdoor ? 2.2 : 2.45, room.center[1]]}
            // עוצמה נמוכה ומרחק גדול: אור חזק קרוב לקיר נשרף לכתם לבן
            intensity={intensity * (outdoor ? 5 : 7) * exposure}
            distance={outdoor ? 7 : 11}
            decay={2}
            color={outdoor ? BALCONY_LIGHT_COLOR : INTERIOR_LIGHT_COLOR}
          />
        );
      })}
    </>
  );
}

/**
 * אור יום שנכנס דרך הפתחים.
 *
 * אין כאן תאורה גלובלית, ולכן חדר סגור לא היה מקבל אור כלל. גוף אור בכל
 * פתח ממלא את התפקיד שממלא בפועל החלון: החלל בהיר ליד הפתח ומתעמעם פנימה.
 * זה מה שנותן לחדר עומק במקום תאורה אחידה.
 */
function DaylightOpenings({
  openings,
  lighting,
  exposure,
  maxLights,
}: {
  openings: SceneModel["openings"];
  lighting: SceneLightingDescriptor;
  exposure: number;
  maxLights: number;
}) {
  // בלילה לא נכנס אור יום; התאורה הפנימית עושה את העבודה
  const strength = lighting.sunIntensity * 0.3 * exposure;
  if (strength < 0.03) return null;

  // פתחים רחבים קודם — דלת מרפסת מאירה חלל שלם, חלון שירותים כמעט לא
  // מספר האורות בסצנה חסום בכוונה: מעבר לכך הצללת החומרים מפסיקה להתקמפל
  // בחלק מהמכשירים, וכל הדירה מוצגת שחורה.
  const lit = [...openings].sort((a, b) => b.widthM - a.widthM).slice(0, Math.min(maxLights, 4));

  return (
    <>
      {lit.map((opening) => (
        <pointLight
          key={opening.id}
          position={opening.position}
          intensity={strength * (opening.isBalconyDoor ? 2 : 1) * opening.widthM}
          distance={opening.isBalconyDoor ? 11 : 7}
          decay={2}
          color={lighting.skyColor}
        />
      ))}
    </>
  );
}

/** אורות העיר ברקע — נדלקים בשקיעה ובלילה */
function CityLights({ lighting, span }: { lighting: SceneLightingDescriptor; span: number }) {
  const points = useMemo(() => {
    const result: [number, number, number][] = [];
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let index = 0; index < 70; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = span * (2.2 + random() * 1.6);
      result.push([Math.cos(angle) * radius, -2 + random() * 6, Math.sin(angle) * radius]);
    }
    return result;
  }, [span]);

  if (lighting.cityLights < 0.1) return null;

  return (
    <group>
      {points.map((position, index) => (
        <mesh key={index} position={position}>
          <sphereGeometry args={[0.16, 6, 6]} />
          <meshBasicMaterial
            color={index % 4 === 0 ? "#ffd9a0" : "#cfe0ff"}
            transparent
            opacity={lighting.cityLights * 0.85}
          />
        </mesh>
      ))}
    </group>
  );
}

function RoomLabels({ rooms }: { rooms: SceneModel["rooms"] }) {
  return (
    <>
      {rooms
        .filter((room) => room.label)
        .map((room) => (
          <Html
            key={room.id}
            position={[room.center[0], 0.05, room.center[1]]}
            center
            distanceFactor={9}
            occlude={false}
            zIndexRange={[10, 0]}
          >
            <span className="pointer-events-none rounded-pill bg-white/85 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-ink-soft shadow-subtle">
              {room.label}
            </span>
          </Html>
        ))}
    </>
  );
}

/** משחרר את המרקמים כשהמסך נסגר */
function TextureCleanup() {
  useEffect(() => () => disposeProceduralTextures(), []);
  return null;
}

export function ApartmentScene({
  model,
  materials,
  lighting,
  quality,
  cameraMode,
  focusedRoomId,
  tourRoomIds,
  selectedCategory,
  onSelect,
  showRoomLabels,
}: SceneProps) {
  const span = Math.max(model.size[0], model.size[1], 6);
  // חשיפת "המצלמה" — מוחלת על כל מקורות האור יחד
  const exposure = lighting.exposure;
  const environmentKey = `${lighting.background}:${lighting.exposure}:${lighting.envIntensity}`;

  return (
    <Canvas
      // צללים רכים דרך המנוע עצמו. אין להשתמש כאן ב-SoftShadows של drei —
      // הוא מחליף את שכבת הצללים ואינו תואם לגרסת three הנוכחית.
      shadows={quality.shadows ? "soft" : false}
      dpr={[1, quality.maxDpr]}
      camera={{
        position: [model.center[0] + span * 0.82, span * 0.52, model.center[1] + span * 0.92],
        fov: 42,
      }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        // מיפוי גוונים קולנועי — בלעדיו אזורים מוארים נשרפים ללבן שטוח.
        // החשיפה עצמה מוחלת על עוצמות האור ולא כאן: שרשרת העיבוד שאחרי
        // הרינדור אינה מעבירה שינוי ב-toneMappingExposure, וכך הערך הזה היה
        // נראה כאילו אין לו השפעה.
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1;
      }}
      // רקע מדורג: שמיים למעלה, ערפילי אופק למטה. רקע שטוח שיטח גם את הדירה.
      style={{
        background: `linear-gradient(180deg, ${lighting.background} 0%, ${lighting.horizonColor} 100%)`,
      }}
    >
      <TextureCleanup />

      {/*
        המפתח מאלץ אפייה מחדש של מפת הסביבה כשהתאורה משתנה. בלעדיו המפה
        נאפית פעם אחת בלבד, ממשיכה להאיר את הסצנה בערכים הישנים, וכל שינוי
        בתאורה נראה כאילו אין לו השפעה.
      */}
      <SceneEnvironment key={environmentKey} lighting={lighting} />

      {/*
        מילוי שמחליף את האור החוזר מהקירות ומהתקרה. אין כאן תאורה גלובלית,
        וללא המילוי הזה רצפת חדר סגור מקבלת כמעט אפס אור ונראית שחורה.
      */}
      <hemisphereLight
        args={[
          lighting.skyColor,
          lighting.groundColor,
          // במצב סיור הדירה מקורה. המילוי הפנימי מגיע מכאן ולא מגופי אור
          // נקודתיים: גוף אור קרוב לקיר שורף עליו כתם לבן, תמיד.
          lighting.ambientIntensity * exposure * (model.enclosed ? 2.6 : 1),
        ]}
      />
      <directionalLight
        position={lighting.sunPosition}
        // שמש ישירה כמעט אינה נכנסת לדירה מקורה; מה שנכנס מגיע דרך הפתחים
        intensity={lighting.sunIntensity * exposure * (model.enclosed ? 0.3 : 1)}
        color={lighting.sunColor}
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={3}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />

      <InteriorLights
        rooms={model.rooms}
        lighting={lighting}
        maxLights={quality.maxLocalLights}
        exposure={exposure}
      />
      {model.enclosed ? (
        <DaylightOpenings
          openings={model.openings}
          lighting={lighting}
          exposure={exposure}
          maxLights={quality.maxLocalLights}
        />
      ) : null}
      <CityLights lighting={lighting} span={span} />

      {/* משטח בסיס — מעגן את הדירה בלי להשתלט על התמונה */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[model.center[0], -0.15, model.center[1]]}
        receiveShadow
      >
        <planeGeometry args={[model.size[0] + 1.6, model.size[1] + 1.6]} />
        <meshStandardMaterial color={lighting.groundColor} roughness={1} metalness={0} />
      </mesh>

      {/* צל מגע — מעגן את הדירה בקרקע ונותן עומק */}
      {quality.contactShadows ? (
        <ContactShadows
          position={[model.center[0], -0.12, model.center[1]]}
          scale={span * 2.4}
          resolution={quality.shadowMapSize}
          blur={2}
          opacity={0.6}
          far={4}
          frames={1}
        />
      ) : null}

      <group>
        {model.boxes.map((box, index) => (
          <Surface
            key={`${box.id}-${index}`}
            box={box}
            // ריהוט המחשה נושא חומר קבוע; כל השאר נגזר מבחירת הדייר
            material={box.appearance ?? materials[box.materialSlot]}
            highlighted={Boolean(box.category && box.category === selectedCategory)}
            quality={quality}
            onSelect={onSelect}
          />
        ))}
      </group>

      {showRoomLabels && cameraMode === "ORBIT" ? <RoomLabels rooms={model.rooms} /> : null}

      <PostEffects quality={quality} lighting={lighting} />

      <CameraRig
        model={model}
        mode={cameraMode}
        focusedRoomId={focusedRoomId}
        tourRoomIds={tourRoomIds}
      />
    </Canvas>
  );
}

export type { THREE };
