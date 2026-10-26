import { Redirect as V2Redirect, useLocalSearchParams as useV2Params, type Href as V2Href } from "expo-router";
import { organizerV2Enabled as v2On } from "../lib/v2/flags";
import { useState, useEffect, useRef } from "react";
import { View, ScrollView, Keyboard } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTabBarPaddingBottom } from "../components/navigation/CustomTabBar";
import { DashboardBar } from "../components/dashboard/DashboardBar";
import {
  SettingsTabs,
  type SettingsTab,
} from "../components/settings/SettingsTabs";
import { PersonalSettingsTab } from "../components/settings/PersonalSettingsTab";
import { OrganizationSettingsTab } from "../components/settings/OrganizationSettingsTab";
import { PayoutsSettingsTab } from "../components/settings/PayoutsSettingsTab";
import { useUserRole } from "../hooks/useUserRole";
import { useMemberRoleContext } from "../contexts/MemberRoleContext";
import { canAccessOrgSettings, canManagePayouts } from "@project-flame/lib";
import { RequireAuthGate } from "../hooks/useRequireAuth";

const TABS_HEIGHT = 42;

function renderTab(tab: SettingsTab) {
  switch (tab) {
    case "personal":
      return <PersonalSettingsTab />;
    case "organization":
      return <OrganizationSettingsTab />;
    case "payouts":
      return <PayoutsSettingsTab />;
  }
}

const ORG_ONLY_TABS: SettingsTab[] = ["organization", "payouts"];

function AccountV1Screen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    tab?: string | string[];
    orgId?: string | string[];
  }>();
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const routeOrgId = Array.isArray(params.orgId) ? params.orgId[0] : params.orgId;
  const initialTab = (tabParam as SettingsTab) || "personal";
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    ["personal", "organization", "payouts"].includes(initialTab) ? initialTab : "personal"
  );
  const { role, isLoading: roleLoading } = useUserRole();
  const { memberRole, setSelectedOrgId } = useMemberRoleContext();

  // When opened from Screen 3 (Manage / Stripe pill) with ?orgId=, pin the
  // context so OrganizationSettingsTab and PayoutsSettingsTab resolve the
  // exact org the user explicitly chose — not whatever org the context last held.
  const syncedOrgIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (routeOrgId && syncedOrgIdRef.current !== routeOrgId) {
      syncedOrgIdRef.current = routeOrgId;
      setSelectedOrgId(routeOrgId);
    }
  }, [routeOrgId, setSelectedOrgId]);
  const isOrg = role === "org" && canAccessOrgSettings(memberRole);
  const isOwner = role === "org" && canManagePayouts(memberRole);

  useEffect(() => {
    // Wait for the role query to settle before normalizing tabs — role defaults
    // to "user" while loading, which would incorrectly reset org-specific tabs
    // (e.g. ?tab=payouts deep-link) before we know the user's actual role.
    if (roleLoading) return;
    if (!isOrg && ORG_ONLY_TABS.includes(activeTab)) {
      setActiveTab("personal");
    }
    if (!isOwner && activeTab === "payouts") {
      setActiveTab(isOrg ? "organization" : "personal");
    }
  }, [roleLoading, isOrg, isOwner, activeTab]);

  const effectiveTab = (() => {
    if (roleLoading) return activeTab;
    if (!isOrg && ORG_ONLY_TABS.includes(activeTab)) return "personal";
    if (!isOwner && activeTab === "payouts") return isOrg ? "organization" : "personal";
    return activeTab;
  })();

  return (
    <RequireAuthGate>
      <View className="flex-1 bg-background">
        <DashboardBar title="Account" onBack={() => router.back()} />

        {/* Tabs (org users see Organization + Payouts) */}
        <SettingsTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isOrg={isOrg}
          isOwner={isOwner}
        />

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
          contentContainerStyle={{
            paddingTop: 16,
            paddingBottom: getTabBarPaddingBottom(insets.bottom),
          }}
        >
          {renderTab(effectiveTab)}
        </ScrollView>
      </View>
    </RequireAuthGate>
  );
}

/**
 * Fase 1b.5b: "Account" split by decision 2026-10-23 — personal → the one Settings (v2);
 * organization / payouts tabs → that organization's Manage screens (need ?orgId=).
 */
export default function AccountScreen() {
  const params = useV2Params<{ tab?: string | string[]; orgId?: string | string[] }>();
  if (v2On()) {
    const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    const orgId = Array.isArray(params.orgId) ? params.orgId[0] : params.orgId;
    if (orgId && tab === "payouts") return <V2Redirect href={`/v2/organizer/payouts?orgId=${encodeURIComponent(orgId)}` as V2Href} />;
    if (orgId && tab === "organization") return <V2Redirect href={`/v2/organizer/settings?orgId=${encodeURIComponent(orgId)}` as V2Href} />;
    if (tab !== "organization" && tab !== "payouts") return <V2Redirect href={"/v2/settings" as V2Href} />;
  }
  return <AccountV1Screen />;
}
