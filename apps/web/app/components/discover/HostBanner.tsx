"use client";

import { useRouter } from "next/navigation";
import { IoMegaphone } from "react-icons/io5";
import { FiChevronRight } from "react-icons/fi";
import { useUser, SignInButton } from "@clerk/nextjs";
import { useUserRole } from "../../lib/hooks/useUserRole";

const bannerContent = (
  <>
    <div className="w-11 h-11 rounded-full bg-white-5 flex items-center justify-center shrink-0">
      <IoMegaphone size={20} className="text-white-100" aria-hidden />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-white-100 font-poppins-semibold text-sm m-0">
        Host your own events
      </p>
      <p className="text-white-50 text-xs font-poppins mt-[2px] m-0">
        Apply to become an organizer
      </p>
    </div>
    <FiChevronRight size={20} className="text-white-50 shrink-0" aria-hidden />
  </>
);

export function HostBanner() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();
  const { data: userRoleData, isLoading: isRoleLoading } = useUserRole();

  // Avoid routing until user role data is settled (prevents admins/organizers
  // being routed to onboarding while the query is still loading)
  const userRole = userRoleData?.role ?? null;
  const hasOrganization = userRoleData?.hasOrganization ?? false;
  const organizationApproved = userRoleData?.organization?.approved === true;

  const handleClick = () => {
    if (!isLoaded) return;
    if (isSignedIn && isRoleLoading) return; // Wait for role data before routing

    if (userRole === "admin") {
      router.push("/organizer?tab=create-event");
      return;
    }

    if (hasOrganization && !organizationApproved) {
      router.push("/account");
      return;
    }

    if (hasOrganization && organizationApproved) {
      router.push("/organizer?tab=create-event");
      return;
    }

    router.push("/?onboarding=true");
  };

  const buttonClassName =
    "w-full flex items-center gap-4 rounded-card px-4 py-4 bg-card hover:opacity-90 transition-opacity text-left";

  return (
    <div className="px-4">
      {isSignedIn ? (
        <button type="button" onClick={handleClick} className={buttonClassName}>
          {bannerContent}
        </button>
      ) : (
        <SignInButton
          mode="modal"
          forceRedirectUrl="/onboarding"
          signUpForceRedirectUrl="/onboarding"
        >
          <button type="button" className={buttonClassName}>
            {bannerContent}
          </button>
        </SignInButton>
      )}
    </div>
  );
}
