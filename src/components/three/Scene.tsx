"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Layout } from "@/lib/packing";
import { useStore } from "@/lib/store";
import { GameBoxes } from "./GameBoxes";
import { Room } from "./Room";
import { Shelves } from "./Shelves";

/** Re-frame the camera whenever the overall width of the scene changes. */
function CameraRig({ span }: { span: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const size = useThree((s) => s.size);

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const halfFov = ((40 / 2) * Math.PI) / 180;
    const fitW = (span / 2 + 30) / (Math.tan(halfFov) * aspect);
    const fitH = 118 / Math.tan(halfFov);
    const dist = Math.max(fitW, fitH);
    camera.position.set(dist * 0.08, 120, dist + 20);
    controls?.target.set(0, 100, 20);
    controls?.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-frame on span changes, not on resize
  }, [span, camera, controls]);
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
      camera={{ fov: 40, near: 1, far: 8000, position: [0, 120, 400] }}
      onPointerMissed={() => set({ selectedId: null })}
    >
      <Room id={environment} span={span} />
      <Shelves shelves={layout.shelves} />
      <GameBoxes placements={layout.placements} />
      <OrbitControls
        makeDefault
        enableDamping={false}
        maxPolarAngle={Math.PI / 2 - 0.03}
        minDistance={30}
        maxDistance={2500}
      />
      <CameraRig span={Math.max(layout.width, 120)} />
    </Canvas>
  );
}
