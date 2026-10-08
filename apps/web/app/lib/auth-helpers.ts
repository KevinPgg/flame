// Auth helper functions that combine Clerk and organization data

import { auth, currentUser } from "@clerk/nextjs/server";
import { getUserOrganization } from "./organizations";

export async function requireAuthWithOrganization() {
  const { userId } = await auth();
  const user = await currentUser();

  if (!userId || !user) {
    throw new Error("Authentication required");
  }

  const orgData = await getUserOrganization(userId);

  if (!orgData) {
    throw new Error("Organization membership required");
  }

  return {
    clerkUser: user,
    supabaseUser: orgData.supabaseUser,
    organization: orgData.organization,
    membership: orgData.membership,
  };
}

export async function getAuthenticatedUserContext() {
  const { userId } = await auth();
  const user = await currentUser();

  if (!userId || !user) {
    return null;
  }

  const orgData = await getUserOrganization(userId);

  return {
    clerkUser: user,
    supabaseUser: orgData?.supabaseUser || null,
    organization: orgData?.organization || null,
    membership: orgData?.membership || null,
    hasOrganization: !!orgData,
  };
}
