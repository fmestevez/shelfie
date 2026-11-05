"use client";

import { type ThreeEvent, useThree } from "@react-three/fiber";
import { CuboidCollider, Physics, type RapierRigidBody, RigidBody, useRapier } from "@react-three/rapier";
import { memo, type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { BodySpec } from "@/lib/bodies";
import type { ShelfInstance } from "@/lib/packing";
import { type ManualPose, type Mode, useStore } from "@/lib/store";
import { BoxMesh, type BoxLook, Highlight, useBoxLook } from "./GameBoxes";
import { physicsApi } from "./physicsApi";

// Units are centimetres, so gravity is 981 cm/s².
const GRAVITY: [number, number, number] = [0, -981, 0];
/** Colliders are a little smaller than the boxes: packed boxes squeeze, and touching ones mustn't explode apart. */
const SKIN = 0.3;
const DRAG_THRESHOLD = 5; // px before a press on a box becomes a drag
const DROP_FROM = 400; // cm: height probed from when dropping outside a compartment
const MAX_FLING = 600; // cm/s

type Grab = (e: ThreeEvent<PointerEvent>, collId: number) => void;
type Registry = Map<number, RapierRigidBody>;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const AXES = [new THREE.Vector3(1, 0, 0), Y_AXIS, Z_AXIS];

/** The nearest rotation that lines the box up with the world axes. */
function squareUp(q: THREE.Quaternion) {
  const basis = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  new THREE.Matrix4().makeRotationFromQuaternion(q).extractBasis(basis[0], basis[1], basis[2]);
  const used = new Set<number>();
  const out = basis.slice(0, 2).map((v) => {
    let best = 0;
    let bestAbs = -1;
    for (let k = 0; k < 3; k++) {
      const a = Math.abs(v.getComponent(k));
      if (!used.has(k) && a > bestAbs) [best, bestAbs] = [k, a];
    }
    used.add(best);
    return AXES[best].clone().multiplyScalar(Math.sign(v.getComponent(best)) || 1);
  });
  const m = new THREE.Matrix4().makeBasis(out[0], out[1], out[0].clone().cross(out[1]));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/** World-space half extents of a box squared up to the axes. */
function halfExtents(size: [number, number, number], q: THREE.Quaternion) {
  const e = new THREE.Matrix4().makeRotationFromQuaternion(q).elements;
  const [x, y, z] = size.map((s) => s / 2);
  return new THREE.Vector3(
    Math.abs(e[0]) * x + Math.abs(e[4]) * y + Math.abs(e[8]) * z,
    Math.abs(e[1]) * x + Math.abs(e[5]) * y + Math.abs(e[9]) * z,
    Math.abs(e[2]) * x + Math.abs(e[6]) * y + Math.abs(e[10]) * z,
  );
}

const toQuat = (r: { x: number; y: number; z: number; w: number }) => new THREE.Quaternion(r.x, r.y, r.z, r.w);
const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

/** Floor, wall and every shelf panel. */
function StaticWorld({ shelves }: { shelves: ShelfInstance[] }) {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[5000, 10, 5000]} position={[0, -10, 0]} friction={0.8} />
      <CuboidCollider args={[5000, 500, 10]} position={[0, 500, -10]} friction={0.5} />
      {shelves.flatMap((s) =>
        s.build.panels.map((p, i) => (
          <CuboidCollider
            key={`${s.key}-${i}`}
            args={[p.size[0] / 2, p.size[1] / 2, p.size[2] / 2]}
            position={[p.center[0] + s.offsetX, p.center[1], p.center[2]]}
            friction={0.6}
          />
        )),
      )}
    </RigidBody>
  );
}

const PhysicsBox = memo(function PhysicsBox({
  spec,
  look,
  registry,
  grabRef,
}: {
  spec: BodySpec;
  look: BoxLook;
  registry: Registry;
  grabRef: RefObject<Grab | null>;
}) {
  const id = spec.sg.game.collId;
  const ref = useRef<RapierRigidBody>(null);
  const highlighted = useStore((s) => (s.hoveredId ?? s.selectedId) === id);
  const hovered = useStore((s) => s.hoveredId === id);

  useEffect(() => {
    if (ref.current) registry.set(id, ref.current);
    return () => {
      registry.delete(id);
    };
  }, [id, registry]);

  const [x, y, z] = spec.size;
  return (
    <RigidBody
      ref={ref}
      position={spec.position}
      quaternion={spec.quaternion}
      colliders={false}
      linearDamping={0.2}
      angularDamping={0.5}
    >
      <CuboidCollider
        args={[Math.max(0.1, x / 2 - SKIN), Math.max(0.1, y / 2 - SKIN), Math.max(0.1, z / 2 - SKIN)]}
        friction={0.7}
        restitution={0.05}
      />
      <BoxMesh
        game={spec.sg.game}
        size={spec.size}
        cover={spec.cover}
        onPointerDown={(e) => grabRef.current?.(e, id)}
        {...look}
      />
      {highlighted && <Highlight sg={spec.sg} size={spec.size} hovered={hovered} />}
    </RigidBody>
  );
});

