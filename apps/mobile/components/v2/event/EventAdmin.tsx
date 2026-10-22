/**
 * Flame 2.0 · event management in the app (phone view of apps/web/app/v2/organizer/event/[id]).
 * Same data as the dashboard (organizer-data); one tool per tab. 1b.2a: Tiers, Purchases,
 * Breakdown; the other tabs open the v1 screen until 1b.2b.
 */
import { useMemo, useRef, useEffect } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  canManageAssignedEvents,
  flameV2Colors as c,
  formatCentsAsPrice,
  formatEventDateTime,
  summarizeEventSales,
  type PurchaseRow,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { routes } from "../../../lib/v2/routes";
import type { MyOrganization, OrgEventV2 } from "../../../lib/v2/organizer-api";
import { useOrganizerModel } from "../../../hooks/v2/useOrganizerModel";
import { OrganizerShell, TABBAR_SPACE } from "../OrganizerShell";
import { ErrorBox, Icon, Kpi, Skeleton } from "../ui";
import { TiersTab } from "./TiersTab";
import { PurchasesTab } from "./PurchasesTab";
import { BreakdownTab } from "./BreakdownTab";

export const EVENT_TABS = ["tiers", "purchases", "breakdown", "promoters", "promotions", "send", "scanners"] as const;
export type EventTab = (typeof EVENT_TABS)[number];
/** Tabs already rebuilt in v2 (1b.2a); the rest open the v1 screen. */
const V2_TABS: readonly EventTab[] = ["tiers", "purchases", "breakdown"];

