/**
 * Shelf models. All units are centimetres. Local frame: x = 0 at left side,
 * y = 0 at floor, z = 0 at the back (against the wall), z = depth at the front.
 */

export interface Panel {
  center: [number, number, number];
  size: [number, number, number];
}

/** An empty box of space that games can be packed into (min corner + size). */
export interface Compartment {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

export interface ShelfBuild {
  width: number;
  height: number;
  depth: number;
  panels: Panel[];
  /** In reading order: top row first, left to right. */
  compartments: Compartment[];
}

export interface ShelfModel {
  id: string;
  name: string;
  description: string;
  build: (opts: { billyCompartments: number }) => ShelfBuild;
}

function kallax(cols: number, rows: number): ShelfModel["build"] {
  const OUTER = 4.1; // thick outer frame
  const INNER = 1.6; // dividers
  const CELL = 33.5;
  const DEPTH = 39;
  const width = 2 * OUTER + cols * CELL + (cols - 1) * INNER;
  const height = 2 * OUTER + rows * CELL + (rows - 1) * INNER;

  return () => {
    const panels: Panel[] = [
      { center: [OUTER / 2, height / 2, DEPTH / 2], size: [OUTER, height, DEPTH] },
      { center: [width - OUTER / 2, height / 2, DEPTH / 2], size: [OUTER, height, DEPTH] },
      { center: [width / 2, OUTER / 2, DEPTH / 2], size: [width - 2 * OUTER, OUTER, DEPTH] },
      { center: [width / 2, height - OUTER / 2, DEPTH / 2], size: [width - 2 * OUTER, OUTER, DEPTH] },
    ];
    for (let c = 1; c < cols; c++) {
      const x = OUTER + c * CELL + (c - 1) * INNER + INNER / 2;
      panels.push({ center: [x, height / 2, DEPTH / 2], size: [INNER, height - 2 * OUTER, DEPTH] });
    }
    for (let r = 1; r < rows; r++) {
      const y = OUTER + r * CELL + (r - 1) * INNER + INNER / 2;
      panels.push({ center: [width / 2, y, DEPTH / 2], size: [width - 2 * OUTER, INNER, DEPTH] });
    }

    const compartments: Compartment[] = [];
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = 0; c < cols; c++) {
        compartments.push({
          x: OUTER + c * (CELL + INNER),
          y: OUTER + r * (CELL + INNER),
          z: 0,
          w: CELL,
          h: CELL,
          d: DEPTH,
        });
      }
    }
    return { width, height, depth: DEPTH, panels, compartments };
  };
}

function billy(width: number, depth: number, height: number): ShelfModel["build"] {
  const SIDE = 1.8;
  const TOP = 1.8;
  const SHELF = 1.6;
  const PLINTH = 6;
  const BACK = 0.4;

  return ({ billyCompartments }) => {
    const n = Math.max(1, billyCompartments);
    const innerW = width - 2 * SIDE;
    const innerD = depth - BACK;
    const bottomY = PLINTH + SHELF; // top surface of the bottom board
    const usable = height - TOP - bottomY - (n - 1) * SHELF;
    const cellH = usable / n;

    const panels: Panel[] = [
      { center: [SIDE / 2, height / 2, depth / 2], size: [SIDE, height, depth] },
      { center: [width - SIDE / 2, height / 2, depth / 2], size: [SIDE, height, depth] },
      { center: [width / 2, height - TOP / 2, depth / 2], size: [innerW, TOP, depth] },
      { center: [width / 2, PLINTH + SHELF / 2, depth / 2], size: [innerW, SHELF, depth - 1] },
      { center: [width / 2, PLINTH / 2, depth - 2], size: [innerW, PLINTH, 1.6] }, // front plinth
      { center: [width / 2, height / 2, BACK / 2], size: [innerW, height - PLINTH, BACK] },
    ];
    for (let i = 1; i < n; i++) {
      const y = bottomY + i * cellH + (i - 1) * SHELF + SHELF / 2;
      panels.push({ center: [width / 2, y, (depth + BACK) / 2 - 0.5], size: [innerW - 0.2, SHELF, innerD - 1] });
    }

    const compartments: Compartment[] = [];
    for (let i = n - 1; i >= 0; i--) {
      compartments.push({
        x: SIDE,
        y: bottomY + i * (cellH + SHELF),
        z: BACK,
        w: innerW,
        h: cellH,
        d: innerD,
      });
    }
    return { width, height, depth, panels, compartments };
  };
}

export const SHELF_MODELS: ShelfModel[] = [
  { id: "kallax-5x5", name: "Kallax 5×5", description: "182 × 182 × 39 cm, 25 cubes", build: kallax(5, 5) },
  { id: "kallax-4x4", name: "Kallax 4×4", description: "147 × 147 × 39 cm, 16 cubes", build: kallax(4, 4) },
  { id: "kallax-2x4", name: "Kallax 2×4", description: "77 × 147 × 39 cm, 8 cubes", build: kallax(2, 4) },
  { id: "kallax-1x4", name: "Kallax 1×4", description: "42 × 147 × 39 cm, 4 cubes", build: kallax(1, 4) },
  { id: "billy-deep", name: "Billy deep", description: "80 × 40 × 202 cm, adjustable shelves", build: billy(80, 40, 202) },
  { id: "billy", name: "Billy", description: "80 × 28 × 202 cm, adjustable shelves", build: billy(80, 28, 202) },
];

export const shelfModel = (id: string) => SHELF_MODELS.find((m) => m.id === id) ?? SHELF_MODELS[0];
