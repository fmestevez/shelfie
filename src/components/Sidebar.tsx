"use client";

import { type ReactNode, useEffect, useState } from "react";
import { addGameFromBgg, loadCollection, loadDemo } from "@/lib/loadCollection";
import { shareUrl } from "@/lib/share";
import { type ExportMode, sceneApi } from "./three/sceneApi";
import type { Layout, Orientation, OverflowMode } from "@/lib/packing";
import { CUSTOM_SHELF_DEFAULTS, type CustomShelf, customCell, customShelfModel, SHELF_MODELS } from "@/lib/shelves";
import { AREA_OPTIONS, type AreaKey, SORT_OPTIONS, type SortedGame, type SortKey } from "@/lib/sorting";
import { manualStats } from "@/lib/bodies";
import { editsOf, type EnvironmentId, type Mode, useStore } from "@/lib/store";
import type { Game, SearchResult } from "@/lib/types";
import { ENVIRONMENTS } from "./three/Room";
import { Field, Section, Segmented, SortDirection, Stepper, Toggle } from "./ui";

const MAX_LOOKAHEAD = 40;
const MIN_OVERHANG = -40; // deeper than any shelf: everything against the back

function overhangLabel(cm: number) {
  if (cm <= MIN_OVERHANG) return "against the back";
  if (cm < 0) return `set back ${-cm} cm`;
  if (cm === 0) return "flush, no overhang";
  return `may stick out ${cm} cm`;
}

function CollectionSection({ games }: { games: Game[] }) {
  const s = useStore();
  const [name, setName] = useState(s.username === "demo" ? "" : s.username);
  const busy = !!s.progress;

  const sources = games.reduce<Record<string, number>>((acc, g) => {
    acc[g.dimsSource] = (acc[g.dimsSource] ?? 0) + 1;
    return acc;
  }, {});
  const expansions = games.filter((g) => g.isExpansion).length;

  return (
    <Section title="Collection">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) loadCollection(name.trim());
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="BoardGameGeek username"
          className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-black disabled:opacity-40"
        >
          {s.username && s.username === name.trim() ? "Reload" : "Load"}
        </button>
      </form>
      {!busy && (
        <button
          type="button"
          onClick={loadDemo}
          className="text-xs text-amber-300/80 underline-offset-2 hover:underline"
        >
          or try a demo collection
        </button>
      )}

      {s.progress && (
        <div>
          <div className="mb-1 text-xs text-white/70">
            {s.progress.message}
            {s.progress.total > 0 && ` · ${s.progress.done}/${s.progress.total}`}
          </div>
          <div className="h-1.5 overflow-hidden rounded bg-white/10">
            <div
              className={`h-full bg-amber-400 transition-all ${s.progress.total ? "" : "w-1/3 animate-pulse"}`}
              style={s.progress.total ? { width: `${(100 * s.progress.done) / s.progress.total}%` } : undefined}
            />
          </div>
        </div>
      )}
      {s.error && <div className="rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200">{s.error}</div>}

      {games.length > 0 && (
        <div className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70">
          <div className="text-white">
            <b>{games.length}</b> items {s.username !== "demo" ? `owned by ${s.username}` : "(demo)"}
            {expansions > 0 && <span className="text-white/50"> · {expansions} expansions</span>}
          </div>
          <div className="mt-1 leading-relaxed text-white/50">
            Box sizes: {sources["selected-version"] ?? 0} from your version, {sources["first-version"] ?? 0} from the
            earliest version, {sources["other-version"] ?? 0} from another version, {sources.default ?? 0} default
            30×21×7 cm
            {(sources["chosen-version"] ?? 0) + (sources.custom ?? 0) > 0 &&
              `, ${(sources["chosen-version"] ?? 0) + (sources.custom ?? 0)} set by you`}
            . Click a box to change its version or size.
          </div>
        </div>
      )}
      {games.length > 0 && <EditsSummary />}
      {games.length > 0 && <AddGame />}
      <Toggle
        label="Include expansions"
        checked={s.includeExpansions}
        onChange={(v) => s.set({ includeExpansions: v })}
      />
      <Toggle label="Box art on boxes" checked={s.showArt} onChange={(v) => s.set({ showArt: v })} />
      <Toggle label="Titles on boxes" checked={s.showTitles} onChange={(v) => s.set({ showTitles: v })} />
      {s.showArt && (
        <Toggle label="High-res box art" checked={s.hdTextures} onChange={(v) => s.set({ hdTextures: v })} />
      )}
    </Section>
  );
}

