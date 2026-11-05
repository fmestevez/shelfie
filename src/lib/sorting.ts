import { colorKey } from "./images";
import type { Game } from "./types";

export type SortKey =
  | "name"
  | "domain"
  | "theme"
  | "category"
  | "mechanic"
  | "family"
  | "designer"
  | "publisher"
  | "series"
  | "color"
  | "size"
  | "year"
  | "weight"
  | "rating"
  | "artist"
  | "players"
  | "bestWith"
  | "playTime"
  | "plays"
  | "myRating";

export type AreaKey = SortKey | "none";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "domain", label: "Type" },
  { key: "theme", label: "Theme" },
  { key: "category", label: "Category" },
  { key: "mechanic", label: "Mechanism" },
  { key: "family", label: "Family" },
  { key: "designer", label: "Designer" },
  { key: "publisher", label: "Publisher" },
  { key: "series", label: "Series" },
  { key: "color", label: "Color" },
  { key: "size", label: "Box size" },
  { key: "year", label: "Year" },
  { key: "weight", label: "Complexity" },
  { key: "rating", label: "BGG rating" },
  { key: "artist", label: "Artist" },
  { key: "players", label: "Player count" },
  { key: "bestWith", label: "Best player count" },
  { key: "playTime", label: "Playing time" },
  { key: "plays", label: "Your plays" },
  { key: "myRating", label: "Your rating" },
];

export const AREA_OPTIONS: { key: AreaKey; label: string }[] = [
  { key: "none", label: "No areas" },
  { key: "domain", label: "Type (BGG)" },
  ...SORT_OPTIONS.filter((o) => o.key !== "domain" && o.key !== "name"),
];

export interface SortedGame {
  game: Game;
  /** Top-level area (e.g. "Wargames"); "" when areas are off. */
  area: string;
  /** Group within the area (e.g. "World War II"). */
  group: string;
}

const NONE = "￿"; // sorts last

const byName = (a: Game, b: Game) => a.name.localeCompare(b.name);

/**
 * For multi-valued attributes (a game has many mechanics), pick the value that is
 * most common across the whole collection so games cluster into meaningful groups.
 */
function primaryPicker(games: Game[], values: (g: Game) => string[]) {
  const freq = new Map<string, number>();
  for (const g of games) for (const v of values(g)) freq.set(v, (freq.get(v) ?? 0) + 1);
  return (g: Game) => {
    let best: string | undefined;
    for (const v of values(g)) if (!best || freq.get(v)! > freq.get(best)!) best = v;
    return best;
  };
}

const seriesOf = (g: Game) =>
  g.families
    .filter((f) => f.startsWith("Series:") || f.startsWith("Game:"))
    .sort((a, b) => Number(b.startsWith("Series:")) - Number(a.startsWith("Series:")))
    .map((f) => f.replace(/^(Series|Game):\s*/, ""));

/** BGG categories that describe format or genre rather than what a game is about. */
const NOT_THEMES = new Set([
  "Expansion for Base-game",
  "Card Game",
  "Dice",
  "Print & Play",
  "Collectible Components",
  "Party Game",
  "Abstract Strategy",
  "Children's Game",
  "Educational",
  "Memory",
  "Word Game",
  "Trivia",
  "Puzzle",
  "Deduction",
  "Bluffing",
  "Negotiation",
  "Real-time",
  "Action / Dexterity",
  "Math",
  "Number",
  "Territory Building",
  "Wargame",
  "Electronic",
  "Game System",
  "Book",
]);

const themeOf = (g: Game) => {
  const themes = [
    ...g.families.filter((f) => f.startsWith("Theme:")).map((f) => f.replace(/^Theme:\s*/, "")),
    ...g.categories.filter((c) => !NOT_THEMES.has(c)),
  ];
  return themes.length ? themes : g.categories.filter((c) => c !== "Expansion for Base-game");
};

// ----- user-chosen groups (theme, category, mechanism, family, artist) -----

/** Attributes where a game has several values and the user can choose which one it's grouped under. */
export type GroupKey = "theme" | "category" | "mechanic" | "family" | "artist";
export const GROUP_KEYS: GroupKey[] = ["theme", "category", "mechanic", "family", "artist"];
export const isGroupKey = (k: string): k is GroupKey => (GROUP_KEYS as string[]).includes(k);

