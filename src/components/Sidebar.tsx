"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { addGameFromBgg, loadCollection, loadDemo } from "@/lib/loadCollection";
import { shareUrl } from "@/lib/share";
import { REPO_URL } from "@/lib/site";
import { type ExportMode, sceneApi } from "./three/sceneApi";
import type { Align, Layout, Orientation, OverflowMode } from "@/lib/packing";
import { CUSTOM_SHELF_DEFAULTS, type CustomShelf, customCell, customShelfModel, SHELF_MODELS } from "@/lib/shelves";
import {
  AREA_OPTIONS,
  type AreaKey,
  GROUP_KEYS,
  type GroupKey,
  groupCounts,
  rankedValues,
  SORT_OPTIONS,
  type SortedGame,
  type SortKey,
} from "@/lib/sorting";
import { manualStats } from "@/lib/bodies";
import { editsOf, type EnvironmentId, type Mode, useStore } from "@/lib/store";
import type { Game, SearchResult } from "@/lib/types";
import { Credit } from "./Credit";
import { ENVIRONMENTS } from "./three/Room";
import { Field, MoreOptions, Range, Section, Segmented, Select, SortDirection, Stepper, Toggle } from "./ui";

const MAX_LOOKAHEAD = 40;
const MIN_OVERHANG = -40; // deeper than any shelf: everything against the back

