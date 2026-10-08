import { useState } from "react";
import { View, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { FlameText } from "@project-flame/ui";
import { BrandingHeader } from "../components/sign-in/BrandingHeader";
import { OAuthButton } from "../components/sign-in/OAuthButton";
import { AppleOAuthButton } from "../components/sign-in/AppleOAuthButton";
import { CredentialsForm } from "../components/sign-in/CredentialsForm";
import { ToggleMode } from "../components/sign-in/ToggleMode";
import { SignInBackButton } from "../components/sign-in/SignInBackButton";
import { SignInDivider } from "../components/sign-in/SignInDivider";
import { TermsDisclaimer } from "../components/sign-in/TermsDisclaimer";
import { SSONameCollection } from "../components/sign-in/SSONameCollection";
import { VerificationCodeInput } from "../components/sign-in/VerificationCodeInput";
import { useOptionalAuth } from "../hooks/useOptionalAuth";
import { useSignInHandlers } from "../hooks/useSignInHandlers";
import { PillButton } from "@project-flame/ui";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

type AuthMode = "sign-in" | "sign-up";

function SignInContent() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const {
    onGoogleAuth,
    onAppleAuth,
    onEmailSignIn,
    onEmailSignUp,
    onVerifyCode,
    cancelVerification,
    onCompleteSSONameCollection,
    cancelSSONameCollection,
    loading,
    error,
    setError,
    pendingVerification,
    pendingSSONameProvider,
  } = useSignInHandlers({
    email,
    password,
    firstName,
    lastName,
    mode,
    setMode,
  });

  const handleSubmit = mode === "sign-in" ? onEmailSignIn : onEmailSignUp;

  // SSO name-collection fallback. Apple only releases the user's name on
  // first authorization per Apple ID × bundle ID; any subsequent flow — or
  // a user who previously had Flame installed — returns without a name and
  // Clerk ("Require first and last name") keeps the sign-up incomplete.
  // Industry-standard pattern (Luma, Eventbrite, Airbnb): prompt for the
  // name, then finish the sign-up. See fix #127.
  if (pendingSSONameProvider) {
    return (
      <SSONameCollection
        provider={pendingSSONameProvider}
        error={error}
        loading={loading}
        onSubmit={onCompleteSSONameCollection}
        onCancel={cancelSSONameCollection}
      />
    );
  }

  if (pendingVerification) {
    return (
      <VerificationCodeInput
        email={email}
        error={error}
        loading={loading}
        onVerify={onVerifyCode}
        onBack={cancelVerification}
      />
    );
  }

  return (
    <View className="flex-1 px-6 justify-center">
      <SignInBackButton />

      <BrandingHeader mode={mode} />

      {/* Apple App Store Guideline 4.8 — Sign in with Apple must be offered
          as an equivalent login option. Rendered first per Apple HIG
          (at least as prominent as other OAuth options). */}
      <AppleOAuthButton onPress={onAppleAuth} disabled={loading} />
      <OAuthButton onPress={onGoogleAuth} disabled={loading} />

      <SignInDivider />

      <CredentialsForm
        mode={mode}
        email={email}
        password={password}
        firstName={firstName}
        lastName={lastName}
        showPassword={showPassword}
        error={error}
        loading={loading}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onFirstNameChange={setFirstName}
        onLastNameChange={setLastName}
        onToggleShowPassword={() => setShowPassword((prev) => !prev)}
        onSubmit={handleSubmit}
      />

      {/* Clickwrap legal disclaimer — consent surface for every auth path
          on this screen (Apple, Google, email sign-in, email sign-up).
          Visible on both sign-in and sign-up modes so returning users and
          brand-new users see the same terms at the same spot. Replaces the
          previous explicit checkbox (fix #127) — industry-standard pattern
          used by Luma, Eventbrite, Airbnb, Ticketmaster, Uber, Spotify. */}
      <TermsDisclaimer />

      <ToggleMode
        mode={mode}
        onToggle={() => {
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          setError("");
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sign-In / Sign-Up Screen (gate: avoid Clerk hooks when not configured)
// ---------------------------------------------------------------------------

export default function SignInScreen() {
  const { isConfigured } = useOptionalAuth();
  const router = useRouter();

  if (!isConfigured) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <FlameText variant="h4" className="text-white-100 text-center mb-4">
          Authentication not configured
        </FlameText>
        <FlameText
          variant="subtitle1"
          className="text-white-70 text-center mb-6"
        >
          Clerk publishable key is missing. Sign-in is disabled.
        </FlameText>
        {/* router.navigate is technically broken from fullScreenModals in production
            standalone builds (see APRIL_2026_FIXES.md #5/#6). Safe here because this
            screen only renders when EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is missing,
            which can't happen in EAS builds. If this ever needs to work in production,
            switch to CommonActions.reset (see navigateBackOrTabs in lib/navigation.ts). */}
        <PillButton
          label="Go Back"
          variant="solid"
          onPress={() => router.navigate("/(tabs)" as never)}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <SignInContent />
    </KeyboardAvoidingView>
  );
}
