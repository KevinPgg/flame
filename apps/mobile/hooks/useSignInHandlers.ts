import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigation } from "expo-router";
import { useSignIn, useSignUp, useSSO, useAuth, useClerk } from "@clerk/expo";
import * as WebBrowser from "expo-web-browser";
import { apiPost } from "../lib/api";
import { navigateToTabs } from "../lib/navigation";
import { useAuthRedirect } from "../contexts/AuthRedirectContext";

type AuthMode = "sign-in" | "sign-up";

function getClerkErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === "object" && "errors" in err) {
    const errors = (err as { errors?: { code?: string; message: string }[] }).errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const { code, message } = errors[0];
      switch (code) {
        case "form_password_incorrect":
        case "form_identifier_not_found":
          // Collapsed intentionally to prevent account enumeration.
          return "Invalid email or password.";
        case "form_password_pwned":
          return "This password has been compromised. Please use a different password.";
        case "too_many_attempts":
          return "Too many attempts. Please wait a moment and try again.";
        case "session_exists":
          return "You are already signed in.";
        default:
          if (message) return message;
      }
    }
  }
  return fallback;
}

interface UseSignInHandlersOptions {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
}

// Minimal shape of the legacy Clerk `SignUpResource` that we interact with
// during the SSO name-collection fallback. Structural typing avoids pulling
// the full `SignUpResource` type from `@clerk/types` (which is a transitive
// dep not explicitly surfaced by `@clerk/expo`).
//
// `__internal_future.reset()` is the Future-API method that clears the local
// signUp state without hitting the API. We use it to forget abandoned SSO
// sign-up attempts so a subsequent email/password sign-up starts fresh (see
// fix for "No sign up was found with id sua_*" in APRIL_2026_FIXES.md).
type SSOSignUpHandle = {
  status: "missing_requirements" | "complete" | string;
  createdSessionId: string | null;
  missingFields?: string[];
  update: (params: {
    firstName?: string;
    lastName?: string;
    legalAccepted?: boolean;
  }) => Promise<unknown>;
  __internal_future?: {
    reset: () => Promise<{ error: unknown | null }>;
  };
};

// Clears any in-flight signUp attempt on the Clerk client so the next
// signUp operation starts clean. Safe to call when there's no current
// attempt — `reset()` is a local-only no-op in that case.
async function resetClerkSignUp(signUp: unknown): Promise<void> {
  if (!signUp || typeof signUp !== "object") return;
  const future = (signUp as { __internal_future?: { reset?: () => Promise<unknown> } })
    .__internal_future;
  try {
    if (future && typeof future.reset === "function") {
      await future.reset();
    }
  } catch (err) {
    if (__DEV__) {
      console.warn("[auth] signUp reset failed", err instanceof Error ? err.message : err);
    }
  }
}

type SSOProvider = "apple" | "google";

