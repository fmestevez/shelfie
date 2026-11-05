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
import { boxName } from "./sceneApi";
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
/** Width and height of the ±x, ±y and ±z faces, as BoxGeometry maps their UVs. */
const FACE_SIZE = (X: number, Y: number, Z: number) =>
  [
    [Z, Y],
    [X, Z],
    [X, Y],
  ] as const;

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
  /** How much smaller (cm) the drawn box is than `size`, so touching boxes never share a face and flicker. */
  inset?: number;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}

/** One textured game box with hover and click selection. */
export const BoxMesh = memo(function BoxMesh({
  game,
  size,
  cover: coverFace,
  position,
  inset = 0.05,
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
  const selected = useStore((s) => s.selectedId === game.collId);

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
    const realArt = showArt && cover && !(cover.userData.generated as boolean) ? cover : null;
    const art = realArt ? (realArt.image as HTMLCanvasElement) : undefined;
    // The box art (else the title on the box colour) on the cover and the back; every edge gets a spine, with the
    // text along its longer side.
    const front = realArt ?? (showTitles ? titleCover(game, color) : null);
    const coverAxis = coverFace === "+y" ? 1 : 0;
    FACE_SIZE(X, Y, Z).forEach(([u, v], axis) => {
      let m: THREE.Material | null = null;
      if (axis === coverAxis) m = front && textured(orientCover(front, u, v));
      else if (art || showTitles) m = textured(spineTexture(game, color, u, v, art, showTitles));
      if (m) mats[2 * axis] = mats[2 * axis + 1] = m;
    });
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
      // Named so the camera can find the box wherever it is (physics moves it).
      name={boxName(game.collId)}
      position={position}
      material={materials}
      castShadow
      receiveShadow
      onPointerOver={onOver}
      onPointerOut={onOut}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <boxGeometry args={[X - inset, Y - inset, Z - inset]} />
      {selected && <SelectionOutline size={[X, Y, Z]} />}
    </mesh>
  );
});

// ---------- selection outline ----------
// Drawn after everything else and without depth testing, so shelves and other boxes never cover it. The box's
// silhouette is first marked in the stencil buffer; the rings are then drawn only outside it.

const OUTLINE_ORDER = 1000;

const stencilMask = new THREE.MeshBasicMaterial({
  colorWrite: false,
  depthWrite: false,
  depthTest: false,
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: THREE.AlwaysStencilFunc,
  stencilZPass: THREE.ReplaceStencilOp,
});

/** The box grown by `px` screen pixels outwards from its centre, filled with a flat colour outside the stencilled silhouette. */
function ringMaterial(color: string, px: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      px: { value: px },
      resolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: /* glsl */ `
      uniform float px;
      uniform vec2 resolution;
      void main() {
        mat4 mvp = projectionMatrix * modelViewMatrix;
        vec4 clip = mvp * vec4(position, 1.0);
        // Push each corner away from the box's centre on screen, by the same number of pixels at any distance.
        vec4 centre = mvp * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 dir = (clip.xy / clip.w - centre.xy / centre.w) * resolution;
        if (length(dir) > 1e-3) clip.xy += normalize(dir) * px * 2.0 / resolution * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      void main() { gl_FragColor = vec4(color, 1.0); }`,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.NotEqualStencilFunc,
    toneMapped: false,
  });
}

const blackRing = ringMaterial("#111111", 5.5);
const yellowRing = ringMaterial("#ffd54a", 4);
const drawingBuffer = new THREE.Vector2();
const syncResolution = (material: THREE.ShaderMaterial) => (renderer: THREE.WebGLRenderer) => {
  renderer.getDrawingBufferSize(drawingBuffer);
  material.uniforms.resolution.value.copy(drawingBuffer);
};

function SelectionOutline({ size }: { size: [number, number, number] }) {
  return (
    // Named so image export can hide it.
    <group name="highlight">
      <mesh material={stencilMask} renderOrder={OUTLINE_ORDER} raycast={() => null}>
        <boxGeometry args={size} />
      </mesh>
      {[blackRing, yellowRing].map((m, i) => (
        <mesh
          key={i}
          material={m}
          renderOrder={OUTLINE_ORDER + 1 + i}
          raycast={() => null}
          onBeforeRender={syncResolution(m)}
        >
          <boxGeometry args={size} />
        </mesh>
      ))}
    </group>
  );
}

/** Glow around the hovered box, with its name. (The selected box gets an outline instead.) */
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
  const highlight = placements.find((p) => p.sg.game.collId === hoveredId);

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
      {highlight && <Highlight sg={highlight.sg} size={highlight.size} position={highlight.center} hovered />}
    </group>
  );
}
