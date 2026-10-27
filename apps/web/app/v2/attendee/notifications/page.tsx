import type { Metadata } from "next";
import { AttendeeShell } from "../AttendeeShell";
import { NotificationsList } from "../NotificationsList";

/**
 * /notifications (rewritten here by the middleware; /v2/attendee/notifications also works) —
 * the full notifications page: what the bell opens on a phone. Signed-in only (/v2 is protected).
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notifications · Flame", robots: { index: false, follow: false } };

export default function NotificationsPage() {
  return (
    <AttendeeShell active={null}>
      <div className="mx-auto max-w-[680px] px-4 pt-6 lg:pt-10">
        <NotificationsList heading="h1" />
      </div>
    </AttendeeShell>
  );
}
