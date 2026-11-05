"use client";

import { type ComponentProps, createContext, type ReactNode, useContext, useId, useRef, useState } from "react";

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
  const bodyId = useId();
  return (
    <section className="border-b border-white/10 px-4 py-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex flex-1 items-center gap-2 py-1 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65 hover:text-white"
        >
          <span className={`text-[9px] transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
            ▶
          </span>
          <h2>{title}</h2>
        </button>
        {right}
      </div>
      {open && (
        <div id={bodyId} className="mt-2 space-y-3 pb-1">
          {children}
        </div>
      )}
    </section>
  );
}

/** A collapsed group of secondary controls inside a section. */
export function MoreOptions({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg bg-white/[0.03] px-3 py-2">
      <summary className="cursor-pointer list-none text-xs text-white/75 hover:text-white [&::-webkit-details-marker]:hidden">
        <span className="mr-1.5 inline-block text-[9px] transition-transform group-open:rotate-90" aria-hidden>
          ▶
        </span>
        {label}
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

/** Lets controls inside a Field point at its label and hint (see useFieldLabel). */
const FieldIds = createContext<{ labelId: string; controlId: string; hintId?: string } | null>(null);

/** Attributes that tie a control to the Field it sits in: its id (for the <label>), and the hint. */
export function useFieldLabel() {
  const ids = useContext(FieldIds);
  return ids ? { id: ids.controlId, "aria-labelledby": ids.labelId, "aria-describedby": ids.hintId } : {};
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const id = useId();
  const ids = { labelId: `${id}-label`, controlId: `${id}-control`, hintId: hint ? `${id}-hint` : undefined };
  return (
    <div role="group" aria-labelledby={ids.labelId} aria-describedby={ids.hintId}>
      {/* A real <label> for dropdowns and sliders; button groups point at it with aria-labelledby. */}
      <label id={ids.labelId} htmlFor={ids.controlId} className="mb-1.5 block text-xs text-white/75">
        {label}
      </label>
      <FieldIds.Provider value={ids}>{children}</FieldIds.Provider>
      {hint && (
        <div id={ids.hintId} className="mt-1 text-[11px] leading-snug text-white/60">
          {hint}
        </div>
      )}
    </div>
  );
}

/** A dropdown named by its Field. */
export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return (
    <select
      {...useFieldLabel()}
      {...props}
      className={`min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-amber-400 [&>option]:bg-neutral-900 ${className}`}
    />
  );
}

/** A slider named by its Field; `valueText` is what screen readers say instead of the raw number. */
export function Range({ valueText, ...props }: ComponentProps<"input"> & { valueText?: string }) {
  return (
    <input
      type="range"
      {...useFieldLabel()}
      aria-valuetext={valueText}
      {...props}
      className="w-full accent-amber-400"
    />
  );
}

/** One-of-several buttons, as a radio group: arrow keys move the choice, Tab enters and leaves it. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const named = useFieldLabel();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = options.findIndex((o) => o.value === value);
  const move = (to: number) => {
    const i = (to + options.length) % options.length;
    onChange(options[i].value);
    refs.current[i]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-labelledby={named["aria-labelledby"]}
      className="flex rounded-lg bg-white/5 p-0.5"
      onKeyDown={(e) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (step) move(current + step);
        else if (e.key === "Home") move(0);
        else if (e.key === "End") move(options.length - 1);
        else return;
        e.preventDefault();
      }}
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={value === o.value || (current < 0 && i === 0) ? 0 : -1}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs transition ${
            value === o.value ? "bg-amber-400 font-semibold text-black shadow" : "text-white/75 hover:text-white"
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
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-amber-400" : "bg-white/25"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`}
        />
      </button>
    </label>
  );
}

/** − count + buttons; `label` says what is being counted, for screen readers. */
export function Stepper({
  value,
  onChange,
  label,
  min = 0,
  max = 12,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min?: number;
  max?: number;
}) {
  const btn = "h-7 w-7 rounded-md bg-white/10 text-sm text-white hover:bg-white/20 disabled:opacity-30";
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <button
        type="button"
        className={btn}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        aria-label={`One fewer ${label}`}
      >
        −
      </button>
      <span className="w-5 text-center text-sm tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={btn}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        aria-label={`One more ${label}`}
      >
        +
      </button>
    </div>
  );
}

/** ↑/↓ toggle for reversing a sort; `label` names what it reverses. */
export function SortDirection({
  reversed,
  onChange,
  label,
}: {
  reversed: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!reversed)}
      title={reversed ? "Reversed order" : "Normal order"}
      aria-label={label}
      aria-pressed={reversed}
      className={`w-9 shrink-0 rounded-lg text-sm transition ${
        reversed ? "bg-amber-400 font-semibold text-black" : "bg-white/10 text-white/75 hover:text-white"
      }`}
    >
      <span aria-hidden>{reversed ? "↓" : "↑"}</span>
    </button>
  );
}
