"use client";

import { Text } from "@react-three/drei";
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { EnvironmentId } from "@/lib/store";
import { painted, woodGrain } from "./textures";

/**
 * Furniture, plants and lamps that give each room its character. Everything is
 * built from primitives (cm, z = 0 at the wall) and kept outside `clear`, the
 * strip the shelves and floor piles use.
 */

type V3 = [number, number, number];

// Point lights fall off with the square of distance in cm; this scale makes power 1 ≈ the sun's strength at 1.5 m.
const LAMP = 150 * 150;

function Block({
  p,
  s,
  color,
  rough = 0.7,
  metal = 0,
  map,
  rot,
  emissive,
}: {
  p: V3;
  s: V3;
  color?: string;
  rough?: number;
  metal?: number;
  map?: THREE.Texture;
  rot?: V3;
  emissive?: string;
}) {
  return (
    <mesh position={p} rotation={rot} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial
        color={color}
        map={map}
        roughness={rough}
        metalness={metal}
        emissive={emissive}
        emissiveIntensity={emissive ? 1.5 : 0}
      />
    </mesh>
  );
}

function Cyl({
  p,
  r,
  r2 = r,
  h,
  color,
  rough = 0.6,
  metal = 0,
  open = false,
  rot,
  emissive,
}: {
  p: V3;
  r: number;
  r2?: number;
  h: number;
  color: string;
  rough?: number;
  metal?: number;
  open?: boolean;
  rot?: V3;
  emissive?: string;
}) {
  return (
    <mesh position={p} rotation={rot} castShadow receiveShadow>
      <cylinderGeometry args={[r, r2, h, 28, 1, open]} />
      <meshStandardMaterial
        color={color}
        roughness={rough}
        metalness={metal}
        side={open ? THREE.DoubleSide : THREE.FrontSide}
        emissive={emissive}
        emissiveIntensity={emissive ? 0.6 : 0}
      />
    </mesh>
  );
}

function Ball({ p, r, color, scale, rough = 0.8 }: { p: V3; r: number; color: string; scale?: V3; rough?: number }) {
  return (
    <mesh position={p} scale={scale} castShadow receiveShadow>
      <sphereGeometry args={[r, 20, 14]} />
      <meshStandardMaterial color={color} roughness={rough} />
    </mesh>
  );
}

