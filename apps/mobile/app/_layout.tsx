import { useState } from "react";
import { Stack } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { colors } from "@project-flame/ui";
import { MemberRoleProvider } from "../contexts/MemberRoleContext";
import { AuthRedirectProvider } from "../contexts/AuthRedirectContext";
import { RoleResolutionGate } from "../components/navigation/RoleResolutionGate";
import { VersionGate } from "../components/system/VersionGate";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, ClerkLoaded } from "@clerk/expo";
import { tokenCache } from "../lib/token-cache";
import { useNotificationRegistration } from "../hooks/useNotificationRegistration";
import { useNotifications } from "../hooks/useNotifications";
import { useForegroundSessionRefresh } from "../hooks/useForegroundSessionRefresh";
import {
  Poppins_300Light,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import "../global.css";

// ---------------------------------------------------------------------------
// Conditional Stripe import — the native module is only available in dev builds
// (not Expo Go). We gracefully degrade so the app remains usable for non-payment
// flows when running via Expo Go.
// ---------------------------------------------------------------------------
let StripeProviderComponent: React.ComponentType<{
  publishableKey: string;
  merchantIdentifier?: string;
  /** Required for 3DS / SCA return-URL handling on iOS — must match the
   *  `scheme` in `app.json`. Without it, the post-3DS redirect to
   *  `project-flame://stripe-redirect` falls through to Expo Router and
   *  surfaces an "Unmatched Route" screen, leaving PaymentSheet unresolved
   *  and the RSVP never created. See MAY_2026_FIXES.md #26. */
  urlScheme?: string;
  children: React.ReactNode;
}> | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const stripe = require("@stripe/stripe-react-native");
  StripeProviderComponent = stripe.StripeProvider;
} catch {
  console.warn(
    "[layout] @stripe/stripe-react-native not available — running in Expo Go? " +
      "Stripe PaymentSheet will not work. Use a development build for payments.",
  );
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

// ---------------------------------------------------------------------------
// Optional provider wrappers — skip when env vars or native modules are missing
// ---------------------------------------------------------------------------

function OptionalStripeProvider({ children }: { children: React.ReactNode }) {
  if (!StripeProviderComponent || !stripePublishableKey) {
    return <>{children}</>;
  }
  return (
    <StripeProviderComponent
      publishableKey={stripePublishableKey}
      merchantIdentifier="merchant.com.projectflame.app"
      urlScheme="project-flame"
    >
      {children}
    </StripeProviderComponent>
  );
}

// ---------------------------------------------------------------------------
// Inner shell — must be inside ClerkProvider so hooks can access auth context.
// ---------------------------------------------------------------------------

function AppShell({
  notificationsOpen,
  onNotificationOpen,
  onNotificationClose,
}: {
  notificationsOpen: boolean;
  onNotificationOpen: () => void;
  onNotificationClose: () => void;
}) {
  useNotificationRegistration();
  // Refresh the Clerk session on foreground so auth gates don't act on a
  // transient isSignedIn=false before the SecureStore token rehydrates (W8-M1).
  useForegroundSessionRefresh();
  const notificationsState = useNotifications();

  return (
    <AuthRedirectProvider>
      <MemberRoleProvider>
        <RoleResolutionGate
          notificationsOpen={notificationsOpen}
          onNotificationOpen={onNotificationOpen}
          onNotificationClose={onNotificationClose}
          notificationsState={notificationsState}
        />
      </MemberRoleProvider>
    </AuthRedirectProvider>
  );
}

// ---------------------------------------------------------------------------
// Root Layout
// ---------------------------------------------------------------------------

export default function Layout() {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [fontsLoaded, fontsError] = useFonts({
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (fontsError) {
    console.error("[layout] useFonts failed:", fontsError);
  }

  if (!fontsLoaded && !fontsError) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  // AppShell is what Clerk gates — once Clerk has hydrated, render the real
  // app shell. If Clerk is unconfigured, just render AppShell directly.
  const shell = (
    <AppShell
      notificationsOpen={notificationsOpen}
      onNotificationOpen={() => setNotificationsOpen(true)}
      onNotificationClose={() => setNotificationsOpen(false)}
    />
  );

  const clerkWrappedShell = clerkPublishableKey ? (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      tokenCache={tokenCache}
    >
      <ClerkLoaded>{shell}</ClerkLoaded>
    </ClerkProvider>
  ) : (
    shell
  );

  // CRITICAL: VersionGate MUST sit OUTSIDE ClerkProvider/ClerkLoaded so the
  // hard-block screen renders even when Clerk hangs or fails to initialize
  // (e.g. clerk/javascript#8245 where isLoaded stays permanently false).
  // The whole point of the gate is to be non-bypassable during incidents.
  // VersionGate decides whether to render ForceUpdateScreen (status === "hard")
  // or its children — when it renders children, Clerk's normal gating kicks
  // back in. See docs/guides/EAS_OTA_UPDATES.md "Version Gating".
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <OptionalStripeProvider>
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider>
            <VersionGate>{clerkWrappedShell}</VersionGate>
          </SafeAreaProvider>
        </QueryClientProvider>
      </OptionalStripeProvider>
    </GestureHandlerRootView>
  );
}
