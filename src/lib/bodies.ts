import { type Cover, type Facing, floorLayout, type Layout, type Placement, type ShelfInstance } from "./packing";
import type { SortedGame } from "./sorting";
import type { ManualPose } from "./store";

/** A game box as a rigid body: its size and cover face in its own frame, plus a pose. */
export interface BodySpec {
  sg: SortedGame;
  size: [number, number, number];
  cover: Cover;
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

const IDENTITY: BodySpec["quaternion"] = [0, 0, 0, 1];

const fromPlacement = (p: Placement): BodySpec => ({
  sg: p.sg,
  size: p.size,
  cover: p.cover,
  position: p.center,
  quaternion: IDENTITY,
});

/** Physics mode: the packed layout, as it stands. */
export const packedBodies = (layout: Layout) => layout.placements.map(fromPlacement);

/**
 * Manual mode: saved poses where there are any; other games start in piles
 * on the floor (behind anything already placed there).
 */
export function manualBodies(
  sorted: SortedGame[],
  poses: Record<number, ManualPose> | undefined,
  facing: Facing,
  shelvesWidth: number,
): BodySpec[] {
  const saved: BodySpec[] = [];
  const fresh: SortedGame[] = [];
  for (const sg of sorted) {
    const pose = poses?.[sg.game.collId];
    if (pose) saved.push({ sg, ...pose });
    else fresh.push(sg);
  }
  if (!fresh.length) return saved;
  const piles = floorLayout(fresh, facing, shelvesWidth).map(fromPlacement);
  // Keep new piles clear of boxes already lying on the floor.
  const front = saved.reduce((m, b) => Math.max(m, b.position[2] + Math.max(...b.size) / 2), 0);
  const shift = saved.length ? Math.max(0, front + 20 - 70) : 0;
  for (const b of piles) b.position = [b.position[0], b.position[1], b.position[2] + shift];
  return [...saved, ...piles];
}

/** Where a body's centre sits: inside a compartment, on top of a unit, or elsewhere (the floor). */
export function whereIs(position: [number, number, number], shelves: ShelfInstance[]): "shelf" | "top" | "floor" {
  const [x, y, z] = position;
  for (const s of shelves) {
    const lx = x - s.offsetX;
    if (lx < 0 || lx > s.build.width || z > s.build.depth + 5) continue;
    if (y > s.build.height) return "top";
    if (s.build.compartments.some((c) => lx >= c.x && lx <= c.x + c.w && y >= c.y && y <= c.y + c.h)) return "shelf";
  }
  return "floor";
}

/** Manual mode's result: where the saved boxes are, and how much compartment volume they fill. */
export function manualStats(
  sorted: SortedGame[],
  poses: Record<number, ManualPose> | undefined,
  shelves: ShelfInstance[],
) {
  const stats = { onShelf: 0, onTop: 0, onFloor: 0, fill: 0 };
  let volume = 0;
  for (const { game } of sorted) {
    const pose = poses?.[game.collId];
    if (!pose) continue;
    const w = whereIs(pose.position, shelves);
    if (w === "shelf") {
      stats.onShelf++;
      volume += pose.size[0] * pose.size[1] * pose.size[2];
    } else if (w === "top") stats.onTop++;
  }
  stats.onFloor = sorted.length - stats.onShelf - stats.onTop;
  const capacity = shelves.reduce((s, sh) => s + sh.build.compartments.reduce((t, c) => t + c.w * c.h * c.d, 0), 0);
  stats.fill = capacity ? volume / capacity : 0;
  return stats;
}
