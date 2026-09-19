"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

import type { SceneBox, SceneModel, SceneRoom } from "@/lib/three/scene-model";

export type CameraMode = "ORBIT" | "WALK";

/** גובה עיניים של אדם עומד */
const EYE_HEIGHT_M = 1.62;
/** רדיוס הגוף — מונע מעבר דרך קירות */
const BODY_RADIUS_M = 0.3;
const WALK_SPEED = 2.4;
const LOOK_SPEED = 0.0028;
/** עדשה רחבה לצילום פנים — 42 מעלות "מדביקות" את המצלמה לקיר */
const WALK_FOV = 72;
const ORBIT_FOV = 42;

// ---------------------------------------------------------------------------
// התנגשויות
// ---------------------------------------------------------------------------

interface Blocker {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * המכשולים שהמצלמה אינה יכולה לעבור דרכם.
 *
 * דלת אינה מכשול — היא פתח. ריצוף אינו מכשול. קירות, מחיצות, מעקות וארונות
 * מטבח כן, כי אדם שהולך בדירה לא עובר דרכם.
 */
function buildBlockers(boxes: SceneBox[]): Blocker[] {
  return boxes
    .filter(
      (box) =>
        box.kind === "WALL" ||
        box.kind === "PARTITION" ||
        box.kind === "RAILING" ||
        box.kind === "KITCHEN" ||
        // רהיט נמוך — שטיח, שולחן סלון — אינו עוצר את המבט; ספה, מיטה וארון כן
        (box.kind === "STAGING" && box.size[1] >= 0.5),
    )
    .map((box) => ({
      minX: box.position[0] - box.size[0] / 2 - BODY_RADIUS_M,
      maxX: box.position[0] + box.size[0] / 2 + BODY_RADIUS_M,
      minZ: box.position[2] - box.size[2] / 2 - BODY_RADIUS_M,
      maxZ: box.position[2] + box.size[2] / 2 + BODY_RADIUS_M,
    }));
}

/**
 * מוצא נקודת עמידה פנויה ליד הנקודה המבוקשת.
 *
 * מרכז החדר עשוי להיות תפוס — שם בדיוק עומד שולחן הסלון או המיטה. חיפוש
 * בספירלה מוצא את המקום הפנוי הקרוב ביותר, במקום להתחיל את הסיור בתוך רהיט.
 */
function findFreeSpot(blockers: Blocker[], x: number, z: number): { x: number; z: number } {
  if (!blocked(blockers, x, z)) return { x, z };

  for (let radius = 0.4; radius <= 4; radius += 0.4) {
    for (let step = 0; step < 16; step += 1) {
      const angle = (step / 16) * Math.PI * 2;
      const candidateX = x + Math.cos(angle) * radius;
      const candidateZ = z + Math.sin(angle) * radius;
      if (!blocked(blockers, candidateX, candidateZ)) {
        return { x: candidateX, z: candidateZ };
      }
    }
  }

  return { x, z };
}

function blocked(blockers: Blocker[], x: number, z: number): boolean {
  for (const blocker of blockers) {
    if (x > blocker.minX && x < blocker.maxX && z > blocker.minZ && z < blocker.maxZ) {
      return true;
    }
  }
  return false;
}

/**
 * מזיז את ההולך, ומחליק לאורך קיר במקום להיתקע בו.
 * בדיקה נפרדת לכל ציר — כך הליכה באלכסון לתוך קיר ממשיכה לאורכו.
 */
function moveWithCollision(
  blockers: Blocker[],
  from: THREE.Vector3,
  deltaX: number,
  deltaZ: number,
): void {
  if (!blocked(blockers, from.x + deltaX, from.z)) from.x += deltaX;
  if (!blocked(blockers, from.x, from.z + deltaZ)) from.z += deltaZ;
}

/**
 * קובע את זווית הראייה של המצלמה.
 * מוחל בלולאת הרינדור, כי הערך נמצא על אובייקט המצלמה עצמו.
 */
function useFieldOfView(fov: number) {
  useFrame((state) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    if (camera.isPerspectiveCamera && Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });
}

// ---------------------------------------------------------------------------
// מצב תצוגה — סיבוב סביב הדירה
// ---------------------------------------------------------------------------

function OrbitRig({
  model,
  focusedRoom,
}: {
  model: SceneModel;
  focusedRoom: SceneRoom | null;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((state) => state.camera);
  useFieldOfView(ORBIT_FOV);
  const span = Math.max(model.size[0], model.size[1], 6);

  // יעד המעבר. null = המבט הכללי על הדירה.
  const goal = useRef<{ target: THREE.Vector3; position: THREE.Vector3 } | null>(null);

  useEffect(() => {
    if (focusedRoom) {
      const target = new THREE.Vector3(focusedRoom.center[0], 1.1, focusedRoom.center[1]);
      // מרחק לפי גודל החדר — חדר רחצה קטן אינו נצפה מאותו מרחק כמו סלון
      const distance = Math.max(3.4, Math.sqrt(focusedRoom.area) * 1.5);
      goal.current = {
        target,
        position: new THREE.Vector3(
          target.x + distance * 0.55,
          distance * 0.85,
          target.z + distance * 0.8,
        ),
      };
    } else {
      goal.current = {
        target: new THREE.Vector3(model.center[0], 0.9, model.center[1]),
        position: new THREE.Vector3(
          model.center[0] + span * 0.7,
          span * 0.72,
          model.center[1] + span * 0.8,
        ),
      };
    }
  }, [focusedRoom, model.center, span]);

  useFrame((_, delta) => {
    const destination = goal.current;
    const orbit = controls.current;
    if (!destination || !orbit) return;

    // מעבר מרוכך — לא קפיצה. המהירות מוגבלת כדי שהעין תספיק לעקוב.
    const step = Math.min(1, delta * 2.6);
    camera.position.lerp(destination.position, step);
    orbit.target.lerp(destination.target, step);
    orbit.update();

    if (
      camera.position.distanceTo(destination.position) < 0.05 &&
      orbit.target.distanceTo(destination.target) < 0.05
    ) {
      goal.current = null;
    }
  });

  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.08}
      minDistance={2.5}
      maxDistance={span * 2.2}
      maxPolarAngle={Math.PI / 2.08}
      makeDefault
    />
  );
}

