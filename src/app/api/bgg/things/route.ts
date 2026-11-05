import type { NextRequest } from "next/server";
import { BggError, fetchThings } from "@/lib/bgg";

const MAX_IDS = 20; // BGG's per-request limit for /thing

export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length || ids.length > MAX_IDS) {
    return Response.json({ error: `Pass 1-${MAX_IDS} numeric ids` }, { status: 400 });
  }

  try {
    // Sort so the cache key is stable regardless of request order.
    const things = await fetchThings([...new Set(ids)].sort((a, b) => a - b));
    return Response.json({ things });
  } catch (e) {
    if (e instanceof BggError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
