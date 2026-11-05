"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { lazy, Suspense, useEffect, useMemo } from "react";
import type * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { BodySpec } from "@/lib/bodies";
import type { Layout } from "@/lib/packing";
import { useStore } from "@/lib/store";
import { GameBoxes } from "./GameBoxes";
import { Room } from "./Room";
import { createSceneApi, FOV, homeView, MAX_POLAR, sceneApi } from "./sceneApi";
import { Shelves } from "./Shelves";

// Rapier (WASM) only loads once physics or manual mode is switched on.
const PhysicsWorld = lazy(() => import("./PhysicsWorld"));

/** Re-frame the camera whenever the overall width of the scene changes. */
function CameraRig({ span }: { span: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const size = useThree((s) => s.size);

  useEffect(() => {
    const { position, target } = homeView(span, size.width / Math.max(1, size.height));
    camera.position.copy(position);
    controls?.target.copy(target);
    controls?.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-frame on span changes, not on resize
  }, [span, camera, controls]);
  return null;
}

/** Exposes camera moves and image export to the UI outside the canvas. */
function SceneBridge({ layout, boxes, span }: { layout: Layout; boxes: Box[]; span: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    if (!controls) return;
    sceneApi.current = createSceneApi({ gl, scene, camera, controls, invalidate, layout, boxes, span });
    return () => {
      sceneApi.current = null;
    };
  }, [gl, scene, camera, controls, invalidate, layout, boxes, span]);
  return null;
}

type Box = { center: [number, number, number]; size: [number, number, number] };

/** A fresh physics world for every new set of bodies. */
const worldIds = new WeakMap<BodySpec[], number>();
let worldCount = 0;
const worldKey = (bodies: BodySpec[]) => {
  if (!worldIds.has(bodies)) worldIds.set(bodies, ++worldCount);
  return worldIds.get(bodies);
};

export function Scene({ layout, bodies }: { layout: Layout; bodies: BodySpec[] | null }) {
  const environment = useStore((s) => s.environment);
  const mode = useStore((s) => s.mode);
  const boxes = useMemo<Box[]>(
    () => (bodies ? bodies.map((b) => ({ center: b.position, size: b.size })) : layout.placements),
    [bodies, layout],
  );
  const set = useStore((s) => s.set);
  const floorSpan = layout.floorAreas.reduce((m, a) => Math.max(m, Math.abs(a.x), Math.abs(a.x + a.w)), 0) * 2;
  const span = Math.max(layout.width, floorSpan, 120);

  return (
    <Canvas
      shadows
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: FOV, near: 1, far: 8000, position: [0, 120, 400] }}
      onPointerMissed={() => set({ selectedId: null })}
    >
      <Room id={environment} span={span} />
      <Shelves shelves={layout.shelves} />
      {bodies ? (
        <Suspense fallback={null}>
          <PhysicsWorld key={`${mode}-${worldKey(bodies)}`} bodies={bodies} shelves={layout.shelves} mode={mode} />
        </Suspense>
      ) : (
        <GameBoxes placements={layout.placements} />
      )}
      <OrbitControls makeDefault enableDamping={false} maxPolarAngle={MAX_POLAR} minDistance={30} maxDistance={2500} />
      <CameraRig span={Math.max(layout.width, 120)} />
      <SceneBridge layout={layout} boxes={boxes} span={Math.max(layout.width, 120)} />
    </Canvas>
  );
}