function AddGame() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) return;
    let alive = true;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/bgg/search?q=${encodeURIComponent(q.trim())}`);
      const body = await res.json().catch(() => ({}));
      if (!alive) return;
      setError(res.ok ? null : (body.error ?? "Search failed"));
      setResults(body.results ?? []);
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <Field label="Add a game that isn't in your collection">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          if (e.target.value.trim().length < 2) setResults(null);
        }}
        placeholder="Search BoardGameGeek…"
        className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:ring-2 focus:ring-amber-400"
      />
      {error && <div className="mt-1 text-[11px] text-red-300">{error}</div>}
      {results && q.trim().length >= 2 && (
        <ul className="mt-1 max-h-52 overflow-y-auto rounded-lg bg-white/5 text-xs">
          {results.length === 0 && <li className="px-3 py-2 text-white/40">No matches</li>}
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(r.id);
                  try {
                    await addGameFromBgg(r);
                    setQ("");
                    setResults(null);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusy(null);
                  }
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-white/80 hover:bg-white/10 disabled:opacity-50"
              >
                <span className="truncate">
                  {r.name}
                  {r.type === "boardgameexpansion" && <span className="text-white/40"> · expansion</span>}
                </span>
                <span className="shrink-0 text-white/40">{busy === r.id ? "adding…" : (r.year ?? "")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}

function EditsSummary() {
  const s = useStore();
  const edits = editsOf(s);
  const changed = Object.keys(edits.overrides).length;
  if (!edits.removed.length && !edits.added.length && !changed) return null;
  const nameOf = (collId: number) =>
    [...s.games, ...edits.added].find((g) => g.collId === collId)?.name ?? `#${collId}`;

  return (
    <details className="text-xs text-white/70">
      <summary className="cursor-pointer text-white/50 hover:text-white">
        Your changes:{" "}
        {[
          edits.added.length && `${edits.added.length} added`,
          edits.removed.length && `${edits.removed.length} removed`,
          changed && `${changed} resized`,
        ]
          .filter(Boolean)
          .join(", ")}
      </summary>
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
        {edits.added.map((g) => (
          <li key={g.collId} className="flex justify-between gap-2">
            <button
              type="button"
              className="truncate text-left hover:text-white"
              onClick={() => s.set({ selectedId: g.collId })}
            >
              + {g.name}
            </button>
            <button
              type="button"
              className="shrink-0 text-red-300 hover:underline"
              onClick={() => s.removeGame(g.collId)}
            >
              remove
            </button>
          </li>
        ))}
        {edits.removed.map((id) => (
          <li key={id} className="flex justify-between gap-2">
            <span className="truncate text-white/40 line-through">{nameOf(id)}</span>
            <button type="button" className="shrink-0 text-amber-300 hover:underline" onClick={() => s.restoreGame(id)}>
              restore
            </button>
          </li>
        ))}
        {Object.keys(edits.overrides).map((id) => (
          <li key={id} className="flex justify-between gap-2">
            <button
              type="button"
              className="truncate text-left hover:text-white"
              onClick={() => s.set({ selectedId: Number(id) })}
            >
              ↔ {nameOf(Number(id))}
            </button>
            <button
              type="button"
              className="shrink-0 text-amber-300 hover:underline"
              onClick={() => s.overrideGame(Number(id), null)}
            >
              reset size
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

const CUSTOM_FIELDS: {
  key: keyof Omit<CustomShelf, "id" | "name" | "back">;
  label: string;
  step: string;
  int?: boolean;
}[] = [
  { key: "width", label: "Width", step: "0.5" },
  { key: "height", label: "Height", step: "0.5" },
  { key: "depth", label: "Depth", step: "0.5" },
  { key: "cols", label: "Columns", step: "1", int: true },
  { key: "rows", label: "Rows", step: "1", int: true },
  { key: "board", label: "Boards", step: "0.1" },
  { key: "plinth", label: "Plinth", step: "0.5" },
];

const newShelfId = () => `custom-${Date.now().toString(36)}`;
const round1 = (x: number) => Math.round(x * 10) / 10;

function CustomShelfEditor({ initial, onDone }: { initial: CustomShelf | null; onDone: () => void }) {
  const save = useStore((s) => s.saveCustomShelf);
  const [name, setName] = useState(initial?.name ?? CUSTOM_SHELF_DEFAULTS.name);
  const [back, setBack] = useState(initial?.back ?? CUSTOM_SHELF_DEFAULTS.back);
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(CUSTOM_FIELDS.map((f) => [f.key, String((initial ?? CUSTOM_SHELF_DEFAULTS)[f.key])])),
  );

  const values = Object.fromEntries(CUSTOM_FIELDS.map((f) => [f.key, Number(draft[f.key])])) as Record<
    (typeof CUSTOM_FIELDS)[number]["key"],
    number
  >;
  const inRange =
    CUSTOM_FIELDS.every((f) => Number.isFinite(values[f.key]) && (!f.int || Number.isInteger(values[f.key]))) &&
    values.width <= 1000 &&
    values.height <= 400 &&
    values.depth <= 150 &&
    values.cols >= 1 &&
    values.cols <= 20 &&
    values.rows >= 1 &&
    values.rows <= 20 &&
    values.board >= 0.5 &&
    values.board <= 10 &&
    values.plinth >= 0;
  const shelf = { ...values, back };
  const cell = inRange ? customCell(shelf) : null;
  const input =
    "w-full min-w-0 rounded-md bg-white/10 px-2 py-1 text-xs tabular-nums text-white outline-none focus:ring-2 focus:ring-amber-400";

  return (
    <form
      className="space-y-2 rounded-lg bg-white/5 p-3 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        if (!cell) return;
        save({ id: initial?.id ?? newShelfId(), name: name.trim() || "Custom shelf", ...shelf });
        onDone();
      }}
    >
      <label className="block">
        <span className="mb-1 block text-white/50">Name</span>
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={input} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        {CUSTOM_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-white/50">
              {f.label}
              {!f.int && " (cm)"}
            </span>
            <input
              type="number"
              inputMode={f.int ? "numeric" : "decimal"}
              step={f.step}
              min="0"
              value={draft[f.key]}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              className={input}
            />
          </label>
        ))}
      </div>
      <Toggle label="Back panel" checked={back} onChange={setBack} />
      <div className={cell ? "text-white/50" : "text-red-300"}>
        {cell
          ? `${values.cols * values.rows} compartments of ${round1(cell.w)} × ${round1(cell.h)} cm, ${round1(cell.d)} cm deep`
          : "These measurements leave no room for compartments."}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-md px-2 py-1 text-white/60 hover:text-white">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!cell}
          className="rounded-md bg-amber-400 px-3 py-1 font-semibold text-black disabled:opacity-30"
        >
          {initial ? "Save" : "Add shelf"}
        </button>
      </div>
    </form>
  );
}

