import type { CollectionEdits, Game } from "./types";

/** The collection as the user wants it: minus removed games, plus added ones, with overrides. */
export function applyEdits(games: Game[], edits: CollectionEdits): Game[] {
  const removed = new Set(edits.removed);
  return [...games.filter((g) => !removed.has(g.collId)), ...edits.added].map((g) => {
    const o = edits.overrides[g.collId];
    if (!o) return g;
    return {
      ...g,
      dims: o.dims ?? g.dims,
      dimsSource: o.dimsSource ?? g.dimsSource,
      versionName: o.versionName ?? g.versionName,
      image: o.image ?? g.image,
      thumbnail: o.thumbnail ?? g.thumbnail,
      groups: o.groups,
    };
  });
}
