import { ImageResponse } from "next/og";
import { ShelfArt } from "./ShelfArt";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#171717" }}>
        <ShelfArt size={140} />
      </div>
    ),
    size,
  );
}