function ShelfRow({
  name,
  description,
  id,
  children,
}: {
  name: string;
  description: string;
  id: string;
  children?: ReactNode;
}) {
  const s = useStore();
  const count = s.shelves.find((x) => x.modelId === id)?.count ?? 0;
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="truncate text-sm text-white">{name}</div>
        <div className="text-[11px] text-white/40">{description}</div>
        {children}
      </div>
      <Stepper value={count} onChange={(n) => s.setShelfCount(id, n)} />
    </div>
  );
}

function ShelvesSection() {
  const s = useStore();
  const hasBilly = s.shelves.some((x) => x.modelId.startsWith("billy") && x.count > 0);
  // null: closed, "new": adding, otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <Section title="Shelves">
      <div className="space-y-2">
        {SHELF_MODELS.map((m) => (
          <ShelfRow key={m.id} id={m.id} name={m.name} description={m.description} />
        ))}
        {s.customShelves.map((c) => {
          const m = customShelfModel(c);
          return editing === c.id ? (
            <CustomShelfEditor key={c.id} initial={c} onDone={() => setEditing(null)} />
          ) : (
            <ShelfRow key={c.id} id={c.id} name={m.name} description={m.description}>
              <div className="mt-0.5 flex gap-3 text-[11px]">
                <button type="button" onClick={() => setEditing(c.id)} className="text-amber-300/80 hover:underline">
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => s.deleteCustomShelf(c.id)}
                  className="text-red-300/80 hover:underline"
                >
                  Delete
                </button>
              </div>
            </ShelfRow>
          );
        })}
      </div>
      {editing === "new" ? (
        <CustomShelfEditor initial={null} onDone={() => setEditing(null)} />
      ) : (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="w-full rounded-lg border border-dashed border-white/20 py-2 text-xs text-white/70 hover:border-amber-400 hover:text-white"
        >
          + Custom shelf
        </button>
      )}
      {hasBilly && (
        <Field label="Billy compartments per unit" hint="Fewer compartments = taller gaps between shelves.">
          <Segmented
            value={String(s.billyCompartments)}
            options={["4", "5", "6", "7"].map((v) => ({ value: v, label: v }))}
            onChange={(v) => s.set({ billyCompartments: Number(v) })}
          />
        </Field>
      )}
      <Field label="Finish">
        <Segmented
          value={s.finish}
          options={[
            { value: "white", label: "White" },
            { value: "black", label: "Black-brown" },
            { value: "oak", label: "Oak" },
          ]}
          onChange={(v) => s.set({ finish: v })}
        />
      </Field>
    </Section>
  );
}

