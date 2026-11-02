/**
 * Flame 2.0 attendee top bar (fase 2.1): Flame logo on the left; search, notifications (bell with
 * the unread count) and Settings on the right — the prototype's `x-top` with its round buttons
 * (`x-circle`). Settings stays here until "You" (2.6) carries it, as in the prototype.
 * On Home the logo gives way to the city button (2.2, prototype `x-loc`), which opens the
 * city sheet.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { flameV2Colors as c } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { FlameLogo } from "../../FlameLogo";
import { Icon, type IconName } from "../ui";
import { useOptionalAttendeeCity } from "../../../contexts/AttendeeCityContext";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";

/** Same height as the v1 Header so the v1 screens underneath keep their layout. */
export const ATTENDEE_TOPBAR_HEIGHT = 60;

/**
 * Round button. Layout in plain styles, not classes: on Kevin's Android the unread number
 * (absolute, negative offsets via classes) covered the bell (2026-10-27) — same fixed numbers
 * as the v1 header, which always rendered right.
 */
export const badgeLabel = (n: number) => (n > 99 ? "99+" : String(n));

/**
 * Explicit width by number of characters (2026-11-02): with only minWidth, Android measured the
 * absolute badge before the bold font applied and cut the second digit (21 looked like 2).
 */
export const badgeWidth = (label: string) => (label.length <= 1 ? 18 : label.length === 2 ? 24 : 30);

function Circle({ icon, label, onPress, badge }: { icon: IconName; label: string; onPress: () => void; badge?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={({ pressed }) => [styles.circle, pressed && { opacity: 0.8 }]}>
      <Icon name={icon} size={20} color={c.cream} />
      {badge ? (
        <View style={[styles.badge, { width: badgeWidth(badgeLabel(badge)) }]} pointerEvents="none">
          <Text style={styles.badgeText} className="font-v2-ui-bold" numberOfLines={1}>
            {badgeLabel(badge)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(28,28,28,0.82)",
    overflow: "visible",
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.dot,
    borderWidth: 2,
    borderColor: c.ink,
  },
  badgeText: { color: c.cream, fontSize: 10, lineHeight: 12, includeFontPadding: false, textAlign: "center" },
  // Pin, name and chevron in one row (on Kevin's phone the pin sat above the name, 2026-10-27):
  // the row is its own View in plain styles, the icons in fixed boxes and the text without font
  // padding, so nothing depends on the Pressable's style function or the font's line box.
  cityPill: {
    height: 40,
    justifyContent: "center",
    paddingLeft: 11,
    paddingRight: 12,
    borderRadius: 20,
    backgroundColor: "rgba(28,28,28,0.82)",
  },
  cityRow: { flexDirection: "row", alignItems: "center" },
  cityIcon: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  cityText: { maxWidth: 130, marginHorizontal: 5, fontSize: 14, lineHeight: 18, includeFontPadding: false, textAlignVertical: "center" },
});

export function AttendeeTopBar({ unreadCount = 0, onNotificationPress }: { unreadCount?: number; onNotificationPress?: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const cityCtx = useOptionalAttendeeCity();
  const signedIn = useOptionalAuth().isSignedIn === true;
  const onHome = (pathname === "/" || pathname === "/index") && !!cityCtx;
  const cityName = cityCtx?.city ?? t("common.allCities");
  const bellLabel = unreadCount > 0 ? `${t("inbox.title")}, ${t("inbox.unread", { count: unreadCount })}` : t("inbox.title");
  return (
    <View
      style={{ paddingTop: insets.top, height: insets.top + ATTENDEE_TOPBAR_HEIGHT }}
      className="z-10 flex-row items-center justify-between bg-black px-4"
    >
      {onHome ? (
        <Pressable
          onPress={cityCtx!.openPicker}
          accessibilityRole="button"
          accessibilityLabel={t("home.cityButton", { city: cityName })}
          style={({ pressed }) => [styles.cityPill, pressed && { opacity: 0.8 }]}
        >
          <View style={styles.cityRow}>
            <View style={styles.cityIcon}>
              <Icon name="pin" size={15} color={c.cream} />
            </View>
            <Text numberOfLines={1} style={styles.cityText} className="font-v2-ui-semibold text-v2-cream">
              {cityName}
            </Text>
            <View style={styles.cityIcon}>
              <Icon name="down" size={14} color={c.c70} />
            </View>
          </View>
        </Pressable>
      ) : (
        <Pressable onPress={() => router.replace("/(tabs)" as Href)} accessibilityRole="button" accessibilityLabel={t("tabs.home")} hitSlop={6}>
          <FlameLogo width={85} height={19} />
        </Pressable>
      )}
      <View className="flex-row items-center gap-2">
        <Circle icon="search" label={t("common.search")} onPress={() => router.push("/discover" as Href)} />
        <Circle icon="bell" label={bellLabel} onPress={() => onNotificationPress?.()} badge={unreadCount} />
        {/* Settings moved into "You" (2.6); signed out there's no "You", so it stays here. */}
        {!signedIn ? <Circle icon="settings" label={t("userSettings.title")} onPress={() => router.push("/settings" as Href)} /> : null}
      </View>
    </View>
  );
}
