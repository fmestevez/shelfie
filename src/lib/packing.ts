import { type Compartment, type CustomShelf, type ShelfBuild, shelfModel } from "./shelves";
import type { SortedGame } from "./sorting";

export type Orientation = "vertical" | "horizontal" | "mixed";
export type Facing = "left" | "right";
export type OverflowMode = "top" | "floor" | "top-floor";
export type Cover = "+x" | "-x" | "+y";
export type Area = "shelf" | "top" | "floor";
export type Align = "left" | "center" | "right";

export interface ShelfSelection {
  modelId: string;
  count: number;
}

export interface LayoutConfig {
  shelves: ShelfSelection[];
  customShelves: CustomShelf[];
  billyCompartments: number;
  orientation: Orientation;
  facing: Facing;
  multiRow: boolean;
  /** How many out-of-order games may be skipped to fill a gap. 0 = strict order. */
  lookahead: number;
  overflow: OverflowMode;
  /** Start every area (see SortedGame.area) in a fresh compartment. */
  separateAreas: boolean;
  /** Don't reorder games inside a compartment (e.g. to keep a colour gradient). */
  keepOrder: boolean;
  /**
   * cm. > 0: boxes may stick out of the front this far. 0: flush with the front.
   * < 0: boxes sit this far back from the front edge (as far as the back allows).
   */
  overhang: number;
  /** cm left between neighbouring columns of boxes. */
  spacing: number;
  /** Where each row of boxes sits across its compartment. */
  align: Align;
}

export interface Placement {
  sg: SortedGame;
  /** World-space centre and axis-aligned size (cm). */
  center: [number, number, number];
  size: [number, number, number];
  cover: Cover;
  area: Area;
  /** Sits behind another row of games. */
  hidden: boolean;
}

export interface ShelfInstance {
  key: string;
  modelId: string;
  offsetX: number;
  build: ShelfBuild;
}

export interface Layout {
  shelves: ShelfInstance[];
  placements: Placement[];
  unplaced: SortedGame[];
  floorAreas: Compartment[];
  stats: { onShelf: number; onTop: number; onFloor: number; fill: number };
  width: number;
}

const EPS = 0.3; // tolerance: boxes squeeze a little
const SUPPORT = 0.6; // fraction of a box's width that must rest on something
const SIZE_TOLERANCE = 1.5; // cm a box may exceed the boxes it rests on
const SHELF_GAP = 1.5;
const CEILING = 255;
const FLOOR_AREA = { w: 70, h: 80, d: 45 };

// ---------- 2D free-space packing of one row's front face ----------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A placed box: its rectangle on the face plus the box's two largest dimensions. */
interface Used extends Rect {
  a: number;
  b: number;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const contains = (a: Rect, b: Rect) => b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;

/**
 * Maximal-rectangles packer over the shelf's front face (x = width, y = height),
 * with gravity: a box must stand on the floor or mostly on top of other boxes.
 */
class Face {
  free: Rect[];
  used: Used[] = [];

  constructor(w: number, h: number) {
    this.free = [{ x: 0, y: 0, w, h }];
  }

  /**
   * Enough of the box rests on something, and everything it rests on is at least
   * as big, so small boxes never end up squashed under bigger ones.
   */
  /**
   * How snugly a box would sit here: 0 on the floor, otherwise how much bigger the
   * boxes underneath are (smaller is snugger). null if it would be unstable or would
   * squash a smaller box.
   */
  private support(x: number, y: number, w: number, a: number, b: number): number | null {
    if (y < 0.01) return 0;
    let s = 0;
    let slack = 0;
    for (const u of this.used) {
      if (Math.abs(u.y + u.h - y) > 0.01) continue;
      const overlap = Math.min(x + w, u.x + u.w) - Math.max(x, u.x);
      if (overlap <= 0.01) continue;
      if (u.a < a - SIZE_TOLERANCE || u.b < b - SIZE_TOLERANCE) return null;
      s += overlap;
      slack = Math.max(slack, u.a - a + u.b - b);
    }
    return s >= w * SUPPORT ? slack : null;
  }

  /** Nothing bigger already sits right on top of this spot (e.g. an overhang). */
  private canCarry(x: number, top: number, w: number, a: number, b: number) {
    return !this.used.some(
      (u) =>
        Math.abs(u.y - top) <= 0.01 &&
        Math.min(x + w, u.x + u.w) - Math.max(x, u.x) > 0.01 &&
        (a < u.a - SIZE_TOLERANCE || b < u.b - SIZE_TOLERANCE),
    );
  }

