/**
 * Flame 2.0 · organizer dashboard in the app (phone view of the web v2 dashboard): hero with logo
 * glow, role, Stripe state, KPIs (owner/admin), create event; current/past tabs, search without
 * accents across both tabs, event list. Same data and rules as the web (useOrganizerModel + lib).
 */
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  canCreateEvents,
  canManagePayouts,
  flameV2Colors as c,
  formatCentsAsPrice,
  formatEventDateTime,
  searchEventsByName,
} from "@project-flame/lib";
import { useI18n } from "../../lib/i18n";
import { routes } from "../../lib/v2/routes";
import type { MyOrganization } from "../../lib/v2/organizer-api";
import type { EnrichedOrgEvent } from "../../hooks/useOrgEventEnriched";
import { useOrganizerModel } from "../../hooks/v2/useOrganizerModel";
import { OrganizerShell, TABBAR_SPACE, useStripeReady } from "./OrganizerShell";
import { ErrorBox, Flyer, Icon, Kpi, OrgAvatar, Pill, Skeleton } from "./ui";

export function OrganizerDashboard({ organization }: { organization: MyOrganization }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { model, loading, failed, fullAccess, refetch, refreshing } = useOrganizerModel(organization);
  const [tab, setTab] = useState<"current" | "past">("current");
  const [search, setSearch] = useState("");

  const matches = model
    ? { current: searchEventsByName(model.current, search), past: searchEventsByName(model.past, search) }
    : null;
  const visible = matches ? matches[tab] : [];
  const other = tab === "current" ? "past" : "current";
  // Searching inside one tab can hide the event in the other one: say so and offer to switch.
  const elsewhere = search.trim() && matches && visible.length === 0 ? matches[other].length : 0;

  return (
    <OrganizerShell
      organization={organization}
      pending={model?.pending ?? 0}
      currentEvents={model?.current ?? []}
      pastEvents={model?.past ?? []}
      title={organization.name}
      onBack={router.canGoBack() ? () => router.back() : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: TABBAR_SPACE + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={c.cream} />}
      >
        <Hero organization={organization} model={model} loading={loading} fullAccess={fullAccess} />

        <View className="gap-3 px-4">
          <View className="flex-row gap-2" accessibilityRole="tablist">
            {(["current", "past"] as const).map((k) => {
              const on = tab === k;
              const count = matches ? matches[k].length : null;
              return (
                <Pressable
                  key={k}
                  onPress={() => setTab(k)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  className={`h-9 flex-row items-center gap-2 rounded-v2-pill px-4 ${on ? "bg-v2-cream" : "bg-v2-ink3"}`}
                >
                  <Text className={`font-v2-ui-semibold text-[13px] ${on ? "text-v2-ink" : "text-v2-c70"}`}>
                    {k === "current" ? t("organizer.currentUpcoming") : t("organizer.pastEvents")}
                  </Text>
                  {count !== null && <Text className={`font-v2-ui text-[13px] ${on ? "text-black/50" : "text-v2-c50"}`}>{count}</Text>}
                </Pressable>
              );
            })}
          </View>

          <View className="h-10 flex-row items-center gap-2 rounded-v2-pill bg-v2-ink2 px-4">
            <Icon name="search" size={16} color={c.c50} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t("organizer.searchEvents")}
              placeholderTextColor={c.c50}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel={t("organizer.searchEvents")}
              className="flex-1 font-v2-ui text-[14px] text-v2-cream"
            />
          </View>

          {!fullAccess && <Text className="font-v2-ui text-[13px] text-v2-c50">{t("organizer.assignedOnly")}</Text>}

          {elsewhere > 0 && (
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="font-v2-ui text-[13px] text-v2-c70">
                {t(other === "past" ? "organizer.matchesInPast" : "organizer.matchesInCurrent", { count: elsewhere })}
              </Text>
              <Pressable onPress={() => setTab(other)} accessibilityRole="button">
                <Text className="font-v2-ui-semibold text-[13px] text-v2-cream underline">{t("organizer.showThem")}</Text>
              </Pressable>
            </View>
          )}

          {failed ? (
            <ErrorBox onRetry={refetch} />
          ) : (
            <EventList
              loading={loading || !model}
              events={visible}
              organization={organization}
              partners={model?.cohostPartners ?? {}}
              empty={search.trim() ? t("organizer.noMatch") : t("organizer.noEvents")}
            />
          )}
        </View>
      </ScrollView>
    </OrganizerShell>
  );
}

