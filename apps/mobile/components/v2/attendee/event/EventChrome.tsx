/**
 * Flame 2.0 event screen chrome (Kevin 2026-10-28, prototype `x-top float` + `x-buybar`):
 *  - EventTopBar: back and share always on top while the page scrolls (room on the right for
 *    "save / follow" later).
 *  - BuyBar: replaces the floating "Buy Tickets" pill. It always says where you are:
 *    you have tickets → "You're going · N tickets" + View N tickets; open RSVP request → its
 *    state; a tier picked → "2 × Tier · before fees" + Continue to checkout; nothing yet →
 *    "From $X" + Get tickets / Request to join.
 */
import { Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { flameV2Colors as c } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { Icon, type IconName } from "../../ui";

const circle = { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(28,28,28,0.82)" } as const;

export const EVENT_TOP_BAR_HEIGHT = 56;

export function EventTopBar({ onBack, onShare }: { onBack: () => void; onShare: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}>
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(0,0,0,0.72)", "rgba(0,0,0,0)"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top + EVENT_TOP_BAR_HEIGHT + 18 }}
      />
      <View pointerEvents="box-none" style={{ paddingTop: insets.top + 8 }} className="flex-row items-center justify-between px-4">
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={4} style={circle} className="items-center justify-center">
          <Icon name="back" size={20} color={c.cream} />
        </Pressable>
        <View className="flex-row items-center gap-2">
          <Pressable onPress={onShare} accessibilityRole="button" accessibilityLabel={t("event.shareEvent")} hitSlop={4} style={circle} className="items-center justify-center">
            <Icon name="share" size={19} color={c.cream} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export type BuyBarProps = {
  /** Small line over the big value ("From", "You're going", "2 × GA · before fees"). */
  kicker: string;
  value: string;
  cta: { label: string; onPress?: () => void; icon?: IconName; tone?: "white" | "dark"; disabled?: boolean };
};

export const BUY_BAR_HEIGHT = 76;

export function BuyBar({ kicker, value, cta }: BuyBarProps) {
  const insets = useSafeAreaInsets();
  const white = (cta.tone ?? "white") === "white";
  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        paddingBottom: Math.max(insets.bottom, 12),
        backgroundColor: "rgba(0,0,0,0.92)",
        borderTopWidth: 1,
        borderTopColor: "#161616",
      }}
      className="flex-row items-center gap-3.5 px-4 pt-3.5"
    >
      <View className="min-w-0 flex-shrink">
        <Text numberOfLines={1} className="font-v2-ui text-[12px] text-v2-c50">
          {kicker}
        </Text>
        <Text numberOfLines={1} className="font-v2-display-bold text-[19px] text-v2-cream">
          {value}
        </Text>
      </View>
      <Pressable
        onPress={cta.onPress}
        disabled={cta.disabled || !cta.onPress}
        accessibilityRole="button"
        accessibilityLabel={cta.label}
        accessibilityState={{ disabled: !!cta.disabled || !cta.onPress }}
        style={{ opacity: cta.disabled ? 0.55 : 1 }}
        className={`h-[52px] flex-1 flex-row items-center justify-center gap-2 rounded-v2-pill px-5 ${white ? "bg-v2-cream active:bg-v2-paper" : "bg-v2-ink3"}`}
      >
        {cta.icon ? <Icon name={cta.icon} size={18} color={white ? c.ink : c.c90} /> : null}
        <Text numberOfLines={1} style={{ color: white ? c.ink : c.c90 }} className="font-v2-ui-semibold text-[15.5px]">
          {cta.label}
        </Text>
      </Pressable>
    </View>
  );
}
