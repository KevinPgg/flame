"use client";

import { useState, useMemo, useRef, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import {
  Ticket,
  Calendar,
  LocationEdit,
} from "@mynaui/icons-react";
import { FiCamera, FiTrash2, FiChevronDown, FiChevronUp, FiSearch } from "react-icons/fi";
import { useUserTickets } from "../lib/hooks/useUserTickets";
import { useUserProfile } from "../lib/hooks/useUserProfile";
import LoadingSpinner from "./LoadingSpinner";
import {
  separateTicketGroupsByDate,
  getFirstTicketIdForGroup,
  type TicketGroupDisplay,
} from "../lib/utils/user-ticket-mappers";

type UserRole = "user" | "organizer" | "admin";

interface SerializedUser {
  id: string;
  email: string;
  clerk_id: string;
  first_name?: string;
  last_name?: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

interface UserDashboardProps {
  user: SerializedUser;
}

type DashboardTab = "tickets" | "settings";

export default function UserDashboard({ user }: UserDashboardProps) {
  return (
    <Suspense fallback={null}>
      <UserDashboardInner user={user} />
    </Suspense>
  );
}

// Named export for account page import compatibility
export { UserDashboard };

function UserDashboardInner({ user }: UserDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: DashboardTab = tabParam === "settings" ? "settings" : "tickets";
  const { user: clerkUser, signOut } = useClerk();
  const queryClient = useQueryClient();
  const { data: ticketData, isLoading: ticketsLoading } = useUserTickets();
  const { profile, refetch: refetchProfile } = useUserProfile();
  const [pastExpanded, setPastExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Profile image upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const tickets = ticketData?.tickets ?? [];

  const { currentGroups, pastGroups, ticketStats } = useMemo(() => {
    const { currentGroups, pastGroups } = separateTicketGroupsByDate(tickets);
    const currentTickets = currentGroups.flatMap((g) => g.tickets);
    // Purchased: each issued/checked-in row represents one ticket — row count
    // equals ticket count.
    const purchased = currentTickets.filter(
      (t) =>
        (t.type === "ticket" || t.type === "promotional") &&
        (t.status === "issued" || t.status === "checked_in"),
    ).length;
    // Pending: a single RSVP row can represent multiple requested tickets, so
    // sum requested_quantity instead of counting rows. Otherwise the card
    // shows "QNT: 3" while the stat pill says "Pending: 1".
    const pending = currentTickets
      .filter(
        (t) =>
          t.type === "rsvp" &&
          (t.status === "pending" || t.status === "approved"),
      )
      .reduce((sum, t) => sum + (t.requested_quantity ?? t.quantity ?? 1), 0);
    return {
      currentGroups,
      pastGroups,
      ticketStats: {
        total: purchased + pending,
        purchased,
        pending,
      },
    };
  }, [tickets]);

  // Filter groups by search query
  const filteredCurrentGroups = useMemo(() => {
    if (!searchQuery.trim()) return currentGroups;
    const q = searchQuery.toLowerCase();
    return currentGroups.filter(
      (g) =>
        g.eventName.toLowerCase().includes(q) ||
        g.tierName.toLowerCase().includes(q) ||
        g.location.toLowerCase().includes(q),
    );
  }, [currentGroups, searchQuery]);

  const filteredPastGroups = useMemo(() => {
    if (!searchQuery.trim()) return pastGroups;
    const q = searchQuery.toLowerCase();
    return pastGroups.filter(
      (g) =>
        g.eventName.toLowerCase().includes(q) ||
        g.tierName.toLowerCase().includes(q) ||
        g.location.toLowerCase().includes(q),
    );
  }, [pastGroups, searchQuery]);

  // Profile image handlers
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "personal");

      const res = await fetch("/api/upload-profile-image", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setUploading(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteProfilePhoto = async () => {
    if (!profile?.profile_image_url) return;
    if (!confirm("Are you sure you want to remove your profile photo?")) return;

    setUploading(true);
    try {
      const urlObj = new URL(profile.profile_image_url);
      const parts = urlObj.pathname.split("/object/public/profile-images/");
      const storagePath = parts.length >= 2 ? (parts.pop() ?? null) : null;

      if (!storagePath) throw new Error("Invalid profile image URL");

      const res = await fetch(
        `/api/upload-profile-image?path=${encodeURIComponent(storagePath)}&type=personal`,
        { method: "DELETE" },
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }

      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete image");
    } finally {
      setUploading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      queryClient.clear();
      router.push("/");
    } catch {
      alert("Sign out failed. Please try again.");
    }
  };

  // Apple App Store Guideline 5.1.1(v) parity on web. Two-step confirm
  // mirrors the mobile flow. The server (/api/user/delete) calls Clerk's
  // Backend API; the Clerk webhook anonymizes/deletes the Supabase row.
  const handleDeleteAccount = async () => {
    if (isDeleting) return;

    const first = confirm(
      "This will permanently delete your Flame account. Your name, email, and profile will be removed.\n\n" +
        "Past ticket purchases and event records are kept in anonymized form for attendee ticket validity and tax compliance. This cannot be undone.\n\n" +
        "Do you want to continue?",
    );
    if (!first) return;

    const second = confirm(
      "Are you absolutely sure? Your name and email will be permanently removed from Flame. This cannot be undone.",
    );
    if (!second) return;

    setIsDeleting(true);
    try {
      const res = await fetch("/api/user/delete", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);

        // Organizer block: server returns 409 with code ACTIVE_ORGANIZER_DATA
        // when the user owns an org with upcoming events or sold tickets.
        // Route them to support with a mailto link rather than a generic fail.
        if (res.status === 409 || data?.code === "ACTIVE_ORGANIZER_DATA") {
          setIsDeleting(false);
          const goToSupport = confirm(
            "Your account has active events or sold tickets. For your attendees' safety and our tax records, please email support@flme.co and we'll help you close out your events before deleting your account.\n\nOpen your email client now?",
          );
          if (goToSupport) {
            window.location.href =
              "mailto:support@flme.co?subject=Account%20deletion%20request";
          }
          return;
        }

        throw new Error(
          data?.error ?? "Could not delete your account. Please try again or contact support.",
        );
      }

      try {
        await signOut();
      } catch (signOutErr) {
        // Clerk session is already invalidated server-side; local signOut
        // may throw but we still want to clear cache and redirect.
        console.warn("[UserDashboard] signOut after delete failed (non-blocking)", signOutErr);
      }

      queryClient.clear();
      router.push("/");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete account");
      setIsDeleting(false);
    }
  };

  // Resolve profile avatar: profile_image_url > Clerk avatar > null
  const avatarUrl =
    profile?.profile_image_url || clerkUser?.imageUrl || null;

  const fullName =
    profile?.first_name || profile?.last_name
      ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()
      : clerkUser?.firstName || "Guest";

  const email = profile?.email ?? clerkUser?.primaryEmailAddress?.emailAddress ?? "—";

  if (ticketsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[800px] mx-auto px-4 pt-24 pb-16 flex flex-col gap-8">
        {/* ─── My Tickets Tab ─── */}
        {activeTab === "tickets" && (
          <div className="flex flex-col gap-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatPill label="Total" value={ticketStats.total} />
              <StatPill label="Purchased" value={ticketStats.purchased} />
              <StatPill label="Pending" value={ticketStats.pending} />
            </div>

            {/* Search bar */}
            {(currentGroups.length > 0 || pastGroups.length > 0) && (
              <div className="flex items-center gap-2 bg-white-5 border border-white-10 rounded-pill px-4 py-2.5">
                <FiSearch size={18} className="text-white-50 shrink-0" />
                <input
                  type="text"
                  placeholder="Search by event name"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-sm font-poppins text-white-100 placeholder:text-white-50"
                />
              </div>
            )}

            {/* Current + Past tickets or empty state */}
            {filteredCurrentGroups.length === 0 && filteredPastGroups.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-16">
                <Ticket size={48} className="text-white-30" />
                <p className="text-white-50 text-sm font-poppins text-center">
                  {searchQuery.trim()
                    ? "No tickets match your search."
                    : "No tickets yet. Start exploring events!"}
                </p>
                {!searchQuery.trim() && (
                  <Link
                    href="/discover"
                    className="bg-white-100 text-dark font-poppins-semibold text-sm px-6 py-2.5 rounded-pill hover:opacity-90 transition-opacity no-underline"
                  >
                    Browse Events
                  </Link>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Section label */}
                <h2 className="text-white-100 text-lg font-poppins-semibold uppercase m-0">
                  My Tickets
                </h2>

                {/* Current tickets */}
                {filteredCurrentGroups.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {filteredCurrentGroups.map((group) => (
                      <TicketCard
                        key={group.id}
                        group={group}
                        onQRPress={
                          group.status === "purchased"
                            ? () => {
                                const ticketId = getFirstTicketIdForGroup(group);
                                if (ticketId) router.push(`/account/ticket/${ticketId}`);
                              }
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}

                {/* Past tickets accordion */}
                {filteredPastGroups.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => setPastExpanded(!pastExpanded)}
                      className="flex items-center gap-2 text-white-50 text-sm font-poppins-medium bg-transparent border-none cursor-pointer hover:text-white-80 transition-colors p-0"
                    >
                      Past tickets ({filteredPastGroups.length})
                      {pastExpanded ? (
                        <FiChevronUp size={16} />
                      ) : (
                        <FiChevronDown size={16} />
                      )}
                    </button>
                    {pastExpanded && (
                      <div className="flex flex-col gap-3">
                        {filteredPastGroups.map((group) => (
                          <TicketCard
                            key={group.id}
                            group={group}
                            isPast
                            onQRPress={
                              group.status === "purchased"
                                ? () => {
                                    const ticketId = getFirstTicketIdForGroup(group);
                                    if (ticketId) router.push(`/account/ticket/${ticketId}`);
                                  }
                                : undefined
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── Settings Tab ─── */}
        {activeTab === "settings" && (
          <div className="flex flex-col gap-6">
            {/* Profile photo section */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div
                  className="relative w-24 h-24 rounded-full overflow-hidden bg-white-10 flex items-center justify-center cursor-pointer group"
                  onClick={handleUploadClick}
                >
                  {uploading ? (
                    <div className="w-full h-full flex items-center justify-center bg-black/50">
                      <div className="w-6 h-6 border-2 border-white-100 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt="Profile"
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="text-white-50 text-3xl font-poppins-semibold">
                      {(fullName?.[0] ?? "?").toUpperCase()}
                    </span>
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <FiCamera size={24} className="text-white-100" />
                  </div>
                </div>
                {/* Delete button - only when custom image exists */}
                {profile?.profile_image_url && !uploading && (
                  <button
                    onClick={handleDeleteProfilePhoto}
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white-100 flex items-center justify-center cursor-pointer border-2 border-background hover:bg-white-80 transition-colors"
                  >
                    <FiTrash2 size={14} className="text-dark" />
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Personal information */}
            <div className="flex flex-col gap-5">
              <h2 className="text-white-100 text-lg font-poppins-semibold uppercase m-0">
                Personal Information
              </h2>
              <div className="flex flex-col gap-4">
                <SettingsField label="Full Name" value={fullName} />
                <SettingsField label="Email" value={email} />
              </div>
            </div>

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              disabled={isDeleting}
              className="w-full bg-white-100 border border-white-50 rounded-pill py-2.5 text-dark text-sm font-poppins-medium cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-70 disabled:cursor-not-allowed"
            >
              Sign out
            </button>

            {/* Delete account */}
            <button
              onClick={handleDeleteAccount}
              disabled={isDeleting}
              className="w-full bg-transparent border border-[rgba(255,0,0,0.5)] rounded-pill py-2.5 text-[#FF4444] text-sm font-poppins-medium cursor-pointer hover:bg-[rgba(255,0,0,0.05)] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isDeleting ? "Deleting..." : "Delete Account"}
            </button>
          </div>
        )}
      </div>

    </div>
  );
}

/* ─── Sub-components ─── */

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white-5 border border-white-5 rounded-card px-4 py-3 flex flex-col gap-1">
      <span className="text-white-50 text-xs font-poppins-medium uppercase">
        {label}
      </span>
      <span className="text-white-100 text-xl font-poppins-semibold">
        {value}
      </span>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  purchased: "#30C680",
  pending: "#238FDA",
  cancelled: "var(--color-white-50)",
};

const STATUS_LABELS: Record<string, string> = {
  purchased: "Purchased",
  pending: "Pending",
  cancelled: "Cancelled",
};

function TicketCard({
  group,
  isPast,
  onQRPress,
}: {
  group: TicketGroupDisplay;
  isPast?: boolean;
  onQRPress?: () => void;
}) {
  const statusColor = STATUS_COLORS[group.status] ?? "#9CA3AF";
  const statusLabel = STATUS_LABELS[group.status] ?? "Unknown";

  const titleText =
    group.tierName || group.stageName
      ? `${group.eventName} — ${[group.tierName, group.stageName].filter(Boolean).join(" · ")}`
      : group.eventName;

  const renderAction = () => {
    if (group.status === "purchased" && onQRPress) {
      return (
        <button
          onClick={onQRPress}
          className="bg-transparent border-none cursor-pointer p-0 hover:opacity-80 transition-opacity"
          aria-label="View QR code"
        >
          <svg width="33" height="33" viewBox="0 0 24 24" fill="none">
            <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm10-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm10-2h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm2 2h2v2h-2v-2zm2-2h2v2h-2v-2zm0 4h2v2h-2v-2z" fill="currentColor" className="text-white-100" />
          </svg>
        </button>
      );
    }
    if (group.status === "pending") {
      return (
        <span className="px-6 py-2.5 rounded-pill bg-white-20 text-white-80 text-sm font-poppins-medium opacity-60">
          Pending
        </span>
      );
    }
    return null;
  };

  return (
    <div
      className={`bg-card rounded-card p-2.5 flex flex-col gap-2 ${isPast ? "opacity-70" : ""}`}
    >
      {/* Top section — event info + status badge */}
      <div className="border-b border-white-20 pb-2 flex items-start justify-between gap-3">
        <div className="flex-1 flex flex-col gap-2">
          {/* Event name + thumbnail */}
          <div className="flex items-center gap-2">
            {group.eventImageUrl ? (
              <div className="w-[44px] h-[43px] rounded-lg shrink-0 relative overflow-hidden">
                <Image
                  src={group.eventImageUrl}
                  alt={group.eventName}
                  fill
                  sizes="44px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="w-[44px] h-[43px] rounded-lg shrink-0 bg-white-10 flex items-center justify-center">
                <Ticket size={20} className="text-white-30" />
              </div>
            )}
            <h3 className="text-white-100 text-base font-poppins-semibold uppercase m-0 leading-snug">
              {titleText}
            </h3>
          </div>

          {/* Date / time row */}
          {(group.date || group.timeRange) && (
            <div className="flex items-center gap-2">
              <Calendar size={24} className="text-white-100 shrink-0" />
              <div className="flex items-center gap-2">
                {group.date && (
                  <span className="text-white-100 text-xs font-poppins-light border-r border-[#BFC0C2] pr-2">
                    {group.date}
                  </span>
                )}
                {group.timeRange && (
                  <span className="text-white-100 text-xs font-poppins-light">
                    {group.timeRange}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Location row */}
          {group.location && (
            <div className="flex items-center gap-2">
              <LocationEdit size={24} className="text-white-100 shrink-0" />
              <span className="text-white-100 text-xs font-poppins-light">
                {group.location}
              </span>
            </div>
          )}
        </div>

        {/* Status label */}
        <span
          style={{ color: statusColor }}
          className="text-xs font-poppins shrink-0"
        >
          {statusLabel}
        </span>
      </div>

      {/* Bottom section — quantity, price, action */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="text-white-80 text-base font-poppins">
            Ticket QNT:{" "}
            <span className="text-white-100 font-poppins-semibold">
              {group.ticketQuantity}
            </span>
          </span>
          <span className="text-white-80 text-base font-poppins">
            Price:{" "}
            <span className="text-white-100 font-poppins-medium">
              {group.priceDisplay}
            </span>
          </span>
        </div>

        {renderAction()}
      </div>
    </div>
  );
}

function SettingsField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white-5 border border-white-5 rounded-card px-4 py-3 flex flex-col gap-1">
      <span className="text-white-50 text-xs font-poppins-medium uppercase">
        {label}
      </span>
      <span className="text-white-100 text-sm font-poppins">{value}</span>
    </div>
  );
}