  /**
   * Where a w×h box (largest dimensions a×b) should go. Default: the lowest spot.
   * `onStacks`: on top of the snuggest existing box first, the floor only if none
   * fits, which keeps floor space for big boxes. `fromRight` packs toward the right.
   */
  find(
    w: number,
    h: number,
    a: number,
    b: number,
    fromRight: boolean,
    onStacks: boolean,
  ): { x: number; y: number } | null {
    let best: { x: number; y: number; score: number } | null = null;
    for (const r of this.free) {
      if (r.w < w || r.h < h) continue;
      for (const x of fromRight ? [r.x + r.w - w, r.x] : [r.x, r.x + r.w - w]) {
        const slack = this.support(x, r.y, w, a, b);
        if (slack === null || !this.canCarry(x, r.y + h, w, a, b)) continue;
        const score = onStacks ? (r.y < 0.01 ? 1e6 : slack) : r.y;
        const better =
          !best ||
          score < best.score - 0.01 ||
          (Math.abs(score - best.score) <= 0.01 &&
            (r.y < best.y - 0.01 || (Math.abs(r.y - best.y) <= 0.01 && (fromRight ? x > best.x : x < best.x))));
        if (better) best = { x, y: r.y, score };
      }
    }
    return best;
  }

  place(rect: Used) {
    this.used.push(rect);
    const next: Rect[] = [];
    for (const f of this.free) {
      if (!overlaps(f, rect)) {
        next.push(f);
        continue;
      }
      if (rect.x > f.x) next.push({ x: f.x, y: f.y, w: rect.x - f.x, h: f.h });
      if (rect.x + rect.w < f.x + f.w)
        next.push({ x: rect.x + rect.w, y: f.y, w: f.x + f.w - rect.x - rect.w, h: f.h });
      if (rect.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: rect.y - f.y });
      if (rect.y + rect.h < f.y + f.h)
        next.push({ x: f.x, y: rect.y + rect.h, w: f.w, h: f.y + f.h - rect.y - rect.h });
    }
    // Drop slivers and rectangles contained in another (keeping one of any duplicates).
    this.free = next.filter(
      (r, i) => r.w > 0.5 && r.h > 0.5 && !next.some((o, j) => j !== i && contains(o, r) && (j < i || !contains(r, o))),
    );
  }
}

// ---------- compartments ----------

interface Item {
  sg: SortedGame;
  x: number;
  y: number;
  X: number;
  Y: number;
  Z: number;
  cover: Cover;
}
interface Row {
  face: Face;
  depth: number;
  items: Item[];
}
interface Orient {
  X: number;
  Y: number;
  Z: number;
  cover: Cover;
  flat: boolean;
}

/**
 * v-tall / v-short: boxes stand upright (long or short edge up first), and small
 * ones may stand on top of others. horizontal: flat stacks. prefer: big boxes
 * stand, small ones lie flat (packed from the right).
 */
type Strategy = "v-tall" | "v-short" | "horizontal" | "prefer";

class Bin {
  rows: Row[] = [];

  constructor(
    readonly c: Compartment,
    readonly multiRow: boolean,
    readonly facing: Facing,
    readonly overhang: number,
    readonly gap: number,
    readonly align: Align,
  ) {}

  private totalDepth() {
    return this.rows.reduce((s, r) => s + r.depth, 0);
  }

  private depthOk(row: Row | null, Z: number) {
    const max = this.c.d + EPS + Math.max(0, this.overhang);
    if (!row) return (this.multiRow || this.rows.length === 0) && this.totalDepth() + Z <= max;
    return this.totalDepth() - row.depth + Math.max(row.depth, Z) <= max;
  }

  private orientations(sg: SortedGame, strategy: Strategy): Orient[] {
    const [a, b, c] = sg.game.dims;
    const side: Cover = this.facing === "left" ? "-x" : "+x";
    const tall: Orient = { X: c, Y: a, Z: b, cover: side, flat: false };
    const short: Orient = { X: c, Y: b, Z: a, cover: side, flat: false };
    // Single row: narrow footprint leaves width for neighbours; multi-row: shallow leaves depth.
    const flats: Orient[] = [
      { X: a, Y: c, Z: b, cover: "+y", flat: true },
      { X: b, Y: c, Z: a, cover: "+y", flat: true },
    ];
    if (!this.multiRow) flats.reverse();
    switch (strategy) {
      case "v-tall":
        return [tall, short];
      case "v-short":
        return [short, tall];
      case "horizontal":
        return flats;
      case "prefer": {
        const standY = a <= this.c.h + EPS ? a : b;
        return standY < this.c.h * 0.6 ? [...flats, tall, short] : [tall, short, ...flats];
      }
    }
  }

