import type { NextRequest } from "next/server";
import { BggError, searchGames } from "@/lib/bgg";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ results: [] });

  try {
    return Response.json({ results: await searchGames(q) });
  } catch (e) {
    if (e instanceof BggError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