/** The user's say over a GroupKey: values ranked best first, and values never to group by. */
export interface GroupPref {
  order: string[];
  hidden: string[];
}
export type GroupPrefs = Partial<Record<GroupKey, GroupPref>>;

export const groupValues: Record<GroupKey, (g: Game) => string[]> = {
  theme: themeOf,
  category: (g) => g.categories.filter((c) => c !== "Expansion for Base-game"),
  mechanic: (g) => g.mechanics,
  // BGG's "Admin:" families are housekeeping, not something to shelve by.
  family: (g) => g.families.filter((f) => !f.startsWith("Admin:")),
  artist: (g) => g.artists ?? [],
};

/** Every value in the collection with how many games have it, most common first. */
export function groupCounts(games: Game[], key: GroupKey): { value: string; count: number }[] {
  const freq = new Map<string, number>();
  for (const g of games) for (const v of new Set(groupValues[key](g))) freq.set(v, (freq.get(v) ?? 0) + 1);
  return [...freq]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** The values in the user's order: ranked ones first, then any new ones by how common they are. */
export function rankedValues(counts: { value: string }[], pref: GroupPref | undefined): string[] {
  if (!pref) return counts.map((c) => c.value);
  const present = new Set(counts.map((c) => c.value));
  const ranked = pref.order.filter((v) => present.has(v));
  const seen = new Set(ranked);
  return [...ranked, ...counts.map((c) => c.value).filter((v) => !seen.has(v))];
}

/**
 * Which value a game is grouped under. A per-game choice wins; otherwise its highest-ranked value
 * that isn't hidden (or, with no preferences, the value most common in the collection).
 * Groups are ordered by rank when the user has ranked them, else alphabetically.
 */
function groupPicker(games: Game[], key: GroupKey, pref: GroupPref | undefined, empty: string) {
  const values = groupValues[key];
  const counts = groupCounts(games, key);
  const rank = new Map(rankedValues(counts, pref).map((v, i) => [v, i]));
  const hidden = new Set(pref?.hidden ?? []);
  const auto = primaryPicker(games, values);
  return (g: Game): Key => {
    const vs = values(g);
    const own = g.groups?.[key];
    const usable = vs.filter((v) => !hidden.has(v));
    const pick = own && vs.includes(own) ? own : pref ? usable.sort((a, b) => rank.get(a)! - rank.get(b)!)[0] : auto(g);
    if (pick) return { group: pick, order: pref ? rank.get(pick)! : pick, tie: 0 };
    // Every value hidden: "Other", just before games with none at all.
    if (vs.length) return { group: "Other", order: pref ? 1e9 : NONE, tie: 0 };
    return { group: empty, order: pref ? 1e9 + 1 : NONE, tie: 1 };
  };
}

// ----- game type (BGG domain) -----

const DOMAINS: [string, string][] = [
  ["wargames", "Wargames"],
  ["strategygames", "Strategy"],
  ["thematic", "Thematic"],
  ["familygames", "Family"],
  ["abstracts", "Abstract"],
  ["partygames", "Party"],
  ["childrensgames", "Children's"],
  ["cgs", "Customizable"],
];
const DOMAIN_LABEL = new Map(DOMAINS);
const DOMAIN_ORDER = new Map(DOMAINS.map(([k], i) => [k, i]));
// Unranked games have no domain; guess from categories.
const CATEGORY_DOMAIN: [string, string][] = [
  ["Wargame", "wargames"],
  ["Abstract Strategy", "abstracts"],
  ["Children's Game", "childrensgames"],
  ["Party Game", "partygames"],
];

function domainOf(g: Game): string | undefined {
  return g.domains?.[0] ?? CATEGORY_DOMAIN.find(([cat]) => g.categories.includes(cat))?.[1];
}

// ----- color -----

export function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

const HUES: [number, string][] = [
  [15, "Red"],
  [45, "Orange"],
  [70, "Yellow"],
  [160, "Green"],
  [200, "Cyan"],
  [260, "Blue"],
  [300, "Purple"],
  [340, "Pink"],
  [360, "Red"],
];

function colorBucket(hex: string | undefined): { label: string; order: number; sub: number } {
  if (!hex) return { label: "Unknown", order: 99, sub: 0 };
  const [h, s, l] = hexToHsl(hex);
  if (l < 0.15) return { label: "Black", order: 20, sub: l };
  if (l > 0.88) return { label: "White", order: 21, sub: -l };
  if (s < 0.18) return { label: "Gray", order: 22, sub: -l };
  const idx = HUES.findIndex(([max]) => h < max);
  const label = HUES[idx][1];
  return { label, order: label === "Red" ? 0 : idx, sub: h >= 340 ? h - 360 : h };
}

// ----- keys -----

interface Key {
  group: string;
  order: number | string;
  tie: number;
}

function keyer(games: Game[], key: SortKey, colors: Record<string, string>, prefs: GroupPrefs): (g: Game) => Key {
  const grouped = (pick: (g: Game) => string | undefined, empty: string) => (g: Game) => {
    const v = pick(g);
    return { group: v ?? empty, order: v ?? NONE, tie: 0 };
  };

  switch (key) {
    case "name":
      return (g) => {
        const c = g.name.replace(/^(the|a|an)\s+/i, "")[0]?.toUpperCase() ?? "#";
        return { group: /[A-Z]/.test(c) ? c : "#", order: "", tie: 0 };
      };
    case "domain":
      return (g) => {
        const d = domainOf(g);
        return { group: d ? (DOMAIN_LABEL.get(d) ?? d) : "Other", order: d ? (DOMAIN_ORDER.get(d) ?? 50) : 99, tie: 0 };
      };
    case "theme":
      return groupPicker(games, "theme", prefs.theme, "No theme");
    case "category":
      return groupPicker(games, "category", prefs.category, "No category");
    case "mechanic":
      return groupPicker(games, "mechanic", prefs.mechanic, "No mechanism");
    case "family":
      return groupPicker(games, "family", prefs.family, "No family");
    case "designer":
      return grouped(
        primaryPicker(games, (g) => g.designers),
        "Unknown designer",
      );
    case "publisher":
      return grouped(
        primaryPicker(games, (g) => g.publishers),
        "Unknown publisher",
      );
    case "series":
      return grouped(primaryPicker(games, seriesOf), "Standalone");
    case "color":
      return (g) => {
        const b = colorBucket(colors[colorKey(g)]);
        return { group: b.label, order: b.order, tie: b.sub };
      };
    case "size":
      return (g) => {
        const [a, b, c] = g.dims.map((x) => Math.round(x));
        return { group: `${a}×${b}×${c} cm`, order: -(a * 1e6 + b * 1e3 + c), tie: 0 };
      };
    case "year":
      return (g) => ({
        group: g.year ? `${Math.floor(g.year / 10) * 10}s` : "Unknown year",
        order: g.year ? Math.floor(g.year / 10) : 1e9,
        tie: g.year ?? 0,
      });
    case "weight":
      return (g) => {
        const w = g.weight;
        const group = !w ? "Unrated" : w < 2 ? "Light" : w < 3 ? "Medium-light" : w < 3.75 ? "Medium-heavy" : "Heavy";
        return { group, order: w ? Math.min(4, Math.floor(w)) : 9, tie: w ?? 0 };
      };
    case "artist":
      return groupPicker(games, "artist", prefs.artist, "Unknown artist");
    case "players":
      return (g) => {
        const hi = g.maxPlayers;
        if (!hi) return { group: "Unknown player count", order: 99, tie: 0 };
        const i = hi === 1 ? 0 : hi === 2 ? 1 : hi <= 4 ? 2 : hi <= 6 ? 3 : 4;
        const group = ["Solo only", "Up to 2 players", "Up to 4 players", "Up to 6 players", "7+ players"][i];
        return { group, order: i, tie: (g.minPlayers ?? 1) * 100 + hi };
      };
    case "bestWith":
      return (g) => {
        const best = g.bestWith;
        if (!best?.length) return { group: "No community vote", order: 999, tie: 0 };
        const [lo, hi] = [Math.min(...best), Math.max(...best)];
        return { group: lo === hi ? `Best with ${lo}` : `Best with ${lo}–${hi}`, order: lo * 100 + hi, tie: 0 };
      };
    case "playTime":
      return (g) => {
        const t = g.playTime;
        if (!t) return { group: "Unknown length", order: 99, tie: 0 };
        const buckets: [number, string][] = [
          [30, "Under 30 min"],
          [60, "30–60 min"],
          [120, "1–2 hours"],
          [180, "2–3 hours"],
          [Infinity, "3+ hours"],
        ];
        const i = buckets.findIndex(([max]) => t <= max);
        return { group: buckets[i][1], order: i, tie: t };
      };
    case "plays":
      return (g) => {
        // Most played first; games added by hand (not in your collection) last.
        const n = g.plays;
        if (n === undefined) return { group: "Not in your collection", order: 99, tie: 0 };
        const i = n >= 10 ? 0 : n >= 5 ? 1 : n >= 2 ? 2 : n === 1 ? 3 : 4;
        const group = ["10+ plays", "5–9 plays", "2–4 plays", "Played once", "Unplayed"][i];
        return { group, order: i, tie: -n };
      };
    case "myRating":
      return (g) => {
        const r = g.myRating;
        if (!r) return { group: "Not rated by you", order: 99, tie: 0 };
        const bucket = Math.floor(r);
        return { group: bucket >= 10 ? "10" : `${bucket}+`, order: -bucket, tie: -r };
      };
    case "rating":
      return (g) => {
        const r = g.rating;
        const bucket = r ? Math.floor(r) : 0;
        return { group: r ? `${bucket}+ rated` : "Unrated", order: -bucket, tie: -(r ?? 0) };
      };
  }
}

const cmpOrder = (a: number | string, b: number | string) =>
  typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));

