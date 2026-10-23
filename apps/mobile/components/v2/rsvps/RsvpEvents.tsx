/**
 * RSVPs, step 1 — phone view of the prototype "ow:rsvps" (same as apps/web/app/v2/organizer/rsvps):
 * the organization's RSVP events (own and co-hosted, already scoped by role) with how many
 * requests wait on each. Tapping one opens its requests (RsvpEventDetail).
 */
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { flameV2Colors as c, formatEventDateTime, rsvpEventLists, type DashboardEvent } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { routes } from "../../../lib/v2/routes";
import type { MyOrganization, OrgEventV2 } from "../../../lib/v2/organizer-api";
import { useOrganizerModel } from "../../../hooks/v2/useOrganizerModel";
import { OrganizerShell, TABBAR_SPACE } from "../OrganizerShell";
import { ErrorBox, Flyer, Icon, Skeleton } from "../ui";

export function RsvpEvents({ organization }: { organization: MyOrganization }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { model, loading, failed, refetch, refreshing } = useOrganizerModel(organization);
  const [tab, setTab] = useState<"current" | "past">("current");
  const [search, setSearch] = useState("");
  const lists = model ? rsvpEventLists(model.all as unknown as (DashboardEvent & OrgEventV2)[], search) : null;
  const shown = lists ? (tab === "current" ? lists.current : lists.past) : [];

  return (
    <OrganizerShell
      organization={organization}
      pending={model?.pending ?? 0}
      section="rsvps"
      title={t("rsvps.title")}
      onBack={() => (router.canGoBack() ? router.back() : router.replace(routes.dashboard(organization) as Href))}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: TABBAR_SPACE + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={c.cream} />}
      >
        <Text className="font-v2-ui text-[14px] leading-[20px] text-v2-c70">{t("rsvps.lede")}</Text>

        <View className="flex-row gap-2" accessibilityRole="tablist">
          {(["current", "past"] as const).map((k) => {
            const on = tab === k;
            const count = lists ? (k === "current" ? lists.current.length : lists.past.length) : null;
            return (
              <Pressable
                key={k}
                onPress={() => setTab(k)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                className={`h-9 flex-row items-center gap-2 rounded-v2-pill px-4 ${on ? "bg-v2-cream" : "bg-v2-ink3"}`}
              >
                <Text className={`font-v2-ui-semibold text-[13px] ${on ? "text-v2-ink" : "text-v2-c70"}`}>
                  {k === "current" ? t("rsvps.current") : t("rsvps.past")}
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
            placeholder={t("rsvps.search")}
            placeholderTextColor={c.c50}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={t("rsvps.search")}
            className="flex-1 font-v2-ui text-[14px] text-v2-cream"
          />
        </View>

        {failed ? (
          <ErrorBox onRetry={refetch} />
        ) : loading || !lists ? (
          <View className="gap-3" accessibilityLabel={t("common.loading")}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width="100%" height={96} radius={16} />
            ))}
          </View>
        ) : shown.length === 0 ? (
          <View className="rounded-v2-card bg-v2-ink2 px-4 py-12">
            <Text className="text-center font-v2-ui text-[14px] text-v2-c50">
              {search.trim() ? t("rsvps.noMatch", { query: search.trim() }) : t("rsvps.noEvents")}
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {shown.map((e) => {
              const when = formatEventDateTime(e.starts_at, e.timezone, locale);
              const where = [e.venue, e.city].filter(Boolean).join(", ");
              const pending = e.pending_rsvps ?? 0;
              return (
                <Pressable
                  key={e.id}
                  onPress={() => router.push(routes.rsvpEvent(e.id, organization) as Href)}
                  accessibilityRole="link"
                  accessibilityLabel={`${e.name}, ${pending} ${t("rsvps.pendingShort")}`}
                  className="flex-row items-center gap-3 rounded-v2-card bg-v2-ink2 p-3 active:bg-v2-ink3"
                >
                  <Flyer src={e.image_url} size={64} radius={12} />
                  <View className="min-w-0 flex-1 gap-1">
                    <Text numberOfLines={1} className="font-v2-ui-semibold text-[15px] text-v2-cream">{e.name}</Text>
                    <View className="flex-row items-center gap-1.5">
                      <Icon name="cal" size={13} color={c.c70} />
                      <Text numberOfLines={1} className="flex-1 font-v2-ui text-[12.5px] text-v2-c70">
                        {when.date} · {when.time}
                      </Text>
                    </View>
                    {where ? (
                      <View className="flex-row items-center gap-1.5">
                        <Icon name="pin" size={13} color={c.c50} />
                        <Text numberOfLines={1} className="flex-1 font-v2-ui text-[12.5px] text-v2-c50">{where}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View className={`w-16 items-center rounded-v2-md py-2 ${pending > 0 ? "bg-[rgba(136,5,23,0.45)]" : ""}`}>
                    <Text className={`font-v2-display-bold text-[22px] leading-[24px] ${pending > 0 ? "text-v2-cream" : "text-v2-c50"}`}>{pending}</Text>
                    <Text className={`mt-0.5 font-v2-ui text-[11px] ${pending > 0 ? "text-v2-cream" : "text-v2-c50"}`}>{t("rsvps.pendingShort")}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </OrganizerShell>
  );
}
