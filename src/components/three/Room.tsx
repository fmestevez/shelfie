"use client";

import { Environment } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { EnvironmentId } from "@/lib/store";
import { brickWall, speckled, woodFloor } from "./textures";

type Preset = "apartment" | "warehouse" | "lobby" | "studio" | "park";

interface EnvDef {
  label: string;
  preset: Preset;
  wall: () => THREE.Texture | null;
  wallTile: number; // cm per texture repeat
  floor: () => THREE.Texture;
  floorTile: number;
  skirting?: string;
  background: string;
  showHdri?: boolean;
  sun: number;
  ambient: number;
}

export const ENVIRONMENTS: Record<EnvironmentId, EnvDef> = {
  "living-room": {
    label: "Living room",
    preset: "apartment",
    wall: () => speckled("living-wall", "#e8dfd1", 0.03),
    wallTile: 200,
    floor: () => woodFloor([172, 124, 80]),
    floorTile: 160,
    skirting: "#f4f1ea",
    background: "#d8cfc0",
    sun: 1.8,
    ambient: 0.55,
  },
  loft: {
    label: "Brick loft",
    preset: "warehouse",
    wall: brickWall,
    wallTile: 170,
    floor: () => speckled("concrete", "#8f8c88", 0.1),
    floorTile: 150,
    background: "#6f6a64",
    sun: 1.6,
    ambient: 0.5,
  },
  cafe: {
    label: "Game café",
    preset: "lobby",
    wall: () => speckled("cafe-wall", "#244534", 0.05),
    wallTile: 200,
    floor: () => woodFloor([94, 60, 38]),
    floorTile: 160,
    skirting: "#3a2618",
    background: "#1b2a22",
    sun: 1.1,
    ambient: 0.45,
  },
  gallery: {
    label: "White gallery",
    preset: "studio",
    wall: () => speckled("gallery-wall", "#f6f6f4", 0.015),
    wallTile: 200,
    floor: () => speckled("gallery-floor", "#e4e3df", 0.03),
    floorTile: 200,
    background: "#f0f0ee",
    sun: 1.4,
    ambient: 0.75,
  },
  garden: {
    label: "Garden",
    preset: "park",
    wall: () => null,
    wallTile: 1,
    floor: () => speckled("grass", "#5b8a3c", 0.18),
    floorTile: 80,
    background: "#a9c8e8",
    showHdri: true,
    sun: 2.2,
    ambient: 0.6,
  },
};

const ROOM = 3000;
const WALL_H = 270;

function tiled(tex: THREE.Texture | null, tile: number, w: number, h: number) {
  if (!tex) return null;
  tex.repeat.set(w / tile, h / tile);
  return tex;
}

export function Room({ id, span }: { id: EnvironmentId; span: number }) {
  const env = ENVIRONMENTS[id];
  const floorMap = useMemo(() => tiled(env.floor(), env.floorTile, ROOM, ROOM), [env]);
  const wallMap = useMemo(() => tiled(env.wall(), env.wallTile, ROOM, WALL_H), [env]);
  const shadowSpan = Math.max(400, span + 200);

  return (
    <>
      {!env.showHdri && <color attach="background" args={[env.background]} />}
      <Environment preset={env.preset} background={env.showHdri} environmentIntensity={env.ambient} />
      <hemisphereLight args={["#ffffff", "#8a7a66", env.ambient * 0.6]} />
      <directionalLight
        position={[span * 0.3 + 150, 420, 380]}
        intensity={env.sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.6}
        shadow-camera-left={-shadowSpan / 2}
        shadow-camera-right={shadowSpan / 2}
        shadow-camera-top={350}
        shadow-camera-bottom={-150}
        shadow-camera-near={10}
        shadow-camera-far={1500}
      />

      <mesh rotation-x={-Math.PI / 2} position={[0, 0, ROOM / 2 - 200]} receiveShadow>
        <planeGeometry args={[ROOM, ROOM]} />
        <meshStandardMaterial map={floorMap} roughness={0.8} />
      </mesh>

      {wallMap && (
        <mesh position={[0, WALL_H / 2, -1]} receiveShadow>
          <planeGeometry args={[ROOM, WALL_H]} />
          <meshStandardMaterial map={wallMap} roughness={0.95} />
        </mesh>
      )}
      {wallMap && env.skirting && (
        <mesh position={[0, 4, -0.5]} receiveShadow>
          <boxGeometry args={[ROOM, 8, 0.9]} />
          <meshStandardMaterial color={env.skirting} roughness={0.5} />
        </mesh>
      )}
    </>
  );
}
