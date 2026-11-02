/**
 * Line-up in create / edit event, app (fase 4.3) — same model as the web (packages/lib lineup):
 * one card per artist with name and optional Instagram / Spotify / SoundCloud; empty cards are
 * ignored on save. Errors from validateLineup (paths `lineup.<key>.<field>`).
 * Photo (2026-11-02): thumbnail with a pencil; the pencil opens a sheet with Spotify / SoundCloud
 * (from the links below), Instagram (disabled: not readable), upload (square crop), remove.
 */
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import {
  artistInitials,
  flameV2Colors as c,
  LINEUP_MAX,
  moveItem,
  newArtistDraft,
  normalizeSoundcloud,
  normalizeSpotify,
  type ArtistDraft,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiClient, apiUploadFormData } from "../../../lib/api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { apiErrorText } from "../../../lib/v2/organizer-api";
import { Sheet } from "../Sheet";
import { Icon } from "../ui";
import { FieldError, Input, Labeled } from "./ui";

function ArtistPhoto({
  artist,
  organizationId,
  disabled,
  onPhoto,
}: {
  artist: ArtistDraft;
  organizationId: string;
  disabled?: boolean;
  onPhoto: (url: string) => void;
}) {
  const { t } = useI18n();
  const { getToken } = useOptionalAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spotify = normalizeSpotify(artist.spotify);
  const soundcloud = normalizeSoundcloud(artist.soundcloud);
  const okSpotify = !!spotify && spotify !== "invalid";
  const okSoundcloud = !!soundcloud && soundcloud !== "invalid";
  const who = artist.name || t("eventForm.lineupArtist");

  const run = async (req: () => Promise<{ photo_url?: string } | null>) => {
    setOpen(false);
    setBusy(true);
    setError(null);
    try {
      const res = await req();
      if (res?.photo_url) onPhoto(res.photo_url);
    } catch (e) {
      setError(apiErrorText(e, t("eventForm.photoError")));
    } finally {
      setBusy(false);
    }
  };
  const fromSource = (source: "spotify" | "soundcloud", url: string) =>
    run(() =>
      apiClient<{ photo_url: string }>("/api/organizer/lineup-photo", {
        method: "POST",
        body: JSON.stringify({ organizationId, source, url }),
        getToken,
      })
    );
  const upload = () =>
    run(async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return null;
      const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      const asset = pick.canceled ? null : pick.assets?.[0];
      if (!asset) return null;
      const body = new FormData();
      body.append("organizationId", organizationId);
      body.append("file", { uri: asset.uri, name: "artist.jpg", type: asset.mimeType ?? "image/jpeg" } as unknown as Blob);
      return apiUploadFormData<{ photo_url: string }>("/api/organizer/lineup-photo", body, getToken);
    });

  const option = (label: string, onPress: () => void, enabled = true, danger = false) => (
    <Pressable
      key={label}
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      className={`h-12 justify-center rounded-v2-md px-3 active:bg-v2-ink3 ${enabled ? "" : "opacity-40"}`}
    >
      <Text className={`font-v2-ui-medium text-[15px] ${danger ? "text-v2-errorText" : "text-v2-cream"}`}>{label}</Text>
    </Pressable>
  );

  return (
    <View>
      <View style={{ width: 44, height: 44, borderRadius: 10, overflow: "hidden", backgroundColor: c.ink3 }} className="items-center justify-center">
        {busy ? (
          <ActivityIndicator color={c.c70} />
        ) : artist.photo ? (
          <Image source={{ uri: artist.photo }} style={{ width: 44, height: 44 }} contentFit="cover" />
        ) : (
          <Text className="font-v2-display-bold text-[14px] text-v2-c70">{artist.name.trim() ? artistInitials(artist.name) : "?"}</Text>
        )}
      </View>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled || busy}
        accessibilityRole="button"
        accessibilityLabel={t("eventForm.photoEdit", { name: who })}
        hitSlop={8}
        style={{ position: "absolute", right: -6, bottom: -6, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.ink2, backgroundColor: c.cream }}
        className="items-center justify-center"
      >
        <Icon name="pencil" size={11} color={c.ink} />
      </Pressable>
      <Sheet open={open} title={t("eventForm.photoEdit", { name: who })} onClose={() => setOpen(false)}>
        <View className="gap-1 pb-2">
          {option(t("eventForm.photoFromSpotify"), () => void fromSource("spotify", artist.spotify), okSpotify)}
          {option(t("eventForm.photoFromSoundcloud"), () => void fromSource("soundcloud", artist.soundcloud), okSoundcloud)}
          {option(t("eventForm.photoFromInstagram"), () => {}, false)}
          {option(t("eventForm.photoUpload"), () => void upload())}
          {artist.photo ? option(t("eventForm.photoRemove"), () => (setOpen(false), onPhoto("")), true, true) : null}
          {!okSpotify || !okSoundcloud ? <Text className="px-3 pt-1 font-v2-ui text-[12px] text-v2-c50">{t("eventForm.photoHint")}</Text> : null}
        </View>
      </Sheet>
      {error ? <Text accessibilityRole="alert" className="mt-2 w-[220px] font-v2-ui text-[12px] text-v2-errorText">{error}</Text> : null}
    </View>
  );
}

export function LineupFields({
  value,
  onChange,
  errorText,
  disabled,
  organizationId,
}: {
  value: ArtistDraft[];
  onChange: (next: ArtistDraft[]) => void;
  errorText: (path: string) => string | null;
  disabled?: boolean;
  /** For the artist photos (stored under the organization). */
  organizationId: string;
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
              <View className="mr-2">
                <ArtistPhoto artist={a} organizationId={organizationId} disabled={disabled} onPhoto={(photo) => set(a.key, { photo })} />
              </View>
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