function ArrangementSection() {
  const s = useStore();
  const look = Math.min(MAX_LOOKAHEAD, s.lookahead);

  return (
    <Section title="Arrangement">
      <Field label="Areas" hint="Big sections of the shelves, e.g. wargames apart from family games.">
        <div className="flex gap-1.5">
          <select
            value={s.areaBy}
            onChange={(e) => s.set({ areaBy: e.target.value as AreaKey })}
            className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-amber-400 [&>option]:bg-neutral-900"
          >
            {AREA_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          {s.areaBy !== "none" && (
            <SortDirection reversed={s.areaReversed} onChange={(v) => s.set({ areaReversed: v })} />
          )}
        </div>
      </Field>
      {s.areaBy !== "none" && (
        <Toggle
          label="Start each area in a new compartment"
          checked={s.separateAreas}
          onChange={(v) => s.set({ separateAreas: v })}
        />
      )}
      <Field label={s.areaBy === "none" ? "Sort by" : "Then sort by"}>
        <div className="flex gap-1.5">
          <select
            value={s.sortBy}
            onChange={(e) => s.set({ sortBy: e.target.value as SortKey })}
            className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-amber-400 [&>option]:bg-neutral-900"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <SortDirection reversed={s.sortReversed} onChange={(v) => s.set({ sortReversed: v })} />
        </div>
      </Field>
      {s.mode === "manual" ? (
        <div className="text-[11px] leading-snug text-white/40">
          In manual mode the order sets how the piles on the floor are laid out, before you move anything.
        </div>
      ) : (
        <>
          <Field
            label="Box orientation"
            hint={
              s.orientation === "mixed"
                ? "Stands big boxes up and stacks small ones, whichever fits more per compartment."
                : undefined
            }
          >
            <Segmented<Orientation>
              value={s.orientation}
              options={[
                { value: "vertical", label: "Vertical" },
                { value: "horizontal", label: "Stacked" },
                { value: "mixed", label: "Mixed" },
              ]}
              onChange={(v) => s.set({ orientation: v })}
            />
          </Field>
          {s.orientation !== "horizontal" && (
            <Field label="Upright boxes: cover faces">
              <Segmented
                value={s.facing}
                options={[
                  { value: "left", label: "← Left" },
                  { value: "right", label: "Right →" },
                ]}
                onChange={(v) => s.set({ facing: v })}
              />
            </Field>
          )}
          <Field label="Depth">
            <Segmented
              value={s.multiRow ? "multi" : "single"}
              options={[
                { value: "single", label: "Single row" },
                { value: "multi", label: "Rows behind rows" },
              ]}
              onChange={(v) => s.set({ multiRow: v === "multi" })}
            />
          </Field>
          <Field label={`Front edge · ${overhangLabel(s.overhang)}`}>
            <input
              type="range"
              min={MIN_OVERHANG}
              max={10}
              step={1}
              value={s.overhang}
              onChange={(e) => s.set({ overhang: Number(e.target.value) })}
              className="w-full accent-amber-400"
            />
            <div className="flex justify-between text-[10px] text-white/35">
              <span>pushed back</span>
              <span>flush</span>
              <span>sticks out</span>
            </div>
          </Field>
          <Field
            label={`Order vs. space · ${look === 0 ? "strict order" : look >= MAX_LOOKAHEAD ? "pack as tight as possible" : `may skip ${look} games to fill gaps`}`}
          >
            <input
              type="range"
              min={0}
              max={MAX_LOOKAHEAD}
              value={look}
              onChange={(e) => {
                const n = Number(e.target.value);
                s.set({ lookahead: n >= MAX_LOOKAHEAD ? 10_000 : n }); // "unlimited"
              }}
              className="w-full accent-amber-400"
            />
          </Field>
          <Field label="Overflow goes">
            <Segmented<OverflowMode>
              value={s.overflow}
              options={[
                { value: "top", label: "On top" },
                { value: "floor", label: "Floor" },
                { value: "top-floor", label: "Top, then floor" },
              ]}
              onChange={(v) => s.set({ overflow: v })}
            />
          </Field>
        </>
      )}
    </Section>
  );
}

function SceneSection() {
  const s = useStore();
  return (
    <Section title="Room">
      <div className="grid grid-cols-2 gap-1.5">
        {(Object.keys(ENVIRONMENTS) as EnvironmentId[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => s.set({ environment: id })}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
              s.environment === id
                ? "bg-white/15 text-white ring-1 ring-amber-400"
                : "bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            <span className="h-4 w-4 shrink-0 rounded" style={{ background: ENVIRONMENTS[id].background }} />
            {ENVIRONMENTS[id].label}
          </button>
        ))}
      </div>
    </Section>
  );
}