function lookLabel(look: number) {
  if (look === 0) return "strict order";
  if (look >= MAX_LOOKAHEAD) return "pack as tight as possible";
  return `may skip ${look} games to fill gaps`;
}

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
          aria-label="BoardGameGeek username"
          autoComplete="username"
          className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/55 outline-none focus:ring-2 focus:ring-amber-400"
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
          <div className="mb-1 text-xs text-white/75" aria-live="polite">
            {s.progress.message}
            {s.progress.total > 0 && ` · ${s.progress.done}/${s.progress.total}`}
          </div>
          <div
            className="h-1.5 overflow-hidden rounded bg-white/10"
            role="progressbar"
            aria-label={s.progress.message}
            aria-valuemin={0}
            aria-valuemax={s.progress.total || undefined}
            aria-valuenow={s.progress.total ? s.progress.done : undefined}
          >
            <div
              className={`h-full bg-amber-400 transition-all ${s.progress.total ? "" : "w-1/3 animate-pulse"}`}
              style={s.progress.total ? { width: `${(100 * s.progress.done) / s.progress.total}%` } : undefined}
            />
          </div>
        </div>
      )}
      {s.error && (
        <div role="alert" className="rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200">
          {s.error}
        </div>
      )}

      {games.length > 0 && (
        <div className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70">
          <div className="text-white">
            <b>{games.length}</b> items {s.username !== "demo" ? `owned by ${s.username}` : "(demo)"}
            {expansions > 0 && <span className="text-white/65"> · {expansions} expansions</span>}
          </div>
          <div className="mt-1 leading-relaxed text-white/65">
            Box sizes: {sources["selected-version"] ?? 0} from your version, {sources["latest-version"] ?? 0} from the
            latest version with a size, {sources.default ?? 0} default 30×21×7 cm
            {(sources["chosen-version"] ?? 0) + (sources.custom ?? 0) > 0 &&
              `, ${(sources["chosen-version"] ?? 0) + (sources.custom ?? 0)} set by you`}
            . Click a box to change its version or size.
          </div>
        </div>
      )}
      {games.length > 0 && (
        <>
          <Toggle
            label="Include expansions"
            checked={s.includeExpansions}
            onChange={(v) => s.set({ includeExpansions: v })}
          />
          <AddGame />
          <EditsSummary />
        </>
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
        type="search"
        aria-label="Search BoardGameGeek for a game to add"
        className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/55 outline-none focus:ring-2 focus:ring-amber-400"
      />
      {error && <div className="mt-1 text-[11px] text-red-300">{error}</div>}
      {results && q.trim().length >= 2 && (
        <ul className="mt-1 max-h-52 overflow-y-auto rounded-lg bg-white/5 text-xs">
          {results.length === 0 && <li className="px-3 py-2 text-white/65">No matches</li>}
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
                  {r.type === "boardgameexpansion" && <span className="text-white/65"> · expansion</span>}
                </span>
                <span className="shrink-0 text-white/65">{busy === r.id ? "adding…" : (r.year ?? "")}</span>
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
  const overrides = Object.entries(edits.overrides);
  const resized = overrides.filter(([, o]) => o.dims || o.versionId);
  const regrouped = overrides.filter(([, o]) => o.groups);
  if (!edits.removed.length && !edits.added.length && !overrides.length) return null;
  const NO_SIZE = {
    versionId: undefined,
    versionName: undefined,
    dims: undefined,
    dimsSource: undefined,
    image: undefined,
    thumbnail: undefined,
  };
  const nameOf = (collId: number) =>
    [...s.games, ...edits.added].find((g) => g.collId === collId)?.name ?? `#${collId}`;

  return (
    <details className="text-xs text-white/70">
      <summary className="cursor-pointer text-white/65 hover:text-white">
        Your changes:{" "}
        {[
          edits.added.length && `${edits.added.length} added`,
          edits.removed.length && `${edits.removed.length} removed`,
          resized.length && `${resized.length} resized`,
          regrouped.length && `${regrouped.length} regrouped`,
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
            <span className="truncate text-white/65 line-through">{nameOf(id)}</span>
            <button type="button" className="shrink-0 text-amber-300 hover:underline" onClick={() => s.restoreGame(id)}>
              restore
            </button>
          </li>
        ))}
        {resized.map(([id]) => (
          <li key={`size-${id}`} className="flex justify-between gap-2">
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
              onClick={() => s.overrideGame(Number(id), NO_SIZE)}
            >
              reset size
            </button>
          </li>
        ))}
        {regrouped.map(([id, o]) => (
          <li key={`group-${id}`} className="flex justify-between gap-2">
            <button
              type="button"
              className="truncate text-left hover:text-white"
              onClick={() => s.set({ selectedId: Number(id) })}
            >
              ⇢ {nameOf(Number(id))}: {Object.values(o.groups ?? {}).join(", ")}
            </button>
            <button
              type="button"
              className="shrink-0 text-amber-300 hover:underline"
              onClick={() => s.overrideGame(Number(id), { groups: undefined })}
            >
              reset group
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
        <span className="mb-1 block text-white/65">Name</span>
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={input} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        {CUSTOM_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-white/65">
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
      <div className={cell ? "text-white/65" : "text-red-300"}>
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
        <div className="text-[11px] text-white/65">{description}</div>
        {children}
      </div>
      <Stepper label={name} value={count} onChange={(n) => s.setShelfCount(id, n)} />
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
    </Section>
  );
}

const GROUP_NOUN: Record<GroupKey, [string, string]> = {
  theme: ["theme", "themes"],
  mechanic: ["mechanic", "mechanics"],
};

/**
 * Pick which themes (or mechanics) to group by, and rank them: each game goes under its highest-ranked
 * value, and the groups appear on the shelves in this order. Untouched, grouping stays automatic.
 */
function GroupChooser({ games, groupKey }: { games: Game[]; groupKey: GroupKey }) {
  const pref = useStore((s) => s.groupPrefs[groupKey]);
  const setPref = useStore((s) => s.setGroupPref);
  const counts = useMemo(() => groupCounts(games, groupKey), [games, groupKey]);
  const countOf = useMemo(() => new Map(counts.map((c) => [c.value, c.count])), [counts]);
  const order = rankedValues(counts, pref);
  const hidden = new Set(pref?.hidden ?? []);
  const [filter, setFilter] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [noun, nouns] = GROUP_NOUN[groupKey];

  const save = (o: string[], h: Set<string>) => setPref(groupKey, { order: o, hidden: [...h] });
  /** Move `v` to index `to` of the full order. */
  const moveTo = (v: string, to: number) => {
    const rest = order.filter((x) => x !== v);
    rest.splice(Math.max(0, Math.min(rest.length, to)), 0, v);
    save(rest, hidden);
  };
  const toggle = (v: string, on: boolean) => {
    const h = new Set(hidden);
    if (on) h.delete(v);
    else h.add(v);
    save(order, h);
  };
  const q = filter.trim().toLowerCase();
  const shown = q ? order.filter((v) => v.toLowerCase().includes(q)) : order;
  const btn = "h-6 w-6 shrink-0 rounded text-white/75 hover:bg-white/15 hover:text-white disabled:opacity-25";

  return (
    <MoreOptions label={`Choose ${nouns}${pref ? ` · customised${hidden.size ? `, ${hidden.size} off` : ""}` : ""}`}>
      <p className="text-[11px] leading-snug text-white/65">
        Untick the {nouns} you don&apos;t want to group by, and drag (or use ↑ ↓) to rank them. Each game goes under its
        highest-ranked {noun}, and groups appear on the shelves in this order.
      </p>
      <div className="flex gap-1.5">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`Filter ${nouns}…`}
          aria-label={`Filter ${nouns}`}
          className="min-w-0 flex-1 rounded-md bg-white/10 px-2 py-1 text-xs text-white placeholder:text-white/55 outline-none focus:ring-2 focus:ring-amber-400"
        />
        {pref && (
          <button
            type="button"
            onClick={() => setPref(groupKey, null)}
            className="shrink-0 rounded-md px-2 text-xs text-amber-300 hover:underline"
          >
            Reset
          </button>
        )}
      </div>
      <ol aria-label={`${nouns} in rank order`} className="max-h-72 space-y-0.5 overflow-y-auto pr-1 text-xs">
        {shown.map((v) => {
          const i = order.indexOf(v);
          const on = !hidden.has(v);
          return (
            <li
              key={v}
              draggable
              onDragStart={(e) => {
                setDragging(v);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging && dragging !== v)
                  moveTo(
                    dragging,
                    order.filter((x) => x !== dragging).indexOf(v) + (order.indexOf(dragging) < i ? 1 : 0),
                  );
                setDragging(null);
              }}
              onDragEnd={() => setDragging(null)}
              className={`flex items-center gap-1.5 rounded-md px-1 py-0.5 ${dragging === v ? "bg-white/15" : "hover:bg-white/5"}`}
            >
              <span aria-hidden className="cursor-grab select-none text-white/45">
                ⋮⋮
              </span>
              <span className="w-5 shrink-0 text-right tabular-nums text-white/55">{i + 1}</span>
              <label
                className={`flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 ${on ? "text-white" : "text-white/55 line-through"}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => toggle(v, e.target.checked)}
                  className="accent-amber-400"
                />
                <span className="truncate">{v}</span>
              </label>
              <span className="shrink-0 tabular-nums text-white/55" aria-label={`${countOf.get(v)} games`}>
                {countOf.get(v)}
              </span>
              <button
                type="button"
                className={btn}
                disabled={i === 0}
                onClick={() => moveTo(v, i - 1)}
                aria-label={`Move ${v} up`}
              >
                ↑
              </button>
              <button
                type="button"
                className={btn}
                disabled={i === order.length - 1}
                onClick={() => moveTo(v, i + 1)}
                aria-label={`Move ${v} down`}
              >
                ↓
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-1 py-1 text-white/55">No {nouns} match.</li>}
      </ol>
    </MoreOptions>
  );
}

function SortingSection({ games }: { games: Game[] }) {
  const s = useStore();
  const chooseable = GROUP_KEYS.filter((k) => k === s.areaBy || k === s.sortBy);
  return (
    <Section title="Sorting">
      <Field label="Areas" hint="Big sections of the shelves, e.g. wargames apart from family games.">
        <div className="flex gap-1.5">
          <Select value={s.areaBy} onChange={(e) => s.set({ areaBy: e.target.value as AreaKey })}>
            {AREA_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
          {s.areaBy !== "none" && (
            <SortDirection
              label="Reverse the order of areas"
              reversed={s.areaReversed}
              onChange={(v) => s.set({ areaReversed: v })}
            />
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
          <Select value={s.sortBy} onChange={(e) => s.set({ sortBy: e.target.value as SortKey })}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
          <SortDirection
            label="Reverse the sort order"
            reversed={s.sortReversed}
            onChange={(v) => s.set({ sortReversed: v })}
          />
        </div>
      </Field>
      {chooseable.map((k) => (
        <GroupChooser key={k} games={games} groupKey={k} />
      ))}
      {s.mode === "manual" && (
        <div className="text-[11px] leading-snug text-white/65">
          In manual mode the order sets how the piles on the floor are laid out, before you move anything.
        </div>
      )}
    </Section>
  );
}

const MODE_HINT: Record<Mode, string> = {
  auto: "Shelfie packs every box for you.",
  physics: "Shelfie packs the boxes, then real gravity takes over: drag boxes to move or throw them.",
  manual: "Every game starts on the floor and you place each box; Shelfie remembers where you put it.",
};

function PlacementSection() {
  const s = useStore();
  const look = Math.min(MAX_LOOKAHEAD, s.lookahead);
  const [confirming, setConfirming] = useState(false);

  return (
    <Section title="Placement">
      <Field label="Who places the boxes" hint={MODE_HINT[s.mode]}>
        <Segmented<Mode>
          value={s.mode}
          options={[
            { value: "auto", label: "Auto" },
            { value: "physics", label: "Physics" },
            { value: "manual", label: "Manual" },
          ]}
          onChange={(v) => {
            setConfirming(false);
            s.set({ mode: v, selectedId: null, hoveredId: null });
          }}
        />
      </Field>
      {s.mode !== "auto" && (
        <div className="rounded-lg bg-white/5 px-3 py-2 text-[11px] leading-snug text-white/65">
          Drag a box to move it; it slides into a compartment when there&apos;s room. <Kbd>R</Kbd> turns it,{" "}
          <Kbd>T</Kbd> stands it up or lays it down. Drag empty space to move the camera.
        </div>
      )}
      {s.mode === "physics" && (
        <button
          type="button"
          onClick={s.resetPhysics}
          className="w-full rounded-lg bg-white/10 py-2 text-xs text-white hover:bg-white/20"
        >
          Repack the shelves
        </button>
      )}
      {s.mode === "manual" &&
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
                s.resetPhysics();
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
      {s.mode !== "manual" && (
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
          <MoreOptions label="Fine-tuning">
            <Field label={`Space between columns · ${s.spacing === 0 ? "none" : `${s.spacing} cm`}`}>
              <Range
                min={0}
                max={5}
                step={0.5}
                value={s.spacing}
                valueText={s.spacing === 0 ? "none" : `${s.spacing} centimetres`}
                onChange={(e) => s.set({ spacing: Number(e.target.value) })}
              />
            </Field>
            <Field label="Align in each compartment">
              <Segmented<Align>
                value={s.align}
                options={[
                  { value: "left", label: "Left" },
                  { value: "center", label: "Centre" },
                  { value: "right", label: "Right" },
                ]}
                onChange={(v) => s.set({ align: v })}
              />
            </Field>
            <Field label={`Front edge · ${overhangLabel(s.overhang)}`}>
              <Range
                min={MIN_OVERHANG}
                max={10}
                step={1}
                value={s.overhang}
                valueText={overhangLabel(s.overhang)}
                onChange={(e) => s.set({ overhang: Number(e.target.value) })}
              />
              <div className="flex justify-between text-[10px] text-white/65">
                <span>pushed back</span>
                <span>flush</span>
                <span>sticks out</span>
              </div>
            </Field>
            <Field label={`Order vs. space · ${lookLabel(look)}`}>
              <Range
                min={0}
                max={MAX_LOOKAHEAD}
                value={look}
                valueText={lookLabel(look)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  s.set({ lookahead: n >= MAX_LOOKAHEAD ? 10_000 : n }); // "unlimited"
                }}
              />
            </Field>
          </MoreOptions>
        </>
      )}
    </Section>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded bg-white/15 px-1 font-mono text-[10px] text-white">{children}</kbd>;
}

function LookSection() {
  const s = useStore();
  return (
    <Section title="Look">
      <Field label="Room">
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
      </Field>
      <Field label="Shelf finish">
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
      <Field label="Boxes">
        <div className="space-y-2.5">
          <Toggle label="Box art" checked={s.showArt} onChange={(v) => s.set({ showArt: v })} />
          <Toggle label="Titles" checked={s.showTitles} onChange={(v) => s.set({ showTitles: v })} />
          {s.showArt && (
            <Toggle label="High-res art" checked={s.hdTextures} onChange={(v) => s.set({ hdTextures: v })} />
          )}
        </div>
      </Field>
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
            <div className="text-[11px] text-white/65">{label}</div>
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
          <summary className="cursor-pointer text-white/65 hover:text-white">
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
                  <span className="tabular-nums text-white/65">{g.count}</span>
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
      <span className="sr-only" aria-live="polite">
        {state === "copied"
          ? "Share link copied to the clipboard"
          : state === "failed"
            ? "Copy the share link below"
            : ""}
      </span>
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
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    // Close when clicking anywhere else.
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const download = (mode: ExportMode) => {
    setOpen(false);
    const url = sceneApi.current?.exportImage(mode);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `shelfie-${username || "collection"}-${mode === "all" ? "collection" : "view"}.png`;
    a.click();
  };
  const item = "block w-full px-3 py-2 text-left text-white hover:bg-white/10 focus:bg-white/10";

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        setOpen(false);
        toggle.current?.focus();
      }}
    >
      <button
        ref={toggle}
        type="button"
        aria-expanded={open}
        aria-controls="export-options"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20"
      >
        Image
      </button>
      {open && (
        <div
          id="export-options"
          className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg bg-neutral-800 text-xs shadow-xl ring-1 ring-white/10"
        >
          <button ref={first} type="button" onClick={() => download("view")} className={item}>
            Download the current view
            <span className="block text-[10px] text-white/65">What you see, at 2× resolution</span>
          </button>
          <button type="button" onClick={() => download("all")} className={item}>
            Download the whole collection
            <span className="block text-[10px] text-white/65">Every shelf and pile, front-on</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function Sidebar({ games, sorted, layout }: { games: Game[]; sorted: SortedGame[]; layout: Layout }) {
  const Title = games.length > 0 ? "h1" : "div";
  return (
    <>
      <div className="px-4 pb-2 pt-5">
        <div className="flex items-start justify-between gap-2">
          {/* The server-rendered intro holds the page's h1 until a collection loads (and the intro goes away). */}
          <Title className="text-xl font-bold tracking-tight text-white">
            Shelf<span className="text-amber-400">ie</span>
          </Title>
          {games.length > 0 && (
            <div className="flex items-start gap-1.5">
              <ExportButton />
              <ShareButton />
            </div>
          )}
        </div>
      </div>
      <CollectionSection games={games} />
      {games.length > 0 && <StatsSection layout={layout} sorted={sorted} />}
      <ShelvesSection />
      <SortingSection games={games} />
      <PlacementSection />
      <LookSection />
      <footer className="space-y-1 px-4 py-4 text-center text-[11px] text-white/65">
        <p>
          Free and open source:{" "}
          <a href={REPO_URL} target="_blank" rel="noopener" className="underline hover:text-white">
            view the code on GitHub
          </a>
        </p>
        <Credit />
      </footer>
    </>
  );
}
