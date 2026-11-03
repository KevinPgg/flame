"use client";

import { useEffect, useRef, useState } from "react";
import { findCatalogCity, newPlacesSessionToken, venueMapsUrl } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { Icon } from "../../components/Icon";
import { fieldCls } from "./ui";

type Suggestion = { place_id: string; name: string; address: string };
export type VenueValue = { venue: string; venueAddress: string; venuePlaceId: string };

/**
 * Venue with Google Places suggestions (2026-11-02). Typing searches (after 3 letters, 300 ms
 * pause) in the event city's country; tapping a suggestion keeps its name and fetches the address
 * (that call closes the billing session). Typing again after a pick forgets the place. Without a
 * key (503) or on errors it's a plain text field, as before.
 */
export function VenueField({ id, value, city, onChange, disabled, invalid, placeholder }: { id: string; value: VenueValue; city: string; onChange: (v: VenueValue) => void; disabled?: boolean; invalid?: boolean; placeholder?: string }) {
  const { t, language } = useI18n();
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [off, setOff] = useState(false); // no key / service down → plain text for this visit
  const [typed, setTyped] = useState(false);
  const session = useRef<string | null>(null);
  const country = findCatalogCity(city)?.country.code ?? "";

  useEffect(() => {
    const text = value.venue.trim();
    if (off || !typed || value.venuePlaceId || text.length < 3) {
      setList(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      session.current ??= newPlacesSessionToken();
      setLoading(true);
      try {
        const q = new URLSearchParams({ input: text, session: session.current, lang: language, ...(country ? { country } : {}) });
        const res = await fetch(`/api/places/venues?${q}`);
        if (res.status === 503 || res.status === 401) return setOff(true);
        if (!res.ok) return;
        const j = (await res.json()) as { suggestions: Suggestion[] };
        if (alive) setList(j.suggestions);
      } catch {
        /* keep typing as plain text */
      } finally {
        if (alive) setLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [value.venue, value.venuePlaceId, typed, off, country, language]);

  const pick = async (s: Suggestion) => {
    const token = session.current ?? newPlacesSessionToken();
    session.current = null; // the details call closes this session; next search starts a new one
    setList(null);
    onChange({ venue: s.name, venueAddress: s.address, venuePlaceId: s.place_id });
    try {
      const res = await fetch(`/api/places/venues/${encodeURIComponent(s.place_id)}?session=${token}&lang=${language}`);
      if (res.ok) {
        const d = (await res.json()) as { place_id: string; address: string };
        onChange({ venue: s.name, venueAddress: d.address || s.address, venuePlaceId: d.place_id });
      }
    } catch {
      /* the short address from the suggestion stays */
    }
  };

  const maps = value.venuePlaceId ? venueMapsUrl({ venue: value.venue, venue_address: value.venueAddress, venue_place_id: value.venuePlaceId }) : null;

  return (
    <div>
      <input
        id={id}
        value={value.venue}
        onChange={(e) => {
          setTyped(true);
          onChange({ venue: e.target.value, venueAddress: "", venuePlaceId: "" });
        }}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid}
        aria-autocomplete="list"
        aria-controls={`${id}-list`}
        autoComplete="off"
        maxLength={200}
        className={`${fieldCls} h-10 bg-v2-ink3`}
      />
      {loading && !list ? <small className="mt-1 block text-[12px] text-v2-c50">{t("eventForm.venueSearching")}</small> : null}
      {list ? (
        list.length === 0 ? (
          <small className="mt-1 block text-[12px] text-v2-c50">{t("eventForm.venueNoResults")}</small>
        ) : (
          <ul id={`${id}-list`} role="listbox" aria-label={t("eventForm.venueSuggestions")} className="mt-1.5 overflow-hidden rounded-v2-md bg-v2-ink3">
            {list.map((s) => (
              <li key={s.place_id} role="option" aria-selected={false}>
                <button type="button" onClick={() => void pick(s)} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-v2-ink4">
                  <Icon name="pin" size={15} className="mt-0.5 shrink-0 text-v2-c50" />
                  <span className="min-w-0">
                    <b className="block truncate text-[13.5px] font-v2-ui-semibold">{s.name}</b>
                    {s.address ? <small className="block truncate text-[12px] text-v2-c50">{s.address}</small> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
      {value.venuePlaceId ? (
        <div className="mt-1.5 flex items-center gap-2 text-[12.5px] text-v2-c70">
          <Icon name="pin" size={14} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{value.venueAddress}</span>
          {maps ? (
            <a href={maps} target="_blank" rel="noopener noreferrer" className="shrink-0 font-v2-ui-semibold hover:underline">
              {t("eventForm.venueOnMaps")}
            </a>
          ) : null}
        </div>
      ) : !off && typed && !list ? (
        <small className="mt-1 block text-[12px] text-v2-c50">{t("eventForm.venueHint")}</small>
      ) : null}
    </div>
  );
}