/** A glowing bulb with a light of its own (no shadows: those are the sun's job). */
function Bulb({
  p,
  r = 3,
  color,
  power,
  distance = 0,
  lightAt = [0, 0, 0],
}: {
  p: V3;
  r?: number;
  color: string;
  power: number;
  distance?: number;
  /** Where the light sits relative to the bulb (bulbs against a wall throw a harsh hotspot otherwise). */
  lightAt?: V3;
}) {
  return (
    <group position={p}>
      <mesh>
        <sphereGeometry args={[r, 14, 10]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {power > 0 && (
        <pointLight position={lightAt} color={color} intensity={power * LAMP} distance={distance} decay={2} />
      )}
    </group>
  );
}

// ---------- plants ----------

function Pot({ h = 30, r = 16, color = "#c8643c" }: { h?: number; r?: number; color?: string }) {
  return (
    <>
      <Cyl p={[0, h / 2, 0]} r={r} r2={r * 0.78} h={h} color={color} rough={0.85} />
      <Cyl p={[0, h - 1, 0]} r={r * 0.92} h={1} color="#3b2a1e" rough={1} />
    </>
  );
}

/** Broad leaves fanning out of a pot, like a monstera. */
function LeafyPlant({
  p,
  scale = 1,
  pot = "#c8643c",
  leaf = "#3f7d3a",
}: {
  p: V3;
  scale?: number;
  pot?: string;
  leaf?: string;
}) {
  const leaves = useMemo(
    () =>
      Array.from({ length: 11 }, (_, i) => ({
        a: i * 2.4,
        tilt: 0.35 + (i % 3) * 0.25,
        h: 34 + (i % 4) * 10,
        len: 16 + (i % 3) * 4,
      })),
    [],
  );
  return (
    <group position={p} scale={scale}>
      <Pot color={pot} />
      {leaves.map((l, i) => (
        <group key={i} position={[0, 28, 0]} rotation={[0, l.a, 0]}>
          <Cyl p={[l.len * 0.35, l.h / 2, 0]} r={0.5} h={l.h} color="#4d6b2f" rot={[0, 0, -l.tilt * 0.6]} />
          <Ball
            p={[l.len * 0.75, l.h, 0]}
            r={1}
            scale={[l.len, 1.2, l.len * 0.6]}
            color={i % 2 ? leaf : "#356b30"}
            rough={0.6}
          />
        </group>
      ))}
    </group>
  );
}

/** Upright sword-shaped leaves. */
function SnakePlant({ p, pot = "#f2f0eb" }: { p: V3; pot?: string }) {
  return (
    <group position={p}>
      <Pot h={34} r={14} color={pot} />
      {Array.from({ length: 9 }, (_, i) => {
        const a = i * 2.1;
        const h = 55 + (i % 4) * 14;
        return (
          <Block
            key={i}
            p={[Math.cos(a) * 5, 32 + h / 2, Math.sin(a) * 5]}
            s={[5, h, 1]}
            rot={[Math.sin(a) * 0.12, a, Math.cos(a) * 0.12]}
            color={i % 2 ? "#2f5d34" : "#486f2e"}
          />
        );
      })}
    </group>
  );
}

function Cactus({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <Pot h={26} r={18} color="#e9e2d6" />
      <Cyl p={[0, 75, 0]} r={9} h={100} color="#4f7d3c" rough={0.9} />
      <Ball p={[0, 125, 0]} r={9} color="#4f7d3c" />
      <Cyl p={[13, 75, 0]} r={5} h={30} color="#4f7d3c" />
      <Cyl p={[8, 62, 0]} r={4} h={14} color="#4f7d3c" rot={[0, 0, Math.PI / 2]} />
      <Ball p={[13, 90, 0]} r={5} color="#4f7d3c" />
      <Cyl p={[-12, 95, 0]} r={4.5} h={26} color="#4f7d3c" />
      <Cyl p={[-7, 83, 0]} r={4} h={12} color="#4f7d3c" rot={[0, 0, Math.PI / 2]} />
      <Ball p={[-12, 108, 0]} r={4.5} color="#4f7d3c" />
    </group>
  );
}

function Tree({ p, scale = 1, leaf = "#4c8a3a" }: { p: V3; scale?: number; leaf?: string }) {
  return (
    <group position={p} scale={scale}>
      <Cyl p={[0, 90, 0]} r={9} r2={13} h={180} color="#6b4a2f" rough={1} />
      <Ball p={[0, 230, 0]} r={70} color={leaf} />
      <Ball p={[-50, 195, 15]} r={48} color="#3f7a32" />
      <Ball p={[45, 205, -10]} r={52} color="#5a9a40" />
      <Ball p={[10, 285, 0]} r={45} color="#5a9a40" />
    </group>
  );
}

function Bush({ p, scale = 1 }: { p: V3; scale?: number }) {
  return (
    <group position={p} scale={scale}>
      <Ball p={[0, 22, 0]} r={30} color="#3f7a32" />
      <Ball p={[28, 16, 8]} r={22} color="#4f8b38" />
      <Ball p={[-26, 15, 4]} r={20} color="#467f34" />
    </group>
  );
}

function Flowers({ p, width }: { p: V3; width: number }) {
  const colors = ["#e8577a", "#f4c542", "#ffffff", "#9b6ad6", "#f08a3c"];
  return (
    <group position={p}>
      {Array.from({ length: Math.round(width / 9) }, (_, i) => {
        const x = -width / 2 + i * 9 + ((i * 37) % 5);
        const h = 18 + ((i * 13) % 14);
        const z = ((i * 29) % 16) - 8;
        return (
          <group key={i} position={[x, 0, z]}>
            <Cyl p={[0, h / 2, 0]} r={0.4} h={h} color="#3e7a2c" />
            <Ball p={[0, h, 0]} r={3} color={colors[i % colors.length]} rough={0.5} />
          </group>
        );
      })}
    </group>
  );
}

// ---------- furniture ----------

function Sofa({
  p,
  width = 210,
  color,
  accent,
  rotY = 0,
}: {
  p: V3;
  width?: number;
  color: string;
  accent: string;
  rotY?: number;
}) {
  const seatW = (width - 40) / 2;
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Cyl key={`${sx}${sz}`} p={[sx * (width / 2 - 8), 5, sz * 36]} r={2} r2={1.5} h={10} color="#2a1d14" />
        )),
      )}
      <Block p={[0, 20, 0]} s={[width, 20, 88]} color={color} rough={0.9} />
      {[-1, 1].map((sx) => (
        <Block key={sx} p={[(sx * seatW) / 2, 35, 6]} s={[seatW - 1, 12, 74]} color={color} rough={0.95} />
      ))}
      <Block p={[0, 52, -34]} s={[width - 40, 46, 20]} color={color} rough={0.95} />
      {[-1, 1].map((sx) => (
        <Block key={sx} p={[sx * (width / 2 - 10), 38, 0]} s={[20, 36, 88]} color={color} rough={0.9} />
      ))}
      <Block p={[-width / 2 + 42, 52, -18]} s={[38, 34, 12]} rot={[-0.25, 0.25, 0]} color={accent} rough={0.95} />
      <Block p={[width / 2 - 44, 50, -18]} s={[34, 30, 12]} rot={[-0.25, -0.3, 0.05]} color="#e9e1d2" rough={0.95} />
    </group>
  );
}

