/**
 * The promoter code (from the link) visible on the event screen before checkout (Kevin
 * 2026-10-28, B10): checked ✓ / checking… / not valid / couldn't check · Retry.
 */
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { flameV2Colors as c } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { Icon } from "../../ui";
import type { PromoterValidationStatus } from "../../../../hooks/useCheckout";

export function PromoterChip({
  code,
  status,
  onRetry,
  onClear,
}: {
  code: string;
  status: PromoterValidationStatus;
  onRetry: () => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const shown = code.trim().toUpperCase();
  if (!shown || status === "idle") return null;
  const pill = "flex-row items-center gap-2 self-start rounded-v2-pill px-3 py-1.5";

  return (
    <View className="px-4" testID="promoter-chip">
      {status === "valid" ? (
        <View style={{ backgroundColor: "rgba(76,215,135,0.1)" }} className={pill}>
          <Icon name="check" size={14} color={c.good} />
          <Text style={{ color: c.good }} className="font-v2-ui-semibold text-[13px]">
            {t("checkout.promoterApplied", { code: shown })}
          </Text>
          <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel={`${t("checkout.remove")} ${shown}`} hitSlop={8}>
            <Icon name="close" size={14} color={c.good} />
          </Pressable>
        </View>
      ) : status === "validating" ? (
        <View className={`${pill} bg-v2-ink3`}>
          <ActivityIndicator size="small" color={c.c70} />
          <Text className="font-v2-ui text-[13px] text-v2-c70">{t("event.promoterChecking", { code: shown })}</Text>
        </View>
      ) : status === "invalid" ? (
        <View style={{ backgroundColor: "rgba(255,138,122,0.1)" }} className={pill}>
          <Icon name="close" size={14} color={c.errorText} />
          <Text style={{ color: c.errorText }} className="flex-shrink font-v2-ui text-[13px]">
            {t("event.promoterInvalid", { code: shown })}
          </Text>
        </View>
      ) : (
        <View className={`${pill} flex-wrap bg-v2-ink3`}>
          <Text className="font-v2-ui text-[13px] text-v2-c70">{t("checkout.promoterCheckFailed")} ·</Text>
          <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel={t("checkout.retry")} hitSlop={8}>
            <Text className="font-v2-ui-semibold text-[13px] text-v2-cream underline">{t("checkout.retry")}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
