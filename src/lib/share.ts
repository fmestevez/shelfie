"use client";

import { fetchAddedGames, loadCollection, loadDemo } from "./loadCollection";
import type { CustomShelf } from "./shelves";
import { editsOf, useStore } from "./store";
import type { CollectionEdits, Dims, GameOverride } from "./types";

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
  "includeExpansions",
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
}

const toBase64Url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromBase64Url = (s: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

export function shareUrl(): string {
  const state = useStore.getState();
  const edits = editsOf(state);
  const payload: SharePayload = {
    u: state.username,
    s: Object.fromEntries(SETTINGS.map((k) => [k, state[k]])) as Settings,
  };
  if (edits.removed.length) payload.r = edits.removed;
  const overrides = Object.entries(edits.overrides).filter(([, o]) => o.dims);
  // Added games get fresh ids on the other end, so their overrides can't travel.
  const sharedOverrides = overrides.filter(([id]) => Number(id) > 0);
  if (sharedOverrides.length) {
    payload.o = sharedOverrides.map(([id, o]) => [Number(id), o.dims!, o.versionId, o.versionName]);
  }
  if (edits.added.length) payload.a = edits.added.map((g) => [g.id, g.name, g.year]);
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("s", toBase64Url(JSON.stringify(payload)));
  return url.toString();
}

/**
 * If the page was opened from a share link, adopt its settings, edits and
 * collection. Returns false when there's nothing to apply.
 */
export function applyShareLink(): boolean {
  const param = new URLSearchParams(window.location.search).get("s");
  if (!param) return false;
  // Clean the address bar so later changes aren't confused with the shared state.
  window.history.replaceState(null, "", window.location.pathname);

  let payload: SharePayload;
  try {
    payload = JSON.parse(fromBase64Url(param));
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
