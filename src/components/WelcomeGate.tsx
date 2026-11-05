"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useStore } from "@/lib/store";

/**
 * Shows the server-rendered intro until a collection is loaded. It starts visible
 * on the client too (so hydration matches the server HTML) and hides after mount.
 */
export function WelcomeGate({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const check = () => setHidden(useStore.getState().games.length > 0);
    check();
    return useStore.subscribe(check);
  }, []);
  return hidden ? null : children;
}
