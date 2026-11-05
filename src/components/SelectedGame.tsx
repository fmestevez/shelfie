"use client";

import { useEffect, useState } from "react";
import { proxied } from "@/lib/images";
import type { Layout } from "@/lib/packing";
import { editsOf, useStore } from "@/lib/store";
import type { Dims, DimsSource, Game, VersionInfo } from "@/lib/types";

const SOURCE_LABEL: Record<DimsSource, string> = {
  "selected-version": "your selected version",
  "first-version": "the earliest version",
  "other-version": "another version (earliest had no size)",
  default: "default size (no version data)",
  "chosen-version": "the version you picked",
  custom: "your custom size",
};

const AREA_LABEL = { shelf: "On the shelves", top: "On top of a shelf", floor: "On the floor" };

const fmt = (d: Dims) => d.map((x) => Math.round(x * 10) / 10).join(" × ");

const versionCache = new Map<number, Promise<VersionInfo[]>>();
function fetchVersions(id: number) {
  let p = versionCache.get(id);
  if (!p) {
    p = fetch(`/api/bgg/versions?id=${id}`)
      .then((r) => (r.ok ? r.json() : { versions: [] }))
      .then((b) => b.versions ?? []);
    versionCache.set(id, p);
  }
  return p;
}

function SizeEditor({ game }: { game: Game }) {
  const overrideGame = useStore((s) => s.overrideGame);
  const override = useStore((s) => editsOf(s).overrides[game.collId]);
  const [versions, setVersions] = useState<VersionInfo[] | null>(game.id > 0 ? null : []);
  const [draft, setDraft] = useState(() => game.dims.map(String));

  useEffect(() => {
    if (game.id <= 0) return;
    let alive = true;
    fetchVersions(game.id).then((v) => alive && setVersions(v));
    return () => {
      alive = false;
    };
  }, [game.id]);

  const dims = draft.map(Number);
  const valid = dims.every((x) => Number.isFinite(x) && x > 0.5 && x < 200);
  const changed = valid && dims.some((x, i) => Math.abs(x - game.dims[i]) > 0.05);

  const pickVersion = (id: string) => {
    if (!id) return overrideGame(game.collId, null);
    const v = versions?.find((x) => x.id === Number(id));
    if (!v) return;
    overrideGame(game.collId, {
      versionId: v.id,
      versionName: v.name,
      // A version without a size keeps the current one, which can then be typed in.
      dims: v.dims ?? game.dims,
      dimsSource: v.dims ? "chosen-version" : game.dimsSource,
      image: v.image,
      thumbnail: v.thumbnail,
    });
    if (v.dims) setDraft(v.dims.map(String));
  };

  const input = "w-full min-w-0 rounded-md bg-white/10 px-2 py-1 text-xs tabular-nums text-white outline-none focus:ring-2 focus:ring-amber-400";

  return (
    <div className="space-y-2 border-t border-white/10 px-3 py-3 text-xs">
      {game.id > 0 && (
        <label className="block">
          <span className="mb-1 block text-white/50">Version</span>
          <select
            value={override?.versionId ?? ""}
            onChange={(e) => pickVersion(e.target.value)}
            disabled={!versions}
            className={`${input} [&>option]:bg-neutral-900`}
          >
            <option value="">{versions ? "Automatic" : "Loading versions…"}</option>
            {versions?.map((v) => (
              <option key={v.id} value={v.id}>
                {[v.name ?? `#${v.id}`, v.year].filter(Boolean).join(" · ")} — {v.dims ? `${fmt(v.dims)} cm` : "no size"}
              </option>
            ))}
          </select>
        </label>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!changed) return;
          const sorted = [...dims].sort((a, b) => b - a) as Dims;
          overrideGame(game.collId, { dims: sorted, dimsSource: "custom" });
          setDraft(sorted.map(String));
        }}
      >
        <span className="mb-1 block text-white/50">Box size (cm)</span>
        <div className="flex items-center gap-1.5">
          {draft.map((v, i) => (
            <input
              key={i}
              type="number"
              step="0.1"
              min="0.5"
              inputMode="decimal"
              aria-label={["Length", "Width", "Height"][i]}
              value={v}
              onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? e.target.value : x)))}
              className={input}
            />
          ))}
          <button
            type="submit"
            disabled={!changed}
            className="shrink-0 rounded-md bg-amber-400 px-2 py-1 font-semibold text-black disabled:opacity-30"
          >
            Set
          </button>
        </div>
      </form>
      {override && (
        <button
          type="button"
          onClick={() => {
            overrideGame(game.collId, null);
            setDraft(game.dims.map(String));
          }}
          className="text-amber-300/80 hover:underline"
        >
          Undo my changes to this game
        </button>
      )}
    </div>
  );
}

export function SelectedGame({ layout }: { layout: Layout }) {
  const selectedId = useStore((s) => s.selectedId);
  const set = useStore((s) => s.set);
  const removeGame = useStore((s) => s.removeGame);
  const p = layout.placements.find((x) => x.sg.game.collId === selectedId);
  if (!p) return null;
  const { game, area, group } = p.sg;

  return (
    <div className="pointer-events-auto absolute bottom-4 right-4 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-xl bg-neutral-900/90 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur">
      <div className="flex gap-3 p-3">
        {game.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element -- proxied remote art, tiny
          <img src={proxied(game.thumbnail)} alt="" className="h-20 w-20 shrink-0 rounded-md object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-tight">{game.name}</h3>
            <button type="button" onClick={() => set({ selectedId: null })} className="text-white/50 hover:text-white" aria-label="Close">
              ✕
            </button>
          </div>
          <div className="mt-0.5 text-xs text-white/50">
            {[game.year, game.isExpansion && "Expansion", game.collId < 0 && game.id > 0 && "Added by you", area, group]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="mt-2 text-xs text-white/80">
            {fmt(game.dims)} cm
            <div className="text-white/45">
              from {SOURCE_LABEL[game.dimsSource]}
              {game.versionName && game.dimsSource !== "default" && game.dimsSource !== "custom" && ` (${game.versionName})`}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-white/50">
              {AREA_LABEL[p.area]}
              {p.hidden && " · back row"}
            </span>
            {game.id > 0 && (
              <a
                href={`https://boardgamegeek.com/boardgame/${game.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-amber-300 hover:underline"
              >
                BGG ↗
              </a>
            )}
          </div>
        </div>
      </div>
      <SizeEditor key={game.collId} game={game} />
      <div className="border-t border-white/10 px-3 py-2">
        <button type="button" onClick={() => removeGame(game.collId)} className="text-xs text-red-300 hover:underline">
          Remove from shelves
        </button>
      </div>
    </div>
  );
}
