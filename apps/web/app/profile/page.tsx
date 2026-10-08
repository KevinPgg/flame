"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useUser, SignInButton } from "@clerk/nextjs";
import {
  IoSettingsOutline,
  IoTimeOutline,
  IoChevronForward,
  IoAdd,
  IoPersonCircleOutline,
} from "react-icons/io5";
import NavbarWrapper from "../components/NavbarWrapper";
import OnboardingModal from "../components/modals/OnboardingModal";
import SupportAdminSection from "./SupportAdminSection";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { SearchInput } from "../components/SearchInput";

/** Show a search bar once "My Organizers" reaches this many orgs. */
const ORG_SEARCH_THRESHOLD = 8;
import { Skeleton } from "../components/ui/Skeleton";
import { useUserProfile } from "../lib/hooks/useUserProfile";
import {
  useUserOrganizations,
  type UserOrganization,
} from "../lib/hooks/useOrganizations";

export default function ProfilePage() {
  const { isSignedIn, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background">
        <NavbarWrapper />
        <main className="pt-16">
          <div className="max-w-[800px] mx-auto px-4 pt-6">
            <ProfileHeaderSkeleton />
          </div>
        </main>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-background">
        <NavbarWrapper />
        <main className="pt-16">
          <div className="max-w-[800px] mx-auto px-4 pt-12 flex flex-col items-center gap-4">
            <p className="text-white-100 font-poppins-medium text-base text-center">
              Sign in to view your profile.
            </p>
            <SignInButton mode="modal" forceRedirectUrl="/profile">
              <button className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-6 py-2 flex items-center gap-2 hover:opacity-90 transition-opacity">
                <IoPersonCircleOutline size={20} />
                Sign in
              </button>
            </SignInButton>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavbarWrapper />
      <main className="pt-16">
        <div className="max-w-[800px] mx-auto px-4 py-6">
          <ProfileContent />
        </div>
      </main>
    </div>
  );
}

