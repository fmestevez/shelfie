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
/** Colliders are a hair smaller than the boxes, so packed boxes that touch don't start out overlapping. */
const SKIN = 0.05;
const DRAG_THRESHOLD = 5; // px before a press on a box becomes a drag
const DROP_FROM = 400; // cm: height probed from when resting a box on the floor
const CEILING = 255; // cm: room above a unit for boxes stacked on top
const OVERHANG_OK = 6; // cm a slotted box may stick out of the front
const FLOAT_GAP = 15; // cm between the shelf fronts and a box held in front of them
// Rapier interaction groups: 16 bits of membership, then 16 bits of filter.
const NO_CONTACT = 0x0000_0000;
const ALL_CONTACT = 0xffff_ffff;
const EASE = 18; // 1/s: how quickly the held box catches up with where it's going
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
      // At 60 steps a second a falling or knocked box moves further per step than a shelf panel is thick;
      // continuous collision detection stops it tunnelling through (and costs nothing while it sleeps).
      ccd
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
        // Resting boxes touch collider to collider, so draw them exactly that size: any bigger and neighbours overlap,
        // and their faces flicker against each other.
        inset={2 * SKIN}
        onPointerDown={(e) => grabRef.current?.(e, id)}
        {...look}
      />
      {hovered && <Highlight sg={spec.sg} size={spec.size} hovered />}
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
    // Places a box can slide into: every compartment, and the space on top of each unit.
    const slots = shelves.flatMap((s) => [
      ...s.build.compartments.map((c) => ({ ...c, x: c.x + s.offsetX })),
      {
        x: s.offsetX,
        y: s.build.height,
        z: 0,
        w: s.build.width,
        h: Math.max(40, CEILING - s.build.height),
        d: s.build.depth,
      },
    ]);
    type Slot = (typeof slots)[number];
    const front = shelves.reduce((m, s) => Math.max(m, s.build.depth), 0);
    const raycaster = new THREE.Raycaster();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    let pending: { id: number; x: number; y: number } | null = null;
    let held: {
      id: number;
      body: RapierRigidBody;
      he: THREE.Vector3;
      /** Where the box is shown, easing towards `goal`. */
      pos: THREE.Vector3;
      goal: THREE.Vector3;
      last: number;
      history: { t: number; p: THREE.Vector3 }[];
      /** The slide-in point last snapped to. */
      snap?: { x: number; y: number };
    } | null = null;
    let raf = 0;
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

    /** Slide the held box into slot `c` from the front at (x, y0); where it settles, or null if there's no room. */
    const slideIn = (c: Slot, x: number, y0: number) => {
      if (!held) return null;
      const { body, he } = held;
      const z0 = c.z + c.d + he.z + 12;
      const z = z0 - sweep(body, he, new THREE.Vector3(x, y0, z0), new THREE.Vector3(0, 0, -1), z0 - (c.z + he.z));
      if (z + he.z > c.z + c.d + OVERHANG_OK) return null;
      const y = y0 - sweep(body, he, new THREE.Vector3(x, y0, z), new THREE.Vector3(0, -1, 0), y0 - he.y);
      return new THREE.Vector3(x, y + 0.2, z);
    };

    /**
     * The best place in slot `c` near the pointer. Besides the spot right under it, candidates line the box up with the
     * slot's walls and with the sides and tops of the boxes already there, so a gap that's only just wide enough is easy
     * to hit. The closest candidate with room wins; the previous one is kept unless another is clearly closer, so the
     * box doesn't flicker between two spots.
     */
    const snap = (c: Slot, hit: THREE.Vector3) => {
      if (!held) return null;
      const { body, he } = held;
      const [xMin, xMax] = [c.x + he.x + 0.05, c.x + c.w - he.x - 0.05];
      const [yMin, yMax] = [c.y + he.y + 0.4, c.y + c.h - he.y - 0.1];
      const xs = [hit.x, xMin, xMax];
      const ys = [hit.y, yMin];
      const region = new rapier.Cuboid(c.w / 2 + 1, c.h / 2 + 1, c.d / 2 + OVERHANG_OK);
      const centre = { x: c.x + c.w / 2, y: c.y + c.h / 2, z: c.z + c.d / 2 + OVERHANG_OK / 2 };
      world.intersectionsWithShape(
        centre,
        { x: 0, y: 0, z: 0, w: 1 },
        region,
        (collider) => {
          const t = collider.translation();
          const h = (collider.shape as InstanceType<typeof rapier.Cuboid>).halfExtents;
          if (!h) return true;
          const e = halfExtents([2 * h.x, 2 * h.y, 2 * h.z], toQuat(collider.rotation()));
          xs.push(t.x + e.x + he.x + 0.1, t.x - e.x - he.x - 0.1);
          ys.push(t.y + e.y + he.y + 0.4);
          return true;
        },
        undefined,
        undefined,
        undefined,
        body,
      );

      const reach = Math.max(10, 1.5 * he.x);
      const candidates: { x: number; y: number; score: number }[] = [];
      for (const rawX of xs) {
        const x = clamp(rawX, xMin, xMax);
        if (Math.abs(x - hit.x) > reach) continue;
        for (const rawY of ys) {
          const y = clamp(rawY, yMin, yMax);
          const sticky = held.snap && Math.abs(held.snap.x - x) < 0.01 && Math.abs(held.snap.y - y) < 0.01 ? 2 : 0;
          candidates.push({ x, y, score: Math.abs(x - hit.x) + 0.5 * Math.abs(y - hit.y) - sticky });
        }
      }
      candidates.sort((a, b) => a.score - b.score);
      const tried = new Set<string>();
      for (const cand of candidates) {
        const key = `${cand.x.toFixed(2)}|${cand.y.toFixed(2)}`;
        if (tried.has(key)) continue;
        if (tried.size >= 24) break;
        tried.add(key);
        const spot = slideIn(c, cand.x, cand.y);
        if (spot) {
          held.snap = { x: cand.x, y: cand.y };
          return spot;
        }
      }
      held.snap = undefined;
      return null;
    };

    /**
     * Where the held box goes for a pointer ray. Over a slot with room for it, it slides in until it meets the back or
     * another box, then settles. Otherwise it stays under the pointer: floating just in front of the shelves, or resting
     * on the floor when the pointer is on the floor in front of them.
     */
    const target = (ray: THREE.Ray) => {
      if (!held) return null;
      const { body, he } = held;
      let best: Slot | null = null;
      let hit: THREE.Vector3 | null = null;
      let bestD = Infinity;
      const box = new THREE.Box3();
      for (const c of slots) {
        if (2 * he.x > c.w + 0.5 || 2 * he.y > c.h + 0.5) continue;
        box.min.set(c.x, c.y, c.z);
        box.max.set(c.x + c.w, c.y + c.h, c.z + c.d);
        const p = ray.intersectBox(box, new THREE.Vector3());
        const d = p ? p.distanceTo(ray.origin) : Infinity;
        if (p && d < bestD) [best, hit, bestD] = [c, p, d];
      }

      if (best && hit) {
        const spot = snap(best, hit);
        if (spot) return spot;
      }

      const floatZ = front + he.z + FLOAT_GAP;
      const g = ray.intersectPlane(ground, new THREE.Vector3());
      if (g && g.z > floatZ) {
        const x = clamp(g.x, -2000, 2000);
        const z = Math.min(g.z, 1500);
        const y =
          DROP_FROM -
          sweep(body, he, new THREE.Vector3(x, DROP_FROM, z), new THREE.Vector3(0, -1, 0), DROP_FROM - he.y);
        return new THREE.Vector3(x, y + 0.2, z);
      }
      const f = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -floatZ), new THREE.Vector3());
      if (!f) return null;
      return new THREE.Vector3(clamp(f.x, -2000, 2000), Math.max(f.y, he.y + 0.2), floatZ);
    };

    const follow = () => {
      if (!held || !lastRay) return;
      const p = target(lastRay);
      if (p) held.goal.copy(p);
    };

    // Ease the held box towards its goal every frame, so moving between slots glides instead of jumping.
    const tick = (now: number) => {
      if (!held) return;
      const dt = Math.min(0.05, (now - held.last) / 1000);
      held.last = now;
      held.pos.lerp(held.goal, 1 - Math.exp(-EASE * dt));
      held.body.setTranslation(held.pos, true);
      held.history.push({ t: now, p: held.pos.clone() });
      if (held.history.length > 8) held.history.shift();
      invalidate();
      raf = requestAnimationFrame(tick);
    };

    const startHold = (id: number) => {
      const body = registry.get(id);
      const spec = specs.get(id);
      if (!body || !spec) return;
      body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
      // While held it passes through everything instead of shoving other boxes around. (Solver groups, not a
      // sensor: a collider switched back from sensor ignores whatever it was already touching, and falls through it.)
      body.collider(0)?.setSolverGroups(NO_CONTACT);
      const q = squareUp(toQuat(body.rotation()));
      body.setRotation(q, true);
      const t = body.translation();
      const pos = new THREE.Vector3(t.x, t.y, t.z);
      held = { id, body, he: halfExtents(spec.size, q), pos, goal: pos.clone(), last: performance.now(), history: [] };
      raf = requestAnimationFrame(tick);
      useStore.getState().set({ selectedId: id, hoveredId: null });
    };

    const release = () => {
      if (held) {
        const { body, history, goal } = held;
        cancelAnimationFrame(raf);
        // Drop it where it was going, not part-way there (which could be inside a panel).
        body.setTranslation(goal, true);
        body.collider(0)?.setSolverGroups(ALL_CONTACT);
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
      cancelAnimationFrame(raf);
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
