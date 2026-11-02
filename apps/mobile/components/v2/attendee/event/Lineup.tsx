/**
 * Line-up on the event screen (fase 4.3, prototype `x-artists`): horizontal row of square artist
 * tiles with their links. Photo when set; otherwise initials on a tone picked from the name.
 */
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { artistInitials, artistLinks, flameV2Colors as c, parseLineup } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";

const TONES = ["#2A1A1F", "#1B2230", "#26211A", "#1C2722", "#2A2033", "#30201A"];
const tone = (name: string) => TONES[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % TONES.length]!;
const SERVICE = { instagram: "Instagram", spotify: "Spotify", soundcloud: "SoundCloud" } as const;
const ICON = { instagram: "logo-instagram", spotify: "musical-notes-outline", soundcloud: "cloud-outline" } as const;

export function Lineup({ lineup }: { lineup: unknown }) {
  const { t } = useI18n();
  const artists = parseLineup(lineup);
  if (artists.length === 0) return null;
  return (
    <View className="mt-8">
      <View className="mx-4 mb-4 h-px bg-[#1C1C1C]" />
      <Text accessibilityRole="header" className="mb-3 px-4 font-v2-display-bold text-[20px] tracking-[-0.4px] text-v2-cream">
        {t("event.lineup")}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 16 }}>
        {artists.map((a, i) => (
          <View key={`${a.name}-${i}`} style={{ width: 112 }}>
            {a.photo_url ? (
              <Image source={{ uri: a.photo_url }} style={{ width: 112, height: 112, borderRadius: 12, backgroundColor: c.ink3 }} contentFit="cover" transition={150} />
            ) : (
              <LinearGradient
                colors={[tone(a.name), "#0E0E0E"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: 112, height: 112, borderRadius: 12, alignItems: "center", justifyContent: "center" }}
              >
                <Text className="font-v2-display-bold text-[30px] text-v2-cream" style={{ opacity: 0.9 }}>
                  {artistInitials(a.name)}
                </Text>
              </LinearGradient>
            )}
            <Text numberOfLines={2} className="mt-2 font-v2-ui-semibold text-[13.5px] leading-[16px] text-v2-cream">
              {a.name}
            </Text>
            {artistLinks(a).length > 0 ? (
              <View className="mt-1.5 flex-row gap-1.5">
                {artistLinks(a).map((l) => (
                  <Pressable
                    key={l.kind}
                    onPress={() => void Linking.openURL(l.url).catch(() => {})}
                    accessibilityRole="link"
                    accessibilityLabel={t("event.artistOn", { name: a.name, service: SERVICE[l.kind] })}
                    hitSlop={4}
                    style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "#1C1C1C" }}
                    className="items-center justify-center active:opacity-70"
                  >
                    <Ionicons name={ICON[l.kind]} size={14} color={c.cream} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