function ProfileContent() {
  const {
    profile,
    isLoading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useUserProfile();
  const orgsQuery = useUserOrganizations();
  const orgs = orgsQuery.data?.organizations;
  const orgsLoading = orgsQuery.isLoading;
  const orgsError = orgsQuery.error;
  const refetchOrgs = orgsQuery.refetch;

  const [becomeOrgVisible, setBecomeOrgVisible] = useState(false);
  const [orgSearch, setOrgSearch] = useState("");

  const orgSearchQuery = orgSearch.trim().toLowerCase();
  // Only apply the filter when the search input is actually shown, so a list
  // dropping below the threshold (with a stale query) can't hide orgs.
  const showOrgSearch = (orgs?.length ?? 0) >= ORG_SEARCH_THRESHOLD;
  const filteredOrgs =
    showOrgSearch && orgSearchQuery
      ? (orgs ?? []).filter((o) => o.name.toLowerCase().includes(orgSearchQuery))
      : orgs ?? [];

  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const initials =
    [profile?.first_name?.[0], profile?.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "?";

  const isProfileLoading = profileLoading && !profile;

  return (
    <>
      {/* Header row: avatar + name/email + Edit pill */}
      <div className="flex items-start gap-3">
        {isProfileLoading ? (
          <Skeleton className="w-[70px] h-[70px] rounded-full" />
        ) : (
          <div className="w-[70px] h-[70px] rounded-full bg-white-10 flex items-center justify-center overflow-hidden shrink-0">
            {profile?.profile_image_url ? (
              <Image
                src={profile.profile_image_url}
                alt={fullName || "Profile"}
                width={70}
                height={70}
                sizes="70px"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-white-100 text-2xl font-poppins-semibold">
                {initials}
              </span>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0 pt-[2px]">
          {isProfileLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-[140px] rounded" />
              <Skeleton className="h-3 w-[180px] rounded" />
            </div>
          ) : (
            <>
              <h1 className="text-white-100 text-lg leading-7 font-poppins-semibold truncate">
                {fullName || "Your Profile"}
              </h1>
              {profile?.email && (
                <p className="text-white-50 text-xs leading-4 font-poppins mt-[2px] truncate">
                  {profile.email}
                </p>
              )}
            </>
          )}
        </div>
        <Link
          href="/account?tab=settings"
          className="bg-white-5 border border-white-5 rounded-pill px-3 py-1.5 flex items-center gap-1 hover:bg-white-10 transition-colors shrink-0"
        >
          <IoSettingsOutline size={14} className="text-white-100" />
          <span className="text-white-100 text-xs leading-4 font-poppins-medium">
            Edit
          </span>
        </Link>
      </div>

      {/* My Organizers section — always-open accordion */}
      <CollapsibleSection title="My Organizers" count={orgs?.length} defaultOpen>
        {orgsLoading && !orgs?.length ? (
          <>
            <OrgRowSkeleton />
            <OrgRowSkeleton />
            <OrgRowSkeleton />
          </>
        ) : orgsError || profileError ? (
          <div className="py-6 flex flex-col items-center gap-3">
            <p className="text-white-80 text-sm leading-5 font-poppins text-center">
              Couldn&apos;t load your profile. Please try again.
            </p>
            <button
              onClick={() => {
                refetchProfile();
                refetchOrgs();
              }}
              className="bg-white-5 border border-white-20 rounded-pill px-6 py-2 hover:bg-white-10 transition-colors"
            >
              <span className="text-white-100 text-sm leading-5 font-poppins-medium">
                Retry
              </span>
            </button>
          </div>
        ) : (
          <>
            {showOrgSearch && (
              <SearchInput
                value={orgSearch}
                onChange={setOrgSearch}
                placeholder="Search organizers"
              />
            )}
            {filteredOrgs.map((org) => <OrgRow key={org.id} org={org} />)}
            {showOrgSearch && orgSearchQuery && filteredOrgs.length === 0 && (
              <p className="text-white-50 text-sm font-poppins py-2">No matches.</p>
            )}

            <button
              onClick={() => setBecomeOrgVisible(true)}
              className="bg-white-5 border border-white-5 border-dashed rounded-card p-3 flex items-center gap-3 hover:bg-white-10 transition-colors text-left"
            >
              <div className="w-[52px] h-[52px] rounded-card bg-white-5 flex items-center justify-center shrink-0">
                <IoAdd size={28} className="text-white-50" />
              </div>
              <span className="text-white-50 text-base leading-[22px] font-poppins">
                Create new organizer
              </span>
            </button>
          </>
        )}
      </CollapsibleSection>

      {/* Support-only org-approval queue (W7-H1) — renders nothing for non-admins */}
      <SupportAdminSection />

      <OnboardingModal
        isOpen={becomeOrgVisible}
        onClose={() => setBecomeOrgVisible(false)}
        onSuccess={() => setBecomeOrgVisible(false)}
      />
    </>
  );
}

function OrgRow({ org }: { org: UserOrganization }) {
  const isPending = !org.approved;
  const eventLabel = `${org.eventCount} event${org.eventCount === 1 ? "" : "s"}`;
  const initials = org.name.charAt(0).toUpperCase();

  const inner = (
    <>
      <div className="w-[52px] h-[52px] rounded-card bg-white-10 flex items-center justify-center overflow-hidden shrink-0">
        {org.logo_url ? (
          <Image
            src={org.logo_url}
            alt={org.name}
            width={52}
            height={52}
            sizes="52px"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-white-100 text-lg font-poppins-semibold">
            {initials}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white-100 text-base leading-[22px] font-poppins-semibold truncate">
          {org.name}
        </p>
        <p className="text-white-50 text-xs leading-4 font-poppins-light mt-[2px]">
          {isPending ? "Pending approval" : eventLabel}
        </p>
      </div>
      {isPending ? (
        <IoTimeOutline size={20} className="text-white-50 shrink-0" />
      ) : (
        <IoChevronForward size={20} className="text-white-100 shrink-0" />
      )}
    </>
  );

  if (isPending) {
    return (
      <div className="bg-white-5 border border-white-5 rounded-card p-3 flex items-center gap-3 opacity-60">
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={`/organizer?org=${encodeURIComponent(org.slug)}`}
      className="bg-white-5 border border-white-5 rounded-card p-3 flex items-center gap-3 hover:bg-white-10 transition-colors"
    >
      {inner}
    </Link>
  );
}

function OrgRowSkeleton() {
  return (
    <div className="bg-white-5 border border-white-5 rounded-card p-3 flex items-center gap-3">
      <Skeleton className="w-[52px] h-[52px] rounded-card" />
      <div className="flex-1 flex flex-col gap-2">
        <Skeleton className="h-[18px] w-3/5 rounded" />
        <Skeleton className="h-3 w-1/3 rounded" />
      </div>
    </div>
  );
}

function ProfileHeaderSkeleton() {
  return (
    <div className="flex items-start gap-3">
      <Skeleton className="w-[70px] h-[70px] rounded-full" />
      <div className="flex-1 flex flex-col gap-2 pt-[2px]">
        <Skeleton className="h-5 w-[140px] rounded" />
        <Skeleton className="h-3 w-[180px] rounded" />
      </div>
    </div>
  );
}
