"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Layout } from "@/lib/packing";
import { useStore } from "@/lib/store";
import { GameBoxes } from "./GameBoxes";
import { Room } from "./Room";
import { createSceneApi, FOV, homeView, MAX_POLAR, sceneApi } from "./sceneApi";
import { Shelves } from "./Shelves";

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
function SceneBridge({ layout, span }: { layout: Layout; span: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    if (!controls) return;
    sceneApi.current = createSceneApi({ gl, scene, camera, controls, invalidate, layout, span });
    return () => {
      sceneApi.current = null;
    };
  }, [gl, scene, camera, controls, invalidate, layout, span]);
  return null;
}

export function Scene({ layout }: { layout: Layout }) {
  const environment = useStore((s) => s.environment);
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
      <GameBoxes placements={layout.placements} />
      <OrbitControls
        makeDefault
        enableDamping={false}
        maxPolarAngle={MAX_POLAR}
        minDistance={30}
        maxDistance={2500}
      />
      <CameraRig span={Math.max(layout.width, 120)} />
      <SceneBridge layout={layout} span={Math.max(layout.width, 120)} />
    </Canvas>
  );
}
