/**
 * Organizer frame for the app (phone view of the prototype "ow-layout", same as the web v2 on a
 * phone): top bar with menu / back / title, a side menu (drawer) and a floating bottom bar. Menu
 * entries are filtered by role with the same permissions as the web. Full-screen forms hide the
 * bottom bar (`hideTabbar`) and bring their own action bar.
 */
import { useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  canAccessOrgSettings,
  canCreateEvents,
  canManageMembers,
  canManagePayouts,
  flameV2Colors as c,
  formatEventDateTime,
} from "@project-flame/lib";
import { useI18n } from "../../lib/i18n";
import { routes } from "../../lib/v2/routes";
import type { MyOrganization } from "../../lib/v2/organizer-api";
import type { EnrichedOrgEvent } from "../../hooks/useOrgEventEnriched";
import { useMyOrganizations } from "../../hooks/v2/useOrganizerModel";
import { useStripeConnect } from "../../hooks/useStripeConnect";
import { FlameLogo } from "../FlameLogo";
import { Badge, Flyer, Icon, OrgAvatar, type IconName } from "./ui";

export type Section = "events" | "rsvps" | "team" | "payouts" | "settings";

/** Height the floating bottom bar takes; scroll content adds it so nothing hides behind the bar. */
export const TABBAR_SPACE = 64 + 16 + 16;

type NavItem = { key: Section; icon: IconName; label: string; href: string; badge?: number };

export function useNavItems(organization: MyOrganization, pending: number): NavItem[] {
  const { t } = useI18n();
  const role = organization.role;
  return [
    { key: "events", icon: "cal", label: t("tabs.events"), href: routes.dashboard(organization) },
    { key: "rsvps", icon: "rsvp", label: t("tabs.rsvps"), href: routes.rsvps(organization), badge: pending },
    ...(canManageMembers(role) ? [{ key: "team" as const, icon: "users" as const, label: t("tabs.team"), href: routes.team(organization) }] : []),
    ...(canManagePayouts(role) ? [{ key: "payouts" as const, icon: "bank" as const, label: t("tabs.payouts"), href: routes.payouts(organization) }] : []),
    ...(canAccessOrgSettings(role)
      ? [{ key: "settings" as const, icon: "settings" as const, label: t("tabs.settings"), href: routes.settings(organization) }]
      : []),
  ];
}

