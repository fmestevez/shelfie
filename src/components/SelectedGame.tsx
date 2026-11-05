"use client";

import { useEffect, useState } from "react";
import { proxied } from "@/lib/images";
import type { BodySpec } from "@/lib/bodies";
import type { Layout } from "@/lib/packing";
import { physicsApi } from "./three/physicsApi";
import { editsOf, useStore } from "@/lib/store";
import { GROUP_KEYS, type GroupKey, groupValues } from "@/lib/sorting";
import type { Dims, DimsSource, Game, VersionInfo } from "@/lib/types";

const SOURCE_LABEL: Record<DimsSource, string> = {
  "selected-version": "your selected version",
  "latest-version": "the latest version with a size",
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
    // "Automatic" clears the version and size only; a group choice stays.
    if (!id) {
      overrideGame(game.collId, {
        versionId: undefined,
        versionName: undefined,
        dims: undefined,
        dimsSource: undefined,
        image: undefined,
        thumbnail: undefined,
      });
      return;
    }
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

  const input =
    "w-full min-w-0 rounded-md bg-white/10 px-2 py-1 text-xs tabular-nums text-white outline-none focus:ring-2 focus:ring-amber-400";

  return (
    <div className="space-y-2 border-t border-white/10 px-3 py-3 text-xs">
      {game.id > 0 && (
        <label className="block">
          <span className="mb-1 block text-white/65">Version</span>
          <select
            value={override?.versionId ?? ""}
            onChange={(e) => pickVersion(e.target.value)}
            disabled={!versions}
            className={`${input} [&>option]:bg-neutral-900`}
          >
            <option value="">{versions ? "Automatic" : "Loading versions…"}</option>
            {versions?.map((v) => (
              <option key={v.id} value={v.id}>
                {[v.name ?? `#${v.id}`, v.year].filter(Boolean).join(" · ")} —{" "}
                {v.dims ? `${fmt(v.dims)} cm` : "no size"}
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
        <span className="mb-1 block text-white/65">Box size (cm)</span>
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

function RotateButtons({ collId }: { collId: number }) {
  const btn = "flex-1 rounded-md bg-white/10 px-2 py-1.5 text-xs text-white hover:bg-white/20";
  return (
    <div className="border-t border-white/10 px-3 py-2">
      <div className="flex gap-1.5">
        <button type="button" className={btn} onClick={() => physicsApi.current?.turn(collId)} title="Shortcut: R">
          ⟳ Turn
        </button>
        <button type="button" className={btn} onClick={() => physicsApi.current?.tip(collId)} title="Shortcut: T">
          ⤾ Stand up / lay down
        </button>
      </div>
      <div className="mt-1.5 text-[11px] text-white/65">
        Drag the box to move it. R and T rotate it while you hold it.
      </div>
    </div>
  );
}

const GROUP_LABEL: Record<GroupKey, string> = {
  theme: "Theme group",
  category: "Category group",
  mechanic: "Mechanism group",
  family: "Family group",
  artist: "Artist group",
};

/** Which of its themes / mechanics this game is grouped under, for whichever of them the shelves are sorted by. */
function GroupChoice({ game }: { game: Game }) {
  const areaBy = useStore((s) => s.areaBy);
  const sortBy = useStore((s) => s.sortBy);
  const override = useStore((s) => editsOf(s).overrides[game.collId]);
  const overrideGame = useStore((s) => s.overrideGame);
  const rows = GROUP_KEYS.filter((k) => k === areaBy || k === sortBy)
    .map((k) => ({ k, values: groupValues[k](game) }))
    .filter((r) => r.values.length > 1);
  if (!rows.length) return null;
  const input =
    "w-full min-w-0 rounded-md bg-white/10 px-2 py-1 text-xs text-white outline-none focus:ring-2 focus:ring-amber-400 [&>option]:bg-neutral-900";

  return (
    <div className="space-y-2 border-t border-white/10 px-3 py-3 text-xs">
      {rows.map(({ k, values }) => (
        <label key={k} className="block">
          <span className="mb-1 block text-white/65">{GROUP_LABEL[k]}</span>
          <select
            value={override?.groups?.[k] ?? ""}
            onChange={(e) =>
              overrideGame(game.collId, { groups: { ...override?.groups, [k]: e.target.value || undefined } })
            }
            className={input}
          >
            <option value="">Automatic</option>
            {values.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

export function SelectedGame({ layout, bodies }: { layout: Layout; bodies: BodySpec[] | null }) {
  const selectedId = useStore((s) => s.selectedId);
  const set = useStore((s) => s.set);
  const removeGame = useStore((s) => s.removeGame);
  const placement = layout.placements.find((x) => x.sg.game.collId === selectedId);
  // With bodies, boxes go wherever they're moved: the packed position no longer applies.
  const sg = bodies ? bodies.find((b) => b.sg.game.collId === selectedId)?.sg : placement?.sg;
  // Clicking a box in the 3D view is silent otherwise; say what got selected.
  const announcement = (
    <div className="sr-only" aria-live="polite">
      {sg ? `${sg.game.name} selected` : ""}
    </div>
  );
  if (!sg) return announcement;
  const p = bodies ? null : placement;
  const { game, area, group } = sg;

  return (
    <>
      {announcement}
      <section
        aria-label={`${game.name}: details`}
        className="pointer-events-auto absolute right-4 top-14 z-10 md:top-4 max-h-[calc(100%-9.5rem)] w-[min(340px,calc(100vw-2rem))] overflow-y-auto rounded-xl bg-neutral-900/90 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur"
      >
        <div className="flex gap-3 p-3">
          {game.thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element -- proxied remote art, tiny
            <img src={proxied(game.thumbnail)} alt="" className="h-20 w-20 shrink-0 rounded-md object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold leading-tight">{game.name}</h2>
              <button
                type="button"
                onClick={() => set({ selectedId: null })}
                className="text-white/65 hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="mt-0.5 text-xs text-white/65">
              {[
                game.year,
                game.isExpansion && "Expansion",
                game.collId < 0 && game.id > 0 && "Added by you",
                area,
                group,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div className="mt-2 text-xs text-white/80">
              {fmt(game.dims)} cm
              <div className="text-white/65">
                from {SOURCE_LABEL[game.dimsSource]}
                {game.versionName &&
                  game.dimsSource !== "default" &&
                  game.dimsSource !== "custom" &&
                  ` (${game.versionName})`}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-white/65">
                {p && AREA_LABEL[p.area]}
                {p?.hidden && " · back row"}
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
        {bodies && <RotateButtons collId={game.collId} />}
        <GroupChoice game={game} />
        <SizeEditor key={game.collId} game={game} />
        <div className="border-t border-white/10 px-3 py-2">
          <button
            type="button"
            onClick={() => removeGame(game.collId)}
            className="text-xs text-red-300 hover:underline"
          >
            Remove from shelves
          </button>
        </div>
      </section>
    </>
  );
}
