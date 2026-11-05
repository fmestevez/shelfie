/** A Kallax full of boxes, drawn with plain flexbox for next/og image generation. */
const CUBES: { flat: boolean; boxes: [string, number][] }[] = [
  {
    flat: false,
    boxes: [
      ["#ef4444", 0.9],
      ["#fbbf24", 0.75],
      ["#3b82f6", 0.95],
      ["#22c55e", 0.8],
    ],
  },
  {
    flat: true,
    boxes: [
      ["#a855f7", 0.9],
      ["#f97316", 0.8],
      ["#06b6d4", 0.85],
    ],
  },
  {
    flat: true,
    boxes: [
      ["#22c55e", 0.95],
      ["#ef4444", 0.75],
    ],
  },
  {
    flat: false,
    boxes: [
      ["#f97316", 0.85],
      ["#a855f7", 0.95],
      ["#fbbf24", 0.7],
    ],
  },
  {
    flat: false,
    boxes: [
      ["#06b6d4", 0.9],
      ["#ef4444", 0.95],
      ["#22c55e", 0.75],
      ["#3b82f6", 0.85],
    ],
  },
  {
    flat: true,
    boxes: [
      ["#fbbf24", 0.9],
      ["#3b82f6", 0.8],
      ["#ef4444", 0.95],
      ["#22c55e", 0.7],
    ],
  },
  {
    flat: true,
    boxes: [
      ["#3b82f6", 0.95],
      ["#fbbf24", 0.85],
    ],
  },
  {
    flat: false,
    boxes: [
      ["#22c55e", 0.8],
      ["#06b6d4", 0.95],
      ["#f97316", 0.9],
    ],
  },
  {
    flat: false,
    boxes: [
      ["#a855f7", 0.85],
      ["#ef4444", 0.75],
      ["#fbbf24", 0.95],
      ["#3b82f6", 0.9],
    ],
  },
];

export function ShelfArt({ size }: { size: number }) {
  const frame = Math.round(size * 0.035);
  const cell = Math.floor((size - frame * 4) / 3);
  const thick = Math.round(cell * 0.17);
  const rows = [CUBES.slice(0, 3), CUBES.slice(3, 6), CUBES.slice(6, 9)];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: size,
        height: size,
        background: "#f3f2ee",
        padding: frame,
        borderRadius: 6,
      }}
    >
      {rows.map((row, r) => (
        <div key={r} style={{ display: "flex", justifyContent: "space-between" }}>
          {row.map((c, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: c.flat ? "column-reverse" : "row",
                alignItems: c.flat ? "center" : "flex-end",
                width: cell,
                height: cell,
                background: "#2a2622",
                padding: Math.round(cell * 0.06),
              }}
            >
              {c.boxes.map(([color, k], j) =>
                c.flat ? (
                  <div key={j} style={{ width: cell * 0.8 * k, height: thick, background: color, marginTop: 2 }} />
                ) : (
                  <div key={j} style={{ width: thick, height: cell * 0.85 * k, background: color, marginRight: 3 }} />
                ),
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
