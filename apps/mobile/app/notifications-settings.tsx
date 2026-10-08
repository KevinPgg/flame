import { View, ScrollView, Pressable, Switch, Text } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@project-flame/ui";
import { getTabBarPaddingBottom } from "../components/navigation/CustomTabBar";
import { DashboardBar } from "../components/dashboard/DashboardBar";
import {
  useNotificationPreferences,
  type NotificationType,
} from "../hooks/useNotificationPreferences";
import { NON_DISMISSABLE_NOTIFICATION_TYPES } from "@project-flame/lib";
import { useUserRole } from "../hooks/useUserRole";

interface NotificationItem {
  type: NotificationType;
  label: string;
  description: string;
  orgOnly?: boolean;
}

const NOTIFICATION_ITEMS: NotificationItem[] = [
  { type: "rsvp_pending", label: "RSVP Received", description: "When your RSVP is submitted" },
  { type: "rsvp_approved", label: "RSVP Approved", description: "When your RSVP is approved" },
  { type: "rsvp_rejected", label: "RSVP Rejected", description: "When your RSVP is not approved" },
  { type: "ticket_received", label: "Ticket Received", description: "When you receive a ticket from an organizer" },
  { type: "event_date_changed", label: "Date Changes", description: "When an event you have tickets for is rescheduled" },
  { type: "event_reminder", label: "Event Reminders", description: "24 hours before events you're attending" },
  { type: "new_rsvp_request", label: "New RSVP Requests", description: "When someone RSVPs to your event", orgOnly: true },
  { type: "ticket_sold", label: "Ticket Sales", description: "When a ticket is sold for your event", orgOnly: true },
  { type: "auth_expiry_warning", label: "Payment Expiry", description: "When an RSVP payment authorization is about to expire", orgOnly: true },
];

export default function NotificationsSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences, updatePreference } = useNotificationPreferences();
  const { role } = useUserRole();
  const isOrg = role === "org";

  const visibleItems = NOTIFICATION_ITEMS.filter(
    (item) => !item.orgOnly || isOrg
  );

  const userItems = visibleItems.filter((item) => !item.orgOnly);
  const orgItems = visibleItems.filter((item) => item.orgOnly);

  return (
    <View className="flex-1 bg-background">
      <DashboardBar title="Notifications" onBack={() => router.back()} />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: getTabBarPaddingBottom(insets.bottom),
        }}
      >
        <View className="px-4 gap-6">
          <View className="gap-1">
            <Text className="text-white-50 text-xs leading-4 font-poppins-medium uppercase mb-2 px-1">
              General
            </Text>
            <View className="rounded-card bg-white-5 overflow-hidden">
              {userItems.map(({ type, label, description }, i) => {
                const isLocked = NON_DISMISSABLE_NOTIFICATION_TYPES.has(type);
                return (
                  <View
                    key={type}
                    className={`flex-row items-center justify-between py-3 px-4 ${i < userItems.length - 1 ? "border-b border-white-10" : ""}`}
                  >
                    <View className="flex-1 mr-4">
                      <Text className="text-white-100 text-sm leading-5 font-poppins-medium">
                        {label}
                      </Text>
                      <Text className="text-white-50 text-xs leading-4 font-poppins">
                        {description}{isLocked ? " (always on)" : ""}
                      </Text>
                    </View>
                    <Switch
                      value={isLocked ? true : (preferences[type] ?? true)}
                      onValueChange={isLocked ? undefined : (val) => updatePreference(type, val)}
                      disabled={isLocked}
                      trackColor={{ false: colors["white-10"], true: colors["white-50"] }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                );
              })}
            </View>
          </View>

          {isOrg && orgItems.length > 0 && (
            <View className="gap-1">
              <Text className="text-white-50 text-xs leading-4 font-poppins-medium uppercase mb-2 px-1">
                Organizer
              </Text>
              <View className="rounded-card bg-white-5 overflow-hidden">
                {orgItems.map(({ type, label, description }, i) => (
                  <View
                    key={type}
                    className={`flex-row items-center justify-between py-3 px-4 ${i < orgItems.length - 1 ? "border-b border-white-10" : ""}`}
                  >
                    <View className="flex-1 mr-4">
                      <Text className="text-white-100 text-sm leading-5 font-poppins-medium">
                        {label}
                      </Text>
                      <Text className="text-white-50 text-xs leading-4 font-poppins">
                        {description}
                      </Text>
                    </View>
                    <Switch
                      value={preferences[type] ?? true}
                      onValueChange={(val) => updatePreference(type, val)}
                      trackColor={{ false: colors["white-10"], true: colors["white-50"] }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
