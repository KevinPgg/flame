/**
 * Organizer frame for the app — phone design of the prototype (ow-layout on a phone), not the web
 * sidebar: top bar (back · title, with an organization switcher on the dashboard · actions · you)
 * and a floating bottom bar Events · RSVPs · Scan · Manage. Every organization-wide tool lives in
 * Manage (prototype: "one hub instead of a growing tab bar"). Full-screen forms hide the bottom
 * bar (`hideTabbar`) and bring their own action bar.
 */
import { useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { canAccessOrgSettings, canManageAssignedEvents, flameV2Colors as c } from "@project-flame/lib";
import { useI18n } from "../../lib/i18n";
import { routes } from "../../lib/v2/routes";
import type { MyOrganization } from "../../lib/v2/organizer-api";
import { SCANNING_SUPPORTED } from "../../lib/scanner-platform";
import { useMyOrganizations } from "../../hooks/v2/useOrganizerModel";
import { useMe } from "../../hooks/v2/useMe";
import { useStripeConnect } from "../../hooks/useStripeConnect";
import { canManagePayouts } from "@project-flame/lib";
import { Badge, Icon, OrgAvatar, type IconName } from "./ui";

export type Section = "events" | "rsvps" | "scan" | "manage";

/** Height the floating bottom bar takes; scroll content adds it so nothing hides behind the bar. */
export const TABBAR_SPACE = 64 + 16 + 16;

type TabItem = { key: Section; icon: IconName; label: string; href: string; badge?: number };

export function useTabItems(organization: MyOrganization, pending: number): TabItem[] {
  const { t } = useI18n();
  const role = organization.role;
  return [
    { key: "events", icon: "cal", label: t("tabs.events"), href: routes.dashboard(organization) },
    { key: "rsvps", icon: "ticket", label: t("tabs.rsvps"), href: routes.rsvps(organization), badge: pending },
    ...(SCANNING_SUPPORTED && canManageAssignedEvents(role)
      ? [{ key: "scan" as const, icon: "qr" as const, label: t("tabs.scan"), href: routes.scan(organization) }]
      : []),
    ...(canAccessOrgSettings(role)
      ? [{ key: "manage" as const, icon: "grid" as const, label: t("tabs.manage"), href: routes.manage(organization) }]
      : []),
  ];
}

export function OrganizerShell({
  organization,
  pending,
  section = "events",
  title,
  onBack,
  switcher = false,
  actions,
  hideTabbar = false,
  children,
}: {
  organization: MyOrganization;
  pending: number;
  section?: Section;
  title: string;
  onBack?: () => void;
  /** Dashboard: the title opens the organization switcher. */
  switcher?: boolean;
  actions?: ReactNode;
  hideTabbar?: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const tabs = useTabItems(organization, pending);

  return (
    <View className="flex-1 bg-v2-ink">
      <View style={{ paddingTop: insets.top }} className="border-b border-[#141414] bg-v2-ink">
        <View className="h-14 flex-row items-center gap-1 px-2">
          {onBack && (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={t("common.back")}
              hitSlop={6}
              className="h-10 w-10 items-center justify-center rounded-v2-sm active:bg-v2-c10"
            >
              <Icon name="back" size={22} color={c.cream} />
            </Pressable>
          )}
          {switcher ? (
            <Pressable
              onPress={() => setSwitching(true)}
              accessibilityRole="button"
              accessibilityLabel={t("organizer.switchOrganizer")}
              className="min-w-0 flex-1 flex-row items-center gap-1.5 px-1"
            >
              <Text numberOfLines={1} accessibilityRole="header" className="shrink font-v2-display-bold text-[18px] tracking-[-0.5px] text-v2-cream">
                {title}
              </Text>
              <Icon name="down" size={18} color={c.c50} />
            </Pressable>
          ) : (
            <Text numberOfLines={1} accessibilityRole="header" className="min-w-0 flex-1 px-1 font-v2-display-bold text-[18px] tracking-[-0.5px] text-v2-cream">
              {title}
            </Text>
          )}
          <View className="flex-row items-center gap-2 pr-1">
            {actions}
            <MeButton onPress={() => router.push(routes.myOrganizers() as Href)} />
          </View>
        </View>
      </View>

      <View className="flex-1">{children}</View>

      {!hideTabbar && (
        <View
          style={{ bottom: Math.max(insets.bottom, 12) }}
          className="absolute left-4 right-4 h-16 flex-row items-center justify-evenly rounded-v2-pill border border-white/10 bg-[rgba(18,18,18,0.94)]"
          accessibilityRole="tablist"
        >
          {tabs.map((item) => {
            const on = item.key === section;
            return (
              <Pressable
                key={item.key}
                onPress={() => !on && router.push(item.href as Href)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={item.label}
                className="min-w-[60px] items-center gap-[3px]"
              >
                <Icon name={item.icon} size={22} color={on ? c.cream : c.c50} />
                <Text className={`font-v2-ui-medium text-[10.5px] ${on ? "text-v2-cream" : "text-v2-c50"}`}>{item.label}</Text>
                {item.badge ? (
                  <View className="absolute -top-1.5 right-2">
                    <Badge n={item.badge} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {switcher && <OrgSwitcherSheet visible={switching} current={organization} onClose={() => setSwitching(false)} />}
    </View>
  );
}

/** "You" — back to the attendee side (profile, where My organizers lives). */
function MeButton({ onPress }: { onPress: () => void }) {
  const { t } = useI18n();
  const me = useMe();
  const initials =
    (me?.name ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={t("organizer.attendeeApp")} hitSlop={4}>
      <View style={{ width: 34, height: 34, borderRadius: 8 }} className="items-center justify-center overflow-hidden bg-v2-accent">
        {me?.imageUrl ? (
          <Image source={{ uri: me.imageUrl }} style={{ width: 34, height: 34 }} contentFit="cover" />
        ) : (
          <Text className="font-v2-ui-bold text-[12px] text-v2-cream">{initials}</Text>
        )}
      </View>
    </Pressable>
  );
}

/** Bottom sheet: the person's other approved organizations + My organizers. */
function OrgSwitcherSheet({ visible, current, onClose }: { visible: boolean; current: MyOrganization; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data } = useMyOrganizations();
  const orgs = (data?.organizations ?? []).filter((o) => o.approved);
  const go = (href: string) => {
    onClose();
    router.push(href as Href);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable className="flex-1 bg-black/60" onPress={onClose} accessibilityLabel={t("common.close")} />
      <View style={{ paddingBottom: insets.bottom + 12 }} className="max-h-[70%] rounded-t-v2-sheet bg-v2-ink2 px-3 pt-3">
        <View className="mb-2 h-1 w-10 self-center rounded-full bg-v2-c30" />
        <Text className="px-2 pb-2 pt-1 font-v2-ui-semibold text-[12px] uppercase tracking-[1px] text-v2-c50">{t("organizer.switchOrganizer")}</Text>
        <ScrollView>
          {orgs.map((o) => {
            const on = o.id === current.id;
            return (
              <Pressable
                key={o.id}
                onPress={() => (on ? onClose() : go(routes.dashboard(o)))}
                accessibilityState={{ selected: on }}
                className={`flex-row items-center gap-3 rounded-v2-md p-2.5 ${on ? "bg-v2-c10" : "active:bg-v2-c06"}`}
              >
                <OrgAvatar name={o.name} logoUrl={o.logo_url} size={40} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-v2-ui-semibold text-[15px] text-v2-cream">{o.name}</Text>
                  <Text className="font-v2-ui text-[12.5px] text-v2-c50">{t(`organizer.roles.${o.role}`)}</Text>
                </View>
                {on && <Icon name="check" size={18} color={c.cream} />}
              </Pressable>
            );
          })}
          <Pressable onPress={() => go(routes.myOrganizers())} className="mt-1 flex-row items-center gap-3 rounded-v2-md p-2.5 active:bg-v2-c06">
            <View style={{ width: 40, height: 40 }} className="items-center justify-center rounded-v2-sm border border-dashed border-v2-c30">
              <Icon name="users" size={18} />
            </View>
            <Text className="font-v2-ui-medium text-[15px] text-v2-c90">{t("organizer.myOrganizers")}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Stripe state for owner/admin (same rule as the web StripeBadge): true ready, false unfinished, null n/a. */
export function useStripeReady(organization: MyOrganization) {
  const enabled = canManagePayouts(organization.role);
  const { status, isLoading } = useStripeConnect(enabled ? organization.id : undefined);
  if (!enabled || isLoading || !status) return null;
  return status.connected && status.chargesEnabled && status.payoutsEnabled;
}
