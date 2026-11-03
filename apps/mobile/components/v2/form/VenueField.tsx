/**
 * Venue with Google Places suggestions in the app (2026-11-02) — same API and rules as the web
 * (VenueField there): search after 3 letters in the city's country, one session per pick, the
 * details call closes it and brings the address; typing again forgets the place; without a key
 * it stays a plain text field.
 */
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { findCatalogCity, flameV2Colors as c, newPlacesSessionToken, venueMapsUrl } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiGet } from "../../../lib/api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { Icon } from "../ui";
import { Input } from "./ui";

type Suggestion = { place_id: string; name: string; address: string };
export type VenueValue = { venue: string; venueAddress: string; venuePlaceId: string };

export function VenueField({ value, city, onChange, placeholder, invalid, editable = true, accessibilityLabel }: { value: VenueValue; city: string; onChange: (v: VenueValue) => void; placeholder: string; invalid?: boolean; editable?: boolean; accessibilityLabel: string }) {
  const { t, language } = useI18n();
  const { getToken } = useOptionalAuth();
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [off, setOff] = useState(false);
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
      try {
        const q = `input=${encodeURIComponent(text)}&session=${session.current}&lang=${language}${country ? `&country=${country}` : ""}`;
        const j = await apiGet<{ suggestions: Suggestion[] }>(`/api/places/venues?${q}`, getToken);
        if (alive) setList(j.suggestions);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 503 || status === 401) setOff(true); // no key / signed out → plain text
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [value.venue, value.venuePlaceId, typed, off, country, language, getToken]);

  const pick = async (s: Suggestion) => {
    const token = session.current ?? newPlacesSessionToken();
    session.current = null;
    setList(null);
    onChange({ venue: s.name, venueAddress: s.address, venuePlaceId: s.place_id });
    try {
      const d = await apiGet<{ place_id: string; address: string }>(`/api/places/venues/${encodeURIComponent(s.place_id)}?session=${token}&lang=${language}`, getToken);
      onChange({ venue: s.name, venueAddress: d.address || s.address, venuePlaceId: d.place_id });
    } catch {
      /* keep the short address */
    }
  };

  const maps = value.venuePlaceId ? venueMapsUrl({ venue: value.venue, venue_address: value.venueAddress, venue_place_id: value.venuePlaceId }) : null;

  return (
    <View>
      <Input
        bare
        value={value.venue}
        onChangeText={(v) => {
          setTyped(true);
          onChange({ venue: v, venueAddress: "", venuePlaceId: "" });
        }}
        placeholder={placeholder}
        invalid={invalid}
        editable={editable}
        maxLength={200}
        accessibilityLabel={accessibilityLabel}
      />
      {list && list.length === 0 ? <Text className="mt-1 font-v2-ui text-[12px] text-v2-c50">{t("eventForm.venueNoResults")}</Text> : null}
      {list && list.length > 0 ? (
        <View accessibilityLabel={t("eventForm.venueSuggestions")} className="mt-1 overflow-hidden rounded-v2-md bg-v2-ink3">
          {list.map((s) => (
            <Pressable key={s.place_id} onPress={() => void pick(s)} accessibilityRole="button" accessibilityLabel={s.name} className="flex-row items-start gap-2 px-3 py-2 active:bg-v2-ink4">
              <Icon name="pin" size={15} color={c.c50} />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-v2-ui-semibold text-[13.5px] text-v2-cream">{s.name}</Text>
                {s.address ? <Text numberOfLines={1} className="font-v2-ui text-[12px] text-v2-c50">{s.address}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
      {value.venuePlaceId ? (
        <View className="mt-1.5 flex-row items-center gap-2">
          <Icon name="pin" size={14} color={c.c70} />
          <Text numberOfLines={1} className="min-w-0 flex-1 font-v2-ui text-[12.5px] text-v2-c70">{value.venueAddress}</Text>
          {maps ? (
            <Pressable onPress={() => void Linking.openURL(maps)} accessibilityRole="link" hitSlop={6}>
              <Text className="font-v2-ui-semibold text-[12.5px] text-v2-c70">{t("eventForm.venueOnMaps")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : !off && typed && !list ? (
        <Text className="mt-1 font-v2-ui text-[12px] text-v2-c50">{t("eventForm.venueHint")}</Text>
      ) : null}
    </View>
  );
}