function Armchair({ p, color, rotY = 0 }: { p: V3; color: string; rotY?: number }) {
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Cyl key={`${sx}${sz}`} p={[sx * 36, 6, sz * 34]} r={2} h={12} color="#1d1d1d" metal={0.6} />
        )),
      )}
      <Block p={[0, 24, 0]} s={[90, 22, 84]} color={color} rough={0.45} />
      <Block p={[0, 39, 6]} s={[60, 10, 70]} color={color} rough={0.45} />
      <Block p={[0, 62, -34]} s={[62, 56, 16]} rot={[-0.1, 0, 0]} color={color} rough={0.45} />
      {[-1, 1].map((sx) => (
        <Block key={sx} p={[sx * 37, 44, 0]} s={[16, 20, 84]} color={color} rough={0.45} />
      ))}
    </group>
  );
}

function SideTable({ p, top = "#b98a5a" }: { p: V3; top?: string }) {
  return (
    <group position={p}>
      <Cyl p={[0, 54, 0]} r={24} h={3} color={top} rough={0.5} />
      <Cyl p={[0, 27, 0]} r={2} h={52} color="#2b2b2b" metal={0.5} />
      <Cyl p={[0, 1, 0]} r={16} h={2} color="#2b2b2b" metal={0.5} />
      <Cyl p={[8, 60, 4]} r={4} h={9} color="#f4f1ea" rough={0.3} />
      <Block p={[-6, 57.5, -4]} s={[22, 3, 16]} rot={[0, 0.3, 0]} color="#7b3f8c" />
    </group>
  );
}

function CafeTable({ p }: { p: V3 }) {
  const chair = (x: number, rotY: number) => (
    <group position={[x, 0, 0]} rotation={[0, rotY, 0]}>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => <Cyl key={`${sx}${sz}`} p={[sx * 17, 22, sz * 17]} r={1.4} h={44} color="#3a2618" />),
      )}
      <Block p={[0, 45, 0]} s={[40, 3, 40]} color="#5e3b22" rough={0.6} />
      <Block p={[0, 68, -19]} s={[40, 40, 3]} color="#5e3b22" rough={0.6} />
    </group>
  );
  return (
    <group position={p}>
      <Cyl p={[0, 74, 0]} r={38} h={3} color="#6e4426" rough={0.5} />
      <Cyl p={[0, 37, 0]} r={3} h={72} color="#1c1c1c" metal={0.6} />
      <Cyl p={[0, 1, 0]} r={22} h={2} color="#1c1c1c" metal={0.6} />
      {/* A game in progress: board, a few pieces and coffee. */}
      <Block p={[0, 76, 0]} s={[44, 0.6, 44]} color="#e8dcc0" map={gameBoard()} />
      {["#d64545", "#3d7dd8", "#f2c230", "#3fae5a"].map((c, i) => (
        <Cyl key={c} p={[-14 + i * 9, 78.5, -6 + (i % 2) * 12]} r={1.6} r2={2.2} h={4.5} color={c} rough={0.4} />
      ))}
      <Cyl p={[26, 80, 14]} r={4} r2={3.4} h={8} color="#f4f1ea" rough={0.3} />
      {chair(-62, Math.PI / 2)}
      {chair(62, -Math.PI / 2)}
    </group>
  );
}

