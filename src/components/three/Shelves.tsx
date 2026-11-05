"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { ShelfInstance } from "@/lib/packing";
import { useStore } from "@/lib/store";
import { woodGrain } from "./textures";

function useFinishMaterial() {
  const finish = useStore((s) => s.finish);
  return useMemo(() => {
    switch (finish) {
      case "black":
        return new THREE.MeshStandardMaterial({ color: "#2e2622", roughness: 0.55 });
      case "oak":
        return new THREE.MeshStandardMaterial({ map: woodGrain([214, 178, 132]), roughness: 0.6 });
      default:
        return new THREE.MeshStandardMaterial({ color: "#f3f2ee", roughness: 0.5 });
    }
  }, [finish]);
}

export function Shelves({ shelves }: { shelves: ShelfInstance[] }) {
  const material = useFinishMaterial();
  return (
    <group>
      {shelves.map((s) => (
        <group key={s.key} position={[s.offsetX, 0, 0]}>
          {s.build.panels.map((p, i) => (
            <mesh key={i} position={p.center} material={material} castShadow receiveShadow>
              <boxGeometry args={p.size} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
