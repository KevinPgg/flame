/**
 * "Where are you going out?" (fase 2.2, prototype `pickCity`): All cities + each city that has
 * events, with how many. A flat list: events don't store a country yet (grouping by country,
 * as in the prototype, needs that data — fase 4). The pick lasts for the session; the city
 * the Home opens on is set in Settings (lib/v2/default-city).
 */
import { Pressable, Text, View } from "react-native";
import { flameV2Colors as c } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { Sheet } from "../../Sheet";
import { Icon } from "../../ui";

function Row({ label, count, on, onPress }: { label: string; count: number; on: boolean; onPress: () => void }) {
  const { t } = useI18n();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${label}, ${t("home.events", { count })}`}
      className="flex-row items-center gap-3 rounded-[10px] px-1 py-2.5 active:bg-v2-ink3"
    >
      <View
        style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: on ? c.cream : c.c30, backgroundColor: on ? c.cream : "transparent" }}
        className="items-center justify-center"
      >
        {on ? <Icon name="check" size={12} color={c.ink} /> : null}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-v2-ui-semibold text-[15px] text-v2-cream">{label}</Text>
        <Text className="font-v2-ui text-[12.5px] text-v2-c50">{t("home.events", { count })}</Text>
      </View>
    </Pressable>
  );
}

export function CitySheet({
  open,
  cities,
  total,
  current,
  onPick,
  onClose,
}: {
  open: boolean;
  cities: Array<{ city: string; count: number }>;
  total: number;
  current: string | null;
  onPick: (city: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Sheet open={open} title={t("home.cityTitle")} subtitle={t("home.cityLead")} onClose={onClose}>
      <Row label={t("common.allCities")} count={total} on={current === null} onPress={() => onPick(null)} />
      {cities.map(({ city, count }) => (
        <Row key={city} label={city} count={count} on={current === city} onPress={() => onPick(city)} />
      ))}
    </Sheet>
  );
}
