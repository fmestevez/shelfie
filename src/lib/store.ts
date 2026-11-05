"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Cover, LayoutConfig, ShelfSelection } from "./packing";
import type { CustomShelf } from "./shelves";
import type { AreaKey, SortKey } from "./sorting";
import type { CollectionEdits, Game, GameOverride } from "./types";

/** Bump when the shape of saved games changes, so old saves are refetched. */
export const GAMES_VERSION = 2;
/** Bump when the colour analysis changes, so saved colours are recomputed. */
export const COLORS_VERSION = 2;

export type EnvironmentId = "living-room" | "loft" | "cafe" | "gallery" | "garden";

/** auto: packed by Shelfie. physics: the packed result as rigid bodies. manual: you place every box. */
export type Mode = "auto" | "physics" | "manual";

/** Where a box ended up in manual mode. */
export interface ManualPose {
  /** Box size in its own frame, and which face shows the cover (as first laid out). */
  size: [number, number, number];
  cover: Cover;
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

export interface LoadProgress {
  message: string;
  done: number;
  total: number;
}

interface State extends Omit<LayoutConfig, "shelves" | "keepOrder"> {
  username: string;
  games: Game[];
  gamesVersion: number;
  /** Per username. */
  edits: Record<string, CollectionEdits>;
  /** Box-art colour per image (see colorKey). */
  colors: Record<string, string>;
  colorsVersion: number;
  progress: LoadProgress | null;
  error: string | null;

  shelves: ShelfSelection[];
  finish: "white" | "black" | "oak";
  areaBy: AreaKey;
  sortBy: SortKey;
  areaReversed: boolean;
  sortReversed: boolean;
  includeExpansions: boolean;
  environment: EnvironmentId;
  hdTextures: boolean;
  showArt: boolean;
  showTitles: boolean;

  mode: Mode;
  /** Manual-mode box poses, per username, by collId. */
  manual: Record<string, Record<number, ManualPose>>;
  /** Bumped to rebuild the physics world from scratch. */
  physicsSeed: number;

  hoveredId: number | null;
  selectedId: number | null;

  set: (patch: Partial<State>) => void;
  setShelfCount: (modelId: string, count: number) => void;
  /** Adds or updates a custom shelf; a new one is placed once. */
  saveCustomShelf: (shelf: CustomShelf) => void;
  deleteCustomShelf: (id: string) => void;
  overrideGame: (collId: number, o: GameOverride | null) => void;
  removeGame: (collId: number) => void;
  restoreGame: (collId: number) => void;
  addGame: (game: Game) => void;
  saveManualPoses: (poses: Record<number, ManualPose>) => void;
  /** Back to the floor piles (manual) or the packed layout (physics). */
  resetPhysics: () => void;
}

const NO_EDITS: CollectionEdits = { overrides: {}, removed: [], added: [] };
export const editsOf = (s: Pick<State, "edits" | "username">) => s.edits[s.username] ?? NO_EDITS;

export const useStore = create<State>()(
  persist(
    (set) => ({
      username: "",
      games: [],
      gamesVersion: GAMES_VERSION,
      edits: {},
      colors: {},
      colorsVersion: COLORS_VERSION,
      progress: null,
      error: null,

      shelves: [{ modelId: "kallax-5x5", count: 1 }],
      customShelves: [],
      billyCompartments: 6,
      finish: "white",
      areaBy: "domain",
      separateAreas: true,
      overhang: 3,
      sortBy: "theme",
      areaReversed: false,
      sortReversed: false,
      orientation: "mixed",
      facing: "right",
      multiRow: false,
      lookahead: 8,
      overflow: "top-floor",
      includeExpansions: true,
      environment: "living-room",
      hdTextures: true,
      showArt: true,
      showTitles: true,

      mode: "auto",
      manual: {},
      physicsSeed: 0,

      hoveredId: null,
      selectedId: null,

      set: (patch) => set(patch),
      setShelfCount: (modelId, count) =>
        set((s) => {
          const others = s.shelves.filter((x) => x.modelId !== modelId);
          const existing = s.shelves.find((x) => x.modelId === modelId);
          if (count <= 0) return { shelves: others };
          if (existing) return { shelves: s.shelves.map((x) => (x.modelId === modelId ? { ...x, count } : x)) };
          return { shelves: [...s.shelves, { modelId, count }] };
        }),
      saveCustomShelf: (shelf) =>
        set((s) => {
          const exists = s.customShelves.some((x) => x.id === shelf.id);
          return exists
            ? { customShelves: s.customShelves.map((x) => (x.id === shelf.id ? shelf : x)) }
            : { customShelves: [...s.customShelves, shelf], shelves: [...s.shelves, { modelId: shelf.id, count: 1 }] };
        }),
      deleteCustomShelf: (id) =>
        set((s) => ({
          customShelves: s.customShelves.filter((x) => x.id !== id),
          shelves: s.shelves.filter((x) => x.modelId !== id),
        })),

      overrideGame: (collId, o) =>
        set((s) => {
          const e = editsOf(s);
          const overrides = { ...e.overrides };
          if (o) overrides[collId] = { ...overrides[collId], ...o };
          else delete overrides[collId];
          return { edits: { ...s.edits, [s.username]: { ...e, overrides } } };
        }),
      removeGame: (collId) =>
        set((s) => {
          const e = editsOf(s);
          // Games the user added are dropped outright; collection games are hidden.
          const next = e.added.some((g) => g.collId === collId)
            ? { ...e, added: e.added.filter((g) => g.collId !== collId) }
            : { ...e, removed: [...new Set([...e.removed, collId])] };
          return { edits: { ...s.edits, [s.username]: next }, selectedId: null, hoveredId: null };
        }),
      restoreGame: (collId) =>
        set((s) => {
          const e = editsOf(s);
          return { edits: { ...s.edits, [s.username]: { ...e, removed: e.removed.filter((id) => id !== collId) } } };
        }),
      addGame: (game) =>
        set((s) => {
          const e = editsOf(s);
          return { edits: { ...s.edits, [s.username]: { ...e, added: [...e.added, game] } }, selectedId: game.collId };
        }),
      saveManualPoses: (poses) => set((s) => ({ manual: { ...s.manual, [s.username]: poses } })),
      resetPhysics: () =>
        set((s) => {
          const manual = { ...s.manual };
          if (s.mode === "manual") delete manual[s.username];
          return { manual, physicsSeed: s.physicsSeed + 1 };
        }),
    }),
    {
      name: "shelfie",
      merge: (persisted, current) => {
        const p = { gamesVersion: 0, colorsVersion: 0, ...(persisted as Partial<State>) };
        // Colours from an older analysis (or keyed the old way) are recomputed.
        if (p.colorsVersion !== COLORS_VERSION) Object.assign(p, { colors: {}, colorsVersion: COLORS_VERSION });
        return { ...current, ...p };
      },
      // Settings and the last loaded collection survive reloads; transient UI state doesn't.
      partialize: (s) => {
        const rest: Partial<State> = { ...s };
        for (const k of [
          "progress",
          "error",
          "hoveredId",
          "selectedId",
          "set",
          "setShelfCount",
          "saveCustomShelf",
          "deleteCustomShelf",
          "overrideGame",
          "removeGame",
          "restoreGame",
          "addGame",
          "saveManualPoses",
          "resetPhysics",
          "physicsSeed",
        ] as const)
          delete rest[k];
        return rest;
      },
    },
  ),
);
