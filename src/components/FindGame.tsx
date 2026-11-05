"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Area } from "@/lib/packing";
import type { SortedGame } from "@/lib/sorting";
import { useStore } from "@/lib/store";
import { sceneApi } from "./three/sceneApi";

const AREA_LABEL: Record<Area, string> = { shelf: "on the shelves", top: "on top", floor: "on the floor" };
const MAX_RESULTS = 8;

/** Lower-case, without accents, so "orleans" finds "Orléans". */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Name starts with the query, then a word starts with it, then it appears anywhere. */
function rank(name: string, q: string) {
  const n = fold(name);
  if (n.startsWith(q)) return 0;
  if (n.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(q))) return 1;
  return n.includes(q) ? 2 : -1;
}

/** Search the games in the scene by name; picking one selects it and brings it into view. */
export function FindGame({
  games,
  panelOpen,
}: {
  games: { sg: SortedGame; area?: Area }[];
  /** On phones the settings panel covers this corner, so the box hides while it's open. */
  panelOpen: boolean;
}) {
  const set = useStore((s) => s.set);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return [];
    return games
      .map((g) => ({ ...g, r: rank(g.sg.game.name, q) }))
      .filter((g) => g.r >= 0)
      .sort((a, b) => a.r - b.r || a.sg.game.name.localeCompare(b.sg.game.name))
      .slice(0, MAX_RESULTS);
  }, [games, query]);

  // "/" jumps to the search box from anywhere (unless already typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || (e.target instanceof HTMLElement && e.target.closest("input, select, textarea"))) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pick = (sg: SortedGame) => {
    set({ selectedId: sg.game.collId, hoveredId: null });
    sceneApi.current?.focus(sg.game.collId);
    setQuery("");
    setOpen(false);
    input.current?.blur();
  };

  const showList = open && query.trim() !== "";

  return (
    <div
      className={`pointer-events-auto absolute left-28 top-3 z-10 w-[min(18rem,calc(100vw-8rem))] md:left-4 md:top-4 md:block ${
        panelOpen ? "hidden" : ""
      }`}
    >
      <input
        ref={input}
        type="search"
        value={query}
        placeholder="Find a game…  /"
        aria-label="Find a game on the shelves"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls="find-game-results"
        aria-activedescendant={showList && results[active] ? `find-game-${active}` : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Let a click on a result land before the list disappears.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((i) => Math.min(results.length - 1, i + 1));
          else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
          else if (e.key === "Enter" && results[active]) pick(results[active].sg);
          else if (e.key === "Escape") {
            setQuery("");
            input.current?.blur();
          } else return;
          e.preventDefault();
        }}
        className="w-full rounded-lg bg-neutral-900/85 px-3 py-2 text-sm text-white shadow-lg ring-1 ring-white/10 backdrop-blur outline-none placeholder:text-white/55 focus:ring-2 focus:ring-amber-400"
      />
      <div className="sr-only" aria-live="polite">
        {showList ? `${results.length} ${results.length === 1 ? "game" : "games"} found` : ""}
      </div>
      {showList && (
        <ul
          id="find-game-results"
          role="listbox"
          className="mt-1 max-h-80 overflow-y-auto rounded-lg bg-neutral-900/95 py-1 text-sm shadow-2xl ring-1 ring-white/10 backdrop-blur"
        >
          {results.length === 0 && (
            <li role="option" aria-disabled="true" aria-selected="false" className="px-3 py-2 text-xs text-white/65">
              No game by that name here.
            </li>
          )}
          {results.map((g, i) => (
            <li
              key={g.sg.game.collId}
              id={`find-game-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(g.sg)}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? "bg-white/10" : ""}`}
            >
              <div className="truncate text-white">{g.sg.game.name}</div>
              <div className="truncate text-[11px] text-white/65">
                {[g.sg.game.year, g.sg.group, g.area && AREA_LABEL[g.area]].filter(Boolean).join(" · ")}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
