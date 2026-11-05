import "server-only";
import { XMLParser } from "fast-xml-parser";
import { cacheLife } from "next/cache";
import type { CollectionItem, Dims, SearchResult, ThingInfo, VersionInfo } from "./types";

const BGG = "https://boardgamegeek.com/xmlapi2";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  isArray: (name) => ["item", "link", "name"].includes(name),
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type X = any;

export class BggError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function bggFetch(path: string): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = { Accept: "application/xml" };
  const token = process.env.BGG_API_TOKEN ?? process.env.BGG_API_KEY;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BGG}${path}`, { headers, cache: "no-store" });
  const text = await res.text();
  if (res.status === 401) {
    throw new BggError(
      token
        ? "BGG rejected the API token (401). Check BGG_API_TOKEN."
        : "BGG requires an API token. Register an app at boardgamegeek.com/applications and set BGG_API_TOKEN in .env.local.",
      401,
    );
  }
  if (res.status === 429) throw new BggError("BGG rate limit hit, slow down.", 429);
  if (res.status >= 500) throw new BggError(`BGG error ${res.status}`, 502);
  return { status: res.status, text };
}

const num = (v: X): number | undefined => {
  const n = parseFloat(typeof v === "object" && v !== null ? v.value : v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// BGG double-escapes text, so entities like &#039; survive XML parsing.
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  });

const str = (v: X): string | undefined => {
  if (v == null) return undefined;
  const s = typeof v === "object" ? (v["#text"] ?? v.value) : v;
  return s == null || s === "" ? undefined : decode(String(s)).trim();
};

const primaryName = (names: X[] | undefined): string | undefined => {
  if (!names?.length) return undefined;
  const p = names.find((n) => n.type === "primary") ?? names[0];
  return str(p);
};

/** No board game box is this long (cm); bigger means the size was entered in the wrong units. */
const MAX_BOX_SIDE = 100;

/** BGG version dims are inches; returns sorted cm triple, or undefined if incomplete or implausible. */
function versionDims(v: X): Dims | undefined {
  const w = num(v.width);
  const l = num(v.length);
  const d = num(v.depth);
  if (!w || !l || !d) return undefined;
  // Clamp obviously bad data (some versions list a 0.04" thick box).
  const cm = [w, l, d].map((x) => Math.max(1.5, Math.round(x * 2.54 * 10) / 10)).sort((a, b) => b - a);
  // Some versions list millimetres as inches (a 425 cm Orléans); treat those as having no size.
  if (cm[0] > MAX_BOX_SIDE) return undefined;
  return cm as Dims;
}

/** Player counts from the community poll's summary, e.g. "Best with 3–4 players" → [3, 4]. */
function bestWith(it: X): number[] | undefined {
  // The parser turns every `name` into an array (games have many names), attributes included.
  const named = (x: X, n: string) => [x.name].flat().includes(n);
  const summaries: X[] = [it["poll-summary"] ?? []].flat();
  const results: X[] = [summaries.find((p) => named(p, "suggested_numplayers"))?.result ?? []].flat();
  const text = str(results.find((r) => named(r, "bestwith"))?.value);
  const counts = text?.match(/\d+/g)?.map(Number);
  return counts?.length ? counts : undefined;
}

/** Versions ordered by release year (unknown last), then by BGG id (≈ creation order). */
function parseVersions(it: X): VersionInfo[] {
  const raw: X[] = it.versions?.item ?? [];
  return raw
    .map((v) => ({
      id: Number(v.id),
      name: primaryName(v.name),
      year: num(v.yearpublished),
      dims: versionDims(v),
      image: str(v.image),
      thumbnail: str(v.thumbnail),
    }))
    .sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity) || a.id - b.id);
}

export async function fetchCollection(
  username: string,
): Promise<{ queued: true } | { queued: false; items: CollectionItem[] }> {
  // stats=1 adds the owner's own rating; numplays comes with every item.
  const q = new URLSearchParams({ username, own: "1", version: "1", stats: "1" });
  const { status, text } = await bggFetch(`/collection?${q}`);
  if (status === 202) return { queued: true };
  const doc = parser.parse(text);
  if (doc.errors) {
    const msg = str(doc.errors.error?.[0]?.message ?? doc.errors.error?.message) ?? "Unknown BGG error";
    throw new BggError(msg, 404);
  }
  const raw: X[] = doc.items?.item ?? [];
  const items: CollectionItem[] = raw.map((it) => {
    const v = it.version?.item?.[0];
    return {
      collId: Number(it.collid),
      id: Number(it.objectid),
      name: str(it.name?.[0]) ?? `#${it.objectid}`,
      year: num(it.yearpublished),
      image: str(it.image),
      thumbnail: str(it.thumbnail),
      version: v
        ? {
            id: Number(v.id),
            name: primaryName(v.name),
            dims: versionDims(v),
            image: str(v.image),
            thumbnail: str(v.thumbnail),
          }
        : undefined,
      plays: Number(str(it.numplays) ?? 0) || 0,
      myRating: num(it.stats?.rating),
    };
  });
  return { queued: false, items };
}

