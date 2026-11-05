/** Box dimensions in centimetres, sorted so that a >= b >= c (c is the thickness). */
export type Dims = [number, number, number];

export type DimsSource = "selected-version" | "latest-version" | "default" | "chosen-version" | "custom";

export interface Game {
  /** BGG collection id (unique per copy in the collection). */
  collId: number;
  /** The user's per-game choice of group for multi-valued sorts like theme or mechanism (from their edits). */
  groups?: GameOverride["groups"];
  /** BGG thing id. */
  id: number;
  name: string;
  year?: number;
  image?: string;
  thumbnail?: string;
  isExpansion: boolean;
  dims: Dims;
  dimsSource: DimsSource;
  versionName?: string;
  categories: string[];
  mechanics: string[];
  designers: string[];
  publishers: string[];
  families: string[];
  /** BGG domains ("wargames", "familygames", …), best rank first. */
  domains: string[];
  /** For expansions: the base game(s) they expand. */
  baseIds: number[];
  weight?: number;
  rating?: number;
  minPlayers?: number;
  maxPlayers?: number;
  artists?: string[];
  /** Minutes, as printed on the box. */
  playTime?: number;
  /** Player counts the BGG community votes best. */
  bestWith?: number[];
  /** Your logged plays (collection games only). */
  plays?: number;
  /** Your own BGG rating. */
  myRating?: number;
}

/** Shape returned by /api/bgg/collection */
export interface CollectionItem {
  collId: number;
  id: number;
  name: string;
  year?: number;
  image?: string;
  thumbnail?: string;
  version?: { id: number; name?: string; dims?: Dims; image?: string; thumbnail?: string };
  /** Logged plays, from the collection. */
  plays?: number;
  /** The owner's own rating (1–10), if they gave one. */
  myRating?: number;
}

/** Shape returned by /api/bgg/things */
export interface ThingInfo {
  id: number;
  type: string;
  image?: string;
  thumbnail?: string;
  categories: string[];
  mechanics: string[];
  designers: string[];
  publishers: string[];
  families: string[];
  domains: string[];
  baseIds: number[];
  weight?: number;
  rating?: number;
  minPlayers?: number;
  maxPlayers?: number;
  /** The most recently released version that lists a box size. */
  latestVersionWithDims?: { id: number; name?: string; dims: Dims };
  artists: string[];
  /** Minutes, as printed on the box. */
  playTime?: number;
  /** Player counts the BGG community votes best, e.g. [3, 4]. */
  bestWith?: number[];
}

/** A published version (edition) of a game, as listed by BGG. */
export interface VersionInfo {
  id: number;
  name?: string;
  year?: number;
  dims?: Dims;
  image?: string;
  thumbnail?: string;
}

export interface SearchResult {
  id: number;
  name: string;
  year?: number;
  type: string;
}

/** The user's changes to one game. */
export interface GameOverride {
  /** Which theme, category, mechanism, family or artist the game is grouped under, instead of the automatic choice. */
  groups?: Partial<Record<"theme" | "category" | "mechanic" | "family" | "artist", string>>;
  versionId?: number;
  versionName?: string;
  dims?: Dims;
  dimsSource?: DimsSource;
  image?: string;
  thumbnail?: string;
}

/** The user's changes to a collection, kept separately so they survive reloads from BGG. */
export interface CollectionEdits {
  overrides: Record<number, GameOverride>;
  removed: number[];
  added: Game[];
}

export const DEFAULT_DIMS: Dims = [30, 21, 7];
