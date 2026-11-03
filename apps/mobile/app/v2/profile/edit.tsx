/** /v2/profile/edit — Edit profile (2026-11-02), opened from You and from Settings. Signed in. */
import { Redirect, type Href } from "expo-router";
import { EditProfile } from "../../../components/v2/attendee/you/EditProfile";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";

export default function EditProfileRoute() {
  const { isSignedIn } = useOptionalAuth();
  if (isSignedIn === false) return <Redirect href={"/sign-in" as Href} />;
  return <EditProfile />;
}
