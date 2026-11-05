import type { NextRequest } from "next/server";
import { BggError, fetchVersions } from "@/lib/bgg";

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Pass a numeric id" }, { status: 400 });

  try {
    return Response.json({ versions: await fetchVersions(id) });
  } catch (e) {
    if (e instanceof BggError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
