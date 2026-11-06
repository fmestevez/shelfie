"use client";

import { fetchAddedGames, loadCollection, loadDemo } from "./loadCollection";
import type { CustomShelf } from "./shelves";
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { applyEdits } from "./edits";
import { type GroupKey, type GroupPrefs, groupCounts, isGroupKey, rankedValues } from "./sorting";
import { editsOf, useStore } from "./store";
import type { CollectionEdits, Dims, Game, GameOverride } from "./types";

/** Settings that travel with a share link. */
const SETTINGS = [
  "shelves",
  "customShelves",
  "billyCompartments",
  "finish",
  "areaBy",
  "areaReversed",
  "sortBy",
  "sortReversed",
  "separateAreas",
  "orientation",
  "facing",
  "multiRow",
  "lookahead",
  "overflow",
  "overhang",
  "spacing",
  "align",
  "includeExpansions",
  "groupPrefs",
  "environment",
  "showArt",
  "showTitles",
] as const;

type Settings = Partial<Pick<ReturnType<typeof useStore.getState>, (typeof SETTINGS)[number]>>;

interface SharePayload {
  /** username */
  u: string;
  /** settings */
  s: Settings;
  /** removed collection ids */
  r?: number[];
  /** overrides: [collId, dims, versionId?, versionName?] */
  o?: [number, Dims, number?, string?][];
  /** added games: [bggId, name, year?] */
  a?: [number, string, number?][];
  /** per-game group choices: [collId, group key, value] */
  g?: [number, GroupKey, string][];
}

/** Overrides that can travel: added games get fresh ids on the other end. */
const travellingOverrides = (edits: CollectionEdits) =>
  Object.entries(edits.overrides).filter(([id]) => Number(id) > 0);

function bytesToBase64Url(bytes: Uint8Array) {
  // In chunks: spreading a big array into one call overflows the stack.
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const base64UrlToBytes = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/**
 * Group rankings as small as they can be while meaning the same thing: only values in this collection,
 * and without the tail that's in default order anyway (the receiving end appends that by itself).
 */
function compactGroupPrefs(prefs: GroupPrefs, games: Game[]): GroupPrefs {
  const out: GroupPrefs = {};
  for (const key of Object.keys(prefs) as GroupKey[]) {
    const pref = prefs[key];
    if (!pref || !isGroupKey(key)) continue;
    const counts = groupCounts(games, key);
    const present = new Set(counts.map((c) => c.value));
    const order = rankedValues(counts, pref);
    // Shortest prefix after which the rest is exactly the default order of what's left.
    let keep = order.length;
    while (keep > 0) {
      const head = new Set(order.slice(0, keep - 1));
      const rest = counts.map((c) => c.value).filter((v) => !head.has(v));
      if (rest.join("\u0000") !== order.slice(keep - 1).join("\u0000")) break;
      keep--;
    }
    out[key] = { order: order.slice(0, keep), hidden: pref.hidden.filter((v) => present.has(v)) };
  }
  return out;
}

export function shareUrl(): string {
  const state = useStore.getState();
  const edits = editsOf(state);
  const payload: SharePayload = {
    u: state.username,
    s: Object.fromEntries(SETTINGS.map((k) => [k, state[k]])) as Settings,
  };
  payload.s.groupPrefs = compactGroupPrefs(state.groupPrefs, applyEdits(state.games, edits));
  if (edits.removed.length) payload.r = edits.removed;
  const overrides = Object.entries(edits.overrides).filter(([, o]) => o.dims);
  // Added games get fresh ids on the other end, so their overrides can't travel.
  const sharedOverrides = overrides.filter(([id]) => Number(id) > 0);
  if (sharedOverrides.length) {
    payload.o = sharedOverrides.map(([id, o]) => [Number(id), o.dims!, o.versionId, o.versionName]);
  }
  if (edits.added.length) payload.a = edits.added.map((g) => [g.id, g.name, g.year]);
  const groupChoices = travellingOverrides(edits).flatMap(([id, o]) =>
    Object.entries(o.groups ?? {}).map(([k, v]) => [Number(id), k as GroupKey, v!] as [number, GroupKey, string]),
  );
  if (groupChoices.length) payload.g = groupChoices;
  // Compressed, and after "#": the fragment never reaches the server, so no length limit there (a long ?s= got
  // "414 URI too long" from Vercel).
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = `z=${bytesToBase64Url(deflateSync(strToU8(JSON.stringify(payload)), { level: 9 }))}`;
  return url.toString();
}

/**
 * If the page was opened from a share link, adopt its settings, edits and
 * collection. Returns false when there's nothing to apply.
 */
export function applyShareLink(): boolean {
  const compressed = new URLSearchParams(window.location.hash.slice(1)).get("z");
  // Links made before compression: plain base64 JSON in ?s=.
  const plain = new URLSearchParams(window.location.search).get("s");
  if (!compressed && !plain) return false;
  // Clean the address bar so later changes aren't confused with the shared state.
  window.history.replaceState(null, "", window.location.pathname);

  let payload: SharePayload;
  try {
    const bytes = compressed ? inflateSync(base64UrlToBytes(compressed)) : base64UrlToBytes(plain!);
    payload = JSON.parse(strFromU8(bytes));
  } catch {
    useStore.getState().set({ error: "That share link is damaged." });
    return true;
  }

  const { set } = useStore.getState();
  const settings = Object.fromEntries(
    Object.entries(payload.s ?? {}).filter(([k]) => (SETTINGS as readonly string[]).includes(k)),
  );
  const overrides: Record<number, GameOverride> = {};
  for (const [id, dims, versionId, versionName] of payload.o ?? []) {
    overrides[id] = { dims, versionId, versionName, dimsSource: versionId ? "chosen-version" : "custom" };
  }
  for (const [id, key, value] of payload.g ?? []) {
    if (!isGroupKey(key)) continue;
    overrides[id] = { ...overrides[id], groups: { ...overrides[id]?.groups, [key]: value } };
  }
  // Keep the viewer's own custom shelves alongside the shared ones.
  if (Array.isArray(settings.customShelves)) {
    const shared = settings.customShelves as CustomShelf[];
    const own = useStore.getState().customShelves.filter((c) => !shared.some((x) => x.id === c.id));
    settings.customShelves = [...own, ...shared];
  }
  const edits: CollectionEdits = { overrides, removed: payload.r ?? [], added: [] };
  set({ ...settings, edits: { ...useStore.getState().edits, [payload.u]: edits }, selectedId: null });

  void (async () => {
    if (payload.u === "demo") await loadDemo();
    else if (payload.u) await loadCollection(payload.u);
    if (payload.a?.length) {
      const added = await fetchAddedGames(payload.a.map(([id, name, year]) => ({ id, name, year, type: "boardgame" })));
      const s = useStore.getState();
      set({ edits: { ...s.edits, [payload.u]: { ...editsOf(s), added } } });
    }
  })();
  return true;
}
