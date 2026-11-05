import type { NextRequest } from "next/server";

// BGG images don't send CORS headers, which WebGL textures and canvas color sampling need.
const ALLOWED_HOSTS = new Set(["cf.geekdo-images.com"]);

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  let url: URL;
  try {
    url = new URL(raw ?? "");
  } catch {
    return new Response("Bad url", { status: 400 });
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    return new Response("Host not allowed", { status: 403 });
  }

  const upstream = await fetch(url, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    return new Response("Upstream error", { status: upstream.status || 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
