/**
 * City of an event (2026-11-02, decision of Kevin): picked from the catalog grouped by country
 * (lib/utils/places), in a sheet. "Another city…" switches to a text field; an old event whose
 * city isn't in the catalog opens in that text mode. Replaces the Google "(cities)" suggestions.
 */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { COUNTRIES, findCatalogCity, flameV2Colors as c } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { Sheet } from "../Sheet";
import { Icon } from "../ui";
import { Input } from "./ui";

export function CityField({ value, onChange, placeholder, invalid, accessibilityLabel, editable = true }: { value: string; onChange: (v: string) => void; placeholder: string; invalid?: boolean; accessibilityLabel: string; editable?: boolean }) {
  const { t, language } = useI18n();
  const known = findCatalogCity(value);
  const [typing, setTyping] = useState(!!value.trim() && !known);
  const [open, setOpen] = useState(false);

  if (typing)
    return (
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Input bare value={value} onChangeText={onChange} placeholder={t("eventForm.cityOtherPlaceholder")} invalid={invalid} editable={editable} maxLength={100} accessibilityLabel={accessibilityLabel} />
        </View>
        <Pressable
          onPress={() => {
            setTyping(false);
            onChange("");
          }}
          accessibilityRole="button"
          hitSlop={6}
        >
          <Text className="font-v2-ui-semibold text-[12.5px] text-v2-c70">{t("eventForm.cityList")}</Text>
        </Pressable>
      </View>
    );

  return (
    <>
      <Pressable
        onPress={() => editable && setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel}: ${known ? known.city.name : t("eventForm.cityPick")}`}
        className={`h-10 flex-row items-center px-1 ${invalid ? "rounded-v2-sm border border-v2-errorText" : ""}`}
      >
        <Text numberOfLines={1} className={`flex-1 font-v2-ui text-[14px] ${known ? "text-v2-cream" : "text-v2-c50"}`}>
          {known ? `${known.country.flag} ${known.city.name}` : placeholder || t("eventForm.cityPick")}
        </Text>
        <Icon name="down" size={16} color={c.c50} />
      </Pressable>
      <Sheet open={open} title={t("eventForm.cityPick")} onClose={() => setOpen(false)}>
        {COUNTRIES.map((country) => (
          <View key={country.code} className="mb-2">
            <Text accessibilityRole="header" className="px-1 pb-1 pt-2 font-v2-ui-semibold text-[12.5px] uppercase tracking-[0.6px] text-v2-c50">
              {country.flag} {country.name[language]}
            </Text>
            {country.cities.map((city) => {
              const on = known?.city.name === city.name;
              return (
                <Pressable
                  key={city.name}
                  onPress={() => {
                    onChange(city.name);
                    setOpen(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={city.name}
                  className={`flex-row items-center gap-3 rounded-v2-md px-3 py-2.5 ${on ? "bg-v2-c10" : "active:bg-v2-c06"}`}
                >
                  <Text className="flex-1 font-v2-ui text-[15px] text-v2-cream">{city.name}</Text>
                  {on ? <Icon name="check" size={16} color={c.cream} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        <Pressable
          onPress={() => {
            setOpen(false);
            setTyping(true);
            onChange("");
          }}
          accessibilityRole="button"
          className="rounded-v2-md px-3 py-3 active:bg-v2-c06"
        >
          <Text className="font-v2-ui-semibold text-[15px] text-v2-c70">{t("eventForm.cityOther")}</Text>
        </Pressable>
      </Sheet>
    </>
  );
}
