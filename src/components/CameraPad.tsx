"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { sceneApi } from "./three/sceneApi";

const ORBIT = Math.PI / 16;
const TILT = Math.PI / 24;

/** A button that repeats its action while held, for touch screens. */
function PadButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
        const repeat = (delay: number) => {
          timer.current = setTimeout(() => {
            onPress();
            repeat(110);
          }, delay);
        };
        repeat(350);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPress();
        }
      }}
      className="grid h-10 w-10 touch-none select-none place-items-center rounded-lg bg-neutral-900/75 text-base text-white shadow ring-1 ring-white/10 backdrop-blur hover:bg-neutral-800 active:bg-amber-400 active:text-black"
    >
      {children}
    </button>
  );
}

export function CameraPad() {
  const api = () => sceneApi.current;
  return (
    <div
      className="pointer-events-auto absolute bottom-4 right-4 z-10 flex items-end gap-1.5"
      role="toolbar"
      aria-label="Camera controls"
    >
      <div className="flex flex-col gap-1.5">
        <PadButton label="Zoom in" onPress={() => api()?.zoom(0.85)}>
          +
        </PadButton>
        <PadButton label="Zoom out" onPress={() => api()?.zoom(1 / 0.85)}>
          −
        </PadButton>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <PadButton label="Rotate left" onPress={() => api()?.orbit(-ORBIT, 0)}>
          ↺
        </PadButton>
        <PadButton label="Move up" onPress={() => api()?.pan(0, 1)}>
          ▲
        </PadButton>
        <PadButton label="Rotate right" onPress={() => api()?.orbit(ORBIT, 0)}>
          ↻
        </PadButton>
        <PadButton label="Move left" onPress={() => api()?.pan(-1, 0)}>
          ◀
        </PadButton>
        <PadButton label="Fit all shelves" onPress={() => api()?.fit()}>
          ⌂
        </PadButton>
        <PadButton label="Move right" onPress={() => api()?.pan(1, 0)}>
          ▶
        </PadButton>
        <PadButton label="Look from higher" onPress={() => api()?.orbit(0, -TILT)}>
          ⤒
        </PadButton>
        <PadButton label="Move down" onPress={() => api()?.pan(0, -1)}>
          ▼
        </PadButton>
        <PadButton label="Look from lower" onPress={() => api()?.orbit(0, TILT)}>
          ⤓
        </PadButton>
      </div>
    </div>
  );
}
