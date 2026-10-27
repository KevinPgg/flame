/**
 * Personal Profile — Screen 1 of the mobile nav restructure.
 *
 * Single gateway for the signed-in user: shows their profile, edit-profile CTA,
 * list of organizations they belong to, and an entry to create a new org.
 * Approved orgs push to /organizer-admin; pending ones render disabled with a
 * clock icon.
 */

import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { FlameImage, colors, CustomRefreshControl, Skeleton } from "@project-flame/ui";
import { getTabBarPaddingBottom } from "../../components/navigation/CustomTabBar";
import { BecomeOrganizerSheet } from "../../components/navigation/BecomeOrganizerSheet";
import { RequireAuthGate } from "../../hooks/useRequireAuth";
import { useUserProfile } from "../../hooks/useUserProfile";
import { useUserOrgs, type UserOrg } from "../../hooks/useUserOrgs";
import { useMemberRoleContext } from "../../contexts/MemberRoleContext";
import { SupportAdminSection } from "../../components/profile/SupportAdminSection";
import { OrgApprovalsEntry } from "../../components/v2/support/OrgApprovals";
import { organizerV2Enabled, attendeeV2Enabled } from "../../lib/v2/flags";
import { You } from "../../components/v2/attendee/you/You";
import { PastItemsAccordion } from "../../components/shared/PastItemsAccordion";
import { TicketSearchBar } from "../../components/dashboard/TicketSearchBar";

/** Show a search bar once "My Organizers" reaches this many orgs. */
const ORG_SEARCH_THRESHOLD = 8;

/** "You": Flame 2.0 (fase 2.6) unless EXPO_PUBLIC_ATTENDEE_V1=true. */
export default function ProfileScreen() {
  return <RequireAuthGate>{attendeeV2Enabled() ? <You /> : <ProfileContent />}</RequireAuthGate>;
}

function ProfileContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    profile,
    isLoading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useUserProfile();
  const orgsQuery = useUserOrgs();
  const orgs = orgsQuery.data as UserOrg[] | undefined;
  const orgsLoading = orgsQuery.isLoading;
  const orgsRefetching = orgsQuery.isRefetching;
  const orgsError = orgsQuery.error;
  const refetchOrgs = orgsQuery.refetch;
  const { setSelectedOrgId } = useMemberRoleContext();
  const queryClient = useQueryClient();

  const [becomeOrgVisible, setBecomeOrgVisible] = useState(false);
  const [orgSearch, setOrgSearch] = useState("");

  const orgSearchQuery = orgSearch.trim().toLowerCase();
  // Only filter when the search input is actually shown, so a list dropping
  // below the threshold (with a stale query) can't hide orgs.
  const showOrgSearch = (orgs?.length ?? 0) >= ORG_SEARCH_THRESHOLD;
  const filteredOrgs =
    showOrgSearch && orgSearchQuery
      ? (orgs ?? []).filter((o) =>
          o.organizationName.toLowerCase().includes(orgSearchQuery),
        )
      : orgs ?? [];

  // Pull to refresh also reloads support's "Organizer approvals" entry (2026-10-27: a new
  // request didn't show until the cache went stale). ["admin"] = status + both lists.
  const onRefresh = useCallback(async () => {
    await Promise.all([
      refetchProfile(),
      refetchOrgs(),
      queryClient.refetchQueries({ queryKey: ["admin"], type: "active" }),
    ]);
  }, [refetchProfile, refetchOrgs, queryClient]);

  const handleOrgPress = useCallback(
    (org: UserOrg) => {
      if (!org.approved) return;
      setSelectedOrgId(org.organizationId);
      router.push(`/organizer-admin?orgId=${org.organizationId}` as never);
    },
    [router, setSelectedOrgId],
  );

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const initials = [profile?.first_name?.[0], profile?.last_name?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase() || "?";

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 14,
          paddingBottom: getTabBarPaddingBottom(insets.bottom),
        }}
        refreshControl={
          <CustomRefreshControl
            refreshing={orgsRefetching && !orgsLoading}
            onRefresh={onRefresh}
          />
        }
      >
        {/* Header row: avatar + name/email + Edit pill */}
        <View className="px-4 flex-row items-start gap-3">
          {profileLoading && !profile ? (
            <Skeleton className="size-[70px] rounded-circle" />
          ) : (
            <View className="size-[70px] rounded-circle bg-white-10 items-center justify-center overflow-hidden">
              {profile?.profile_image_url ? (
                <FlameImage
                  source={{ uri: profile.profile_image_url }}
                  className="w-full h-full"
                  contentFit="cover"
                />
              ) : (
                <Text className="text-white-100 text-2xl font-poppins-semibold">
                  {initials}
                </Text>
              )}
            </View>
          )}
          <View className="flex-1 min-w-0 pt-[2px]">
            {profileLoading && !profile ? (
              <View className="gap-2">
                <Skeleton className="h-5 w-[140px] rounded" />
                <Skeleton className="h-3 w-[180px] rounded" />
              </View>
            ) : (
              <>
                <Text
                  className="text-white-100 text-lg leading-7 font-poppins-semibold"
                  numberOfLines={1}
                >
                  {fullName || "Your Profile"}
                </Text>
                {profile?.email && (
                  <Text
                    className="text-white-50 text-xs leading-4 font-poppins mt-[2px]"
                    numberOfLines={1}
                  >
                    {profile.email}
                  </Text>
                )}
              </>
            )}
          </View>
          <Pressable
            onPress={() => router.push("/account?tab=personal" as never)}
            className="bg-white-5 border border-white-5 rounded-pill px-3 py-1.5 flex-row items-center gap-1"
            hitSlop={8}
          >
            {/* <Ionicons
              name="settings-outline"
              size={14}
              color={colors["white-100"]}
            /> */}
            <Text className="text-white-100 text-xs leading-4 font-poppins-medium">
              Edit
            </Text>
          </Pressable>
        </View>

        {/* My Organizers section — always-open accordion */}
        <View className="px-4 mt-[30px]">
          <PastItemsAccordion
            label="My Organizers"
            count={orgs?.length ?? 0}
            defaultExpanded
          >
            <View className="gap-3">
              {orgsLoading && !orgs?.length ? (
                <>
                  <OrgRowSkeleton />
                  <OrgRowSkeleton />
                  <OrgRowSkeleton />
                </>
              ) : orgsError || profileError ? (
                <View className="py-6 items-center gap-3">
                  <Text className="text-white-80 text-sm leading-5 font-poppins text-center">
                    Couldn't load your profile. Please try again.
                  </Text>
                  <Pressable
                    onPress={onRefresh}
                    className="bg-white-5 border border-white-20 rounded-pill px-6 py-2"
                  >
                    <Text className="text-white-100 text-sm leading-5 font-poppins-medium">
                      Retry
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {showOrgSearch && (
                    <TicketSearchBar
                      value={orgSearch}
                      onChangeText={setOrgSearch}
                      placeholder="Search organizers"
                    />
                  )}
                  {filteredOrgs.map((org) => (
                    <OrgRow
                      key={org.organizationId}
                      org={org}
                      onPress={() => handleOrgPress(org)}
                    />
                  ))}
                  {showOrgSearch && orgSearchQuery && filteredOrgs.length === 0 ? (
                    <Text className="text-white-50 text-sm font-poppins py-2">
                      No matches.
                    </Text>
                  ) : null}

                  {/* Create new organizer CTA */}
                  <Pressable
                    onPress={() => setBecomeOrgVisible(true)}
                    className="bg-white-5 border border-white-5 border-dashed rounded-card p-3 flex-row items-center gap-3"
                  >
                    <View className="size-[52px] rounded-card bg-white-5 items-center justify-center">
                      <Ionicons
                        name="add"
                        size={28}
                        color={colors["white-50"]}
                      />
                    </View>
                    <Text className="text-white-50 text-base leading-[22px] font-poppins">
                      Create new organizer
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </PastItemsAccordion>
        </View>

        {/* Support-only org-approval queue (W7-H1) — renders nothing for non-admins.
            Fase 1b.7: an entry to the 2.0 screen; the v1 inline queue only with the switch. */}
        {organizerV2Enabled() ? <OrgApprovalsEntry /> : <SupportAdminSection />}
      </ScrollView>

      <BecomeOrganizerSheet
        visible={becomeOrgVisible}
        onClose={() => setBecomeOrgVisible(false)}
      />
    </View>
  );
}

