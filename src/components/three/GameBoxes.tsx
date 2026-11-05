"use client";

import { Html } from "@react-three/drei";
import { type ThreeEvent, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { colorKey } from "@/lib/images";
import { fallbackColor } from "@/lib/loadCollection";
import type { Placement } from "@/lib/packing";
import { useStore } from "@/lib/store";
import { coverTexture, orientCover, spineTexture } from "./textures";

const plainCache = new Map<string, THREE.MeshStandardMaterial>();
const plain = (color: string) => {
  let m = plainCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    plainCache.set(color, m);
  }
  return m;
};

const texCache = new WeakMap<THREE.Texture, THREE.MeshStandardMaterial>();
const textured = (map: THREE.Texture) => {
  let m = texCache.get(map);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map, roughness: 0.55 });
    texCache.set(map, m);
  }
  return m;
};

// BoxGeometry material order: +x, -x, +y, -y, +z, -z
const FACE = { "+x": 0, "-x": 1, "+y": 2 } as const;

const GameBox = memo(function GameBox({ p, color, hd, maxTex }: { p: Placement; color: string; hd: boolean; maxTex: number }) {
  const { game } = p.sg;
  const [X, Y, Z] = p.size;
  const [cover, setCover] = useState<THREE.Texture | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const set = useStore((s) => s.set);

  useEffect(() => {
    let alive = true;
    coverTexture(game, color, hd, maxTex).then((t) => {
      if (alive) {
        setCover(t);
        invalidate();
      }
    });
    return () => {
      alive = false;
    };
  }, [game, color, hd, maxTex, invalidate]);

  const materials = useMemo(() => {
    const side = plain(color);
    const mats: THREE.Material[] = [side, side, side, side, side, side];
    // Front (+z) shows the spine; text runs along the longer edge.
    const art = cover && !(cover.userData.generated as boolean) ? (cover.image as HTMLCanvasElement) : undefined;
    mats[4] = textured(spineTexture(game, color, X, Y, art));
    if (cover) {
      const [u, v] = p.cover === "+y" ? [X, Z] : [Z, Y];
      mats[FACE[p.cover]] = textured(orientCover(cover, u, v));
    }
    return mats;
  }, [game, color, cover, p.cover, X, Y, Z]);

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    set({ hoveredId: game.collId });
  };
  const onOut = () => {
    if (useStore.getState().hoveredId === game.collId) set({ hoveredId: null });
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    set({ selectedId: game.collId });
  };

  return (
    <mesh
      position={p.center}
      material={materials}
      castShadow
      receiveShadow
      onPointerOver={onOver}
      onPointerOut={onOut}
      onClick={onClick}
    >
      <boxGeometry args={[X - 0.05, Y - 0.05, Z - 0.05]} />
    </mesh>
  );
});

export function GameBoxes({ placements }: { placements: Placement[] }) {
  const colors = useStore((s) => s.colors);
  const hd = useStore((s) => s.hdTextures);
  const hoveredId = useStore((s) => s.hoveredId);
  const selectedId = useStore((s) => s.selectedId);
  // Keep GPU memory reasonable for big collections.
  const maxTex = hd ? (placements.length > 200 ? 320 : 512) : 256;

  const highlight = placements.find((p) => p.sg.game.collId === (hoveredId ?? selectedId));

  return (
    <group>
      {placements.map((p) => (
        <GameBox
          key={p.sg.game.collId}
          p={p}
          color={colors[colorKey(p.sg.game)] ?? fallbackColor(p.sg.game.id)}
          hd={hd}
          maxTex={maxTex}
        />
      ))}
      {highlight && (
        <group position={highlight.center}>
          <mesh raycast={() => null}>
            <boxGeometry args={highlight.size.map((s) => s + 0.6) as [number, number, number]} />
            <meshBasicMaterial color="#ffd54a" transparent opacity={0.25} depthWrite={false} />
          </mesh>
          {hoveredId === highlight.sg.game.collId && (
            <Html position={[0, highlight.size[1] / 2 + 4, 0]} center style={{ pointerEvents: "none" }}>
              <div className="whitespace-nowrap rounded-md bg-black/80 px-2 py-1 text-xs text-white shadow-lg">
                <div className="font-semibold">{highlight.sg.game.name}</div>
                <div className="text-white/70">
                  {[highlight.sg.area, highlight.sg.group].filter(Boolean).join(" · ")}
                </div>
              </div>
            </Html>
          )}
        </group>
      )}
    </group>
  );
}
