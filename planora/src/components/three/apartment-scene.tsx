"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, SoftShadows } from "@react-three/drei";
import type * as THREE from "three";

import type { MaterialAppearance, SceneLighting } from "@/lib/three/materials";
import type { MaterialSlot, SceneBox, SceneModel } from "@/lib/three/scene-model";

export type CameraMode = "ORBIT" | "WALK";

interface SceneProps {
  model: SceneModel;
  materials: Record<MaterialSlot, MaterialAppearance>;
  lighting: SceneLighting;
  cameraMode: CameraMode;
  selectedCategory: string | null;
  onSelect?: (category: string, label: string) => void;
  showRoomLabels: boolean;
}

/** משטח בודד בסצנה */
function Surface({
  box,
  appearance,
  highlighted,
  onSelect,
}: {
  box: SceneBox;
  appearance: MaterialAppearance;
  highlighted: boolean;
  onSelect?: (category: string, label: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isInteractive = box.selectable && Boolean(onSelect) && Boolean(box.category);
  const transparent = appearance.opacity !== undefined;

  return (
    <mesh
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
      <boxGeometry args={box.size} />
      <meshStandardMaterial
        color={hovered || highlighted ? lighten(appearance.color) : appearance.color}
        roughness={appearance.roughness}
        metalness={appearance.metalness}
        transparent={transparent}
        opacity={appearance.opacity ?? 1}
        emissive={highlighted ? "#2f5d99" : "#000000"}
        emissiveIntensity={highlighted ? 0.22 : 0}
      />
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

/** מצב הליכה בסיסי — המצלמה נעה בגובה עיניים */
function WalkCamera({ center }: { center: [number, number] }) {
  const { camera } = useThree();
  const angle = useRef(0);

  useFrame((_, delta) => {
    angle.current += delta * 0.12;
    const radius = 2.4;
    camera.position.set(
      center[0] + Math.cos(angle.current) * radius,
      1.65,
      center[1] + Math.sin(angle.current) * radius,
    );
    camera.lookAt(center[0], 1.5, center[1]);
  });

  return null;
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
            distanceFactor={14}
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

export function ApartmentScene({
  model,
  materials,
  lighting,
  cameraMode,
  selectedCategory,
  onSelect,
  showRoomLabels,
}: SceneProps) {
  const target = useMemo<[number, number, number]>(
    () => [model.center[0], 0.9, model.center[1]],
    [model.center],
  );

  const span = Math.max(model.size[0], model.size[1], 6);

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [model.center[0] + span * 0.7, span * 0.72, model.center[1] + span * 0.8], fov: 42 }}
      gl={{ antialias: true }}
      style={{ background: lighting.background }}
    >
      <SoftShadows size={28} samples={10} focus={0.9} />

      <hemisphereLight
        args={[lighting.skyColor, lighting.groundColor, lighting.ambientIntensity]}
      />
      <directionalLight
        position={lighting.sunPosition}
        intensity={lighting.sunIntensity}
        color={lighting.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      {/* תאורה פנימית — משמעותית בשקיעה ובלילה */}
      <pointLight
        position={[model.center[0], 2.4, model.center[1]]}
        intensity={lighting.interiorIntensity * 12}
        distance={16}
        decay={2}
        color="#ffe9c9"
      />

      <group>
        {model.boxes.map((box, index) => (
          <Surface
            key={`${box.id}-${index}`}
            box={box}
            appearance={materials[box.materialSlot]}
            highlighted={Boolean(box.category && box.category === selectedCategory)}
            onSelect={onSelect}
          />
        ))}
      </group>

      {showRoomLabels && cameraMode === "ORBIT" ? <RoomLabels rooms={model.rooms} /> : null}

      {cameraMode === "WALK" ? (
        <WalkCamera center={model.center} />
      ) : (
        <OrbitControls
          target={target}
          enableDamping
          dampingFactor={0.08}
          minDistance={3}
          maxDistance={span * 2.2}
          maxPolarAngle={Math.PI / 2.08}
          makeDefault
        />
      )}
    </Canvas>
  );
}

export type { THREE };