function Bench({
  p,
  length = 150,
  wood = "#b98a5a",
  legs = "#222",
  rotY = 0,
}: {
  p: V3;
  length?: number;
  wood?: string;
  legs?: string;
  rotY?: number;
}) {
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      {[0, 1, 2].map((i) => (
        <Block key={i} p={[0, 44, -12 + i * 12]} s={[length, 3, 10]} color={wood} rough={0.7} />
      ))}
      {[-1, 1].map((sx) => (
        <Block key={sx} p={[sx * (length / 2 - 15), 21, 0]} s={[4, 42, 36]} color={legs} metal={0.5} rough={0.5} />
      ))}
    </group>
  );
}

function FloorLamp({ p, shade, light, power }: { p: V3; shade: string; light: string; power: number }) {
  return (
    <group position={p}>
      <Cyl p={[0, 1.5, 0]} r={15} h={3} color="#2b2620" metal={0.6} rough={0.4} />
      <Cyl p={[0, 78, 0]} r={1.2} h={150} color="#2b2620" metal={0.6} rough={0.4} />
      <Cyl p={[0, 160, 0]} r={14} r2={22} h={28} color={shade} open emissive={light} rough={0.9} />
      <Bulb p={[0, 154, 0]} r={3.5} color={light} power={power} />
    </group>
  );
}

function Pendant({
  p,
  drop,
  light,
  power,
  shade = "#1e1e1e",
}: {
  p: V3;
  drop: number;
  light: string;
  power: number;
  shade?: string;
}) {
  const [x, top, z] = p;
  return (
    <group position={[x, top, z]}>
      <Cyl p={[0, -drop / 2, 0]} r={0.3} h={drop} color="#111" />
      <Cyl p={[0, -drop - 7, 0]} r={3} r2={17} h={16} color={shade} open metal={0.7} rough={0.35} />
      <Bulb p={[0, -drop - 13, 0]} r={4} color={light} power={power} />
    </group>
  );
}

/** A spotlight aimed at a point (three.js spotlights need a target object). */
function Spot({ p, at, color, power, angle = 0.42 }: { p: V3; at: V3; color: string; power: number; angle?: number }) {
  const [target] = useState(() => new THREE.Object3D());
  return (
    <>
      <primitive object={target} position={at} />
      <spotLight
        position={p}
        target={target}
        color={color}
        intensity={power * LAMP}
        angle={angle}
        penumbra={0.6}
        decay={2}
      />
    </>
  );
}

/** Warm bulbs on a sagging wire, with a couple of real lights along it. */
function StringLights({
  from,
  to,
  sag,
  count,
  color,
  power,
}: {
  from: V3;
  to: V3;
  sag: number;
  count: number;
  color: string;
  power: number;
}) {
  const points = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const t = i / (count - 1);
        return new THREE.Vector3(
          from[0] + (to[0] - from[0]) * t,
          from[1] + (to[1] - from[1]) * t - sag * (1 - (2 * t - 1) ** 2),
          from[2] + (to[2] - from[2]) * t,
        );
      }),
    [from, to, sag, count],
  );
  const wire = useMemo(
    () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), count * 2, 0.25, 4),
    [points, count],
  );
  return (
    <group>
      <mesh geometry={wire}>
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {points.map((v, i) => (
        <Bulb
          key={i}
          p={[v.x, v.y - 2.5, v.z]}
          r={1.8}
          color={color}
          power={i % Math.ceil(count / 3) === Math.floor(count / 6) ? power : 0}
          lightAt={[0, -25, 70]}
        />
      ))}
    </group>
  );
}

