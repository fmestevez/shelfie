"use client";

import { demoGames } from "./demo";
import { colorKey, dominantColor, loadImage, pool, proxied } from "./images";
import { GAMES_VERSION, useStore } from "./store";
import { type CollectionItem, DEFAULT_DIMS, type Game, type SearchResult, type ThingInfo } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string, label: string): Promise<{ status: number; body: T }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.status === 429 && attempt < 5) {
      useStore.getState().set({ progress: { ...useStore.getState().progress!, message: `${label} (rate limited, waiting…)` } });
      await sleep(4000 * (attempt + 1));
      continue;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 202) throw new Error(body.error ?? `Request failed (${res.status})`);
    return { status: res.status, body };
  }
}

function merge(item: CollectionItem, thing: ThingInfo | undefined): Game {
  let dims = DEFAULT_DIMS;
  let dimsSource: Game["dimsSource"] = "default";
  let versionName: string | undefined;

  if (item.version?.dims) {
    // The user picked a version in their collection, and BGG knows its size.
    versionName = item.version.name;
    dims = item.version.dims;
    dimsSource = "selected-version";
  } else if (thing?.latestVersionWithDims) {
    // Otherwise the newest printing with a known size: the box you'd most likely buy today.
    versionName = thing.latestVersionWithDims.name;
    dims = thing.latestVersionWithDims.dims;
    dimsSource = "latest-version";
  }

  return {
    collId: item.collId,
    id: item.id,
    name: item.name,
    year: item.year,
    image: item.version?.image ?? item.image ?? thing?.image,
    thumbnail: item.version?.thumbnail ?? item.thumbnail ?? thing?.thumbnail,
    isExpansion: thing?.type === "boardgameexpansion",
    dims,
    dimsSource,
    versionName,
    categories: thing?.categories ?? [],
    mechanics: thing?.mechanics ?? [],
    designers: thing?.designers ?? [],
    publishers: thing?.publishers ?? [],
    families: thing?.families ?? [],
    domains: thing?.domains ?? [],
    baseIds: thing?.baseIds ?? [],
    weight: thing?.weight,
    rating: thing?.rating,
    minPlayers: thing?.minPlayers,
    maxPlayers: thing?.maxPlayers,
    artists: thing?.artists ?? [],
    playTime: thing?.playTime,
    bestWith: thing?.bestWith,
    plays: item.plays,
    myRating: item.myRating,
  };
}

export async function loadCollection(username: string) {
  const { set } = useStore.getState();
  set({ error: null, progress: { message: "Requesting collection from BGG…", done: 0, total: 0 } });

  try {
    // 1. Collection (BGG answers 202 while it builds the export).
    let items: CollectionItem[] | undefined;
    for (let attempt = 0; attempt < 20 && !items; attempt++) {
      const { status, body } = await getJson<{ items?: CollectionItem[] }>(
        `/api/bgg/collection?username=${encodeURIComponent(username)}`,
        "Requesting collection",
      );
      if (status === 202) {
        set({ progress: { message: "BGG is preparing your collection…", done: attempt, total: 20 } });
        await sleep(3000);
      } else {
        items = body.items ?? [];
      }
    }
    if (!items) throw new Error("BGG took too long to prepare the collection. Try again in a minute.");
    if (!items.length) throw new Error(`No owned games found for "${username}".`);

    // 2. Game details + versions, 20 ids per request.
    const ids = [...new Set(items.map((i) => i.id))];
    const things = new Map<number, ThingInfo>();
    for (let i = 0; i < ids.length; i += 20) {
      const label = `Fetching game details`;
      set({ progress: { message: label, done: i, total: ids.length } });
      const { body } = await getJson<{ things: ThingInfo[] }>(`/api/bgg/things?ids=${ids.slice(i, i + 20).join(",")}`, label);
      for (const t of body.things) things.set(t.id, t);
    }

    const games = items.map((it) => merge(it, things.get(it.id)));
    set({ games, username, selectedId: null, gamesVersion: GAMES_VERSION });
    await computeColors(games);
  } catch (e) {
    set({ progress: null, error: e instanceof Error ? e.message : String(e) });
  }
}

/** Add a game that isn't in the BGG collection (e.g. from search). */
/** Games that aren't in a BGG collection, built from search results (or a share link). */
export async function fetchAddedGames(list: SearchResult[]): Promise<Game[]> {
  const things = new Map<number, ThingInfo>();
  const ids = [...new Set(list.map((r) => r.id))];
  for (let i = 0; i < ids.length; i += 20) {
    const { body } = await getJson<{ things: ThingInfo[] }>(`/api/bgg/things?ids=${ids.slice(i, i + 20).join(",")}`, "Adding games");
    for (const t of body.things) things.set(t.id, t);
  }
  // Negative ids can't clash with BGG collection ids; time-based so copies are allowed.
  const base = -Date.now();
  return list.map((r, i) => {
    const thing = things.get(r.id);
    return merge(
      { collId: base - i, id: r.id, name: r.name, year: r.year, image: thing?.image, thumbnail: thing?.thumbnail },
      thing,
    );
  });
}

export async function addGameFromBgg(r: SearchResult) {
  const [game] = await fetchAddedGames([r]);
  useStore.getState().addGame(game);
  await computeColors([game]);
}

export async function loadDemo() {
  const games = demoGames();
  useStore.getState().set({ games, username: "demo", error: null, selectedId: null, colors: {}, gamesVersion: GAMES_VERSION });
  await computeColors(games);
}

let colorRun: Promise<void> | null = null;

/**
 * Average box-art colour per game, used for spines and colour sorting. Results are
 * published in batches so a reload mid-way resumes where it left off.
 */
export function computeColors(games: Game[]) {
  colorRun = (colorRun ?? Promise.resolve()).then(async () => {
    const { set } = useStore.getState();
    const fresh: Record<string, string> = {};
    const flush = () => set({ colors: { ...useStore.getState().colors, ...fresh } });
    const known = useStore.getState().colors;
    const todo = [...new Map(games.filter((g) => !known[colorKey(g)]).map((g) => [colorKey(g), g])).values()];
    let done = 0;
    await pool(todo, 6, async (g) => {
      const src = proxied(g.thumbnail);
      let color: string | undefined;
      if (src) {
        try {
          color = dominantColor(await loadImage(src));
        } catch {
          /* keep fallback */
        }
      }
      fresh[colorKey(g)] = color ?? fallbackColor(g.id);
      if (++done % 25 === 0) {
        flush();
        set({ progress: { message: "Analysing box colours", done, total: todo.length } });
      }
    });
    flush();
    if (todo.length) set({ progress: null });
  });
  return colorRun;
}

export function fallbackColor(id: number) {
  const hue = (Math.abs(id) * 137.508) % 360;
  return hslHex(hue, 0.45, 0.42);
}

function hslHex(h: number, s: number, l: number) {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