  private openRow(): Row {
    const row: Row = { face: new Face(this.c.w + EPS, this.c.h + EPS), depth: 0, items: [] };
    this.rows.push(row);
    return row;
  }

  place(sg: SortedGame, strategy: Strategy): boolean {
    const opts = this.orientations(sg, strategy);
    const [a, b] = sg.game.dims;
    // Fill the front row before opening another one behind it.
    for (const row of [...this.rows, null]) {
      const face = row?.face ?? new Face(this.c.w + EPS, this.c.h + EPS);
      let best: { o: Orient; x: number; y: number; rank: number } | undefined;
      opts.forEach((o, rank) => {
        if (!this.depthOk(row, o.Z)) return;
        const spot = face.find(o.X + this.gap, o.Y, a, b, strategy === "prefer" && o.flat, o.flat);
        if (!spot) return;
        // Lowest spot wins (gravity); orientation preference breaks ties.
        if (!best || spot.y < best.y - 0.01 || (Math.abs(spot.y - best.y) <= 0.01 && rank < best.rank)) {
          best = { o, ...spot, rank };
        }
      });
      if (!best) continue;
      const { o, x, y } = best;
      const r = row ?? this.openRow();
      r.face.place({ x, y, w: o.X + this.gap, h: o.Y, a, b });
      r.items.push({ sg, x, y, X: o.X, Y: o.Y, Z: o.Z, cover: o.cover });
      r.depth = Math.max(r.depth, o.Z);
      return true;
    }
    return false;
  }

  toPlacements(area: Area): Placement[] {
    const { c } = this;
    // If the rows are deeper than the compartment, they poke out of the front.
    const front = c.z + Math.max(c.d, this.totalDepth());
    const setBack = Math.max(0, -this.overhang);
    let rowStart = 0;
    return this.rows.flatMap((row, ri) => {
      const rowFront = front - rowStart;
      const isBack = ri === this.rows.length - 1;
      // Set-back boxes move toward the wall, but never into the row behind them.
      const backLimit = isBack ? c.z : rowFront - row.depth;
      // With several rows, the back row is pushed right against the back panel.
      const zOf = (Z: number) => (isBack && ri > 0 ? c.z + Z / 2 : Math.max(backLimit + Z, rowFront - setBack) - Z / 2);
      const xs = alignRow(row.items, c.w, this.align, this.gap);
      const out = row.items.map((it, i): Placement => ({
        sg: it.sg,
        center: [c.x + xs[i] + it.X / 2, c.y + it.y + it.Y / 2, zOf(it.Z)],
        size: [it.X, it.Y, it.Z],
        cover: it.cover,
        area,
        hidden: ri > 0,
      }));
      rowStart += row.depth;
      return out;
    });
  }
}

/**
 * Left edges for a row packed from the left, re-aligned. Right: the packing is mirrored, so stacks build against the
 * right side. Centre: every group of boxes resting on a single box is centred over it (carrying whatever is stacked
 * on them), then the whole row is centred. A group stays put if that would leave something resting partly outside
 * it, or bring it closer to a neighbour than the column spacing.
 */