// ---------- on the walls ----------

function Picture({
  p,
  w,
  h,
  art,
  frame = "#1f1a16",
}: {
  p: V3;
  w: number;
  h: number;
  art: THREE.Texture;
  frame?: string;
}) {
  return (
    <group position={p}>
      <Block p={[0, 0, 1.5]} s={[w + 6, h + 6, 3]} color={frame} rough={0.5} />
      <mesh position={[0, 0, 3.05]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={art} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Window({ p, w, h, glow }: { p: V3; w: number; h: number; glow: string }) {
  const cols = 3;
  const rows = 4;
  return (
    <group position={p}>
      <mesh position={[0, 0, 0.6]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color={glow} toneMapped={false} />
      </mesh>
      <Block p={[0, 0, 1.5]} s={[w + 8, 4, 3]} color="#1b1b1b" metal={0.6} />
      <Block p={[0, h / 2 + 2, 1.5]} s={[w + 8, 4, 3]} color="#1b1b1b" metal={0.6} />
      <Block p={[0, -h / 2 - 2, 3]} s={[w + 14, 4, 8]} color="#1b1b1b" metal={0.6} />
      {Array.from({ length: cols + 1 }, (_, i) => (
        <Block key={`c${i}`} p={[-w / 2 + (i * w) / cols, 0, 1.5]} s={[3, h + 8, 3]} color="#1b1b1b" metal={0.6} />
      ))}
      {Array.from({ length: rows - 1 }, (_, i) => (
        <Block key={`r${i}`} p={[0, -h / 2 + ((i + 1) * h) / rows, 1.5]} s={[w, 2, 2]} color="#1b1b1b" metal={0.6} />
      ))}
    </group>
  );
}

function Chalkboard({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <Block p={[0, 0, 1.5]} s={[106, 76, 3]} color="#7a4b2a" rough={0.6} />
      <mesh position={[0, 0, 3.05]}>
        <planeGeometry args={[96, 66]} />
        <meshStandardMaterial map={chalk()} roughness={1} />
      </mesh>
    </group>
  );
}

function Plaque({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <Block p={[0, 0, 0.3]} s={[26, 14, 0.6]} color="#fbfbf9" rough={0.4} />
      <Text position={[0, 3, 0.7]} fontSize={2.2} color="#222" anchorX="center" maxWidth={22}>
        Untitled (Collection)
      </Text>
      <Text position={[0, -1.5, 0.7]} fontSize={1.4} color="#666" anchorX="center" maxWidth={22}>
        Cardboard, ink and ambition
      </Text>
    </group>
  );
}

// ---------- textures ----------

function abstractArt(key: string, palette: string[], seed: number) {
  return painted(`art|${key}`, 384, 480, (ctx) => {
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    ctx.fillStyle = palette[0];
    ctx.fillRect(0, 0, 384, 480);
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = palette[1 + (i % (palette.length - 1))];
      ctx.globalAlpha = 0.85;
      if (i % 2) {
        ctx.beginPath();
        ctx.arc(rnd() * 384, rnd() * 480, 40 + rnd() * 110, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(rnd() * 300, rnd() * 400, 60 + rnd() * 160, 30 + rnd() * 140);
    }
    ctx.globalAlpha = 1;
  });
}

const rug = (key: string, base: string, stripe: string, edge: string) =>
  painted(`rug|${key}`, 512, 512, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = stripe;
    for (let y = 40; y < 512; y += 72) ctx.fillRect(0, y, 512, 14);
    ctx.strokeStyle = edge;
    ctx.lineWidth = 18;
    ctx.strokeRect(14, 14, 484, 484);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
  });

const gameBoard = () =>
  painted("cafe-board", 256, 256, (ctx) => {
    ctx.fillStyle = "#e8dcc0";
    ctx.fillRect(0, 0, 256, 256);
    const colors = ["#c9a46a", "#8fb36b", "#6c9bc4", "#d78a5e"];
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < 6; c++) {
        ctx.fillStyle = colors[(r * 3 + c * 5) % colors.length];
        ctx.fillRect(16 + c * 38, 16 + r * 38, 34, 34);
      }
  });

const chalk = () =>
  painted("chalkboard", 512, 352, (ctx) => {
    ctx.fillStyle = "#26302b";
    ctx.fillRect(0, 0, 512, 352);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * 512, Math.random() * 352, 80, 6);
    ctx.fillStyle = "#f3efe2";
    ctx.textAlign = "center";
    ctx.font = "bold 56px Georgia, serif";
    ctx.fillText("GAME NIGHT", 256, 92);
    ctx.font = "italic 30px Georgia, serif";
    ctx.fillText("tonight · 7 pm", 256, 140);
    ctx.font = "26px Georgia, serif";
    ctx.fillStyle = "#f6d77b";
    ["Coffee ......... 2.50", "Hot chocolate .. 3.00", "Table fee ...... 4.00"].forEach((t, i) =>
      ctx.fillText(t, 256, 205 + i * 40),
    );
  });

// ---------- rooms ----------

function Rug({ x, z, w, d, map }: { x: number; z: number; w: number; d: number; map: THREE.Texture }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[x, 0.15, z]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={map} roughness={1} />
    </mesh>
  );
}

/** A long picket fence behind the shelves, as one instanced mesh. */
function Fence({ width }: { width: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = Math.ceil(width / 12);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      ref.current?.setMatrixAt(i, m.makeTranslation(-width / 2 + i * 12, 60, -6));
    }
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [count, width]);
  const wood = woodGrain([196, 160, 118]);
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow receiveShadow>
        <boxGeometry args={[9, 120, 2]} />
        <meshStandardMaterial map={wood} roughness={0.9} />
      </instancedMesh>
      {[30, 95].map((y) => (
        <Block key={y} p={[0, y, -8.5]} s={[width, 8, 3]} map={wood} rough={0.9} />
      ))}
    </group>
  );
}

