/**
 * Flyer (prototype "cf-flyer"): 4:5 preview with "Change" / remove, or "Add flyer". Picks from
 * the photo library and normalizes to the same 1080×1350 JPEG as v1 and the web
 * (lib/event-image.ts). Uploading happens on save — the form only keeps the local file.
 */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { apiUploadFormData } from "../../../lib/api";
import { flameV2Colors as c } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { processEventImageTo4x5 } from "../../../lib/event-image";
import { Button, Icon } from "../ui";
import { FieldError } from "./ui";

export type FlyerFile = { uri: string; mime: string; ext: string };

export function FlyerPicker({
  value,
  onChange,
  existingUrl,
  onRemoveExisting,
  disabled,
}: {
  value: FlyerFile | null;
  onChange: (v: FlyerFile | null) => void;
  existingUrl?: string | null;
  onRemoveExisting?: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = value?.uri ?? existingUrl ?? null;

  const pick = async () => {
    setError(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError(t("eventForm.flyerPermission"));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 });
      if (result.canceled || !result.assets[0]) return;
      setBusy(true);
      const a = result.assets[0];
      const out = await processEventImageTo4x5({ uri: a.uri, width: a.width, height: a.height, fileName: a.fileName, mimeType: a.mimeType });
      onChange({ uri: out.uri, mime: out.mime, ext: out.ext });
    } catch {
      setError(t("eventForm.flyerFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="items-center">
      {shown ? (
        <View style={{ width: 200, aspectRatio: 4 / 5 }} className="overflow-hidden rounded-v2-card bg-v2-ink2">
          <Image source={{ uri: shown }} style={{ width: "100%", height: "100%" }} contentFit="cover" accessibilityIgnoresInvertColors />
          <View className="absolute bottom-2 left-2 right-2 flex-row justify-between">
            <Button small variant="primary" icon="refresh" label={t("eventForm.flyerChange")} disabled={disabled || busy} onPress={() => void pick()} />
            <Pressable
              onPress={() => (value ? onChange(null) : onRemoveExisting?.())}
              disabled={disabled || busy}
              accessibilityRole="button"
              accessibilityLabel={t("eventForm.flyerRemove")}
              className="h-9 w-9 items-center justify-center rounded-full bg-black/60"
            >
              <Icon name="trash" size={16} color={c.cream} />
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => void pick()}
          disabled={disabled || busy}
          accessibilityRole="button"
          accessibilityLabel={t("eventForm.flyerAdd")}
          style={{ width: 200, aspectRatio: 4 / 5 }}
          className="items-center justify-center gap-2 rounded-v2-card border border-dashed border-v2-c30 bg-v2-ink2 px-4 active:bg-v2-ink3"
        >
          <Icon name="plus" size={26} color={c.c70} />
          <Text className="font-v2-ui-semibold text-[14px] text-v2-cream">{busy ? "…" : t("eventForm.flyerAdd")}</Text>
          <Text className="text-center font-v2-ui text-[12px] text-v2-c50">{t("eventForm.flyerHintApp")}</Text>
        </Pressable>
      )}
      <FieldError message={error} />
    </View>
  );
}

/** FormData body for POST /api/upload-image (same fields as v1 and the web). */
export function flyerFormData(file: FlyerFile, event: { id: string; slug: string }): FormData {
  const body = new FormData();
  body.append("file", { uri: file.uri, name: `flyer.${file.ext}`, type: file.mime } as unknown as Blob);
  body.append("eventId", event.id);
  body.append("eventSlug", event.slug);
  return body;
}

/**
 * POST /api/upload-image for a picked flyer → its public URL. Kevin (10-26) got "Network request
 * failed" changing a flyer: log what was about to be sent (does the file still exist? size?)
 * and retry once on a pure network failure (status 0), which is safe — the upload only stores
 * a new file.
 */
export async function uploadFlyer(
  file: FlyerFile,
  event: { id: string; slug: string },
  getToken: Parameters<typeof apiUploadFormData>[2],
): Promise<string | null> {
  let info: { exists: boolean; size?: number } | null = null;
  try {
    info = (await FileSystem.getInfoAsync(file.uri)) as { exists: boolean; size?: number };
  } catch {
    info = null;
  }
  if (info && !info.exists) {
    console.warn("[flyer] the picked image is no longer on the device", { uri: file.uri });
    return null;
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await apiUploadFormData<{ url?: string }>("/api/upload-image", flyerFormData(file, event), getToken);
      return res.url ?? null;
    } catch (e) {
      const status = (e as { status?: number }).status;
      console.warn("[flyer] upload failed", { attempt, status, uri: file.uri, bytes: info?.size, message: (e as Error).message });
      if (status !== 0 || attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  return null;
}
