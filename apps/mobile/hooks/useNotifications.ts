/**
 * Hook for fetching and managing notification data from the notifications table.
 * Queries Supabase directly via Clerk JWT + RLS.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOptionalAuth } from "./useOptionalAuth";
import { getAuthenticatedClient } from "../lib/supabase-auth";

export interface NotificationRecord {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  read: boolean;
  created_at: string;
}

export function useNotifications() {
  const { getToken, isSignedIn, userId } = useOptionalAuth();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);
  const requestVersion = useRef(0);
  const tokenFailCount = useRef(0);
  const lastTokenFailTime = useRef(0);
  const dismissedIds = useRef(new Set<string>());
  // Latest list for actions that need it synchronously (a setState updater runs later).
  const latestNotifications = useRef<NotificationRecord[]>([]);
  latestNotifications.current = notifications;

  const visibleNotifications = useMemo(
    () => notifications.filter((n) => !dismissedIds.current.has(n.id)),
    [notifications],
  );

  const unreadCount = useMemo(
    () => visibleNotifications.filter((n) => !n.read).length,
    [visibleNotifications],
  );

  const fetchNotifications = useCallback(async () => {
    if (!isSignedIn) {
      requestVersion.current += 1;
      tokenFailCount.current = 0;
      lastTokenFailTime.current = 0;
      setNotifications((prev) => (prev.length === 0 ? prev : []));
      setError(null);
      setIsLoading(false);
      hasLoadedOnce.current = false;
      return;
    }
    const TOKEN_FAIL_COOLDOWN_MS = 60_000;
    const now = Date.now();
    if (
      tokenFailCount.current >= 3 &&
      now - lastTokenFailTime.current < TOKEN_FAIL_COOLDOWN_MS
    ) {
      return;
    }

    requestVersion.current += 1;
    const version = requestVersion.current;
    setIsLoading(true);
    setError(null);

    const attemptFetch = async (isRetry: boolean) => {
      const supabase = await getAuthenticatedClient(getToken);
      if (requestVersion.current !== version) return null;

      const { data, error: queryError } = await supabase
        .from("notifications")
        .select("id, type, title, body, data, read, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (requestVersion.current !== version) return null;

      if (
        queryError &&
        !isRetry &&
        (queryError.code === "PGRST303" ||
          (typeof queryError.message === "string" &&
            queryError.message.toLowerCase().includes("jwt expired")))
      ) {
        return attemptFetch(true);
      }

      if (queryError) throw queryError;
      return (data ?? []) as NotificationRecord[];
    };

    try {
      const items = await attemptFetch(false);
      if (items && requestVersion.current === version) {
        tokenFailCount.current = 0;
        lastTokenFailTime.current = 0;
        setNotifications(items);
      }
    } catch (err) {
      if (requestVersion.current !== version) return;
      const isTokenError =
        err instanceof Error &&
        err.message.includes("Failed to obtain Supabase token");
      if (isTokenError) {
        tokenFailCount.current += 1;
        lastTokenFailTime.current = Date.now();
        if (tokenFailCount.current <= 1) {
          console.warn("[useNotifications] Supabase token unavailable — pausing for 60s");
        }
      } else {
        console.error("[useNotifications] fetchNotifications failed", {
          action: "fetchNotifications",
          userId: userId ?? undefined,
          version,
          currentVersion: requestVersion.current,
          error: err,
        });
      }
      setError("Failed to load notifications");
    } finally {
      if (requestVersion.current === version) {
        setIsLoading(false);
        hasLoadedOnce.current = true;
      }
    }
  }, [isSignedIn, getToken, userId]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!isSignedIn) return;
      try {
        const supabase = await getAuthenticatedClient(getToken);
        const { error } = await supabase
          .from("notifications")
          .update({ read: true })
          .eq("id", notificationId);

        if (error) {
          console.error("[useNotifications] markAsRead failed:", error);
          return;
        }

        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, read: true } : n,
          ),
        );
      } catch (err) {
        console.error("[useNotifications] markAsRead failed:", err);
      }
    },
    [isSignedIn, getToken],
  );

  const markAllAsRead = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const supabase = await getAuthenticatedClient(getToken);
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("read", false);

      if (error) {
        console.error("[useNotifications] markAllAsRead failed:", error);
        return;
      }

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      console.error("[useNotifications] markAllAsRead failed:", err);
    }
  }, [isSignedIn, getToken]);

  const dismiss = useCallback(
    async (notificationId: string) => {
      if (!isSignedIn || !userId) return;
      dismissedIds.current.add(notificationId);
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      try {
        const supabase = await getAuthenticatedClient(getToken);
        const { data: user, error: userError } = await supabase
          .from("users")
          .select("id")
          .eq("clerk_id", userId)
          .single();

        if (userError || !user) return;

        const { error } = await supabase
          .from("notifications")
          .delete()
          .eq("id", notificationId)
          .eq("user_id", user.id);

        if (error) {
          console.error("[useNotifications] dismiss failed:", error);
        }
      } catch (err) {
        console.error("[useNotifications] dismiss failed:", err);
      }
    },
    [isSignedIn, getToken, userId],
  );

  /**
   * Delete every notification on screen. Fix 2026-10-27: the ids were collected inside a
   * setState updater, which React runs later — the list was always empty at the check, so
   * nothing was deleted and everything came back on the next load. On failure the list is
   * restored and the error is thrown for the screen to show.
   */
  const dismissAll = useCallback(async () => {
    if (!isSignedIn || !userId) return;
    const idsToDelete = latestNotifications.current
      .filter((n) => !dismissedIds.current.has(n.id))
      .map((n) => n.id);
    if (idsToDelete.length === 0) return;
    idsToDelete.forEach((id) => dismissedIds.current.add(id));
    setNotifications((prev) => prev.filter((n) => !idsToDelete.includes(n.id)));
    const restore = () => {
      idsToDelete.forEach((id) => dismissedIds.current.delete(id));
      void fetchNotifications();
    };
    try {
      const supabase = await getAuthenticatedClient(getToken);
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("clerk_id", userId)
        .single();

      if (userError || !user) throw userError ?? new Error("user not found");

      // Mark all as read first — RLS policy may restrict deletion to read notifications
      const { error: markReadError } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .in("id", idsToDelete);
      if (markReadError) {
        console.error("[useNotifications] dismissAll markReadBeforeDelete failed:", {
          action: "markReadBeforeDelete",
          userId: user.id,
          idsToDelete,
          error: markReadError,
        });
      }

      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("user_id", user.id)
        .in("id", idsToDelete);

      if (error) throw error;
    } catch (err) {
      console.error("[useNotifications] dismissAll failed:", err);
      restore();
      throw err;
    }
  }, [isSignedIn, getToken, userId, fetchNotifications]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  return {
    notifications: visibleNotifications,
    unreadCount,
    isLoading,
    isInitialLoad: isLoading && !hasLoadedOnce.current,
    error,
    refresh: fetchNotifications,
    markAsRead,
    markAllAsRead,
    dismiss,
    dismissAll,
  };
}
