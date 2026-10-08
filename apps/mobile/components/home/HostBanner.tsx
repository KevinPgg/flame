/**
 * "Host your own events" upsell banner for the home screen.
 *
 * Shown for users who don't yet have an approved organization. Tapping opens
 * the BecomeOrganizerSheet to apply. Hidden for users who already have an
 * approved org (they can access their org via the Profile tab).
 */

import { useState } from "react";
import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameText, colors } from "@project-flame/ui";
import { BecomeOrganizerSheet } from "../navigation/BecomeOrganizerSheet";
import { useUserOrgs, type UserOrg } from "../../hooks/useUserOrgs";

export function HostBanner() {
  const orgsQuery = useUserOrgs();
  const orgs = orgsQuery.data as UserOrg[] | undefined;
  const [becomeOrgVisible, setBecomeOrgVisible] = useState(false);

  // Suppress render until the orgs query has settled — prevents a flash of the
  // "Host your own events" banner for users who do have an approved org.
  if (orgsQuery.isLoading) return null;

  // Hide when user already has any approved org — they can reach it via Profile tab.
  const hasApprovedOrg = orgs?.some((o) => o.approved) ?? false;
  if (hasApprovedOrg) return null;

  return (
    <>
      <Pressable onPress={() => setBecomeOrgVisible(true)} className="mx-4">
        <View className="rounded-card px-4 py-4 flex-row items-center bg-card">
          <View className="size-[44px] rounded-circle bg-white-5 items-center justify-center mr-4">
            <Ionicons name="megaphone" size={24} color={colors["white-80"]} />
          </View>
          <View className="flex-1">
            <FlameText
              variant="body"
              className="text-white-100 font-poppins-semibold"
            >
              Host your own events
            </FlameText>
            <FlameText variant="subtitle2" className="text-white-50 mt-[2px]">
              Apply to become an organizer
            </FlameText>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors["white-50"]}
          />
        </View>
      </Pressable>

      <BecomeOrganizerSheet
        visible={becomeOrgVisible}
        onClose={() => setBecomeOrgVisible(false)}
      />
    </>
  );
}
