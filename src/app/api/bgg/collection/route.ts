import type { NextRequest } from "next/server";
import { BggError, fetchCollection } from "@/lib/bgg";

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username")?.trim();
  if (!username) return Response.json({ error: "Missing username" }, { status: 400 });

  try {
    const result = await fetchCollection(username);
    if (result.queued) {
      // BGG builds large collections asynchronously; the client retries.
      return Response.json({ queued: true }, { status: 202 });
    }
    return Response.json({ items: result.items });
  } catch (e) {
    if (e instanceof BggError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