export function OrganizerShell({
  organization,
  pending,
  currentEvents,
  pastEvents = [],
  activeEventId,
  section = "events",
  title,
  onBack,
  hideTabbar = false,
  children,
}: {
  organization: MyOrganization;
  pending: number;
  currentEvents: EnrichedOrgEvent[];
  pastEvents?: EnrichedOrgEvent[];
  /** Event open on screen: highlighted in the menu. */
  activeEventId?: string;
  section?: Section;
  title: string;
  onBack?: () => void;
  hideTabbar?: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const nav = useNavItems(organization, pending);
  // Bottom bar: same entries as the menu, like the web v2 on a phone.
  const bar = nav;
  const go = (href: string) => {
    setDrawer(false);
    router.push(href as Href);
  };

  return (
    <View className="flex-1 bg-v2-ink">
      <View style={{ paddingTop: insets.top }} className="border-b border-[#141414] bg-v2-ink">
        <View className="h-14 flex-row items-center gap-1 px-2">
          <Pressable
            onPress={() => setDrawer(true)}
            accessibilityRole="button"
            accessibilityLabel={t("organizer.menu")}
            hitSlop={6}
            className="h-10 w-10 items-center justify-center rounded-v2-sm active:bg-v2-c10"
          >
            <Icon name="menu" size={22} />
          </Pressable>
          {onBack && (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={t("common.back")}
              hitSlop={6}
              className="h-10 w-10 items-center justify-center rounded-v2-sm active:bg-v2-c10"
            >
              <Icon name="back" size={20} />
            </Pressable>
          )}
          <Text numberOfLines={1} accessibilityRole="header" className="flex-1 px-1 font-v2-display-bold text-[18px] tracking-[-0.5px] text-v2-cream">
            {title}
          </Text>
        </View>
      </View>

      <View className="flex-1">{children}</View>

      {!hideTabbar && (
        <View
          style={{ bottom: Math.max(insets.bottom, 12) }}
          className="absolute left-4 right-4 h-16 flex-row items-center justify-evenly rounded-v2-pill border border-white/10 bg-[rgba(18,18,18,0.94)]"
          accessibilityRole="tablist"
        >
          {bar.map((item) => {
            const on = item.key === section;
            return (
              <Pressable
                key={item.key}
                onPress={() => !on && go(item.href)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={item.label}
                className="min-w-[56px] items-center gap-[3px]"
              >
                <Icon name={item.icon} size={22} color={on ? c.cream : c.c50} />
                <Text className={`font-v2-ui-medium text-[10.5px] ${on ? "text-v2-cream" : "text-v2-c50"}`}>{item.label}</Text>
                {item.badge ? (
                  <View className="absolute -top-1.5 right-1">
                    <Badge n={item.badge} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      <Modal visible={drawer} transparent animationType="fade" onRequestClose={() => setDrawer(false)} statusBarTranslucent>
        <View className="flex-1 flex-row">
          <View style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }} className="w-[290px] border-r border-[#161616] bg-[#050505]">
            <ScrollView contentContainerStyle={{ paddingHorizontal: 14, gap: 12 }}>
              <View className="flex-row items-center justify-between px-1">
                <Pressable onPress={() => go(routes.myOrganizers())} accessibilityLabel={t("organizer.myOrganizers")}>
                  <FlameLogo width={94} height={18} color={c.cream} />
                </Pressable>
                <Pressable
                  onPress={() => setDrawer(false)}
                  accessibilityRole="button"
                  accessibilityLabel={t("organizer.closeMenu")}
                  className="h-9 w-9 items-center justify-center rounded-v2-sm active:bg-v2-c10"
                >
                  <Icon name="close" size={20} />
                </Pressable>
              </View>

              <OrgSwitcher current={organization} onGo={go} />
              {canManagePayouts(organization.role) && <StripeLine organization={organization} onGo={go} />}

              <View className="gap-0.5">
                {nav.map((item) => {
                  const on = item.key === section;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => go(item.href)}
                      accessibilityRole="link"
                      accessibilityState={{ selected: on }}
                      className={`flex-row items-center gap-2.5 rounded-v2-sm px-2.5 py-[10px] ${on ? "bg-v2-c10" : "active:bg-v2-c06"}`}
                    >
                      <Icon name={item.icon} size={18} color={on ? c.cream : c.c70} />
                      <Text className={`flex-1 font-v2-ui-medium text-[14px] ${on ? "text-v2-cream" : "text-v2-c70"}`}>{item.label}</Text>
                      {item.badge ? <Badge n={item.badge} /> : null}
                    </Pressable>
                  );
                })}
              </View>

              {canCreateEvents(organization.role) && (
                <Pressable
                  onPress={() => go(routes.createEvent(organization))}
                  accessibilityRole="button"
                  className="h-11 flex-row items-center justify-center gap-2 rounded-v2-pill bg-v2-cream active:bg-v2-paper"
                >
                  <Icon name="plus" size={18} color={c.ink} />
                  <Text className="font-v2-ui-semibold text-[14px] text-v2-ink">{t("organizer.createEvent")}</Text>
                </Pressable>
              )}

              <EventLinks label={t("organizer.upcoming")} events={currentEvents.slice(0, 12)} activeId={activeEventId} organization={organization} onGo={go} />
              {pastEvents.length > 0 && (
                <EventLinks label={t("organizer.past")} events={pastEvents.slice(0, 3)} activeId={activeEventId} organization={organization} onGo={go} />
              )}

              <View className="mt-2 gap-0.5 border-t border-v2-c10 pt-3">
                {(
                  [
                    ["compass", t("organizer.discover"), routes.discover()],
                    ["ticket", t("organizer.myTickets"), routes.myTickets()],
                    ["user", t("organizer.myAccount"), routes.account()],
                  ] as const
                ).map(([icon, label, href]) => (
                  <Pressable key={href} onPress={() => go(href)} accessibilityRole="link" className="flex-row items-center gap-2.5 rounded-v2-sm px-2.5 py-[10px] active:bg-v2-c06">
                    <Icon name={icon} size={18} />
                    <Text className="font-v2-ui-medium text-[14px] text-v2-c70">{label}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
          <Pressable className="flex-1 bg-black/60" onPress={() => setDrawer(false)} accessibilityLabel={t("organizer.closeMenu")} />
        </View>
      </Modal>
    </View>
  );
}

function EventLinks({
  label,
  events,
  activeId,
  organization,
  onGo,
}: {
  label: string;
  events: EnrichedOrgEvent[];
  activeId?: string;
  organization: MyOrganization;
  onGo: (href: string) => void;
}) {
  const { locale } = useI18n();
  if (events.length === 0) return null;
  return (
    <View className="gap-0.5">
      <Text className="px-2 pb-1 pt-1.5 font-v2-ui-semibold text-[11px] uppercase tracking-[1px] text-v2-c50">{label}</Text>
      {events.map((e) => (
        <Pressable
          key={e.id}
          onPress={() => onGo(routes.event(e.id, organization))}
          accessibilityState={{ selected: e.id === activeId }}
          className={`flex-row items-center gap-2.5 rounded-v2-sm px-2 py-1.5 ${
            e.id === activeId ? "border border-v2-c16 border-l-[3px] border-l-v2-flame bg-v2-c10" : "active:bg-v2-c06"
          }`}
        >
          <Flyer src={e.image_url} size={30} radius={6} />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="font-v2-ui-semibold text-[12.5px] text-v2-cream">{e.name}</Text>
            <Text numberOfLines={1} className="font-v2-ui text-[11px] text-v2-c50">
              {formatEventDateTime(e.starts_at, e.timezone, locale).date}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function OrgSwitcher({ current, onGo }: { current: MyOrganization; onGo: (href: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { data } = useMyOrganizations();
  const others = (data?.organizations ?? []).filter((o) => o.approved && o.id !== current.id);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={t("organizer.switchOrganizer")}
        accessibilityState={{ expanded: open }}
        className="flex-row items-center gap-2.5 rounded-v2-lg border border-v2-c10 bg-v2-c06 p-2"
      >
        <OrgAvatar name={current.name} logoUrl={current.logo_url} size={34} />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-v2-ui-semibold text-[14px] text-v2-cream">{current.name}</Text>
          <Text className="font-v2-ui text-[12px] text-v2-c50">{t(`organizer.roles.${current.role}`)}</Text>
        </View>
        <Icon name="down" size={16} color={c.c50} />
      </Pressable>
      {open && (
        <View className="mt-1 rounded-v2-card border border-v2-c10 bg-v2-ink2 p-1">
          {others.map((o) => (
            <Pressable key={o.id} onPress={() => onGo(routes.dashboard(o))} className="flex-row items-center gap-2.5 rounded-v2-sm p-2 active:bg-v2-c06">
              <OrgAvatar name={o.name} logoUrl={o.logo_url} size={28} />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-v2-ui-semibold text-[13px] text-v2-cream">{o.name}</Text>
                <Text className="font-v2-ui text-[11.5px] text-v2-c50">{t(`organizer.roles.${o.role}`)}</Text>
              </View>
            </Pressable>
          ))}
          <Pressable onPress={() => onGo(routes.myOrganizers())} className="flex-row items-center gap-2.5 rounded-v2-sm p-2 active:bg-v2-c06">
            <Icon name="users" size={18} />
            <Text className="font-v2-ui-medium text-[13px] text-v2-c70">{t("organizer.myOrganizers")}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** "Stripe connected" / "Finish Stripe setup" (owner/admin), same rule as the web StripeBadge. */
export function useStripeReady(organization: MyOrganization) {
  const enabled = canManagePayouts(organization.role);
  const { status, isLoading } = useStripeConnect(enabled ? organization.id : undefined);
  if (!enabled || isLoading || !status) return null;
  return status.connected && status.chargesEnabled && status.payoutsEnabled;
}

function StripeLine({ organization, onGo }: { organization: MyOrganization; onGo: (href: string) => void }) {
  const { t } = useI18n();
  const ready = useStripeReady(organization);
  if (ready === null) return null;
  return ready ? (
    <View className="flex-row items-center gap-2 px-2.5">
      <View className="h-2 w-2 rounded-full bg-v2-good" />
      <Text className="font-v2-ui text-[12.5px] text-v2-c70">{t("organizer.stripeConnected")}</Text>
    </View>
  ) : (
    <Pressable onPress={() => onGo(routes.payouts(organization))} className="flex-row items-center gap-2 px-2.5">
      <View className="h-2 w-2 rounded-full bg-v2-warn" />
      <Text className="font-v2-ui-medium text-[12.5px] text-v2-warn">{t("organizer.stripeIncomplete")}</Text>
    </Pressable>
  );
}
