/**
 * Hook for reading and updating notification preferences on the users table.
 */

import { useCallback, useEffect, useState } from "react";
import type { NotificationType } from "@project-flame/lib";
import { NON_DISMISSABLE_NOTIFICATION_TYPES } from "@project-flame/lib";
import { useOptionalAuth } from "./useOptionalAuth";
import { getAuthenticatedClient } from "../lib/supabase-auth";

export type { NotificationType };

export type NotificationPreferences = Record<NotificationType, boolean>;

const DEFAULT_PREFERENCES: NotificationPreferences = {
  rsvp_pending: true,
  rsvp_approved: true,
  rsvp_rejected: true,
  event_date_changed: true,
  event_reminder: true,
  new_rsvp_request: true,
  ticket_sold: true,
  ticket_received: true,
  auth_expiry_warning: true,
  organization_approved: true,
  organization_rejected: true,
  team_invitation: true,
  followed_org_event: true,
};

export function useNotificationPreferences() {
  const { getToken, isSignedIn } = useOptionalAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPreferences = useCallback(async () => {
    if (!isSignedIn) return;
    setIsLoading(true);
    try {
      const supabase = await getAuthenticatedClient(getToken);
      // RLS on the `users` table scopes SELECT to the current user's row
      // via auth.jwt() ->> 'sub' matching clerk_id, so no explicit .eq() needed.
      const { data } = await supabase
        .from("users")
        .select("notification_preferences")
        .single();

      if (data?.notification_preferences) {
        const merged: NotificationPreferences = {
          ...DEFAULT_PREFERENCES,
          ...(data.notification_preferences as Partial<NotificationPreferences>),
        };
        // Non-dismissable types must always be true regardless of persisted value
        for (const type of NON_DISMISSABLE_NOTIFICATION_TYPES) {
          merged[type] = true;
        }
        setPreferences(merged);
      }
    } catch (err) {
      console.error("[useNotificationPreferences] fetch failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, getToken]);

  const updatePreference = useCallback(
    async (type: NotificationType, enabled: boolean) => {
      // Non-dismissable types cannot be turned off — ignore attempts to disable them
      if (NON_DISMISSABLE_NOTIFICATION_TYPES.has(type)) return;

      const prevPreferences = preferences;
      const updated = { ...prevPreferences, [type]: enabled };
      setPreferences(updated);

      try {
        const supabase = await getAuthenticatedClient(getToken);
        // RLS on the `users` table scopes UPDATE to the current user's row.
        const { error } = await supabase
          .from("users")
          .update({ notification_preferences: updated });

        if (error) {
          console.error("[useNotificationPreferences] update failed:", error);
          setPreferences(prevPreferences);
          return;
        }
      } catch (err) {
        console.error("[useNotificationPreferences] update failed:", err);
        setPreferences(prevPreferences);
      }
    },
    [preferences, getToken],
  );

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  return { preferences, isLoading, updatePreference };
}
