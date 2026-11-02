/**
 * Line-up in create / edit event, app (fase 4.3) — same model as the web (packages/lib lineup):
 * one card per artist with name and optional Instagram / Spotify / SoundCloud; empty cards are
 * ignored on save. Errors from validateLineup (paths `lineup.<key>.<field>`).
 */
import { Pressable, Text, View } from "react-native";
import { flameV2Colors as c, LINEUP_MAX, moveItem, newArtistDraft, type ArtistDraft } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { Icon } from "../ui";
import { FieldError, Input, Labeled } from "./ui";

export function LineupFields({
  value,
  onChange,
  errorText,
  disabled,
}: {
  value: ArtistDraft[];
  onChange: (next: ArtistDraft[]) => void;
  errorText: (path: string) => string | null;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const set = (key: string, patch: Partial<ArtistDraft>) => onChange(value.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  const iconBtn = (label: string, icon: "up" | "down" | "trash", onPress: () => void, off?: boolean) => (
    <Pressable
      onPress={onPress}
      disabled={disabled || off}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      className={`h-8 w-8 items-center justify-center rounded-v2-pill active:bg-v2-ink3 ${disabled || off ? "opacity-30" : ""}`}
    >
      <Icon name={icon} size={16} color={icon === "trash" ? c.c50 : c.c70} />
    </Pressable>
  );

  return (
    <View className="gap-3">
      {value.map((a, i) => {
        const p = `lineup.${a.key}.`;
        const who = a.name || String(i + 1);
        return (
          <View key={a.key} className="gap-3 rounded-v2-card bg-v2-ink2 p-4">
            <View className="flex-row items-center gap-1">
              <Text className="w-5 font-v2-display-bold text-[15px] text-v2-c50">{i + 1}</Text>
              <Text numberOfLines={1} className="flex-1 font-v2-ui-semibold text-[14px] text-v2-cream">
                {a.name.trim() || t("eventForm.lineupArtist")}
              </Text>
              {iconBtn(t("eventForm.lineupMoveUp", { name: who }), "up", () => onChange(moveItem(value, i, -1)), i === 0)}
              {iconBtn(t("eventForm.lineupMoveDown", { name: who }), "down", () => onChange(moveItem(value, i, 1)), i === value.length - 1)}
              {iconBtn(t("eventForm.lineupRemove", { name: who }), "trash", () => onChange(value.filter((x) => x.key !== a.key)))}
            </View>
            <Labeled label={t("eventForm.artistName")} error={errorText(p + "name")}>
              <Input
                value={a.name}
                onChangeText={(name) => set(a.key, { name })}
                maxLength={80}
                placeholder={t("eventForm.artistNamePlaceholder")}
                accessibilityLabel={`${t("eventForm.artistName")} ${i + 1}`}
                invalid={!!errorText(p + "name")}
                editable={!disabled}
              />
            </Labeled>
            <Labeled label="Instagram" optional={t("eventForm.optional")} error={errorText(p + "instagram")}>
              <Input
                value={a.instagram}
                onChangeText={(instagram) => set(a.key, { instagram })}
                autoCapitalize="none"
                placeholder="@usuario"
                accessibilityLabel={`Instagram ${i + 1}`}
                invalid={!!errorText(p + "instagram")}
                editable={!disabled}
              />
            </Labeled>
            <Labeled label="Spotify" optional={t("eventForm.optional")} error={errorText(p + "spotify")}>
              <Input
                value={a.spotify}
                onChangeText={(spotify) => set(a.key, { spotify })}
                autoCapitalize="none"
                keyboardType="url"
                placeholder="open.spotify.com/artist/…"
                accessibilityLabel={`Spotify ${i + 1}`}
                invalid={!!errorText(p + "spotify")}
                editable={!disabled}
              />
            </Labeled>
            <Labeled label="SoundCloud" optional={t("eventForm.optional")} error={errorText(p + "soundcloud")}>
              <Input
                value={a.soundcloud}
                onChangeText={(soundcloud) => set(a.key, { soundcloud })}
                autoCapitalize="none"
                keyboardType="url"
                placeholder="soundcloud.com/…"
                accessibilityLabel={`SoundCloud ${i + 1}`}
                invalid={!!errorText(p + "soundcloud")}
                editable={!disabled}
              />
            </Labeled>
          </View>
        );
      })}
      {value.length < LINEUP_MAX && (
        <Pressable
          onPress={() => onChange([...value, newArtistDraft()])}
          disabled={disabled}
          accessibilityRole="button"
          className="h-11 flex-row items-center justify-center gap-2 rounded-v2-card border border-dashed border-v2-c10 active:bg-v2-ink2"
        >
          <Icon name="plus" size={16} color={c.c90} />
          <Text className="font-v2-ui-semibold text-[14px] text-v2-c90">{t("eventForm.addArtist")}</Text>
        </Pressable>
      )}
      <FieldError message={errorText("lineup")} />
    </View>
  );
}
