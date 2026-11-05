import { ImageResponse } from "next/og";
import { SITE_URL } from "@/lib/site";
import { ShelfArt } from "./ShelfArt";

export const alt = "Shelfie: a 3D shelf packed with board games";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 90px",
          background: "linear-gradient(135deg, #171717 0%, #0a0a0a 100%)",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 560 }}>
          <div style={{ display: "flex", fontSize: 104, fontWeight: 800, letterSpacing: -3 }}>
            Shelf<span style={{ color: "#fbbf24" }}>ie</span>
          </div>
          <div style={{ fontSize: 38, lineHeight: 1.25, marginTop: 18, color: "#e5e5e5" }}>
            Your board game collection, packed onto real shelves in 3D.
          </div>
          <div style={{ fontSize: 26, marginTop: 28, color: "#a3a3a3" }}>
            {`BoardGameGeek · Kallax · Billy · ${new URL(SITE_URL).host}`}
          </div>
        </div>
        <ShelfArt size={420} />
      </div>
    ),
    size,
  );
}