export interface Clearance {
  /** x of the left and right edges of everything that holds games. */
  left: number;
  right: number;
  /** Width of the shelves themselves (for things hung above or in front of them). */
  shelvesLeft: number;
  shelvesRight: number;
}

function LivingRoom({ c }: { c: Clearance }) {
  const art1 = abstractArt("living1", ["#efe4d2", "#c86b4a", "#2f5d62", "#e3b448"], 7);
  const art2 = abstractArt("living2", ["#f4efe6", "#5b7f95", "#d9a07b", "#3c3c3c"], 21);
  return (
    <>
      <Rug
        x={(c.shelvesLeft + c.shelvesRight) / 2}
        z={150}
        w={c.shelvesRight - c.shelvesLeft + 140}
        d={170}
        map={rug("living", "#c9b79c", "#a8472f", "#5a3b2a")}
      />
      <FloorLamp p={[c.right + 30, 0, 32]} shade="#f1e6d0" light="#ffbf73" power={1.1} />
      <Sofa p={[c.right + 175, 0, 50]} color="#5b6f7a" accent="#d99a3e" />
      <Picture p={[c.right + 140, 150, 0]} w={56} h={70} art={art1} />
      <Picture p={[c.right + 215, 140, 0]} w={44} h={56} art={art2} frame="#c9a46a" />
      <LeafyPlant p={[c.left - 35, 0, 32]} scale={1.15} />
      <SideTable p={[c.left - 95, 0, 30]} />
    </>
  );
}

function Loft({ c }: { c: Clearance }) {
  const mid = (c.shelvesLeft + c.shelvesRight) / 2;
  const span = c.shelvesRight - c.shelvesLeft;
  return (
    <>
      <Window p={[c.left - 140, 150, 0]} w={150} h={170} glow="#e6eef6" />
      <Armchair p={[c.left - 110, 0, 85]} color="#7a4a2a" rotY={0.45} />
      <Cactus p={[c.right + 40, 0, 35]} />
      <Block p={[c.right + 110, 20, 30]} s={[46, 40, 40]} map={woodGrain([170, 128, 84])} rough={0.9} />
      <Block
        p={[c.right + 112, 60, 30]}
        s={[46, 40, 40]}
        rot={[0, 0.12, 0]}
        map={woodGrain([170, 128, 84])}
        rough={0.9}
      />
      {[-1, 1].map((sx) => (
        <Pendant key={sx} p={[mid + (sx * span) / 4, 280, 110]} drop={38} light="#ffc982" power={0.8} />
      ))}
    </>
  );
}

