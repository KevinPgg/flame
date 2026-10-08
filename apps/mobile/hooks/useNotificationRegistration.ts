/**
 * Registers the device for push notifications on app boot when the user
 * is signed in. Also handles notification tap → deep link navigation.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useOptionalAuth } from "./useOptionalAuth";
import { registerForPushNotificationsAsync } from "../lib/notifications";
import { resolveNotificationDeepLink } from "../lib/notification-deep-links";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [5_000, 15_000, 30_000];
const EXHAUSTED_COOLDOWN_MS = 120_000;

export function useNotificationRegistration() {
  const { getToken, isSignedIn } = useOptionalAuth();
  const router = useRouter();
  const hasRegistered = useRef(false);
  const retryCount = useRef(0);
  const retriesExhaustedAt = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    if (!isSignedIn) {
      hasRegistered.current = false;
      retryCount.current = 0;
      retriesExhaustedAt.current = 0;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      return;
    }
    if (hasRegistered.current) return;
    if (
      retriesExhaustedAt.current > 0 &&
      Date.now() - retriesExhaustedAt.current < EXHAUSTED_COOLDOWN_MS
    ) {
      return;
    }

    const attempt = () => {
      registerForPushNotificationsAsync(getTokenRef.current)
        .then(() => {
          hasRegistered.current = true;
          retryCount.current = 0;
          retriesExhaustedAt.current = 0;
        })
        .catch((err) => {
          console.warn(
            `[useNotificationRegistration] Registration attempt ${retryCount.current + 1} failed:`,
            err,
          );
          hasRegistered.current = false;
          if (retryCount.current < MAX_RETRIES) {
            const delay = RETRY_DELAYS[retryCount.current] ?? 30_000;
            retryCount.current++;
            retryTimer.current = setTimeout(attempt, delay);
          } else {
            retriesExhaustedAt.current = Date.now();
          }
        });
    };

    // Delay the first attempt to give Clerk time to propagate the session
    // token after sign-in. Without this, getToken() returns a stale token.
    retryTimer.current = setTimeout(attempt, 3_000);

    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [isSignedIn]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | Record<string, string>
          | undefined;
        const path = resolveNotificationDeepLink(
          data?.type ?? "",
          data?.deepLink,
          data,
        );
        if (path) {
          try {
            router.push(path as never);
          } catch {
            // Gracefully ignore invalid deep links
          }
        }
      },
    );
    return () => subscription.remove();
  }, [router]);
}