function Hero({
  organization,
  model,
  loading,
  fullAccess,
}: {
  organization: MyOrganization;
  model: { all: unknown[]; revenue: Array<{ currency: string; cents: number }> } | null;
  loading: boolean;
  fullAccess: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const role = organization.role;
  const stripeReady = useStripeReady(organization);

  return (
    <View className="mb-5 overflow-hidden">
      {/* Color glow from the organizer's logo (prototype: "logo on a color glow") */}
      <View pointerEvents="none" className="absolute inset-0">
        {organization.logo_url ? (
          <Image source={{ uri: organization.logo_url }} style={{ width: "100%", height: "100%", opacity: 0.4 }} blurRadius={60} contentFit="cover" />
        ) : (
          <LinearGradient colors={["rgba(136,5,23,0.55)", "transparent"]} start={{ x: 0.2, y: 0 }} end={{ x: 0.6, y: 1 }} style={{ flex: 1 }} />
        )}
        <LinearGradient colors={["transparent", c.ink]} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      </View>

      <View className="gap-5 px-4 pb-4 pt-6">
        <View className="flex-row items-center gap-4">
          <OrgAvatar name={organization.name} logoUrl={organization.logo_url} size={72} />
          <View className="min-w-0 flex-1 gap-2">
            <Text numberOfLines={2} className="font-v2-display-bold text-[26px] leading-[30px] tracking-[-0.8px] text-v2-cream">
              {organization.name}
            </Text>
            <View className="flex-row flex-wrap items-center gap-2">
              {role !== "owner" && <Pill>{t(`organizer.roles.${role}`)}</Pill>}
              {stripeReady === true && <Pill tone="good">{t("organizer.stripeConnected")}</Pill>}
              {stripeReady === false && (
                <Pressable onPress={() => router.push(routes.payouts(organization) as Href)} accessibilityRole="link">
                  <Pill tone="warn">{t("organizer.stripeIncomplete")}</Pill>
                </Pressable>
              )}
              {canManagePayouts(role) && (
                <Pressable onPress={() => router.push(routes.settings(organization) as Href)} accessibilityRole="link">
                  <Pill>{t("organizer.manage")}</Pill>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {fullAccess && (
          <View className="flex-row gap-8">
            <Kpi label={t("organizer.totalEvents")} loading={loading || !model}>
              <Text className="font-v2-display-bold text-[26px] text-v2-cream">{model?.all.length ?? 0}</Text>
            </Kpi>
            <Kpi label={t("organizer.totalRevenue")} loading={loading || !model}>
              {model && model.revenue.length === 0 ? (
                <Text className="font-v2-display-bold text-[26px] text-v2-cream">—</Text>
              ) : (
                model?.revenue.map((r) => (
                  <Text key={r.currency} className="font-v2-display-bold text-[26px] text-v2-cream">
                    {formatCentsAsPrice(r.cents, r.currency)}
                  </Text>
                ))
              )}
            </Kpi>
          </View>
        )}

        {canCreateEvents(role) && (
          <Pressable
            onPress={() => router.push(routes.createEvent(organization) as Href)}
            accessibilityRole="button"
            className="h-11 flex-row items-center justify-center gap-2 rounded-v2-pill bg-v2-cream active:bg-v2-paper"
          >
            <Icon name="plus" size={18} color={c.ink} />
            <Text className="font-v2-ui-semibold text-[14px] text-v2-ink">{t("organizer.createEvent")}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function EventList({
  loading,
  events,
  organization,
  partners,
  empty,
}: {
  loading: boolean;
  events: EnrichedOrgEvent[];
  organization: MyOrganization;
  partners: Record<string, string[]>;
  empty: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();

  if (loading) {
    return (
      <View className="overflow-hidden rounded-v2-card bg-v2-ink2" accessibilityLabel={t("common.loading")}>
        {Array.from({ length: 4 }, (_, i) => (
          <View key={i} className="flex-row items-center gap-3 border-b border-v2-c06 px-4 py-3">
            <Skeleton width={48} height={48} radius={10} />
            <View className="flex-1 gap-2">
              <Skeleton width="60%" height={14} />
              <Skeleton width="35%" height={11} />
            </View>
          </View>
        ))}
      </View>
    );
  }
  if (events.length === 0) {
    return (
      <View className="rounded-v2-card bg-v2-ink2 px-4 py-12">
        <Text className="text-center font-v2-ui text-[14px] text-v2-c50">{empty}</Text>
      </View>
    );
  }
  return (
    <View className="overflow-hidden rounded-v2-card bg-v2-ink2">
      {events.map((e, i) => {
        const when = formatEventDateTime(e.starts_at, e.timezone, locale);
        const where = [e.venue, e.city].filter(Boolean).join(", ");
        const names = partners[e.id];
        return (
          <Pressable
            key={e.id}
            onPress={() => router.push(routes.event(e.id, organization) as Href)}
            accessibilityRole="link"
            className={`flex-row items-center gap-3 px-4 py-3 active:bg-v2-ink3 ${i > 0 ? "border-t border-v2-c06" : ""}`}
          >
            <Flyer src={e.image_url} size={48} />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="font-v2-ui-semibold text-[15px] text-v2-cream">{e.name}</Text>
              <Text numberOfLines={1} className="font-v2-ui text-[12px] text-v2-c50">
                {when.date} · {when.time}
                {where ? ` · ${where}` : ""}
              </Text>
              {(e.requires_rsvp || names) && (
                <View className="mt-1 flex-row flex-wrap gap-1.5">
                  {e.requires_rsvp && (
                    <View className="rounded-v2-xs bg-v2-flame px-1.5 py-0.5">
                      <Text className="font-v2-ui-semibold text-[11px] text-v2-cream">
                        {e.pending_rsvps ? t("organizer.pendingRequests", { count: e.pending_rsvps }) : t("organizer.rsvp")}
                      </Text>
                    </View>
                  )}
                  {names && (
                    <View className="max-w-full rounded-v2-xs bg-v2-ink4 px-1.5 py-0.5">
                      <Text numberOfLines={1} className="font-v2-ui text-[11px] text-v2-c70">
                        {t("organizer.cohostWith", { names: names.join(" & ") })}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
            <View className="items-end">
              <Text className="font-v2-ui-semibold text-[13px] text-v2-cream">{formatCentsAsPrice(e.totalRevenue || 0, e.currency ?? "USD")}</Text>
              <Text className="font-v2-ui text-[13px] text-v2-c50">{(e.totalAttendees || 0).toLocaleString(locale)}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