function Cafe({ c }: { c: Clearance }) {
  return (
    <>
      <StringLights
        from={[c.left - 160, 250, 4]}
        to={[c.right + 160, 250, 4]}
        sag={22}
        count={Math.max(14, Math.round((c.right - c.left + 320) / 22))}
        color="#ffcf7a"
        power={0.35}
      />
      <Chalkboard p={[c.left - 85, 150, 0]} />
      <LeafyPlant p={[c.left - 40, 0, 40]} pot="#2f2f2f" leaf="#4e8a3d" />
      <CafeTable p={[c.right + 110, 0, 95]} />
      <Pendant p={[c.right + 110, 280, 95]} drop={70} light="#ffb35c" power={0.7} shade="#7b5a2a" />
      <Rug
        x={(c.shelvesLeft + c.shelvesRight) / 2}
        z={140}
        w={c.shelvesRight - c.shelvesLeft + 100}
        d={150}
        map={rug("cafe", "#7a2e2a", "#c99a4a", "#3a1a17")}
      />
    </>
  );
}

function Gallery({ c }: { c: Clearance }) {
  const span = c.shelvesRight - c.shelvesLeft;
  const spots = Math.min(4, Math.max(2, Math.round(span / 120)));
  return (
    <>
      <Block
        p={[(c.shelvesLeft + c.shelvesRight) / 2, 266, 120]}
        s={[span + 60, 3, 4]}
        color="#e9e9e7"
        metal={0.4}
        rough={0.4}
      />
      {Array.from({ length: spots }, (_, i) => {
        const x = c.shelvesLeft + ((i + 0.5) * span) / spots;
        return (
          <group key={i}>
            <Cyl p={[x, 258, 116]} r={4} r2={5} h={14} color="#f3f3f1" rot={[0.75, 0, 0]} metal={0.3} rough={0.3} />
            <Spot p={[x, 258, 116]} at={[x, 90, 0]} color="#fff6ea" power={0.8} />
          </group>
        );
      })}
      <Plaque p={[c.right + 30, 135, 0]} />
      <group position={[c.right + 95, 0, 45]}>
        <Block p={[0, 45, 0]} s={[44, 90, 44]} color="#f7f7f5" rough={0.5} />
        <mesh position={[0, 112, 0]} castShadow>
          <torusKnotGeometry args={[13, 3.6, 140, 18, 2, 3]} />
          <meshStandardMaterial color="#b9894a" metalness={0.85} roughness={0.25} />
        </mesh>
      </group>
      <Bench p={[c.left - 120, 0, 90]} length={150} wood="#d9c3a0" legs="#f2f2f0" />
      <SnakePlant p={[c.left - 30, 0, 30]} />
    </>
  );
}

function Garden({ c }: { c: Clearance }) {
  const width = Math.max(1200, c.right - c.left + 1000);
  return (
    <>
      <Fence width={width} />
      <Tree p={[c.left - 170, 0, -70]} scale={1.15} />
      <Tree p={[c.right + 220, 0, -90]} scale={1.3} leaf="#5b9442" />
      <Bush p={[c.left - 45, 0, 25]} />
      <Bush p={[c.right + 60, 0, 22]} scale={1.2} />
      <Flowers p={[c.left - 120, 0, 25]} width={110} />
      <Flowers p={[c.right + 160, 0, 20]} width={130} />
      <Bench p={[c.right + 170, 0, 110]} length={140} wood="#a8743f" legs="#2a3b2c" rotY={-0.35} />
    </>
  );
}

const ROOMS: Record<EnvironmentId, (props: { c: Clearance }) => ReactNode> = {
  "living-room": LivingRoom,
  loft: Loft,
  cafe: Cafe,
  gallery: Gallery,
  garden: Garden,
};

export function Decor({ id, clearance }: { id: EnvironmentId; clearance: Clearance }) {
  const Room = ROOMS[id];
  return <Room c={clearance} />;
}