export function useSignInHandlers({
  email,
  password,
  firstName,
  lastName,
  mode,
  setMode,
}: UseSignInHandlersOptions) {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { startSSOFlow } = useSSO();
  const { getToken, isSignedIn } = useAuth();
  const { setActive } = useClerk();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [pendingClientTrust, setPendingClientTrust] = useState(false);
  // SSO fallback state: set when Apple/Google finishes but Clerk still has
  // missing first/last name fields (Apple's one-time name release gotcha).
  // The actual SignUp resource is held in a ref to avoid re-renders from
  // mutations Clerk performs on it internally.
  const [pendingSSONameProvider, setPendingSSONameProvider] =
    useState<SSOProvider | null>(null);
  const ssoSignUpRef = useRef<SSOSignUpHandle | null>(null);
  const ssoHandlerNameRef = useRef<string | null>(null);
  const { setAuthRedirecting } = useAuthRedirect();

  // Track whether a post-sign-in sync is needed. The actual sync runs in a
  // useEffect that fires after Clerk has re-rendered with the new session,
  // guaranteeing getToken() returns a fresh JWT instead of a stale one.
  const [pendingSyncHandler, setPendingSyncHandler] = useState<string | null>(null);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    if (!isSignedIn || !pendingSyncHandler) return;
    const handler = pendingSyncHandler;
    setPendingSyncHandler(null);

    (async () => {
      try {
        await apiPost("/api/auth/sync-current-user", {}, getTokenRef.current);
      } catch (syncErr) {
        const err = syncErr instanceof Error ? syncErr : new Error(String(syncErr));
        console.warn("[auth] sync-current-user failed", {
          handler,
          errorMessage: err.message,
          errorName: err.name,
        });
      }
    })();
  }, [isSignedIn, pendingSyncHandler]);

  const completeAuthAndRedirect = useCallback(
    (handler: string) => {
      setAuthRedirecting(true);
      setPendingSyncHandler(handler);
    },
    [setAuthRedirecting]
  );

  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  // Shared SSO runner used by Google and Apple. Both providers use Clerk's
  // `useSSO` hook with different strategy strings. Clerk handles Apple's
  // identity flow (including the one-time name/email release on first
  // sign-in and the private-relay email address) internally.
  const runSSOFlow = useCallback(
    async (
      strategy: "oauth_google" | "oauth_apple",
      providerLabel: "google" | "apple",
      handlerName: string,
    ) => {
      if (loading) return;
      if (__DEV__) console.log("[auth] sso_signin", { provider: providerLabel, status: "starting" });
      setLoading(true);
      setError("");

      let didNavigate = false;
      try {
        const redirectUrl = "com.projectflame.app://callback";
        if (__DEV__) console.log("[auth] sso_signin redirect url:", redirectUrl);
        const result = await startSSOFlow({
          strategy,
          redirectUrl,
        });
        if (__DEV__) console.log("[auth] sso_signin", {
          provider: providerLabel,
          status: result.createdSessionId ? "success" : "no_session",
        });

        // Happy path: existing user — Clerk returned a session immediately.
        if (result.createdSessionId && result.setActive) {
          await result.setActive({ session: result.createdSessionId });
          if (__DEV__) console.log("[auth] sso_signin", { provider: providerLabel, status: "activated" });
          completeAuthAndRedirect(handlerName);
          navigateToTabs(navigation);
          didNavigate = true;
          return;
        }

        // New-user path: Clerk returned a SignUp attempt instead of a session
        // because no matching account existed. With Terms of Service required
        // in the Clerk dashboard, `legal_accepted` is a missing field. We
        // treat the clickwrap disclaimer under the OAuth buttons as legal
        // acceptance (industry standard — Luma/Eventbrite/Airbnb/Ticketmaster).
        // Ref: https://clerk.com/docs/guides/development/custom-flows/authentication/oauth-connections
        const initialSignUp = result.signUp as SSOSignUpHandle | undefined;
        if (initialSignUp && result.setActive) {
          // After any `update()` call we read status/createdSessionId off the
          // resolved resource rather than assuming in-place mutation of the
          // original `initialSignUp`. Clerk's legacy `SignUpResource` does
          // mutate in place today, but the Future API (and potentially a
          // future SDK change to the legacy resource) may return a fresh
          // object — this pattern is resilient to both.
          let currentSignUp: SSOSignUpHandle = initialSignUp;

          if (currentSignUp.status === "missing_requirements") {
            if (__DEV__) {
              console.log("[auth] sso_signin", {
                provider: providerLabel,
                status: "missing_requirements",
                missingFields: currentSignUp.missingFields,
              });
            }
            // NOTE: `useSSO()` returns the legacy `SignUpResource` (not the
            // Future API). Its `update()` throws on validation failure rather
            // than returning `{ error }`. The outer try/catch handles failures.
            const updated = (await currentSignUp.update({
              legalAccepted: true,
            })) as SSOSignUpHandle | undefined;
            if (updated) currentSignUp = updated;
          }

          if (currentSignUp.status === "complete" && currentSignUp.createdSessionId) {
            await result.setActive({ session: currentSignUp.createdSessionId });
            if (__DEV__) console.log("[auth] sso_signin", { provider: providerLabel, status: "activated_new_user" });
            completeAuthAndRedirect(handlerName);
            navigateToTabs(navigation);
            didNavigate = true;
            return;
          }

          // Still missing `first_name` / `last_name`. Apple's Sign in with
          // Apple only releases the user's name on the FIRST authorization
          // per Apple ID × bundle ID — a user who previously authorized the
          // app (dev build, TestFlight, prior install) gets no name on
          // subsequent flows. Clerk's "Require first and last name" keeps
          // the sign-up in `missing_requirements`. Industry-standard fix
          // (Luma, Eventbrite, Airbnb): show a short "Complete your profile"
          // prompt, collect first + last name, then call `signUp.update(...)`
          // to finish. Handled by `onCompleteSSONameCollection` below.
          const remaining = currentSignUp.missingFields ?? [];
          const nameMissing =
            remaining.includes("first_name") || remaining.includes("last_name");
          if (nameMissing) {
            if (__DEV__) {
              console.log("[auth] sso_signin", {
                provider: providerLabel,
                status: "awaiting_name_collection",
                missingFields: remaining,
              });
            }
            ssoSignUpRef.current = currentSignUp;
            ssoHandlerNameRef.current = handlerName;
            setPendingSSONameProvider(providerLabel);
            // Deliberately NOT setting didNavigate here — we want the finally
            // block to clear the loading state and redirect overlay so the
            // name-collection screen is interactive.
            return;
          }

          if (__DEV__) {
            console.warn("[auth] sso_signin still incomplete", {
              provider: providerLabel,
              status: currentSignUp.status,
              missingFields: remaining,
            });
          }
          // Abandon the incomplete SSO signUp attempt so a subsequent email
          // signUp doesn't try to PATCH a now-stale `sua_*` id and 404.
          await resetClerkSignUp(currentSignUp);
          setError("We couldn't finish creating your account. Please try signing up with email instead.");
          return;
        }

        // Fallback: no session, no sign-up — truly unexpected.
        const providerName = providerLabel === "apple" ? "Apple" : "Google";
        setError(`Sign-in failed: no session created from ${providerName}. Please try again.`);
        return;
      } catch (err: unknown) {
        const providerName = providerLabel === "apple" ? "Apple" : "Google";
        const msg = getClerkErrorMessage(err, `${providerName} sign-in failed. Please try again.`);
        if (__DEV__) {
          const errSummary =
            err instanceof Error ? { message: err.message, code: (err as { code?: string }).code } : {};
          console.error("[auth] sso_signin", { action: "sso_signin", provider: providerLabel, status: "failure", ...errSummary });
        }
        setError(msg);
      } finally {
        // Only clear the auth-redirecting overlay on failure. On success,
        // navigateToTabs resets to (tabs) and the home screen's useFocusEffect
        // clears the overlay. The 15s timeout in AuthRedirectContext is a safety net.
        if (!didNavigate) setAuthRedirecting(false);
        setLoading(false);
      }
    },
    [loading, startSSOFlow, completeAuthAndRedirect, navigation, setAuthRedirecting],
  );

  const onGoogleAuth = useCallback(
    () => runSSOFlow("oauth_google", "google", "onGoogleAuth"),
    [runSSOFlow],
  );

  // Apple App Store Guideline 4.8 — equivalent login option. Sign in with
  // Apple satisfies all three 4.8 requirements: (1) limits data collection
  // to name + email, (2) allows users to hide their email via private relay,
  // (3) doesn't track interactions for ads.
  const onAppleAuth = useCallback(
    () => runSSOFlow("oauth_apple", "apple", "onAppleAuth"),
    [runSSOFlow],
  );

  // Called from the <SSONameCollection> fallback screen when Apple/Google
  // didn't release a user name. Updates the already-created SignUp attempt
  // with first + last name, then activates the session.
  const onCompleteSSONameCollection = useCallback(
    async (firstNameInput: string, lastNameInput: string) => {
      if (loading) return;
      const ssoSignUp = ssoSignUpRef.current;
      const handlerName = ssoHandlerNameRef.current;
      if (!ssoSignUp || !handlerName) {
        setError("Sign-in session expired. Please try again.");
        setPendingSSONameProvider(null);
        return;
      }

      if (__DEV__) {
        console.log("[auth] sso_name_collection", { status: "submitting" });
      }
      setLoading(true);
      setError("");

      let didNavigate = false;
      try {
        // Capture the resolved resource rather than relying on in-place
        // mutation of `ssoSignUp`. See matching note in `runSSOFlow` — makes
        // the flow resilient to a Clerk SDK that returns a fresh resource
        // from `update()`.
        const updatedSignUp =
          ((await ssoSignUp.update({
            firstName: firstNameInput,
            lastName: lastNameInput,
          })) as SSOSignUpHandle | undefined) ?? ssoSignUp;

        if (
          updatedSignUp.status === "complete" &&
          updatedSignUp.createdSessionId
        ) {
          await setActive({ session: updatedSignUp.createdSessionId });
          if (__DEV__) {
            console.log("[auth] sso_name_collection", { status: "activated" });
          }
          ssoSignUpRef.current = null;
          ssoHandlerNameRef.current = null;
          setPendingSSONameProvider(null);
          completeAuthAndRedirect(handlerName);
          navigateToTabs(navigation);
          didNavigate = true;
          return;
        }

        if (__DEV__) {
          console.warn("[auth] sso_name_collection still incomplete", {
            status: updatedSignUp.status,
            missingFields: updatedSignUp.missingFields,
          });
        }
        // Keep the stashed ref in sync with the newest state in case the
        // user retries (e.g. Clerk rejected the names as too short).
        ssoSignUpRef.current = updatedSignUp;
        setError("We couldn't finish creating your account. Please try again.");
      } catch (err: unknown) {
        if (__DEV__) {
          const errSummary =
            err instanceof Error
              ? { message: err.message, code: (err as { code?: string }).code }
              : {};
          console.error("[auth] sso_name_collection", {
            action: "sso_name_collection",
            status: "failure",
            ...errSummary,
          });
        }
        setError(
          getClerkErrorMessage(err, "Couldn't save your name. Please try again."),
        );
      } finally {
        if (!didNavigate) setAuthRedirecting(false);
        setLoading(false);
      }
    },
    [loading, setActive, completeAuthAndRedirect, navigation, setAuthRedirecting],
  );

  const cancelSSONameCollection = useCallback(() => {
    if (loading) return;
    const abandoned = ssoSignUpRef.current;
    ssoSignUpRef.current = null;
    ssoHandlerNameRef.current = null;
    setPendingSSONameProvider(null);
    setError("");
    // Clear the stale signUp attempt from Clerk's client state. Otherwise a
    // subsequent email/password sign-up will try to PATCH the abandoned
    // `sua_*` id and fail with "No sign up was found". Fire-and-forget — the
    // UI has already dismissed and reset() is a local-only state clear.
    void resetClerkSignUp(abandoned);
  }, [loading]);

  const onEmailSignIn = useCallback(async () => {
    if (loading) return;
    if (!signIn) {
      setError("Authentication is still loading. Please wait a moment and try again.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    if (__DEV__) console.log("[auth] email_signin", { status: "starting" });
    setLoading(true);
    setError("");

    let didNavigate = false;
    try {
      // Clerk Core 3: create() throws ClerkAPIError on failure; status lives on the signIn signal
      await signIn.create({
        identifier: email.trim(),
        password,
      });

      const status = signIn.status;
      if (__DEV__) console.log("[auth] email_signin", {
        status,
        hasSession: !!signIn.createdSessionId,
      });

      if (status === "complete" && signIn.createdSessionId) {
        await setActive({ session: signIn.createdSessionId });
        if (__DEV__) console.log("[auth] email_signin", { status: "activated" });
        completeAuthAndRedirect("onEmailSignIn");
        navigateToTabs(navigation);
        didNavigate = true;
      } else if (status === "needs_client_trust" || status === "needs_second_factor") {
        const factors = signIn.supportedSecondFactors;
        const emailFactor = factors?.find((f: { strategy: string }) => f.strategy === "email_code");
        if (emailFactor) {
          await signIn.mfa.sendEmailCode();
          if (__DEV__) console.log("[auth] email_signin", { status: "client_trust_code_sent" });
          setPendingClientTrust(true);
        } else {
          if (__DEV__) console.warn("[auth] email_signin no email_code factor", { factors });
          setError("Verification required but no email verification available.");
        }
      } else {
        if (__DEV__) console.warn("[auth] email_signin unhandled status", { status });
        setError("Sign in could not be completed. Please try again or contact support.");
      }
    } catch (err: unknown) {
      if (__DEV__) {
        const errSummary =
          err instanceof Error ? { message: err.message, code: (err as { code?: string }).code } : {};
        console.error("[auth] email_signin", { action: "email_signin", status: "failure", ...errSummary });
      }
      setError(getClerkErrorMessage(err, "Sign in failed. Please check your credentials."));
    } finally {
      if (!didNavigate) setAuthRedirecting(false);
      setLoading(false);
    }
  }, [loading, signIn, email, password, setActive, completeAuthAndRedirect, navigation, setAuthRedirecting]);

  const onEmailSignUp = useCallback(async () => {
    if (loading) return;
    if (!signUp) {
      setError("Authentication is still loading. Please wait a moment and try again.");
      return;
    }
    if (!firstName?.trim() || !lastName?.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    if (__DEV__) console.log("[auth] email_signup", { status: "starting" });
    setLoading(true);
    setError("");

    let didNavigate = false;
    try {
      // Defensive: clear any stale signUp state from an abandoned SSO attempt
      // before starting a fresh email/password flow. Without this, Clerk's
      // client keeps the last `sua_*` id in memory and `signUp.password()`
      // tries to PATCH it, causing a 404 "No sign up was found with id sua_*"
      // (e.g. after a user taps Apple → back out of name collection → switch
      // to email). reset() is a local-only state clear, safe on fresh state.
      await resetClerkSignUp(signUp);

      // Clerk v3 API: signUp.password() initializes email+password sign-up in one call.
      // legalAccepted is required when Terms of Service is enabled in the Clerk dashboard.
      const { error: passwordError } = await signUp.password({
        emailAddress: email.trim(),
        password,
        firstName: firstName!.trim(),
        lastName: lastName!.trim(),
        // Consent surface is the clickwrap <TermsDisclaimer> visible on the
        // sign-up screen ("By continuing, you agree to our Terms..."). The
        // explicit checkbox was removed in fix #127 so we always pass true
        // here — the user already saw the disclaimer and tapped submit.
        legalAccepted: true,
      });

      if (passwordError) {
        if (__DEV__) console.error("[auth] email_signup password error", passwordError);
        setError(getClerkErrorMessage(
          { errors: [passwordError] },
          "Sign up failed. Please try again.",
        ));
        return;
      }

      const status = signUp.status;
      if (__DEV__) console.log("[auth] email_signup", { status, hasSession: !!signUp.createdSessionId });

      if (status === "complete" && signUp.createdSessionId) {
        await setActive({ session: signUp.createdSessionId });
        if (__DEV__) console.log("[auth] email_signup", { status: "activated_no_verification" });
        completeAuthAndRedirect("onEmailSignUp");
        navigateToTabs(navigation);
        didNavigate = true;
        return;
      }

      await signUp.verifications.sendEmailCode();

      if (__DEV__) console.log("[auth] email_signup", { status: "verification_sent" });
      setPendingVerification(true);
    } catch (err: unknown) {
      if (__DEV__) {
        const errSummary =
          err instanceof Error ? { message: err.message, code: (err as { code?: string }).code } : {};
        console.error("[auth] email_signup", {
          action: "email_signup",
          status: "failure",
          ...errSummary,
        });
      }
      setError(getClerkErrorMessage(err, "Sign up failed. Please try again."));
    } finally {
      if (!didNavigate) setAuthRedirecting(false);
      setLoading(false);
    }
  }, [loading, signUp, setActive, email, password, firstName, lastName, completeAuthAndRedirect, navigation, setAuthRedirecting]);

  const onVerifyCode = useCallback(async (code: string) => {
    if (loading) return;
    const digitsOnly = code.replace(/\D/g, "");
    if (digitsOnly.length !== 6) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    if (__DEV__) console.log("[auth] email_verify", { status: "starting", isClientTrust: pendingClientTrust });
    setLoading(true);
    setError("");

    let didNavigate = false;
    try {
      if (pendingClientTrust) {
        if (!signIn) { setError("Sign-in session expired. Please try again."); return; }
        await signIn.mfa.verifyEmailCode({ code: digitsOnly });
        if (__DEV__) console.log("[auth] email_verify client_trust", { status: signIn.status });
        if (signIn.status === "complete" && signIn.createdSessionId) {
          await setActive({ session: signIn.createdSessionId });
          if (__DEV__) console.log("[auth] email_verify", { status: "activated_client_trust" });
          setPendingClientTrust(false);
          completeAuthAndRedirect("onVerifyCode_clientTrust");
          navigateToTabs(navigation);
          didNavigate = true;
        } else {
          setError("Verification incomplete. Please try again.");
        }
      } else {
        if (!signUp) { setError("Sign-up session expired. Please try again."); return; }
        await signUp.verifications.verifyEmailCode({ code: digitsOnly });
        if (__DEV__) console.log("[auth] email_verify signup", { status: signUp.status });
        if (signUp.status === "complete" && signUp.createdSessionId) {
          await setActive({ session: signUp.createdSessionId });
          if (__DEV__) console.log("[auth] email_verify", { status: "activated" });
          completeAuthAndRedirect("onVerifyCode");
          navigateToTabs(navigation);
          didNavigate = true;
        } else {
          setError("Verification incomplete. Please try again.");
        }
      }
    } catch (err: unknown) {
      if (__DEV__) {
        const errSummary =
          err instanceof Error ? { message: err.message, code: (err as { code?: string }).code } : {};
        console.error("[auth] email_verify", {
          action: "email_verify",
          status: "failure",
          ...errSummary,
        });
      }
      setError(getClerkErrorMessage(err, "Verification failed. Please check the code and try again."));
    } finally {
      if (!didNavigate) setAuthRedirecting(false);
      setLoading(false);
    }
  }, [loading, pendingClientTrust, signIn, signUp, setActive, completeAuthAndRedirect, navigation, setAuthRedirecting]);

  const cancelVerification = useCallback(() => {
    if (loading) return;
    setPendingVerification(false);
    setPendingClientTrust(false);
    setError("");
  }, [loading]);

  return {
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
    pendingVerification: pendingVerification || pendingClientTrust,
    pendingSSONameProvider,
  };
}