function StatsSection({ layout, sorted }: { layout: Layout; sorted: SortedGame[] }) {
  const mode = useStore((s) => s.mode);
  const poses = useStore((s) => s.manual[s.username]);
  const manual = mode === "manual";
  const stats = manual ? manualStats(sorted, poses, layout.shelves) : layout.stats;
  const unplaced = manual ? [] : layout.unplaced;
  const groups: { area: string; name: string; count: number }[] = [];
  for (const p of manual ? [] : layout.placements) {
    const { area, group } = p.sg;
    const last = groups.at(-1);
    if (last && last.name === group && last.area === area) last.count++;
    else groups.push({ area, name: group, count: 1 });
  }
  const set = useStore((s) => s.set);

  return (
    <Section title="Result">
      <div className="grid grid-cols-2 gap-2 text-center">
        {[
          ["On shelves", stats.onShelf],
          ["Shelf space used", `${Math.round(stats.fill * 100)}%`],
          ["On top", stats.onTop],
          ["On the floor", stats.onFloor],
        ].map(([label, v]) => (
          <div key={label} className="rounded-lg bg-white/5 py-2">
            <div className="text-lg font-semibold tabular-nums text-white">{v}</div>
            <div className="text-[11px] text-white/45">{label}</div>
          </div>
        ))}
      </div>
      {unplaced.length > 0 && (
        <div className="rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200">
          {unplaced.length} didn&apos;t fit anywhere:{" "}
          {unplaced
            .slice(0, 6)
            .map((u) => u.game.name)
            .join(", ")}
          {unplaced.length > 6 && "…"}
        </div>
      )}
      {groups.length > 1 && (
        <details className="text-xs text-white/70">
          <summary className="cursor-pointer text-white/50 hover:text-white">
            Order on the shelves ({groups.length} runs)
          </summary>
          <ol className="mt-2 max-h-48 space-y-0.5 overflow-y-auto pr-1">
            {groups.map((g, i) => (
              <li key={i}>
                {g.area && g.area !== groups[i - 1]?.area && (
                  <div className="mb-0.5 mt-2 text-[10px] font-semibold uppercase tracking-wider text-amber-300/80 first:mt-0">
                    {g.area}
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <button
                    type="button"
                    className="truncate text-left hover:text-white"
                    onClick={() => {
                      const p = layout.placements.find((x) => x.sg.group === g.name && x.sg.area === g.area);
                      if (p) set({ selectedId: p.sg.game.collId });
                    }}
                  >
                    {g.name}
                  </button>
                  <span className="tabular-nums text-white/40">{g.count}</span>
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}
    </Section>
  );
}

function ShareButton() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const [fallback, setFallback] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          const url = shareUrl();
          try {
            await navigator.clipboard.writeText(url);
            setState("copied");
            setFallback(null);
          } catch {
            setState("failed");
            setFallback(url);
          }
          setTimeout(() => setState("idle"), 2000);
        }}
        className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20"
      >
        {state === "copied" ? "Link copied ✓" : "Share"}
      </button>
      {fallback && (
        <input
          readOnly
          value={fallback}
          onFocus={(e) => e.target.select()}
          className="mt-2 w-full rounded-md bg-white/10 px-2 py-1 text-[11px] text-white"
          aria-label="Share link"
        />
      )}
    </div>
  );
}

function ExportButton() {
  const [open, setOpen] = useState(false);
  const username = useStore((s) => s.username);

  const download = (mode: ExportMode) => {
    setOpen(false);
    const url = sceneApi.current?.exportImage(mode);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `shelfie-${username || "collection"}-${mode === "all" ? "collection" : "view"}.png`;
    a.click();
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20"
      >
        Image
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg bg-neutral-800 text-xs shadow-xl ring-1 ring-white/10"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => download("view")}
            className="block w-full px-3 py-2 text-left text-white hover:bg-white/10"
          >
            Current view
            <span className="block text-[10px] text-white/45">What you see, at 2× resolution</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => download("all")}
            className="block w-full px-3 py-2 text-left text-white hover:bg-white/10"
          >
            Whole collection
            <span className="block text-[10px] text-white/45">Every shelf and pile, front-on</span>
          </button>
        </div>
      )}
    </div>
  );
}

