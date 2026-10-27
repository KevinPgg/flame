/**
 * Root shell: renders the global Header, Stack, custom tab bar, and notifications
 * overlay. Shows a loading overlay while auth-redirect navigation is in flight.
 *
 * IMPORTANT: The <Stack> must ALWAYS be mounted — never conditionally unmounted
 * behind an `if (isLoading) return <Spinner />` guard. When sign-in completes,
 * Clerk's session change triggers query refetches; if the Stack unmounts during
 * that window, any pending CommonActions.reset dispatched by navigateToTabs is
 * lost — the navigator it targets no longer exists. When loading finishes the
 * Stack remounts fresh with the URL still at /sign-in, sending the user back to
 * the sign-in screen. Keeping the Stack always mounted and showing a loading
 * overlay on top prevents this race condition. See APRIL_2026_FIXES.md entry #8.
 */

import { View, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Stack, usePathname } from "expo-router";
import { useAuthRedirect } from "../../contexts/AuthRedirectContext";
import { ScrollToTopProvider } from "../../contexts/ScrollToTopContext";
import { Header } from "../home/Header";
import { CustomTabBar } from "./CustomTabBar";
import { NotificationsOverlay } from "../notifications/NotificationsOverlay";
import { FlameLogo } from "../FlameLogo";
import { AttendeeTopBar } from "../v2/attendee/AttendeeTopBar";
import { AttendeeTabBar } from "../v2/attendee/AttendeeTabBar";
import { attendeeV2Enabled } from "../../lib/v2/flags";
import { AttendeeCityProvider } from "../../contexts/AttendeeCityContext";
import { colors } from "@project-flame/ui";
import type { NotificationsOverlayState } from "../notifications/NotificationsOverlay";

/**
 * Screens presented as full-screen modals. These cover the entire screen
 * (Header + Tab Bar) at the native layer via react-native-screens, so the
 * tab bar doesn't need custom show/hide animation — it's simply occluded.
 */
const FULL_SCREEN_MODAL_ROUTES = ["sign-in", "scanner", "forgot-password", "reset-password"] as const;
const CARD_ROUTES = ["org-members"] as const;

interface RoleResolutionGateProps {
  notificationsOpen: boolean;
  onNotificationOpen: () => void;
  onNotificationClose: () => void;
  notificationsState: NotificationsOverlayState;
}

export function RoleResolutionGate({
  notificationsOpen,
  onNotificationOpen,
  onNotificationClose,
  notificationsState,
}: RoleResolutionGateProps) {
  const { isAuthRedirecting } = useAuthRedirect();
  // Flame 2.0 organizer screens (/v2/…) bring their own top bar and bottom bar (OrganizerShell).
  const v2 = usePathname().startsWith("/v2");
  // Fase 2: the attendee side gets the 2.0 top bar and tab bar (EXPO_PUBLIC_ATTENDEE_V1=true → v1).
  const attendeeV2 = attendeeV2Enabled();

  return (
    <AttendeeCityProvider>
    <ScrollToTopProvider>
      <View style={{ flex: 1 }} className="bg-background">
        <StatusBar style="light" />
        {isAuthRedirecting && (
          <View
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}
            className="bg-background items-center justify-center"
          >
            <FlameLogo width={120} height={28} color="#FFFFFF" />
            <ActivityIndicator size="large" color="#FFFFFF" style={{ marginTop: 24 }} />
          </View>
        )}
        {!v2 &&
          (attendeeV2 ? (
            <AttendeeTopBar onNotificationPress={onNotificationOpen} unreadCount={notificationsState.unreadCount} />
          ) : (
            <Header onNotificationPress={onNotificationOpen} unreadCount={notificationsState.unreadCount} />
          ))}
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              gestureEnabled: true,
              animation: "default",
            }}
          >
            {FULL_SCREEN_MODAL_ROUTES.map(name => (
              <Stack.Screen
                key={name}
                name={name}
                options={{
                  presentation: "fullScreenModal",
                  animation: "slide_from_bottom",
                  gestureEnabled: false,
                }}
              />
            ))}
            {CARD_ROUTES.map(name => (
              <Stack.Screen
                key={name}
                name={name}
                options={{
                  headerShown: false,
                  presentation: "card",
                }}
              />
            ))}
          </Stack>
          {!v2 && (attendeeV2 ? <AttendeeTabBar /> : <CustomTabBar />)}
        </View>
        <NotificationsOverlay
          visible={notificationsOpen}
          onClose={onNotificationClose}
          notificationsState={notificationsState}
        />
      </View>
    </ScrollToTopProvider>
    </AttendeeCityProvider>
  );
}
