"use client";

import { Html } from "@react-three/drei";
import { type ThreeEvent, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { colorKey } from "@/lib/images";
import { fallbackColor } from "@/lib/loadCollection";
import type { Cover, Placement } from "@/lib/packing";
import type { SortedGame } from "@/lib/sorting";
import { useStore } from "@/lib/store";
import type { Game } from "@/lib/types";
import { coverTexture, orientCover, spineTexture, titleCover } from "./textures";

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

export interface BoxLook {
  color: string;
  hd: boolean;
  maxTex: number;
  showArt: boolean;
  showTitles: boolean;
}

/** Shared appearance settings for every box in the scene. */
export function useBoxLook(count: number) {
  const colors = useStore((s) => s.colors);
  const hd = useStore((s) => s.hdTextures);
  const showArt = useStore((s) => s.showArt);
  const showTitles = useStore((s) => s.showTitles);
  // Keep GPU memory reasonable for big collections.
  const maxTex = hd ? (count > 200 ? 320 : 512) : 256;
  return (game: Game): BoxLook => ({
    color: colors[colorKey(game)] ?? fallbackColor(game.id),
    hd,
    maxTex,
    showArt,
    showTitles,
  });
}

interface BoxMeshProps extends BoxLook {
  game: Game;
  /** Size in the box's own frame; the spine faces +z. */
  size: [number, number, number];
  cover: Cover;
  position?: [number, number, number];
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}

/** One textured game box with hover and click selection. */
export const BoxMesh = memo(function BoxMesh({
  game,
  size,
  cover: coverFace,
  position,
  onPointerDown,
  color,
  hd,
  maxTex,
  showArt,
  showTitles,
}: BoxMeshProps) {
  const [X, Y, Z] = size;
  const [cover, setCover] = useState<THREE.Texture | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const set = useStore((s) => s.set);

  useEffect(() => {
    // With art off, don't download it at all.
    if (!showArt) return;
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
  }, [game, color, hd, maxTex, invalidate, showArt]);

  const materials = useMemo(() => {
    const side = plain(color);
    const mats: THREE.Material[] = [side, side, side, side, side, side];
    // Front (+z) shows the spine; text runs along the longer edge.
    const realArt = showArt && cover && !(cover.userData.generated as boolean) ? cover : null;
    const art = realArt ? (realArt.image as HTMLCanvasElement) : undefined;
    if (art || showTitles) mats[4] = textured(spineTexture(game, color, X, Y, art, showTitles));
    // The cover face: box art, else the title on the box colour, else plain.
    const front = realArt ?? (showTitles ? titleCover(game, color) : null);
    if (front) {
      const [u, v] = coverFace === "+y" ? [X, Z] : [Z, Y];
      mats[FACE[coverFace]] = textured(orientCover(front, u, v));
    }
    return mats;
  }, [game, color, cover, coverFace, X, Y, Z, showArt, showTitles]);

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    set({ hoveredId: game.collId });
  };
  const onOut = () => {
    if (useStore.getState().hoveredId === game.collId) set({ hoveredId: null });
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // A drag that ended over the box isn't a click.
    if (e.delta > 4) return;
    set({ selectedId: game.collId });
  };

  return (
    <mesh
      position={position}
      material={materials}
      castShadow
      receiveShadow
      onPointerOver={onOver}
      onPointerOut={onOut}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <boxGeometry args={[X - 0.05, Y - 0.05, Z - 0.05]} />
    </mesh>
  );
});

/** Glow around the hovered or selected box, with a name label on hover. */
export function Highlight({
  sg,
  size,
  position,
  hovered,
}: {
  sg: SortedGame;
  size: [number, number, number];
  position?: [number, number, number];
  hovered: boolean;
}) {
  return (
    // Named so image export can hide it.
    <group name="highlight" position={position}>
      <mesh raycast={() => null}>
        <boxGeometry args={size.map((s) => s + 0.6) as [number, number, number]} />
        <meshBasicMaterial color="#ffd54a" transparent opacity={0.25} depthWrite={false} />
      </mesh>
      {hovered && (
        <Html position={[0, size[1] / 2 + 4, 0]} center style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded-md bg-black/80 px-2 py-1 text-xs text-white shadow-lg">
            <div className="font-semibold">{sg.game.name}</div>
            <div className="text-white/70">{[sg.area, sg.group].filter(Boolean).join(" · ")}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

export function GameBoxes({ placements }: { placements: Placement[] }) {
  const look = useBoxLook(placements.length);
  const hoveredId = useStore((s) => s.hoveredId);
  const selectedId = useStore((s) => s.selectedId);

  const highlight = placements.find((p) => p.sg.game.collId === (hoveredId ?? selectedId));

  return (
    <group>
      {placements.map((p) => (
        <BoxMesh
          key={p.sg.game.collId}
          game={p.sg.game}
          size={p.size}
          cover={p.cover}
          position={p.center}
          {...look(p.sg.game)}
        />
      ))}
      {highlight && (
        <Highlight
          sg={highlight.sg}
          size={highlight.size}
          position={highlight.center}
          hovered={hoveredId === highlight.sg.game.collId}
        />
      )}
    </group>
  );
}
