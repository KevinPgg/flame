import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getUserOrganization } from "../lib/roles";

export default async function OnboardingPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
    return;
  }

  // Check if user already has an organization
  const organization = await getUserOrganization(userId);

  if (organization) {
    // User already has an organization, redirect to organizer dashboard
    redirect("/organizer");
  } else {
    // User needs to create organization, show onboarding modal
    redirect("/?onboarding=true");
  }
}