// ---------------------------------------------------------------------------
// מצב סיור — הליכה בתוך הדירה
// ---------------------------------------------------------------------------

function WalkRig({
  model,
  focusedRoom,
  tourRooms,
}: {
  model: SceneModel;
  focusedRoom: SceneRoom | null;
  /** מסלול הסיור האוטומטי. ריק = הליכה חופשית. */
  tourRooms: SceneRoom[];
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);

  useFieldOfView(WALK_FOV);
  const blockers = useMemo(() => buildBlockers(model.boxes), [model.boxes]);
  const position = useRef(new THREE.Vector3());
  const yaw = useRef(0);
  const pitch = useRef(-0.05);
  const keys = useRef(new Set<string>());
  const dragging = useRef(false);
  const tourIndex = useRef(0);
  const started = useRef(false);
  /** יעד הליכה יחיד — נקבע כשבוחרים חדר בזמן סיור */
  const walkTarget = useRef<THREE.Vector3 | null>(null);

  // נקודת הפתיחה: החדר שנבחר, או החדר הגדול בדירה
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const start =
      focusedRoom ?? [...model.rooms].sort((a, b) => b.area - a.area)[0] ?? null;

    if (!start) {
      position.current.set(model.center[0], EYE_HEIGHT_M, model.center[1]);
      return;
    }

    // עומדים בקצה אחד של החדר ומביטים לאורכו — כך מצלמים חדר, ולא מהמרכז
    // כשהפנים לקיר הקרוב.
    const horizontal = start.size[0] >= start.size[1];
    const along = horizontal ? start.size[0] : start.size[1];
    const backOff = Math.min(along / 2 - 0.5, along * 0.36);

    const standX = start.center[0] - (horizontal ? backOff : 0);
    const standZ = start.center[1] - (horizontal ? 0 : backOff);
    const spot = findFreeSpot(blockers, standX, standZ);
    position.current.set(spot.x, EYE_HEIGHT_M, spot.z);

    // המבט לאורך החדר, אל הקצה הרחוק
    const lookX = start.center[0] + (horizontal ? along / 2 : 0);
    const lookZ = start.center[1] + (horizontal ? 0 : along / 2);
    yaw.current = Math.atan2(lookX - spot.x, lookZ - spot.z);
    pitch.current = -0.06;
  }, [blockers, focusedRoom, model.center, model.rooms]);

  // בחירת חדר במצב סיור מהלכת את המצלמה אליו, במקום להחליף תמונה
  useEffect(() => {
    if (!started.current || !focusedRoom) return;
    walkTarget.current = new THREE.Vector3(
      focusedRoom.center[0],
      EYE_HEIGHT_M,
      focusedRoom.center[1],
    );
  }, [focusedRoom]);

  // מקלדת
  useEffect(() => {
    const pressed = keys.current;
    const down = (event: KeyboardEvent) => pressed.add(event.key.toLowerCase());
    const up = (event: KeyboardEvent) => pressed.delete(event.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      // מקש שנשאר לחוץ כשיוצאים מהסיור לא אמור להזיז את המצלמה בפעם הבאה
      pressed.clear();
    };
  }, []);

  // גרירה להסתכלות מסביב — עובד גם במגע
  useEffect(() => {
    const element = gl.domElement;
    let lastX = 0;
    let lastY = 0;

    const start = (event: PointerEvent) => {
      dragging.current = true;
      // גרירה ידנית מבטלת הליכה אוטומטית — השליטה חוזרת למשתמש
      walkTarget.current = null;
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const move = (event: PointerEvent) => {
      if (!dragging.current) return;
      yaw.current -= (event.clientX - lastX) * LOOK_SPEED * 2;
      pitch.current = Math.max(
        -0.9,
        Math.min(0.75, pitch.current - (event.clientY - lastY) * LOOK_SPEED * 2),
      );
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const end = () => {
      dragging.current = false;
    };

    element.addEventListener("pointerdown", start);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    return () => {
      element.removeEventListener("pointerdown", start);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const step = Math.min(delta, 0.05);

    if (tourRooms.length > 0) {
      // סיור אוטומטי: תנועה רציפה אל החדר הבא, בלי קפיצות
      const goal = tourRooms[tourIndex.current % tourRooms.length];
      const target = new THREE.Vector3(goal.center[0], EYE_HEIGHT_M, goal.center[1]);
      const toTarget = target.clone().sub(position.current);
      const distance = toTarget.length();

      if (distance < 0.45) {
        tourIndex.current += 1;
      } else {
        toTarget.normalize().multiplyScalar(Math.min(WALK_SPEED * 0.7 * step, distance));
        moveWithCollision(blockers, position.current, toTarget.x, toTarget.z);
        // הפנים תמיד לכיוון ההליכה
        const desiredYaw = Math.atan2(toTarget.x, toTarget.z);
        let difference = desiredYaw - yaw.current;
        while (difference > Math.PI) difference -= Math.PI * 2;
        while (difference < -Math.PI) difference += Math.PI * 2;
        yaw.current += difference * Math.min(1, step * 2.2);
        pitch.current += (-0.04 - pitch.current) * Math.min(1, step * 2);
      }
    } else if (walkTarget.current) {
      // הליכה אל חדר שנבחר — אותה תנועה רציפה כמו בסיור המודרך
      const toTarget = walkTarget.current.clone().sub(position.current);
      const distance = toTarget.length();

      if (distance < 0.4) {
        walkTarget.current = null;
      } else {
        toTarget.normalize().multiplyScalar(Math.min(WALK_SPEED * 0.8 * step, distance));
        moveWithCollision(blockers, position.current, toTarget.x, toTarget.z);
        const desiredYaw = Math.atan2(toTarget.x, toTarget.z);
        let difference = desiredYaw - yaw.current;
        while (difference > Math.PI) difference -= Math.PI * 2;
        while (difference < -Math.PI) difference += Math.PI * 2;
        yaw.current += difference * Math.min(1, step * 2.4);
      }
    } else {
      const forward = Number(keys.current.has("w") || keys.current.has("arrowup"));
      const back = Number(keys.current.has("s") || keys.current.has("arrowdown"));
      const left = Number(keys.current.has("a") || keys.current.has("arrowleft"));
      const right = Number(keys.current.has("d") || keys.current.has("arrowright"));

      const move = new THREE.Vector3(right - left, 0, back - forward);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(WALK_SPEED * step);
        // סיבוב וקטור התנועה לכיוון המבט
        const sin = Math.sin(yaw.current);
        const cos = Math.cos(yaw.current);
        moveWithCollision(
          blockers,
          position.current,
          move.x * cos - move.z * sin,
          move.x * sin + move.z * cos,
        );
      }
    }

    camera.position.copy(position.current);
    const direction = new THREE.Vector3(
      Math.sin(yaw.current) * Math.cos(pitch.current),
      Math.sin(pitch.current),
      Math.cos(yaw.current) * Math.cos(pitch.current),
    );
    camera.lookAt(position.current.clone().add(direction));
  });

  return null;
}

export function CameraRig({
  model,
  mode,
  focusedRoomId,
  tourRoomIds,
}: {
  model: SceneModel;
  mode: CameraMode;
  focusedRoomId: string | null;
  /** מסלול סיור קולנועי. ריק = אין סיור פעיל. */
  tourRoomIds: string[];
}) {
  const focusedRoom = useMemo(
    () => model.rooms.find((room) => room.id === focusedRoomId) ?? null,
    [model.rooms, focusedRoomId],
  );

  const tourRooms = useMemo(
    () =>
      tourRoomIds
        .map((id) => model.rooms.find((room) => room.id === id))
        .filter((room): room is SceneRoom => Boolean(room)),
    [model.rooms, tourRoomIds],
  );

  if (mode === "WALK") {
    return <WalkRig model={model} focusedRoom={focusedRoom} tourRooms={tourRooms} />;
  }

  return <OrbitRig model={model} focusedRoom={focusedRoom} />;
}
