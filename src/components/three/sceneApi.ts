"use client";

import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Layout } from "@/lib/packing";

export type ExportMode = "view" | "all";

/** Camera and export actions, wired up by <SceneBridge> inside the canvas. */
export interface SceneApi {
  orbit: (dTheta: number, dPhi: number) => void;
  zoom: (factor: number) => void;
  pan: (dx: number, dy: number) => void;
  fit: () => void;
  /** Bring a game's box into view, keeping roughly the current viewing angle. */
  focus: (collId: number) => void;
  exportImage: (mode: ExportMode) => string;
}

export const sceneApi: { current: SceneApi | null } = { current: null };

/** The scene-graph name of a game's box mesh. */
export const boxName = (collId: number) => `game-${collId}`;

export const FOV = 40;
const MIN_DIST = 30;
const MAX_DIST = 2500;
const FOCUS_DIST = 140; // cm from a found box: close enough to read its neighbours too
export const MAX_POLAR = Math.PI / 2 - 0.03;

/** Camera position and target that frame shelves `span` cm wide. */
export function homeView(span: number, aspect: number) {
  const halfFov = ((FOV / 2) * Math.PI) / 180;
  // Leave room either side for a glimpse of the room's furniture.
  const fitW = (span / 2 + 75) / (Math.tan(halfFov) * aspect);
  const fitH = 118 / Math.tan(halfFov);
  const dist = Math.max(fitW, fitH);
  return { position: new THREE.Vector3(dist * 0.08, 120, dist + 20), target: new THREE.Vector3(0, 100, 20) };
}

export function createSceneApi(ctx: {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControlsImpl;
  invalidate: () => void;
  layout: Layout;
  /** Every box, for framing the whole collection. */
  boxes: { center: [number, number, number]; size: [number, number, number] }[];
  span: number;
}): SceneApi {
  const { gl, scene, camera, controls, invalidate } = ctx;

  // Short eased move so button presses don't jump.
  let raf = 0;
  const moveTo = (position: THREE.Vector3, target: THREE.Vector3) => {
    cancelAnimationFrame(raf);
    const p0 = camera.position.clone();
    const t0 = controls.target.clone();
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 200);
      const e = 1 - (1 - k) ** 3;
      camera.position.lerpVectors(p0, position, e);
      controls.target.lerpVectors(t0, target, e);
      controls.update();
      invalidate();
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };

  const offset = () => camera.position.clone().sub(controls.target);

  /** Render once without the hover glow or selection outline and read the pixels back. */
  const capture = (cam: THREE.Camera) => {
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.name === "highlight" && o.visible) hidden.push(o);
    });
    for (const o of hidden) o.visible = false;
    gl.render(scene, cam);
    const url = gl.domElement.toDataURL("image/png");
    for (const o of hidden) o.visible = true;
    return url;
  };

  return {
    orbit(dTheta, dPhi) {
      const s = new THREE.Spherical().setFromVector3(offset());
      s.theta += dTheta;
      s.phi = THREE.MathUtils.clamp(s.phi + dPhi, 0.15, MAX_POLAR);
      moveTo(new THREE.Vector3().setFromSpherical(s).add(controls.target), controls.target.clone());
    },
    zoom(factor) {
      const o = offset();
      const d = THREE.MathUtils.clamp(o.length() * factor, MIN_DIST, MAX_DIST);
      moveTo(o.setLength(d).add(controls.target), controls.target.clone());
    },
    pan(dx, dy) {
      const step = offset().length() * 0.15;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).setY(0).normalize();
      const delta = right.multiplyScalar(dx * step).add(new THREE.Vector3(0, dy * step, 0));
      // Keep the target above the floor.
      if (controls.target.y + delta.y < 0) delta.y = -controls.target.y;
      moveTo(camera.position.clone().add(delta), controls.target.clone().add(delta));
    },
    fit() {
      const { position, target } = homeView(ctx.span, camera.aspect);
      moveTo(position, target);
    },
    focus(collId) {
      const box = scene.getObjectByName(boxName(collId));
      if (!box) return;
      const at = box.getWorldPosition(new THREE.Vector3());
      // Look from the front, slightly above, whatever odd angle the camera was at.
      const dir = offset().normalize();
      dir.set(dir.x, Math.max(dir.y, 0.15), Math.max(dir.z, 0.6)).normalize();
      // On a portrait screen the game's card covers the top half: aim higher so the box shows below it.
      const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * FOCUS_DIST;
      const target = at.clone().add(new THREE.Vector3(0, camera.aspect < 1 ? 0.45 * halfHeight : 0, 0));
      moveTo(target.clone().add(dir.multiplyScalar(FOCUS_DIST)), target);
    },
    exportImage(mode) {
      if (mode === "view") {
        // Same framing, twice the resolution.
        const ratio = gl.getPixelRatio();
        gl.setPixelRatio(Math.min(3, ratio * 2));
        const url = capture(camera);
        gl.setPixelRatio(ratio);
        invalidate();
        return url;
      }

      // Whole collection: frame every shelf, overflow stack and floor pile, front-on.
      const box = new THREE.Box3();
      for (const s of ctx.layout.shelves) {
        box.expandByPoint(new THREE.Vector3(s.offsetX, 0, 0));
        box.expandByPoint(new THREE.Vector3(s.offsetX + s.build.width, s.build.height, s.build.depth));
      }
      for (const p of ctx.boxes) {
        const half = new THREE.Vector3(...p.size).multiplyScalar(0.5);
        const c = new THREE.Vector3(...p.center);
        box.expandByPoint(c.clone().sub(half));
        box.expandByPoint(c.clone().add(half));
      }
      if (box.isEmpty()) box.set(new THREE.Vector3(-100, 0, 0), new THREE.Vector3(100, 200, 40));
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const margin = 25;
      const w = size.x + 2 * margin;
      const h = size.y + 2 * margin;
      const aspect = w / h;

      const maxSide = Math.min(4096, gl.capabilities.maxTextureSize);
      const W = Math.round(aspect >= 1 ? maxSide : maxSide * aspect);
      const H = Math.round(aspect >= 1 ? maxSide / aspect : maxSide);

      const cam = new THREE.PerspectiveCamera(30, aspect, 1, 10000);
      const halfFov = THREE.MathUtils.degToRad(15);
      const dist = h / 2 / Math.tan(halfFov);
      cam.position.set(center.x, center.y, box.max.z + dist);
      cam.lookAt(center.x, center.y, center.z);

      const prevSize = gl.getSize(new THREE.Vector2());
      const prevRatio = gl.getPixelRatio();
      gl.setPixelRatio(1);
      gl.setSize(W, H, false);
      const url = capture(cam);
      gl.setPixelRatio(prevRatio);
      gl.setSize(prevSize.x, prevSize.y, false);
      invalidate();
      return url;
    },
  };
}
