/**
 * Flame 2.0 building blocks for the app (same look as apps/web/app/v2/components): icons, avatars,
 * flyers, skeletons, badges, KPI, error box. v2 tokens only (bg-v2-*, font-v2-*); don't mix with v1.
 */
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { flameV2Colors as c } from "@project-flame/lib";
import { useI18n } from "../../lib/i18n";

const ICONS = {
  cal: "calendar-outline",
  rsvp: "mail-open-outline",
  users: "people-outline",
  bank: "card-outline",
  settings: "settings-outline",
  plus: "add",
  search: "search",
  menu: "menu",
  close: "close",
  back: "chevron-back",
  down: "chevron-down",
  chev: "chevron-forward",
  ticket: "ticket-outline",
  user: "person-outline",
  compass: "compass-outline",
  alert: "alert-circle-outline",
  download: "download-outline",
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, color = c.c70 }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={ICONS[name]} size={size} color={color} />;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** Organization logo, or its initials on the accent color. */
export function OrgAvatar({ name, logoUrl, size }: { name: string; logoUrl: string | null; size: number }) {
  const radius = Math.round(size * 0.22);
  if (logoUrl) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: c.paper }}
        contentFit="cover"
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: c.accent }} className="items-center justify-center">
      <Text style={{ fontSize: Math.max(11, size * 0.32) }} className="font-v2-ui-bold text-v2-cream">
        {initials(name)}
      </Text>
    </View>
  );
}

/** Event flyer thumbnail (square). */
export function Flyer({ src, size, radius = 10 }: { src: string | null | undefined; size: number; radius?: number }) {
  return src ? (
    <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: radius, backgroundColor: c.ink3 }} contentFit="cover" />
  ) : (
    <View style={{ width: size, height: size, borderRadius: radius }} className="items-center justify-center bg-v2-ink3">
      <Icon name="cal" size={size * 0.4} color={c.c30} />
    </View>
  );
}

export function Skeleton({ width, height, radius = 6 }: { width: number | `${number}%`; height: number; radius?: number }) {
  return <View style={{ width, height, borderRadius: radius }} className="bg-v2-ink3" />;
}

/** Red count bubble (menu badges). */
export function Badge({ n }: { n: number }) {
  return (
    <View className="min-w-[18px] items-center rounded-v2-pill bg-v2-dot px-1.5 py-[1px]">
      <Text className="font-v2-ui-bold text-[11px] text-v2-cream">{n > 99 ? "99+" : n}</Text>
    </View>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "flame" | "good" | "warn" }) {
  const bg = { neutral: "bg-v2-ink3", flame: "bg-v2-flame", good: "bg-v2-ink3", warn: "bg-v2-ink3" }[tone];
  const fg = { neutral: "text-v2-c70", flame: "text-v2-cream", good: "text-v2-good", warn: "text-v2-warn" }[tone];
  return (
    <View className={`rounded-v2-pill px-2.5 py-1 ${bg}`}>
      <Text className={`font-v2-ui-medium text-[12px] ${fg}`}>{children}</Text>
    </View>
  );
}

export function Kpi({ label, loading, children }: { label: string; loading: boolean; children: ReactNode }) {
  return (
    <View className="gap-1">
      <Text className="font-v2-ui-medium text-[12px] uppercase tracking-[0.5px] text-v2-c50">{label}</Text>
      {loading ? <Skeleton width={72} height={26} /> : <View>{children}</View>}
    </View>
  );
}

export function ErrorBox({ message, onRetry, retryLabel }: { message?: string; onRetry: () => void; retryLabel?: string }) {
  const { t } = useI18n();
  return (
    <View className="items-center gap-3 rounded-v2-card bg-v2-ink2 px-4 py-8">
      <Icon name="alert" size={24} color={c.errorText} />
      <Text className="text-center font-v2-ui text-[14px] text-v2-c70">{message ?? t("errors.generic")}</Text>
      <Pressable onPress={onRetry} accessibilityRole="button" className="h-10 justify-center rounded-v2-pill bg-v2-ink3 px-5 active:bg-v2-ink4">
        <Text className="font-v2-ui-semibold text-[14px] text-v2-cream">{retryLabel ?? t("common.retry")}</Text>
      </Pressable>
    </View>
  );
}

export function Spinner() {
  return (
    <View className="flex-1 items-center justify-center bg-v2-ink">
      <ActivityIndicator color={c.cream} />
    </View>
  );
}
