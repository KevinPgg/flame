"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../../lib/i18n";
import { Icon } from "./Icon";

/**
 * Pick a Flame account for an organizer tool (team, send tickets, scanners) — restricted search
 * (Kevin, 2026-10-23): suggestions as you type only among people already connected to the
 * organization; anyone else only by their full e-mail. GET /api/organizer/people (debounced,
 * stale answers dropped). Same behavior as the app's PeoplePicker.
 */
export type Person = { id: string; email: string; first_name: string | null; last_name: string | null; related?: boolean };

export const personLabel = (p: Pick<Person, "first_name" | "last_name" | "email">) =>
  [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email;

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

export function PeoplePicker({
  organization,
  value,
  onChange,
  disabled,
  noAccount,
  id = "people-picker",
}: {
  organization: { id: string; name: string };
  value: Person | null;
  onChange: (p: Person | null) => void;
  disabled?: boolean;
  /** Shown instead of "no Flame account" when a full e-mail has no account (receives it in lowercase). */
  noAccount?: (email: string) => ReactNode;
  id?: string;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const req = useRef(0);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    const term = q.trim();
    const n = ++req.current;
    setError(null);
    if (term.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/organizer/people?organizationId=${encodeURIComponent(organization.id)}&q=${encodeURIComponent(term)}`);
        const json = (await res.json().catch(() => null)) as { people?: Person[]; error?: string } | null;
        if (n !== req.current) return;
        if (!res.ok) setError(res.status < 500 && json?.error ? json.error : tRef.current("errors.generic"));
        else setResults(json?.people ?? []);
      } catch {
        if (n === req.current) setError(tRef.current("errors.generic"));
      } finally {
        if (n === req.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, organization.id]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-v2-md bg-v2-ink3 p-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-v2-ink4 text-[13px] font-v2-ui-bold">{initials(personLabel(value))}</span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[14px] font-v2-ui-semibold">{personLabel(value)}</b>
          <small className="block truncate text-[12.5px] text-v2-c50">{value.email}</small>
        </span>
        <button type="button" disabled={disabled} onClick={() => onChange(null)} className="h-9 rounded-v2-pill px-3 text-[13px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4">
          {t("people.change")}
        </button>
      </div>
    );
  }

  const term = q.trim();
  const empty = !searching && results !== null && results.length === 0;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] text-v2-c70">
        {t("people.label")}
      </label>
      <div className="relative">
        <Icon name="search" size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-v2-c50" />
        <input
          id={id}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("people.placeholder")}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          className="h-11 w-full min-w-0 rounded-v2-md bg-v2-ink3 pl-10 pr-4 text-[14px] text-v2-cream placeholder:text-v2-c50 focus:outline-none focus:ring-1 focus:ring-v2-c30"
        />
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-v2-c50">{t("people.hint", { org: organization.name })}</p>
      {searching && <p className="mt-2 text-[13px] text-v2-c50">{t("people.searching")}</p>}
      {empty && looksLikeEmail(term) && noAccount ? (
        <div className="mt-2">{noAccount(term.toLowerCase())}</div>
      ) : empty ? (
        <p className="mt-2 text-[13px] text-v2-c70">{looksLikeEmail(term) ? t("people.noAccount") : t("people.none", { org: organization.name })}</p>
      ) : null}
      {results && results.length > 0 && (
        <ul className="mt-2 overflow-hidden rounded-v2-md bg-v2-ink3">
          {results.map((p) => (
            <li key={p.id} className="border-b border-v2-c06 last:border-0">
              <button
                type="button"
                onClick={() => {
                  onChange(p);
                  setQ("");
                  setResults(null);
                }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-v2-ink4"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-v2-ink4 text-[12px] font-v2-ui-bold">{initials(personLabel(p))}</span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14px] font-v2-ui-semibold">{personLabel(p)}</b>
                  <small className="block truncate text-[12.5px] text-v2-c50">{p.email}</small>
                </span>
                {p.related === false ? <small className="text-[11.5px] text-v2-c50">{t("people.byEmail")}</small> : <Icon name="chev" size={16} className="text-v2-c50" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-2 text-[13px] text-v2-errorText">{error}</p>}
    </div>
  );
}
