import type { Metadata } from "next";
import { AttendeeShell } from "../AttendeeShell";
import YouView from "./YouView";

/** "You" (fase 2.6), served at /profile by the middleware rewrite. Signed-in only. */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "You · Flame", robots: { index: false, follow: false } };

export default function YouPage() {
  return (
    <AttendeeShell active="you">
      <YouView />
    </AttendeeShell>
  );
}
