"use client";

import { useEffect, useMemo, useState } from "react";
import { computeColors, loadCollection } from "@/lib/loadCollection";
import { useShallow } from "zustand/react/shallow";
import { manualBodies, packedBodies } from "@/lib/bodies";
import { computeLayout } from "@/lib/packing";
import { sortGames } from "@/lib/sorting";
import { applyEdits } from "@/lib/edits";
import { applyShareLink } from "@/lib/share";
import { editsOf, GAMES_VERSION, useStore } from "@/lib/store";
import { Scene } from "./three/Scene";
import { CameraPad } from "./CameraPad";
import { SelectedGame } from "./SelectedGame";
import { Sidebar } from "./Sidebar";

function useLayout() {
  const s = useStore(
    useShallow((s) => ({
      games: s.games,
      edits: editsOf(s),
      colors: s.colors,
      includeExpansions: s.includeExpansions,
      sortBy: s.sortBy,
      areaBy: s.areaBy,
      areaReversed: s.areaReversed,
      sortReversed: s.sortReversed,
      separateAreas: s.separateAreas,
      overhang: s.overhang,
      spacing: s.spacing,
      align: s.align,
      shelves: s.shelves,
      customShelves: s.customShelves,
      billyCompartments: s.billyCompartments,
      orientation: s.orientation,
      facing: s.facing,
      multiRow: s.multiRow,
      lookahead: s.lookahead,
      overflow: s.overflow,
    })),
  );

  const games = useMemo(() => {
    const all = applyEdits(s.games, s.edits);
    return s.includeExpansions ? all : all.filter((g) => !g.isExpansion);
  }, [s.games, s.edits, s.includeExpansions]);
  // Colours only matter for colour sorting; avoid re-sorting as they stream in otherwise.
  const colorsForSort = s.sortBy === "color" || s.areaBy === "color" ? s.colors : null;
  const sorted = useMemo(
    () => sortGames(games, s.areaBy, s.sortBy, colorsForSort ?? {}, { area: s.areaReversed, sort: s.sortReversed }),
    [games, s.areaBy, s.sortBy, colorsForSort, s.areaReversed, s.sortReversed],
  );
  const layout = useMemo(
    () =>
      computeLayout(sorted, {
        shelves: s.shelves,
        customShelves: s.customShelves,
        billyCompartments: s.billyCompartments,
        orientation: s.orientation,
        facing: s.facing,
        multiRow: s.multiRow,
        lookahead: s.lookahead,
        overflow: s.overflow,
        separateAreas: s.separateAreas,
        overhang: s.overhang,
        spacing: s.spacing,
        align: s.align,
        keepOrder: s.sortBy === "color",
      }),
    [
      sorted,
      s.shelves,
      s.customShelves,
      s.billyCompartments,
      s.orientation,
      s.facing,
      s.multiRow,
      s.lookahead,
      s.overflow,
      s.separateAreas,
      s.overhang,
      s.spacing,
      s.align,
      s.sortBy,
    ],
  );
  const mode = useStore((s) => s.mode);
  const seed = useStore((s) => s.physicsSeed);
  const username = useStore((s) => s.username);
  const bodies = useMemo(() => {
    if (mode === "physics") return packedBodies(layout);
    if (mode !== "manual") return null;
    // Saved poses are read once per world: the world itself is the live state, and saves shouldn't rebuild it.
    return manualBodies(sorted, useStore.getState().manual[username], s.facing, layout.width);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed rebuilds the world on reset
  }, [mode, layout, sorted, username, s.facing, seed]);
  return { games, sorted, layout, bodies };
}

export default function App() {
  const { games, sorted, layout, bodies } = useLayout();
  const [open, setOpen] = useState(true);

  // Picking a version can change the box art; analyse any art we haven't seen.
  useEffect(() => {
    if (useStore.getState().gamesVersion === GAMES_VERSION) computeColors(games);
  }, [games]);

  useEffect(() => {
    if (applyShareLink()) return;
    const { games, username, gamesVersion } = useStore.getState();
    // Collections saved by an older version of the app are refetched once.
    if (username && username !== "demo" && games.length && gamesVersion !== GAMES_VERSION) loadCollection(username);
  }, []);

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-neutral-950">
      <aside
        className={`absolute inset-y-0 left-0 z-10 w-80 max-w-[85vw] overflow-y-auto bg-neutral-900/92 backdrop-blur transition-transform md:relative md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar games={games} sorted={sorted} layout={layout} />
      </aside>
      <main className="relative min-w-0 flex-1">
        <Scene layout={layout} bodies={bodies} />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="absolute left-3 top-3 z-20 rounded-lg bg-neutral-900/80 px-3 py-1.5 text-xs text-white shadow md:hidden"
        >
          {open ? "Hide settings" : "Settings"}
        </button>
        <SelectedGame layout={layout} bodies={bodies} />
        <CameraPad />
      </main>
    </div>
  );
}
