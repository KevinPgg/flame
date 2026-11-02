/**
 * Flame 2.0 "You" (fase 2.6), app. Prototype `SCREENS.profile` — one single profile (no
 * hosting/attending switch): photo, name, e-mail, Settings (moved here from the top bar) and
 * Edit profile; counters; "My organizers" with Manage (approved, same route as v1) or Under
 * review, and New organizer (the v1 apply sheet); organizer approvals for Flame support; past
 * events from your tickets; Saved (fase 4.1); Following (fase 4.2: counter + list).
 * Data: the existing useUserProfile, useUserOrgs and useUserTickets.
 */
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { buildWallet, flameV2Colors as c, splitSavedEvents, walletDayTime } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { useUserProfile } from "../../../../hooks/useUserProfile";
import { useUserOrgs, type UserOrg } from "../../../../hooks/useUserOrgs";
import { useUserTickets } from "../../../../hooks/useUserTickets";
import { useSavedEvents } from "../../../../hooks/useSavedEvents";
import { useFollowing } from "../../../../hooks/useFollowing";
import { FollowButton } from "../FollowButton";
import { EventTile } from "../EventTile";
import { useMemberRoleContext } from "../../../../contexts/MemberRoleContext";
import { getTabBarPaddingBottom } from "../../../navigation/CustomTabBar";
import { BecomeOrganizerSheet } from "../../../navigation/BecomeOrganizerSheet";
import { OrgApprovalsEntry } from "../../support/OrgApprovals";
import { Button, Icon, OrgAvatar, Skeleton } from "../../ui";

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <View className="mt-9 px-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Text accessibilityRole="header" className="font-v2-display-bold text-[20px] tracking-[-0.5px] text-v2-cream">{title}</Text>
        {aside}
      </View>
      {children}
    </View>
  );
}