export function EventAdmin({ eventId, organization }: { eventId: string; organization: MyOrganization }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { data, model, loading, failed, refetch, refreshing, invalidate } = useOrganizerModel(organization);

  const requested = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tab: EventTab = (EVENT_TABS as readonly string[]).includes(requested ?? "") ? (requested as EventTab) : "tiers";
  const setTab = (next: EventTab) => router.setParams({ tab: next });

  // Owned events first, then co-hosted (same lookup order as the web).
  const found = useMemo(() => {
    if (!data) return null;
    const owned = data.events?.find((e) => e.id === eventId);
    if (owned) return { event: owned, ownerName: null as string | null };
    const co = data.cohost_events?.find((x) => x.event.id === eventId);
    return co ? { event: co.event, ownerName: co.owner_org_name } : null;
  }, [data, eventId]);

  const event: OrgEventV2 | null = found?.event ?? null;
  const isOwnerOrg = Boolean(event && event.organization_id === organization.id);
  const canEdit = isOwnerOrg && canManageAssignedEvents(organization.role);
  const purchases = (event?.purchases ?? []) as PurchaseRow[];
  const stats = event ? summarizeEventSales({ tiers: event.ticket_tiers ?? [], purchases, pendingRsvps: event.pending_rsvps }) : null;
  const ended = event ? new Date(event.ends_at).getTime() < Date.now() : false;
  const when = event ? formatEventDateTime(event.starts_at, event.timezone, locale) : null;
  const currency = event?.currency ?? "USD";

  // Keep the active tab visible in the horizontal tab bar.
  const tabScroll = useRef<ScrollView>(null);
  const tabX = useRef<Record<string, number>>({});
  useEffect(() => {
    const x = tabX.current[tab];
    if (x !== undefined) tabScroll.current?.scrollTo({ x: Math.max(0, x - 40), animated: true });
  }, [tab]);

  const back = () => (router.canGoBack() ? router.back() : router.replace(routes.dashboard(organization) as Href));

  const shell = (children: React.ReactNode) => (
    <OrganizerShell
      organization={organization}
      pending={model?.pending ?? 0}
      currentEvents={model?.current ?? []}
      pastEvents={model?.past ?? []}
      activeEventId={eventId}
      title={event?.name ?? ""}
      onBack={back}
    >
      {children}
    </OrganizerShell>
  );

  if (failed) return shell(<View className="px-4 pt-6"><ErrorBox onRetry={refetch} /></View>);
  if (!loading && data && !event) {
    return shell(
      <View className="px-4 pt-6">
        <ErrorBox message={t("eventAdmin.notFound")} onRetry={back} retryLabel={t("common.back")} />
      </View>,
    );
  }

  return shell(
    <ScrollView
      stickyHeaderIndices={[1]}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: TABBAR_SPACE + insets.bottom }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={c.cream} />}
    >
      {/* ---------- Header: flyer on its own blurred colors ---------- */}
      <View className="overflow-hidden">
        <View pointerEvents="none" className="absolute inset-0">
          {event?.image_url ? (
            <Image source={{ uri: event.image_url }} style={{ width: "100%", height: "100%", opacity: 0.45 }} blurRadius={50} contentFit="cover" />
          ) : null}
          <LinearGradient colors={["rgba(0,0,0,0.3)", c.ink]} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
        </View>

        <View className="gap-5 px-4 pb-5 pt-5">
          <View className="flex-row gap-4">
            <View style={{ width: 112, aspectRatio: 4 / 5 }} className="overflow-hidden rounded-v2-flyer bg-v2-ink3">
              {event?.image_url ? (
                <Image source={{ uri: event.image_url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              ) : null}
            </View>
            <View className="min-w-0 flex-1 justify-end">
              {event ? (
                <>
                  <View className="mb-2 flex-row flex-wrap items-center gap-2">
                    <StatusPill ended={ended} published={event.status === "published"} />
                    {event.requires_rsvp && (
                      <View className="rounded-v2-xs bg-v2-flame px-1.5 py-0.5">
                        <Text className="font-v2-ui-semibold text-[11px] text-v2-cream">{t("organizer.rsvp")}</Text>
                      </View>
                    )}
                  </View>
                  <Text numberOfLines={3} className="font-v2-display-bold text-[24px] leading-[27px] tracking-[-0.7px] text-v2-cream">
                    {event.name}
                  </Text>
                  <Text className="mt-1.5 font-v2-ui text-[13px] text-v2-c70">
                    {when?.date} · {when?.time}
                    {event.venue || event.city ? ` · ${[event.venue, event.city].filter(Boolean).join(", ")}` : ""}
                  </Text>
                </>
              ) : (
                <View className="gap-2">
                  <Skeleton width={80} height={20} />
                  <Skeleton width="90%" height={26} />
                  <Skeleton width="60%" height={14} />
                </View>
              )}
            </View>
          </View>

          {event && (
            <View className="flex-row flex-wrap gap-2">
              {isOwnerOrg && (
                <ActionPill icon="users" label={t("eventAdmin.cohosts")} onPress={() => router.push(routes.eventV1(event.id, organization) as Href)} />
              )}
              {event.requires_rsvp && (
                <ActionPill
                  icon="rsvp"
                  label={t("rsvps.manage")}
                  count={event.pending_rsvps || undefined}
                  onPress={() => router.push(routes.rsvpEvent(event.id, organization) as Href)}
                />
              )}
              {canEdit && (
                <Pressable
                  onPress={() => router.push(routes.editEvent(event.id, organization) as Href)}
                  accessibilityRole="button"
                  className="h-10 justify-center rounded-v2-pill bg-v2-cream px-4 active:bg-v2-paper"
                >
                  <Text className="font-v2-ui-semibold text-[13px] text-v2-ink">{t("eventAdmin.edit")}</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Headline numbers */}
          <View className="flex-row flex-wrap gap-x-7 gap-y-4">
            <Kpi label={t("eventAdmin.kpi.capacity")} loading={!stats}>
              <KpiValue>{stats?.ticketQuantity}</KpiValue>
            </Kpi>
            <Kpi label={t("eventAdmin.kpi.requested")} loading={!stats}>
              <KpiValue>{stats?.requested}</KpiValue>
            </Kpi>
            <Kpi label={t("eventAdmin.kpi.sold")} loading={!stats}>
              <KpiValue>{stats?.sold}</KpiValue>
            </Kpi>
            <Kpi label={t("eventAdmin.kpi.revenue")} loading={!stats}>
              <KpiValue>{stats ? formatCentsAsPrice(stats.revenueCents, currency) : ""}</KpiValue>
            </Kpi>
          </View>
        </View>
      </View>

      {/* ---------- Tabs (sticky) ---------- */}
      <View className="border-b border-v2-c10 bg-v2-ink">
        <ScrollView ref={tabScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }} accessibilityRole="tablist">
          {EVENT_TABS.map((k) => {
            const on = tab === k;
            return (
              <Pressable
                key={k}
                onLayout={(e) => (tabX.current[k] = e.nativeEvent.layout.x)}
                onPress={() => setTab(k)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                className="h-12 justify-center px-3"
              >
                <Text className={`font-v2-ui-semibold text-[14px] ${on ? "text-v2-cream" : "text-v2-c50"}`}>{t(`eventAdmin.tabs.${k}`)}</Text>
                {on && <View className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-v2-flame" />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View className="gap-4 px-4 pt-5">
        {found?.ownerName && (
          <Text className="rounded-v2-card bg-v2-ink2 p-4 font-v2-ui text-[13px] text-v2-c70">
            {t("eventAdmin.readOnlyCohost", { organizer: found.ownerName })}
          </Text>
        )}
        {!event ? (
          <Skeleton width="100%" height={160} radius={18} />
        ) : !V2_TABS.includes(tab) ? (
          <PreviousVersion onOpen={() => router.push(routes.eventV1(event.id, organization) as Href)} />
        ) : tab === "tiers" ? (
          <TiersTab event={event} purchases={purchases} canEdit={canEdit} organization={organization} onChanged={invalidate} />
        ) : !isOwnerOrg ? (
          <NoSales />
        ) : tab === "purchases" ? (
          <PurchasesTab event={event} organization={organization} />
        ) : (
          <BreakdownTab event={event} />
        )}
      </View>
    </ScrollView>,
  );
}

function KpiValue({ children }: { children: React.ReactNode }) {
  return <Text className="font-v2-display-bold text-[22px] text-v2-cream">{children}</Text>;
}

function StatusPill({ ended, published }: { ended: boolean; published: boolean }) {
  const { t } = useI18n();
  const [bg, fg, label] = ended
    ? ["bg-v2-ink3", "text-v2-c70", t("eventAdmin.status.ended")]
    : published
      ? ["bg-[rgba(76,215,135,0.15)]", "text-v2-good", t("eventAdmin.status.published")]
      : ["bg-[rgba(255,180,67,0.15)]", "text-v2-warn", t("eventAdmin.status.draft")];
  return (
    <View className={`rounded-v2-pill px-2.5 py-1 ${bg}`}>
      <Text className={`font-v2-ui-semibold text-[12px] ${fg}`}>{label}</Text>
    </View>
  );
}

function ActionPill({ icon, label, count, onPress }: { icon: "users" | "rsvp"; label: string; count?: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="h-10 flex-row items-center gap-2 rounded-v2-pill bg-v2-ink3 px-4 active:bg-v2-ink4">
      <Icon name={icon} size={16} color={c.c90} />
      <Text className="font-v2-ui-semibold text-[13px] text-v2-c90">{label}</Text>
      {count ? <Text className="font-v2-ui text-[13px] text-v2-c50">{count}</Text> : null}
    </Pressable>
  );
}

function NoSales() {
  const { t } = useI18n();
  return <Text className="rounded-v2-card bg-v2-ink2 p-5 font-v2-ui text-[14px] text-v2-c50">{t("eventAdmin.noSalesData")}</Text>;
}

function PreviousVersion({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <View className="items-start gap-3 rounded-v2-card bg-v2-ink2 p-5">
      <Text className="font-v2-ui text-[14px] text-v2-c70">{t("eventAdmin.previousVersion")}</Text>
      <Pressable onPress={onOpen} accessibilityRole="button" className="h-10 justify-center rounded-v2-pill bg-v2-ink3 px-4 active:bg-v2-ink4">
        <Text className="font-v2-ui-semibold text-[13px] text-v2-c90">{t("eventAdmin.openPrevious")}</Text>
      </Pressable>
    </View>
  );
}