function alignRow(items: Item[], width: number, align: Align, gap: number): number[] {
  if (align === "left") return items.map((it) => it.x);
  if (align === "right") return items.map((it) => width - (it.x + it.X));

  const xs = items.map((it) => it.x);
  // Packed rows may squeeze slightly past the compartment; never spread wider than they were.
  const limit = Math.max(width, ...items.map((it) => it.x + it.X));
  const xOverlap = (i: number, j: number) => Math.min(xs[i] + items[i].X, xs[j] + items[j].X) - Math.max(xs[i], xs[j]);
  // What each box rests on, from the packed positions.
  const parents = items.map((it, i) =>
    items.flatMap((q, j) => (j !== i && Math.abs(q.y + q.Y - it.y) < 0.02 && xOverlap(i, j) > 0.05 ? [j] : [])),
  );
  const kids = items.map(() => [] as number[]);
  parents.forEach((ps, i) => ps.forEach((p) => kids[p].push(i)));

  const order = items.map((_, i) => i).sort((a, b) => items[a].y - items[b].y);
  for (const q of order) {
    const group = kids[q].filter((k) => parents[k].length === 1);
    if (!group.length) continue;
    const moved = new Set(group);
    for (const stack = [...group]; stack.length;) {
      for (const k of kids[stack.pop()!]) {
        if (moved.has(k)) continue;
        moved.add(k);
        stack.push(k);
      }
    }
    const anchored = [...moved].every((i) => group.includes(i) || parents[i].every((p) => moved.has(p)));
    if (!anchored) continue;
    const lo = Math.min(...group.map((i) => xs[i]));
    const hi = Math.max(...group.map((i) => xs[i] + items[i].X));
    const shift = xs[q] + items[q].X / 2 - (lo + hi) / 2;
    if (Math.abs(shift) < 0.01) continue;
    for (const i of moved) xs[i] += shift;
    const clash = [...moved].some(
      (i) =>
        xs[i] < -0.01 ||
        xs[i] + items[i].X > limit + 0.01 ||
        items.some(
          (o, j) =>
            !moved.has(j) &&
            // Closer than the column spacing (or overlapping) at the same height.
            xOverlap(i, j) > 0.01 - gap &&
            Math.min(items[i].y + items[i].Y, o.y + o.Y) - Math.max(items[i].y, o.y) > 0.01,
        ),
    );
    if (clash) for (const i of moved) xs[i] -= shift;
  }

  const lo = Math.min(...xs);
  const hi = Math.max(...items.map((it, i) => xs[i] + it.X));
  const shift = Math.max(0, (width - (hi - lo)) / 2) - lo;
  return xs.map((x) => x + shift);
}

type FillOpts = {
  multiRow: boolean;
  facing: Facing;
  lookahead: number;
  overhang: number;
  keepOrder: boolean;
  spacing: number;
  align: Align;
};
const newBin = (c: Compartment, o: FillOpts) => new Bin(c, o.multiRow, o.facing, o.overhang, o.spacing, o.align);

const fitCache = new WeakMap<SortedGame, Map<string, boolean>>();
function fitsEmpty(c: Compartment, sg: SortedGame, strategy: Strategy, opts: FillOpts) {
  const key = `${c.w}|${c.h}|${c.d}|${strategy}|${opts.multiRow}|${Math.max(0, opts.overhang)}|${opts.spacing}`;
  let m = fitCache.get(sg);
  if (!m) fitCache.set(sg, (m = new Map()));
  let v = m.get(key);
  if (v === undefined) {
    v = newBin(c, opts).place(sg, strategy);
    m.set(key, v);
  }
  return v;
}

/**
 * Greedily fill one compartment from the front of the queue, trying each strategy
 * and keeping whichever fits the most. Up to `lookahead` games that could have gone
 * here but didn't fit may be skipped (they stay queued for the next compartment).
 */
function fill(c: Compartment, queue: SortedGame[], strategies: Strategy[], opts: FillOpts) {
  let best: { bin: Bin; taken: Set<number>; volume: number; strategy: Strategy } | undefined;
  const consider = (strategy: Strategy, bin: Bin, taken: Set<number>, reordered = false) => {
    let volume = 0;
    for (const i of taken) {
      const [a, b, d] = queue[i].game.dims;
      volume += a * b * d;
    }
    // When order matters, a reordered packing has to fit strictly more to win.
    if (reordered && opts.keepOrder) {
      if (best && taken.size <= best.taken.size) return;
    } else if (best && !(taken.size > best.taken.size || (taken.size === best.taken.size && volume > best.volume))) {
      return;
    }
    best = { bin, taken, volume, strategy };
  };

  for (const strategy of strategies) {
    // In sort order, skipping at most `lookahead` games that could have fit.
    const bin = newBin(c, opts);
    const taken = new Set<number>();
    let skipped = 0;
    let i = 0;
    for (; i < queue.length && skipped <= opts.lookahead; i++) {
      if (bin.place(queue[i], strategy)) taken.add(i);
      // Only games that could have gone here count against the budget; one that
      // never fits this compartment shape mustn't block the ones behind it.
      else if (fitsEmpty(c, queue[i], strategy, opts)) skipped++;
    }
    consider(strategy, bin, taken);

    // The same games, biggest first: small boxes then stack on big ones instead of
    // taking floor space a big box needed.
    const big = newBin(c, opts);
    const bigTaken = new Set<number>();
    const prefix = Array.from({ length: i }, (_, k) => k);
    prefix.sort(
      (p, q) => queue[q].game.dims[0] * queue[q].game.dims[1] - queue[p].game.dims[0] * queue[p].game.dims[1],
    );
    for (const k of prefix) if (big.place(queue[k], strategy)) bigTaken.add(k);
    consider(strategy, big, bigTaken, true);
  }
  const rest = queue.filter((_, i) => !best!.taken.has(i));
  return { bin: (!opts.keepOrder && biggestFirst(c, queue, best!, opts)) || best!.bin, rest };
}