export function You() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { profile, isLoading: profileLoading, refetch: refetchProfile } = useUserProfile();
  const orgsQuery = useUserOrgs();
  const tickets = useUserTickets();
  const { setSelectedOrgId } = useMemberRoleContext();
  const [sheet, setSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const orgs = (orgsQuery.data as UserOrg[] | undefined) ?? [];
  const past = useMemo(() => buildWallet(tickets.data?.tickets ?? []).past, [tickets.data?.tickets]);
  const attended = past.filter((w) => w.checkedIn > 0).length;
  const saved = useSavedEvents();
  const savedSplit = useMemo(() => splitSavedEvents(saved.events), [saved.events]);
  const following = useFollowing();
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchProfile(), orgsQuery.refetch(), tickets.refetch(), saved.refetch(), following.refetch(), queryClient.refetchQueries({ queryKey: ["admin"], type: "active" })]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchProfile, orgsQuery, tickets, saved, following, queryClient]);

  const manage = (o: UserOrg) => {
    setSelectedOrgId(o.organizationId);
    router.push(`/organizer-admin?orgId=${o.organizationId}` as Href);
  };

  return (
    <ScrollView
      className="flex-1 bg-black"
      contentContainerStyle={{ paddingTop: 6, paddingBottom: getTabBarPaddingBottom(insets.bottom) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={c.cream} colors={[c.cream]} progressBackgroundColor={c.ink3} />}
    >
      <View className="items-center px-4">
        {profileLoading && !profile ? (
          <Skeleton width={84} height={84} radius={42} />
        ) : (
          <View style={{ width: 84, height: 84, borderRadius: 42, overflow: "hidden", backgroundColor: c.ink3 }} className="items-center justify-center">
            {profile?.profile_image_url ? (
              <Image source={{ uri: profile.profile_image_url }} style={{ width: 84, height: 84 }} contentFit="cover" />
            ) : (
              <Text className="font-v2-display-bold text-[28px] text-v2-cream">{(name[0] ?? profile?.email?.[0] ?? "?").toUpperCase()}</Text>
            )}
          </View>
        )}
        <Text accessibilityRole="header" className="mt-3 text-center font-v2-display-bold text-[28px] tracking-[-0.8px] text-v2-cream">
          {name || profile?.email || " "}
        </Text>
        {name && profile?.email ? <Text className="font-v2-ui text-[14px] text-v2-c50">{profile.email}</Text> : null}
        <View className="mt-5 flex-row gap-3">
          <View accessibilityLabel={`${t("follow.title")}: ${following.orgs.length}`} className="min-w-[100px] rounded-[14px] bg-[#121212] px-4 py-2.5">
            <Text className="font-v2-display-bold text-[20px] text-v2-cream">{following.orgs.length}</Text>
            <Text className="font-v2-ui text-[12px] text-v2-c50">{t("follow.title")}</Text>
          </View>
          <Pressable onPress={() => router.push("/dashboard" as Href)} accessibilityRole="button" accessibilityLabel={`${t("you.events")}: ${attended}`} className="min-w-[100px] rounded-[14px] bg-[#121212] px-4 py-2.5 active:opacity-80">
            <Text className="font-v2-display-bold text-[20px] text-v2-cream">{attended}</Text>
            <Text className="font-v2-ui text-[12px] text-v2-c50">{t("you.events")}</Text>
          </Pressable>
          <View accessibilityLabel={`${t("you.organizers")}: ${orgs.length}`} className="min-w-[100px] rounded-[14px] bg-[#121212] px-4 py-2.5">
            <Text className="font-v2-display-bold text-[20px] text-v2-cream">{orgs.length}</Text>
            <Text className="font-v2-ui text-[12px] text-v2-c50">{t("you.organizers")}</Text>
          </View>
        </View>
        <View className="mt-4 flex-row gap-2">
          <Button small label={t("you.editProfile")} onPress={() => router.push("/settings" as Href)} />
          <Button small icon="settings" label={t("userSettings.title")} onPress={() => router.push("/settings" as Href)} />
        </View>
      </View>

      <Section title={t("you.myOrganizers")}>
        <View className="gap-2">
          {orgsQuery.isLoading ? <Skeleton width={"100%"} height={72} radius={16} /> : null}
          {orgs.map((o) =>
            o.approved ? (
              <Pressable key={o.organizationId} onPress={() => manage(o)} accessibilityRole="button" accessibilityLabel={`${t("you.manage")} ${o.organizationName}`} className="flex-row items-center gap-3 rounded-[16px] bg-[#121212] p-3 active:opacity-80">
                <OrgAvatar name={o.organizationName} logoUrl={o.logoUrl} size={48} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-v2-ui-semibold text-[15px] text-v2-cream">{o.organizationName}</Text>
                  <Text className="font-v2-ui text-[12.5px] text-v2-c50">{t("you.eventsCount", { count: o.eventCount })}</Text>
                </View>
                <Text className="font-v2-ui-semibold text-[13px] text-v2-c90">{t("you.manage")}</Text>
                <Icon name="chev" size={15} color={c.c90} />
              </Pressable>
            ) : (
              <View key={o.organizationId} style={{ opacity: 0.7 }} className="flex-row items-center gap-3 rounded-[16px] bg-[#121212] p-3">
                <OrgAvatar name={o.organizationName} logoUrl={o.logoUrl} size={48} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-v2-ui-semibold text-[15px] text-v2-cream">{o.organizationName}</Text>
                  <Text style={{ color: c.warn }} className="font-v2-ui text-[12.5px]">{t("you.underReview")}</Text>
                </View>
                <Icon name="clock" size={18} color={c.c50} />
              </View>
            ),
          )}
          <Pressable onPress={() => setSheet(true)} accessibilityRole="button" style={{ borderWidth: 1, borderStyle: "dashed", borderColor: c.c16 }} className="flex-row items-center gap-3 rounded-[16px] p-3 active:bg-v2-ink2">
            <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: c.ink3 }} className="items-center justify-center">
              <Icon name="plus" size={20} color={c.cream} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="font-v2-ui-semibold text-[15px] text-v2-cream">{t("you.newOrganizer")}</Text>
              <Text className="font-v2-ui text-[12.5px] text-v2-c50">{t("you.newOrganizerHint")}</Text>
            </View>
          </Pressable>
        </View>
        <View className="mt-2">
          <OrgApprovalsEntry />
        </View>
      </Section>

      <Section
        title={t("saved.title")}
        aside={saved.events.length ? <Text className="font-v2-ui text-[13px] text-v2-c50">{saved.events.length}</Text> : undefined}
      >
        {saved.isLoading ? (
          <View className="flex-row gap-3">
            <Skeleton width={150} height={188} radius={14} />
            <Skeleton width={150} height={188} radius={14} />
          </View>
        ) : saved.events.length === 0 ? (
          <Text className="font-v2-ui text-[14px] text-v2-c50">{t("saved.empty")}</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 16 }} className="-mx-4 px-4" testID="saved-list">
            {savedSplit.upcoming.map((e) => (
              <EventTile key={e.id} event={e} width={150} />
            ))}
            {savedSplit.past.map((e) => (
              <View key={e.id}>
                <EventTile event={e} width={150} past save />
                <View className="absolute left-2 top-2 rounded-v2-pill bg-[rgba(0,0,0,0.6)] px-2 py-0.5">
                  <Text className="font-v2-ui-semibold text-[10.5px] text-v2-c90">{t("saved.ended")}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </Section>

      <Section
        title={t("follow.title")}
        aside={following.orgs.length ? <Text className="font-v2-ui text-[13px] text-v2-c50">{following.orgs.length}</Text> : undefined}
      >
        {following.isLoading ? (
          <Skeleton width={"100%"} height={64} radius={16} />
        ) : following.orgs.length === 0 ? (
          <View className="items-start rounded-[16px] bg-[#121212] p-4">
            <Text className="font-v2-ui-semibold text-[15px] text-v2-cream">{t("follow.empty")}</Text>
            <Text className="mt-0.5 font-v2-ui text-[13px] text-v2-c50">{t("follow.emptyHint")}</Text>
            <View className="mt-3">
              <Button small variant="primary" label={t("follow.find")} onPress={() => router.push("/discover" as Href)} />
            </View>
          </View>
        ) : (
          <View className="gap-2" testID="following-list">
            {following.orgs.map((o) => (
              <View key={o.id} className="flex-row items-center gap-3 rounded-[16px] bg-[#121212] p-3">
                <Pressable onPress={() => router.push(`/organizer/${o.slug}` as Href)} accessibilityRole="link" className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-80">
                  <OrgAvatar name={o.name} logoUrl={o.logo_url} size={48} />
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="font-v2-ui-semibold text-[15px] text-v2-cream">{o.name}</Text>
                    <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c50">
                      {[o.city, t("follow.followers", { count: o.followers_count })].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                </Pressable>
                <FollowButton org={o} />
              </View>
            ))}
          </View>
        )}
      </Section>

      <Section
        title={t("you.pastEvents")}
        aside={
          <Pressable onPress={() => router.push("/dashboard" as Href)} accessibilityRole="link" hitSlop={6}>
            <Text className="font-v2-ui-semibold text-[13px] text-v2-cream underline">{t("you.history")}</Text>
          </Pressable>
        }
      >
        {past.length === 0 ? (
          <Text className="font-v2-ui text-[14px] text-v2-c50">{t("you.noPast")}</Text>
        ) : (
          past.slice(0, 5).map((w) => (
            <Pressable key={w.event.id} onPress={() => router.push(`/ticket/${w.tickets[0]!.id}` as Href)} accessibilityRole="link" className="flex-row items-center gap-3 py-2.5 active:opacity-80">
              <View style={{ width: 48, height: 60, borderRadius: 8, overflow: "hidden", backgroundColor: c.ink3 }}>
                {w.event.image_url ? <Image source={{ uri: w.event.image_url }} style={{ width: 48, height: 60 }} contentFit="cover" /> : null}
              </View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-v2-ui-semibold text-[15px] text-v2-cream">{w.event.name}</Text>
                <Text className="font-v2-ui text-[13px] text-v2-c50">{walletDayTime(w.event.starts_at, w.event.timezone, locale).day}</Text>
                <Text numberOfLines={1} className="font-v2-ui text-[13px] text-v2-c50">{w.event.venue}</Text>
              </View>
              {w.checkedIn > 0 ? (
                <View className="rounded-v2-pill bg-v2-ink3 px-2.5 py-1">
                  <Text className="font-v2-ui-semibold text-[12px] text-v2-c90">{t("wallet.attended")}</Text>
                </View>
              ) : null}
            </Pressable>
          ))
        )}
      </Section>

      <BecomeOrganizerSheet visible={sheet} onClose={() => setSheet(false)} />
    </ScrollView>
  );
}
