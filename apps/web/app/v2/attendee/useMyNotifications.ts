"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** One notification as the web bell shows it (GET /api/me/notifications). */
export type WebNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  image: string | null;
  href: string | null;
};

export const MY_NOTIFICATIONS_KEY = ["me-notifications"] as const;
type Data = { notifications: WebNotification[] };
type Target = { ids: string[] } | { all: true };

async function send(method: "PATCH" | "DELETE", target: Target) {
  const res = await fetch("/api/me/notifications", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(target),
  });
  if (!res.ok) throw new Error(`notifications ${method} ${res.status}`);
}

/**
 * The bell's data (fase 2.1): list + unread count, refreshed every minute and on focus;
 * mark read / delete update the list at once and roll back if the server says no.
 */
export function useMyNotifications(enabled = true) {
  const qc = useQueryClient();
  const query = useQuery<Data>({
    queryKey: MY_NOTIFICATIONS_KEY,
    queryFn: async () => {
      const res = await fetch("/api/me/notifications");
      if (!res.ok) throw new Error(`notifications ${res.status}`);
      return res.json();
    },
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const optimistic = (change: (list: WebNotification[]) => WebNotification[]) => {
    const previous = qc.getQueryData<Data>(MY_NOTIFICATIONS_KEY);
    if (previous) qc.setQueryData<Data>(MY_NOTIFICATIONS_KEY, { notifications: change(previous.notifications) });
    return { previous };
  };
  const rollback = (_e: unknown, _v: unknown, ctx?: { previous?: Data }) => {
    if (ctx?.previous) qc.setQueryData(MY_NOTIFICATIONS_KEY, ctx.previous);
  };
  const matches = (target: Target, n: WebNotification) => ("all" in target ? true : target.ids.includes(n.id));

  const markRead = useMutation({
    mutationFn: (target: Target) => send("PATCH", target),
    onMutate: (target) => optimistic((list) => list.map((n) => (matches(target, n) ? { ...n, read: true } : n))),
    onError: rollback,
  });
  const remove = useMutation({
    mutationFn: (target: Target) => send("DELETE", target),
    onMutate: (target) => optimistic((list) => list.filter((n) => !matches(target, n))),
    onError: rollback,
  });

  const notifications = query.data?.notifications ?? [];
  return {
    query,
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
    markRead,
    remove,
  };
}
