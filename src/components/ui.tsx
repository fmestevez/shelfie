"use client";

import { type ReactNode, useState } from "react";

const openKey = (title: string) => `shelfie:section:${title}`;

/** A sidebar section whose header folds it away; each remembers whether it was open. */
export function Section({
  title,
  children,
  right,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(openKey(title));
      return v === null ? defaultOpen : v === "1";
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(openKey(title), open ? "0" : "1");
    } catch {
      // Private mode: the section just won't remember.
    }
  };
  return (
    <section className="border-b border-white/10 px-4 py-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 py-1 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50 hover:text-white/80"
        >
          <span className={`text-[9px] transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
            ▶
          </span>
          <h2>{title}</h2>
        </button>
        {right}
      </div>
      {open && <div className="mt-2 space-y-3 pb-1">{children}</div>}
    </section>
  );
}

/** A collapsed group of secondary controls inside a section. */
export function MoreOptions({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg bg-white/[0.03] px-3 py-2">
      <summary className="cursor-pointer list-none text-xs text-white/60 hover:text-white [&::-webkit-details-marker]:hidden">
        <span className="mr-1.5 inline-block text-[9px] transition-transform group-open:rotate-90" aria-hidden>
          ▶
        </span>
        {label}
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <div className="mb-1.5 text-xs text-white/70">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] leading-snug text-white/40">{hint}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg bg-white/5 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs transition ${
            value === o.value ? "bg-amber-400 font-semibold text-black shadow" : "text-white/70 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-white/80">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-amber-400" : "bg-white/15"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`}
        />
      </button>
    </label>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 12,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const btn = "h-7 w-7 rounded-md bg-white/10 text-sm text-white hover:bg-white/20 disabled:opacity-30";
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={btn}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        aria-label="Fewer"
      >
        −
      </button>
      <span className="w-5 text-center text-sm tabular-nums">{value}</span>
      <button
        type="button"
        className={btn}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="More"
      >
        +
      </button>
    </div>
  );
}

/** ↑/↓ toggle for reversing a sort. */
export function SortDirection({ reversed, onChange }: { reversed: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!reversed)}
      title={reversed ? "Reversed order" : "Normal order"}
      aria-label={reversed ? "Reversed order, click for normal" : "Normal order, click to reverse"}
      aria-pressed={reversed}
      className={`w-9 shrink-0 rounded-lg text-sm transition ${
        reversed ? "bg-amber-400 font-semibold text-black" : "bg-white/10 text-white/70 hover:text-white"
      }`}
    >
      {reversed ? "↓" : "↑"}
    </button>
  );
}