/**
 * Re-pack the games chosen for a compartment biggest-first within each group, so
 * stacks have big boxes at the bottom. Keeps the original packing if they no
 * longer all fit.
 */
function biggestFirst(
  c: Compartment,
  queue: SortedGame[],
  chosen: { taken: Set<number>; strategy: Strategy },
  opts: FillOpts,
) {
  const games = queue.filter((_, i) => chosen.taken.has(i));
  const groupRank = new Map<string, number>();
  for (const sg of games) {
    const k = `${sg.area}|${sg.group}`;
    if (!groupRank.has(k)) groupRank.set(k, groupRank.size);
  }
  const footprint = (sg: SortedGame) => sg.game.dims[0] * sg.game.dims[1];
  const ordered = [...games].sort(
    (p, q) =>
      groupRank.get(`${p.area}|${p.group}`)! - groupRank.get(`${q.area}|${q.group}`)! || footprint(q) - footprint(p),
  );
  if (ordered.every((sg, i) => sg === games[i])) return null;
  const bin = newBin(c, opts);
  return ordered.every((sg) => bin.place(sg, chosen.strategy)) ? bin : null;
}

function splitAreas(sorted: SortedGame[]): SortedGame[][] {
  const out: SortedGame[][] = [];
  for (const sg of sorted) {
    const last = out[out.length - 1];
    if (last && last[0].area === sg.area) last.push(sg);
    else out.push([sg]);
  }
  return out;
}

