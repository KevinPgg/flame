"use client";

/**
 * "/?onboarding=true" opens the organizer onboarding (create your organization) — every v1 route
 * that needs an organization sends people there (/onboarding, /organizer, HostBanner…). The v1
 * Home did it; since 2.2 the Home is v2, so the v2 Home does it too, with the same modal.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import OnboardingModal from "../../components/modals/OnboardingModal";

export function OnboardingFromUrl() {
  const { isSignedIn, isLoaded } = useUser();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const asked = params?.get("onboarding") === "true";

  useEffect(() => {
    if (isLoaded && isSignedIn && asked) setOpen(true);
  }, [isLoaded, isSignedIn, asked]);

  const done = () => {
    setOpen(false);
    if (asked) {
      const url = new URL(window.location.href);
      url.searchParams.delete("onboarding");
      window.history.replaceState({}, "", url.toString());
    }
  };

  return <OnboardingModal isOpen={open} onClose={done} onSuccess={done} />;
}
