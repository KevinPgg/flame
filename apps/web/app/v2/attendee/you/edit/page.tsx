import type { Metadata } from "next";
import { AttendeeShell } from "../../AttendeeShell";
import EditProfileView from "./EditProfileView";

/** Edit profile (2026-11-02), served at /profile/edit by the middleware rewrite. Signed-in only. */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit profile · Flame", robots: { index: false, follow: false } };

export default function EditProfilePage() {
  return (
    <AttendeeShell active="you">
      <EditProfileView />
    </AttendeeShell>
  );
}