export function computeLayout(sorted: SortedGame[], cfg: LayoutConfig): Layout {
  // Arrange shelf units side by side, centred on x = 0.
  const shelves: ShelfInstance[] = [];
  let x = 0;
  for (const sel of cfg.shelves) {
    const model = shelfModel(sel.modelId, cfg.customShelves);
    for (let i = 0; i < sel.count; i++) {
      const build = model.build({ billyCompartments: cfg.billyCompartments });
      shelves.push({ key: `${sel.modelId}-${i}-${shelves.length}`, modelId: sel.modelId, offsetX: x, build });
      x += build.width + SHELF_GAP;
    }
  }
  const width = Math.max(0, x - SHELF_GAP);
  for (const s of shelves) s.offsetX -= width / 2;
  const compartments = shelves.flatMap((s) => s.build.compartments.map((c) => ({ ...c, x: c.x + s.offsetX })));

  const strategies: Strategy[] =
    cfg.orientation === "mixed"
      ? ["prefer", "horizontal", "v-tall", "v-short"]
      : cfg.orientation === "vertical"
        ? ["v-tall", "v-short"]
        : ["horizontal"];
  const opts: FillOpts = {
    multiRow: cfg.multiRow,
    facing: cfg.facing,
    lookahead: cfg.lookahead,
    overhang: cfg.overhang,
    keepOrder: cfg.keepOrder,
    spacing: Math.max(0, cfg.spacing),
    align: cfg.align,
  };

  const placements: Placement[] = [];
  let usedVolume = 0;
  const shelfVolume = compartments.reduce((s, c) => s + c.w * c.h * c.d, 0);

  // Each area gets its own run of compartments, and skipping only happens within it.
  const runs = cfg.separateAreas ? splitAreas(sorted) : [sorted];
  let queue: SortedGame[] = [];
  let next = 0; // first compartment no area has used yet
  for (const run of runs) {
    let rest = run;
    let lastUsed = next - 1;
    for (let i = next; i < compartments.length && rest.length; i++) {
      const filled = fill(compartments[i], rest, strategies, opts);
      if (filled.rest.length === rest.length) continue;
      const ps = filled.bin.toPlacements("shelf");
      for (const p of ps) usedVolume += p.size[0] * p.size[1] * p.size[2];
      placements.push(...ps);
      rest = filled.rest;
      lastUsed = i;
    }
    next = lastUsed + 1;
    queue = queue.concat(rest);
  }
  const onShelf = placements.length;

  // Overflow: stacks on top of the units.
  if (queue.length && cfg.overflow !== "floor") {
    for (const s of shelves) {
      if (!queue.length) break;
      const c: Compartment = {
        x: s.offsetX + 0.5,
        y: s.build.height,
        z: 0.5,
        w: s.build.width - 1,
        h: Math.max(30, CEILING - s.build.height),
        d: s.build.depth - 1,
      };
      const { bin, rest } = fill(c, queue, ["horizontal"], { ...opts, lookahead: Infinity });
      placements.push(...bin.toPlacements("top"));
      queue = rest;
    }
  }
  const onTop = placements.length - onShelf;

  // Overflow: piles on the floor, alternating left/right of the shelves.
  const floorAreas: Compartment[] = [];
  if (queue.length && cfg.overflow !== "top") {
    const reach = [width / 2 + 12, width / 2 + 12]; // how far piles extend left / right
    for (let i = 0; i < 200 && queue.length; i++) {
      const side = i % 2;
      // Grow the spot for oversized boxes (Crokinole boards and the like).
      const [a, b] = queue[0].game.dims;
      const w = Math.max(FLOOR_AREA.w, a + 1);
      const d = Math.max(FLOOR_AREA.d, b + 1);
      const c: Compartment = {
        x: side === 0 ? -reach[0] - w : reach[1],
        y: 0,
        z: 2,
        w,
        h: FLOOR_AREA.h,
        d,
      };
      reach[side] += w + 6;
      const { bin, rest } = fill(c, queue, ["horizontal"], { ...opts, lookahead: Infinity });
      floorAreas.push(c);
      placements.push(...bin.toPlacements("floor"));
      queue = rest;
    }
  }
  const onFloor = placements.length - onShelf - onTop;

  return {
    shelves,
    placements,
    unplaced: queue,
    floorAreas,
    stats: { onShelf, onTop, onFloor, fill: shelfVolume ? usedVolume / shelfVolume : 0 },
    width,
  };
}

/**
 * Every game in piles on the floor in front of the shelves, in sorted order
 * (the starting point of manual mode). Piles fill rows left to right, front
 * rows further from the wall.
 */
export function floorLayout(sorted: SortedGame[], facing: Facing, shelvesWidth: number): Placement[] {
  const opts: FillOpts = {
    multiRow: false,
    facing,
    lookahead: Infinity,
    overhang: 0,
    keepOrder: false,
    spacing: 0.5,
    align: "center",
  };
  const volume = sorted.reduce((s, sg) => s + sg.game.dims[0] * sg.game.dims[1] * sg.game.dims[2], 0);
  // Low piles, so they don't hide the shelves behind them.
  const pileH = 36;
  const pileVolume = FLOOR_AREA.w * pileH * FLOOR_AREA.d * 0.5;
  const pitch = FLOOR_AREA.w + 6;
  // Roughly twice as wide as deep, and at least as wide as the shelves.
  const cols = Math.max(Math.ceil(shelvesWidth / pitch), Math.ceil(Math.sqrt((2 * volume) / pileVolume)), 3);

  const placements: Placement[] = [];
  let queue = sorted;
  let z = 60;
  while (queue.length) {
    let x = (-cols * pitch) / 2 + 3;
    let rowDepth = FLOOR_AREA.d;
    for (let i = 0; i < cols && queue.length; i++) {
      const [a, b] = queue[0].game.dims;
      const c: Compartment = {
        x,
        y: 0,
        z,
        w: Math.max(FLOOR_AREA.w, a + 1),
        h: FLOOR_AREA.h,
        d: Math.max(FLOOR_AREA.d, b + 1),
      };
      const { bin, rest } = fill(c, queue, ["horizontal"], opts);
      placements.push(...bin.toPlacements("floor"));
      queue = rest;
      x += c.w + 6;
      rowDepth = Math.max(rowDepth, c.d);
    }
    z += rowDepth + 12;
  }
  return placements;
}