const MODE_HINT: Record<Mode, string> = {
  auto: "Shelfie packs every box for you.",
  physics: "The packed shelves with real gravity: drag boxes to move or throw them.",
  manual: "Every game starts on the floor. Drag each box onto the shelves; Shelfie remembers where you put it.",
};

function ModeSection() {
  const mode = useStore((s) => s.mode);
  const set = useStore((s) => s.set);
  const resetPhysics = useStore((s) => s.resetPhysics);
  const [confirming, setConfirming] = useState(false);

  return (
    <Section title="Mode">
      <Field label="Who places the boxes" hint={MODE_HINT[mode]}>
        <Segmented<Mode>
          value={mode}
          options={[
            { value: "auto", label: "Auto" },
            { value: "physics", label: "Physics" },
            { value: "manual", label: "Manual" },
          ]}
          onChange={(v) => {
            setConfirming(false);
            set({ mode: v, selectedId: null, hoveredId: null });
          }}
        />
      </Field>
      {mode !== "auto" && (
        <div className="space-y-1.5 text-[11px] leading-snug text-white/45">
          <p>
            Drag a box to pick it up. Over a compartment it slides in until it meets the back or another box; elsewhere
            it lands on whatever is below. Press R to turn it and T to stand it up or lay it down, or use the buttons on
            the game&apos;s card.
          </p>
          <p>Drag empty space to move the camera.</p>
        </div>
      )}
      {mode === "physics" && (
        <button
          type="button"
          onClick={resetPhysics}
          className="w-full rounded-lg bg-white/10 py-2 text-xs text-white hover:bg-white/20"
        >
          Repack the shelves
        </button>
      )}
      {mode === "manual" &&
        (confirming ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="flex-1 text-white/70">Move every box back to the floor?</span>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-2 py-1 text-white/60 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                resetPhysics();
                setConfirming(false);
              }}
              className="rounded-md bg-red-400 px-2 py-1 font-semibold text-black"
            >
              Reset
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="w-full rounded-lg bg-white/10 py-2 text-xs text-white hover:bg-white/20"
          >
            Put everything back on the floor
          </button>
        ))}
    </Section>
  );
}

export function Sidebar({ games, sorted, layout }: { games: Game[]; sorted: SortedGame[]; layout: Layout }) {
  return (
    <>
      <div className="px-4 pb-2 pt-5">
        <div className="flex items-start justify-between gap-2">
          {/* Not an h1: the page's heading is the server-rendered intro. */}
          <div className="text-xl font-bold tracking-tight text-white">
            Shelf<span className="text-amber-400">ie</span>
          </div>
          {games.length > 0 && (
            <div className="flex items-start gap-1.5">
              <ExportButton />
              <ShareButton />
            </div>
          )}
        </div>
        <p className="text-xs text-white/50">Your BoardGameGeek collection, packed onto real shelves.</p>
      </div>
      <CollectionSection games={games} />
      {games.length > 0 && <StatsSection layout={layout} sorted={sorted} />}
      {games.length > 0 && <ModeSection />}
      <ShelvesSection />
      <ArrangementSection />
      <SceneSection />
    </>
  );
}
