/**
 * City chosen on the Flame 2.0 Home (fase 2.2). Shared by the top bar's city button, the Home
 * feed and Settings. What the person picks on the Home lives in memory only; what the Home opens
 * on is the default city from Settings, remembered on this phone (lib/v2/default-city, Kevin
 * 2026-10-27). Until the person picks, the Home applies that default ("auto" = Quito when it has
 * events, same rule as v1 W0-Q3); once they pick, their pick stays for the session. Saving a new
 * default in Settings applies it right away.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readDefaultCityPref, saveDefaultCityPref, type DefaultCityPref } from "../lib/v2/default-city";

type Ctx = {
  /** null = all cities. */
  city: string | null;
  touched: boolean;
  pick: (city: string | null) => void;
  /** Default the Home applies while the person hasn't picked (does not count as their choice). */
  applyDefault: (city: string | null) => void;
  /** Settings value ("auto" | "all" | city); null until read from the phone. */
  defaultPref: DefaultCityPref | null;
  setDefaultPref: (pref: DefaultCityPref) => void;
  pickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
};

const AttendeeCityCtx = createContext<Ctx | null>(null);

export function AttendeeCityProvider({ children }: { children: ReactNode }) {
  const [city, setCity] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const touchedRef = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [defaultPref, setPref] = useState<DefaultCityPref | null>(null);

  useEffect(() => {
    let alive = true;
    void readDefaultCityPref().then((p) => alive && setPref((cur) => cur ?? p));
    return () => {
      alive = false;
    };
  }, []);

  const pick = useCallback((c: string | null) => {
    touchedRef.current = true;
    setTouched(true);
    setCity(c);
    setPickerOpen(false);
  }, []);
  const applyDefault = useCallback((c: string | null) => {
    if (!touchedRef.current) setCity(c);
  }, []);
  const setDefaultPref = useCallback((p: DefaultCityPref) => {
    setPref(p);
    void saveDefaultCityPref(p);
    // A new default wins over this session's pick: the Home re-applies it.
    touchedRef.current = false;
    setTouched(false);
  }, []);
  const value = useMemo(
    () => ({
      city,
      touched,
      pick,
      applyDefault,
      defaultPref,
      setDefaultPref,
      pickerOpen,
      openPicker: () => setPickerOpen(true),
      closePicker: () => setPickerOpen(false),
    }),
    [city, touched, pick, applyDefault, defaultPref, setDefaultPref, pickerOpen],
  );
  return <AttendeeCityCtx.Provider value={value}>{children}</AttendeeCityCtx.Provider>;
}

export function useAttendeeCity(): Ctx {
  const ctx = useContext(AttendeeCityCtx);
  if (!ctx) throw new Error("useAttendeeCity outside AttendeeCityProvider");
  return ctx;
}

/** Same, but null outside the provider (the top bar renders in tests without it). */
export function useOptionalAttendeeCity(): Ctx | null {
  return useContext(AttendeeCityCtx);
}