interface OrgRowProps {
  org: UserOrg;
  onPress: () => void;
}

function OrgRow({ org, onPress }: OrgRowProps) {
  const isPending = !org.approved;
  const eventLabel = `${org.eventCount} event${org.eventCount === 1 ? "" : "s"}`;
  const initials = org.organizationName.charAt(0).toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      disabled={isPending}
      className={`bg-white-5 border border-white-5 rounded-card p-3 flex-row items-center gap-3 ${
        isPending ? "opacity-60" : ""
      }`}
    >
      <View className="size-[52px] rounded-card bg-white-10 items-center justify-center overflow-hidden">
        {org.logoUrl ? (
          <FlameImage
            source={{ uri: org.logoUrl }}
            className="w-full h-full"
            contentFit="cover"
          />
        ) : (
          <Text className="text-white-100 text-lg font-poppins-semibold">
            {initials}
          </Text>
        )}
      </View>
      <View className="flex-1 min-w-0">
        <Text
          className="text-white-100 text-base leading-[22px] font-poppins-semibold"
          numberOfLines={1}
        >
          {org.organizationName}
        </Text>
        <Text className="text-white-50 text-xs leading-4 font-poppins-light mt-[2px]">
          {isPending ? "Pending approval" : eventLabel}
        </Text>
      </View>
      <Ionicons
        name={isPending ? "time-outline" : "chevron-forward"}
        size={20}
        color={colors[isPending ? "white-50" : "white-100"]}
      />
    </Pressable>
  );
}

function OrgRowSkeleton() {
  return (
    <View className="bg-white-5 border border-white-5 rounded-card p-3 flex-row items-center gap-3">
      <Skeleton className="size-[52px] rounded-card" />
      <View className="flex-1 gap-2">
        <Skeleton className="h-[18px] w-[60%] rounded" />
        <Skeleton className="h-3 w-[35%] rounded" />
      </View>
    </View>
  );
}