export async function fetchThings(ids: number[]): Promise<ThingInfo[]> {
  "use cache";
  cacheLife("days");

  const { text } = await bggFetch(`/thing?id=${ids.join(",")}&versions=1&stats=1`);
  const doc = parser.parse(text);
  const raw: X[] = doc.items?.item ?? [];
  return raw.map((it) => {
    const links: X[] = it.link ?? [];
    const of = (type: string) => links.filter((l) => l.type === type).map((l) => str(l.value)!);
    const versions = parseVersions(it);
    // Newest release year first (unknown years last), then the newest BGG entry.
    const latest = versions
      .filter((v) => v.dims)
      .sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity) || b.id - a.id)[0];
    const ratings = it.statistics?.ratings;
    // Domain membership comes from the per-family ranks; best-ranked domain first.
    const ranks: X[] = [ratings?.ranks?.rank ?? []].flat();
    const domains = ranks
      .filter((r) => r.type === "family")
      .map((r) => ({ name: String(r.name), value: Number(r.value) || Infinity }))
      .sort((a, b) => a.value - b.value)
      .map((r) => r.name);
    return {
      id: Number(it.id),
      type: String(it.type),
      image: str(it.image),
      thumbnail: str(it.thumbnail),
      categories: of("boardgamecategory"),
      mechanics: of("boardgamemechanic"),
      designers: of("boardgamedesigner"),
      publishers: of("boardgamepublisher"),
      families: of("boardgamefamily"),
      domains,
      baseIds: links.filter((l) => l.type === "boardgameexpansion" && l.inbound === "true").map((l) => Number(l.id)),
      weight: num(ratings?.averageweight),
      rating: num(ratings?.average),
      minPlayers: num(it.minplayers),
      maxPlayers: num(it.maxplayers),
      artists: of("boardgameartist").filter((a) => a !== "(Uncredited)"),
      playTime: num(it.playingtime) ?? num(it.maxplaytime),
      bestWith: bestWith(it),
      latestVersionWithDims: latest ? { id: latest.id, name: latest.name, dims: latest.dims! } : undefined,
    };
  });
}

export async function fetchVersions(id: number): Promise<VersionInfo[]> {
  "use cache";
  cacheLife("days");

  const { text } = await bggFetch(`/thing?id=${id}&versions=1`);
  const it = parser.parse(text).items?.item?.[0];
  return it ? parseVersions(it) : [];
}

export async function searchGames(query: string): Promise<SearchResult[]> {
  "use cache";
  cacheLife("hours");

  const q = new URLSearchParams({ query, type: "boardgame,boardgameexpansion" });
  const { text } = await bggFetch(`/search?${q}`);
  const raw: X[] = parser.parse(text).items?.item ?? [];
  const seen = new Set<number>();
  const results: SearchResult[] = [];
  for (const it of raw) {
    const id = Number(it.id);
    if (seen.has(id)) continue; // games are listed under both types
    seen.add(id);
    results.push({ id, name: primaryName(it.name) ?? `#${id}`, year: num(it.yearpublished), type: String(it.type) });
  }
  // Exact, then whole-word, then partial matches; BGG returns them in no useful order.
  const lq = query.toLowerCase();
  const word = new RegExp(`(^|\\W)${lq.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`);
  const rank = (r: SearchResult) => {
    const n = r.name.toLowerCase();
    if (n === lq) return 0;
    const w = word.test(n);
    return n.startsWith(lq) ? (w ? 1 : 2) : w ? 3 : 4;
  };
  return results.sort((a, b) => rank(a) - rank(b) || (b.year ?? 0) - (a.year ?? 0)).slice(0, 15);
}