/**
 * Sort into areas (e.g. game type), then groups within each area (e.g. theme).
 * Expansions whose base game is in the collection sit right after it.
 */
export function sortGames(
  games: Game[],
  areaBy: AreaKey,
  sortBy: SortKey,
  colors: Record<string, string>,
  reverse: { area?: boolean; sort?: boolean } = {},
  prefs: GroupPrefs = {},
): SortedGame[] {
  const present = new Set(games.map((g) => g.id));
  const baseOf = (g: Game) => (g.isExpansion ? g.baseIds?.find((id) => present.has(id) && id !== g.id) : undefined);
  const followers = new Map<number, Game[]>();
  const bases: Game[] = [];
  for (const g of games) {
    const base = baseOf(g);
    if (base === undefined) bases.push(g);
    else followers.set(base, [...(followers.get(base) ?? []), g]);
  }

  const areaKey = areaBy === "none" ? null : keyer(bases, areaBy, colors, prefs);
  const groupKey = keyer(bases, sortBy, colors, prefs);
  const keyed = bases.map((game) => ({ game, area: areaKey?.(game), group: groupKey(game) }));

  const areaDir = reverse.area ? -1 : 1;
  const sortDir = reverse.sort ? -1 : 1;
  keyed.sort((a, b) => {
    if (a.area && b.area) {
      const c = cmpOrder(a.area.order, b.area.order) || a.area.group.localeCompare(b.area.group);
      if (c) return c * areaDir;
    }
    if (sortBy === "name") return byName(a.game, b.game) * sortDir;
    return (
      (cmpOrder(a.group.order, b.group.order) ||
        a.group.group.localeCompare(b.group.group) ||
        a.group.tie - b.group.tie ||
        byName(a.game, b.game)) * sortDir
    );
  });

  const out: SortedGame[] = [];
  const emitted = new Set<number>();
  const emit = (game: Game, area: string, group: string) => {
    if (emitted.has(game.collId)) return;
    emitted.add(game.collId);
    out.push({ game, area, group });
    // Expansions (and expansions of expansions) follow their base.
    for (const e of [...(followers.get(game.id) ?? [])].sort(byName)) emit(e, area, group);
  };
  for (const k of keyed) emit(k.game, k.area?.group ?? "", k.group.group);
  // Expansions in a cycle (expansion of an expansion only) would be skipped above.
  for (const g of games) if (!emitted.has(g.collId)) emit(g, areaKey ? "Other" : "", "Other");
  return out;
}
