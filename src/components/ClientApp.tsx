"use client";

import dynamic from "next/dynamic";

// WebGL + localStorage-backed state: render on the client only.
const App = dynamic(() => import("./App"), {
  ssr: false,
  loading: () => (
    <div role="status" className="grid h-dvh place-items-center bg-neutral-950 text-sm text-white/65">
      Building shelves…
    </div>
  ),
});

export default function ClientApp() {
  return <App />;
}
