"use client";

/** One-tap switch (prototype: "Sold out and Hidden are one-tap switches"). */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={`inline-flex select-none items-center gap-2 text-[13px] ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 shrink-0 rounded-v2-pill transition-colors ${checked ? "bg-v2-flame" : "bg-v2-ink4"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
        />
      </button>
      <span className="text-v2-c70">{label}</span>
    </label>
  );
}
