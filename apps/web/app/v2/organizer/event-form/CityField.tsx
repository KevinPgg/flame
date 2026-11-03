"use client";

import { useState } from "react";
import { COUNTRIES, findCatalogCity } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { fieldCls } from "./ui";

const OTHER = "__other__";

/**
 * City of an event (2026-11-02): picked from the catalog, grouped by country; "Another city…"
 * opens a text field (cities outside the catalog still work and show under "Other cities").
 * An old event whose city isn't in the catalog opens in text mode with its value.
 */
export function CityField({ id, value, onChange, disabled, invalid }: { id: string; value: string; onChange: (city: string) => void; disabled?: boolean; invalid?: boolean }) {
  const { t, language } = useI18n();
  const known = findCatalogCity(value);
  const [typing, setTyping] = useState(!!value.trim() && !known);

  if (typing)
    return (
      <div className="flex items-center gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("eventForm.cityOtherPlaceholder")}
          disabled={disabled}
          aria-invalid={invalid}
          maxLength={100}
          className={`${fieldCls} h-10 min-w-0 flex-1 bg-v2-ink3`}
        />
        <button
          type="button"
          onClick={() => {
            setTyping(false);
            onChange("");
          }}
          className="shrink-0 text-[12.5px] font-v2-ui-semibold text-v2-c70 hover:text-v2-cream"
        >
          {t("eventForm.cityList")}
        </button>
      </div>
    );

  return (
    <select
      id={id}
      value={known ? known.city.name : ""}
      disabled={disabled}
      aria-invalid={invalid}
      onChange={(e) => {
        if (e.target.value === OTHER) {
          setTyping(true);
          onChange("");
        } else onChange(e.target.value);
      }}
      className={`${fieldCls} h-10 bg-v2-ink3`}
    >
      <option value="" disabled>
        {t("eventForm.cityPick")}
      </option>
      {COUNTRIES.map((c) => (
        <optgroup key={c.code} label={`${c.flag} ${c.name[language]}`}>
          {c.cities.map((city) => (
            <option key={city.name} value={city.name}>
              {city.name}
            </option>
          ))}
        </optgroup>
      ))}
      <option value={OTHER}>{t("eventForm.cityOther")}</option>
    </select>
  );
}
