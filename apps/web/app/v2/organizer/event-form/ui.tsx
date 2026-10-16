"use client";

import type { ReactNode } from "react";

/** Building blocks shared by the v2 create-event form and (next) the edit / tier forms. */

export const fieldCls =
  "h-11 w-full min-w-0 rounded-v2-md bg-v2-ink3 px-4 text-[14px] text-v2-cream placeholder:text-v2-c50 focus:outline-none focus:ring-1 focus:ring-v2-c30 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-v2-errorText";

/** DOM id of the control (or message) for an error path, so "publish" can jump to the first problem. */
export const fieldId = (path: string) => `f-${path.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2.5 flex items-baseline justify-between gap-3 text-[12px] font-v2-ui-semibold uppercase tracking-[0.06em] text-v2-c50">
        <span>{title}</span>
        {aside ? <span className="normal-case tracking-normal text-v2-c50">{aside}</span> : null}
      </h2>
      {children}
    </section>
  );
}

export function FieldError({ path, message }: { path?: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={path ? `${fieldId(path)}-error` : undefined} role="alert" className="mt-1.5 text-[12.5px] text-v2-errorText">
      {message}
    </p>
  );
}

export function Labeled({
  label,
  optional,
  htmlFor,
  children,
  error,
  path,
}: {
  label: string;
  optional?: string;
  htmlFor?: string;
  children: ReactNode;
  error?: string | null;
  path?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[12.5px] text-v2-c70">
        {label}
        {optional ? <span className="text-v2-c50"> · {optional}</span> : null}
      </label>
      {children}
      <FieldError path={path} message={error} />
    </div>
  );
}

/** Row of a grouped card (prototype "cf-row"): label on the left, control on the right. */
export function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2">
      <label htmlFor={htmlFor} className="w-[96px] shrink-0 text-[13px] text-v2-c70 sm:w-[120px]">
        {label}
      </label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Group({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-v2-c10 overflow-hidden rounded-v2-card bg-v2-ink2">{children}</div>;
}

/** Big switch row (prototype "cf-toggle"). */
export function SwitchRow({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 px-4 py-3 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-v2-ui-semibold">{title}</span>
        {hint ? <span className="mt-0.5 block text-[12.5px] text-v2-c50">{hint}</span> : null}
      </span>
      <span aria-hidden className={`relative h-6 w-10 shrink-0 rounded-v2-pill transition-colors ${checked ? "bg-v2-flame" : "bg-v2-ink4"}`}>
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
        />
      </span>
    </button>
  );
}

export const iconBtn =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-v2-c70 hover:bg-v2-ink4 hover:text-v2-cream disabled:opacity-30 disabled:hover:bg-transparent";
