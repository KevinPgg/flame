/**
 * "Have an access code?" (Kevin 2026-10-27, prototype): below the tiers, a link that opens a
 * sheet to type the code; Unlock runs the event screen's existing unlock (POST
 * /api/ticket-tiers/unlock) and the sheet closes once it's accepted. When a code is applied the
 * link becomes a chip with Remove. The promoter code moved to the checkout sheet, which already
 * had it (with the discount code).
 */
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { flameV2Colors as c } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { Sheet } from "../../Sheet";
import { Button, Icon } from "../../ui";

type Status = "idle" | "validating" | "valid" | "invalid";

export function AccessCode({
  value,
  status,
  error,
  onChange,
  onUnlock,
  onClear,
}: {
  value: string;
  status: Status;
  error: string | null;
  onChange: (v: string) => void;
  onUnlock: (v: string) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open && status === "valid") setOpen(false);
  }, [open, status]);

  return (
    <View className="px-4">
      {status === "valid" ? (
        <View style={{ backgroundColor: "rgba(76,215,135,0.1)" }} className="flex-row items-center gap-2 self-start rounded-v2-pill px-3 py-1.5">
          <Icon name="check" size={14} color={c.good} />
          <Text style={{ color: c.good }} className="font-v2-ui-semibold text-[13px]">
            {t("accessCode.applied", { code: value.trim().toUpperCase() })}
          </Text>
          <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel={t("accessCode.remove")} hitSlop={8}>
            <Icon name="close" size={14} color={c.good} />
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={t("event.haveAccessCode")} className="flex-row items-center gap-2 self-start py-1 active:opacity-70">
          <Icon name="lock" size={16} color={c.cream} />
          <Text className="font-v2-ui-semibold text-[14px] text-v2-cream">{t("event.haveAccessCode")}</Text>
        </Pressable>
      )}
      <Sheet open={open} title={t("accessCode.title")} subtitle={t("accessCode.lead")} onClose={() => setOpen(false)}>
        <View className="flex-row items-center gap-2 pb-2">
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder={t("accessCode.placeholder")}
            placeholderTextColor={c.c50}
            accessibilityLabel={t("accessCode.title")}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={() => value.trim() && onUnlock(value)}
            className="h-12 flex-1 rounded-[14px] bg-v2-ink3 px-4 font-v2-ui text-[15px] text-v2-cream"
          />
          <Button variant="primary" label={status === "validating" ? "…" : t("accessCode.unlock")} disabled={!value.trim() || status === "validating"} onPress={() => onUnlock(value)} />
        </View>
        {status === "invalid" && error ? <Text style={{ color: c.errorText }} className="pb-2 font-v2-ui text-[12.5px]">{error}</Text> : null}
      </Sheet>
    </View>
  );
}
