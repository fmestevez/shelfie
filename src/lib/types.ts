/** Box dimensions in centimetres, sorted so that a >= b >= c (c is the thickness). */
export type Dims = [number, number, number];

export type DimsSource =
  | "selected-version"
  | "latest-version"
  | "default"
  | "chosen-version"
  | "custom";

export interface Game {
  /** BGG collection id (unique per copy in the collection). */
  collId: number;
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
