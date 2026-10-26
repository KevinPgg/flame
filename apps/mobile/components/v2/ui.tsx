/**
 * Flame 2.0 building blocks for the app (same look as apps/web/app/v2/components): icons, avatars,
 * flyers, skeletons, badges, KPI, error box. v2 tokens only (bg-v2-*, font-v2-*); don't mix with v1.
 */
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from "react-native";
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
  qr: "qr-code-outline",
  grid: "grid-outline",
  check: "checkmark",
  chart: "bar-chart-outline",
  mail: "mail-outline",
  pin: "location-outline",
  copy: "copy-outline",
  trash: "trash-outline",
  send: "paper-plane-outline",
  refresh: "refresh",
  scan: "scan-outline",
  eye: "eye-outline",
  up: "chevron-up",
  clock: "time-outline",
  camera: "camera-outline",
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

type ButtonVariant = "primary" | "ghost" | "soft" | "danger";

/** Pill button (prototype "btn"): primary = white pill, soft = ink-3, ghost = text, danger = red text. */
export function Button({
  label,
  onPress,
  variant = "soft",
  icon,
  disabled,
  small,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  small?: boolean;
  accessibilityLabel?: string;
}) {
  const bg = { primary: "bg-v2-cream active:bg-v2-paper", soft: "bg-v2-ink3 active:bg-v2-ink4", ghost: "active:bg-v2-ink3", danger: "active:bg-v2-ink3" }[variant];
  const fg = { primary: c.ink, soft: c.c90, ghost: c.c70, danger: c.errorText }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      className={`${small ? "h-9 px-3.5" : "h-11 px-5"} flex-row items-center justify-center gap-2 rounded-v2-pill ${bg} ${disabled ? "opacity-50" : ""}`}
    >
      {icon && <Icon name={icon} size={small ? 15 : 17} color={fg} />}
      {label ? (
        <Text style={{ color: fg }} className={`font-v2-ui-semibold ${small ? "text-[13px]" : "text-[14px]"}`}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Text field on ink-3 (prototype "input"). */
export function Field(props: ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor={c.c50}
      autoCorrect={false}
      {...props}
      className={`h-11 rounded-v2-md bg-v2-ink3 px-4 font-v2-ui text-[14px] text-v2-cream ${props.className ?? ""}`}
    />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="alert" className="font-v2-ui text-[13px] text-v2-errorText">
      {children}
    </Text>
  );
}

export function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <View accessibilityRole="alert" className="flex-row items-center gap-2 rounded-v2-card bg-[rgba(76,215,135,0.15)] px-4 py-3">
      <Icon name="check" size={16} color={c.good} />
      <Text className="flex-1 font-v2-ui text-[14px] text-v2-good">{children}</Text>
    </View>
  );
}

/** Confirmation before destructive actions (same contract as the web ConfirmDialog). */
export function ConfirmDialog({
  open,
  message,
  detail,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  detail?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-black/70 px-6">
        <View accessibilityViewIsModal className="w-full max-w-[400px] gap-2 rounded-v2-card border border-v2-c16 bg-v2-ink2 p-5">
          <Text className="font-v2-ui-semibold text-[16px] text-v2-cream">{message}</Text>
          {detail ? <Text className="font-v2-ui text-[13.5px] leading-[19px] text-v2-c70">{detail}</Text> : null}
          <View className="mt-3 flex-row justify-end gap-2">
            <Button label={t("common.cancel")} variant="ghost" onPress={onCancel} disabled={busy} />
            <Button label={confirmLabel ?? t("common.delete")} variant="primary" onPress={onConfirm} disabled={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