/** Drag and drop, rotation and saving. */
function Interaction({
  bodies,
  shelves,
  mode,
  registry,
  grabRef,
}: {
  bodies: BodySpec[];
  shelves: ShelfInstance[];
  mode: Mode;
  registry: Registry;
  grabRef: RefObject<Grab | null>;
}) {
  const { world, rapier } = useRapier();
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const el = gl.domElement;
    const specs = new Map(bodies.map((b) => [b.sg.game.collId, b]));
    const compartments = shelves.flatMap((s) => s.build.compartments.map((c) => ({ ...c, x: c.x + s.offsetX })));
    const raycaster = new THREE.Raycaster();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    let pending: { id: number; x: number; y: number } | null = null;
    let held: {
      id: number;
      body: RapierRigidBody;
      he: THREE.Vector3;
      history: { t: number; p: THREE.Vector3 }[];
    } | null = null;
    let lastRay: THREE.Ray | null = null;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;

    // Manual mode keeps every box's pose, once things have stopped moving.
    const save = (tries = 0) => {
      if (mode !== "manual") return;
      const poses: Record<number, ManualPose> = {};
      try {
        for (const [id, spec] of specs) {
          const body = registry.get(id);
          if (!body) continue;
          const v = body.linvel();
          if (tries < 10 && Math.hypot(v.x, v.y, v.z) > 2) {
            saveTimer = setTimeout(() => save(tries + 1), 700);
            return;
          }
          const t = body.translation();
          const r = body.rotation();
          poses[id] = {
            size: spec.size,
            cover: spec.cover,
            position: [t.x, t.y, t.z],
            quaternion: [r.x, r.y, r.z, r.w],
          };
        }
      } catch {
        return; // the world is being torn down
      }
      useStore.getState().saveManualPoses(poses);
    };
    const scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 1200);
    };

    const rayAt = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1),
        camera,
      );
      return raycaster.ray.clone();
    };

    /** How far the held box can travel from `from` along `dir` before touching something. */
    const sweep = (body: RapierRigidBody, he: THREE.Vector3, from: THREE.Vector3, dir: THREE.Vector3, max: number) => {
      const shape = new rapier.Cuboid(
        Math.max(0.1, he.x - 0.05),
        Math.max(0.1, he.y - 0.05),
        Math.max(0.1, he.z - 0.05),
      );
      const hit = world.castShape(
        from,
        { x: 0, y: 0, z: 0, w: 1 },
        dir,
        shape,
        0,
        max,
        true,
        undefined,
        undefined,
        undefined,
        body,
      );
      return hit ? Math.max(0, hit.time_of_impact - 0.05) : max;
    };

    /** Where the held box goes for a pointer ray: into the compartment under it, or dropped on whatever is below. */
    const target = (ray: THREE.Ray) => {
      if (!held) return null;
      const { body, he } = held;
      let best: (typeof compartments)[number] | null = null;
      let hit: THREE.Vector3 | null = null;
      let bestD = Infinity;
      const box = new THREE.Box3();
      for (const c of compartments) {
        if (2 * he.x > c.w + 0.5 || 2 * he.y > c.h + 0.5) continue;
        box.min.set(c.x, c.y, c.z);
        box.max.set(c.x + c.w, c.y + c.h, c.z + c.d);
        const p = ray.intersectBox(box, new THREE.Vector3());
        const d = p ? p.distanceTo(ray.origin) : Infinity;
        if (p && d < bestD) [best, hit, bestD] = [c, p, d];
      }

      if (best && hit) {
        const c = best;
        // Slide in from the front at the pointer's height until it meets the back or another box, then lower it.
        const x = clamp(hit.x, c.x + he.x + 0.05, c.x + c.w - he.x - 0.05);
        const y0 = clamp(hit.y, c.y + he.y + 0.4, c.y + c.h - he.y - 0.1);
        const z0 = c.z + c.d + he.z + 12;
        const z = z0 - sweep(body, he, new THREE.Vector3(x, y0, z0), new THREE.Vector3(0, 0, -1), z0 - (c.z + he.z));
        const y = y0 - sweep(body, he, new THREE.Vector3(x, y0, z), new THREE.Vector3(0, -1, 0), y0 - he.y);
        return new THREE.Vector3(x, y + 0.2, z);
      }

      // Elsewhere: follow the pointer over the floor (or along the wall when pointing above it), landing on top of whatever is there.
      let x: number;
      let z: number;
      const g = ray.intersectPlane(ground, new THREE.Vector3());
      if (g && g.z >= he.z + 0.5) [x, z] = [g.x, g.z];
      else {
        const w = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -(he.z + 0.5)), new THREE.Vector3());
        if (!w) return null;
        [x, z] = [w.x, he.z + 0.5];
      }
      x = clamp(x, -2000, 2000);
      z = clamp(z, he.z + 0.5, 1500);
      const from = new THREE.Vector3(x, DROP_FROM, z);
      const y = DROP_FROM - sweep(body, he, from, new THREE.Vector3(0, -1, 0), DROP_FROM - he.y);
      return new THREE.Vector3(x, y + 0.2, z);
    };

    const follow = () => {
      if (!held || !lastRay) return;
      const p = target(lastRay);
      if (!p) return;
      held.body.setTranslation(p, true);
      held.history.push({ t: performance.now(), p });
      if (held.history.length > 8) held.history.shift();
      invalidate();
    };

    const startHold = (id: number) => {
      const body = registry.get(id);
      const spec = specs.get(id);
      if (!body || !spec) return;
      body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      const q = squareUp(toQuat(body.rotation()));
      body.setRotation(q, true);
      held = { id, body, he: halfExtents(spec.size, q), history: [] };
      useStore.getState().set({ selectedId: id, hoveredId: null });
    };

    const release = () => {
      if (held) {
        const { body, history } = held;
        body.setBodyType(rapier.RigidBodyType.Dynamic, true);
        // In physics mode a quick release throws the box.
        let v = new THREE.Vector3();
        const first = history[0];
        const last = history[history.length - 1];
        if (mode === "physics" && first && last && last.t - first.t > 10 && performance.now() - last.t < 80) {
          v = last.p
            .clone()
            .sub(first.p)
            .divideScalar((last.t - first.t) / 1000)
            .clampLength(0, MAX_FLING);
        }
        // Thrown boxes are fast enough to pass through a thin shelf panel without continuous collision checks.
        body.enableCcd(v.lengthSq() > 0);
        body.setLinvel(v, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        held = null;
        scheduleSave();
        invalidate();
      }
      pending = null;
      if (controls) controls.enabled = true;
    };

    const rotate = (id: number, axis: THREE.Vector3) => {
      const body = registry.get(id);
      const spec = specs.get(id);
      if (!body || !spec) return;
      const before = halfExtents(spec.size, squareUp(toQuat(body.rotation())));
      const q = squareUp(new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2).multiply(toQuat(body.rotation())));
      body.setRotation(q, true);
      const he = halfExtents(spec.size, q);
      if (held?.id === id) {
        held.he = he;
        follow();
      } else {
        // Keep the bottom where it was, so it doesn't sink into what's below.
        const t = body.translation();
        body.setTranslation({ x: t.x, y: t.y - before.y + he.y + 0.3, z: t.z }, true);
        body.wakeUp();
        scheduleSave();
      }
      invalidate();
    };

    grabRef.current = (e, id) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      pending = { id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
      // Dragging a box shouldn't also orbit the camera.
      if (controls) controls.enabled = false;
    };
    physicsApi.current = { turn: (id) => rotate(id, Y_AXIS), tip: (id) => rotate(id, Z_AXIS) };

    const onMove = (e: PointerEvent) => {
      if (!pending) return;
      if (!held) {
        if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) < DRAG_THRESHOLD) return;
        startHold(pending.id);
      }
      lastRay = rayAt(e.clientX, e.clientY);
      follow();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, select, textarea")) return;
      const id = held?.id ?? useStore.getState().selectedId;
      if (id == null) return;
      const key = e.key.toLowerCase();
      if (key === "r") rotate(id, Y_AXIS);
      else if (key === "t") rotate(id, Z_AXIS);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("keydown", onKey);
      if (saveTimer) {
        clearTimeout(saveTimer);
        save(10);
      }
      if (controls) controls.enabled = true;
      grabRef.current = null;
      physicsApi.current = null;
    };
  }, [bodies, shelves, mode, registry, grabRef, world, rapier, camera, gl, controls, invalidate]);

  return null;
}

export default function PhysicsWorld({
  bodies,
  shelves,
  mode,
}: {
  bodies: BodySpec[];
  shelves: ShelfInstance[];
  mode: Mode;
}) {
  const look = useBoxLook(bodies.length);
  const registry = useMemo<Registry>(() => new Map(), []);
  const grabRef = useRef<Grab | null>(null);

  return (
    <Physics gravity={GRAVITY} lengthUnit={100} updateLoop="independent" colliders={false}>
      <StaticWorld shelves={shelves} />
      {bodies.map((b) => (
        <PhysicsBox key={b.sg.game.collId} spec={b} look={look(b.sg.game)} registry={registry} grabRef={grabRef} />
      ))}
      <Interaction bodies={bodies} shelves={shelves} mode={mode} registry={registry} grabRef={grabRef} />
    </Physics>
  );
}
