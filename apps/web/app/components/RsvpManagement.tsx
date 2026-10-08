"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  FiArrowLeft,
  FiCalendar,
  FiUsers,
  FiTag,
  FiCheck,
  FiX,
  FiDownload,
  FiLoader,
} from "react-icons/fi";
import RsvpLoadingPage from "./RsvpLoadingPage";
import { useRsvpAction } from "../lib/hooks/useRsvp";
import { useQuery } from "@tanstack/react-query";
import {
  formatCedula,
  extractBasePrice,
  extractBasePriceHistorical,
  getBasePriceFromTicket,
  formatCentsAsPrice,
  buildPendingRsvpExportAoa,
  normalizeRegistrationExportColumns,
  registrationValuesForExportColumns,
} from "@project-flame/lib";
import { FormField } from "./modals/RegistrationFormModal";

interface RsvpManagementProps {
  event: {
    id: string;
    name: string;
    slug: string;
    city: string;
    venue: string;
    starts_at: string;
    ends_at: string;
    status: string;
    max_attendees: number;
    total_rsvps: number;
    currency?: string;
    timezone?: string | null;
    registration_form_config?: FormField[] | null;
    ticket_tiers: {
      id: string;
      name: string;
      price_cents: number;
      quantity_total: number;
      quantity_sold: number;
    }[];
  };
  rsvps: {
    id: string;
    user_id: string;
    event_id: string;
    ticket_tier_id: string;
    requested_quantity: number;
    status:
      | "pending"
      | "approved"
      | "rejected"
      | "purchased"
      | "auto_cancelled"
      | "payment_failed";
    requested_at: string;
    approved_at: string | null;
    approved_by: string | null;
    rejected_at: string | null;
    rejected_by: string | null;
    stage_id: string | null;
    stage_name: string | null;
    stage_price_cents: number | null;
    fee_percentage: number | null;
    registration_data?: Record<string, any> | null;
    base_price_cents?: number | null; // Discounted base price (if promo code applied)
    total_amount_cents?: number | null; // Total with fees (if available)
    users: {
      first_name: string | null;
      last_name: string | null;
      email: string;
      document_id: string | null;
    };
    ticket_tiers: {
      name: string;
      price_cents: number;
    };
  }[];
  organization: {
    id: string;
    name: string;
    slug: string;
  };
}

export default function RsvpManagement({
  event,
  rsvps: initialRsvps,
  organization,
}: RsvpManagementProps) {
  const [filter, setFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all");
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    rsvpId: string;
    action: "approve" | "reject";
    userName: string;
  } | null>(null);
  const [viewModal, setViewModal] = useState<{
    isOpen: boolean;
    rsvpId: string;
    userName: string;
    registrationData: Record<string, any> | null;
  } | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [processingRsvpId, setProcessingRsvpId] = useState<string | null>(null);

  const isPastEvent = new Date(event.ends_at) < new Date();

  // Local state for RSVPs that can be optimistically updated
  const [rsvps, setRsvps] = useState(initialRsvps);

  // Local state for registration form config (updated from polled data)
  const [registrationFormConfig, setRegistrationFormConfig] = useState(
    event.registration_form_config,
  );
  const [isExportingRsvps, setIsExportingRsvps] = useState(false);

  // Track pending optimistic updates with an atomic counter (prevents race conditions)
  // When counter > 0, we have in-flight optimistic updates that shouldn't be overwritten
  const pendingOptimisticUpdatesRef = useRef(0);
  const lastSyncedRsvpsRef = useRef(initialRsvps);

  // Sync local state when initialRsvps prop changes, but preserve optimistic updates
  useEffect(() => {
    // Only sync if the prop has actually changed and we don't have pending optimistic updates
    const rsvpsChanged =
      JSON.stringify(initialRsvps) !==
      JSON.stringify(lastSyncedRsvpsRef.current);

    if (rsvpsChanged && pendingOptimisticUpdatesRef.current === 0) {
      setRsvps(initialRsvps);
      lastSyncedRsvpsRef.current = initialRsvps;
    }
  }, [initialRsvps]);

  // Sync registration_form_config when event prop changes
  useEffect(() => {
    setRegistrationFormConfig(event.registration_form_config);
  }, [event.registration_form_config]);

  // React Query mutation for RSVP actions
  const rsvpMutation = useRsvpAction();

  // 🔄 Poll for RSVP updates every 15 seconds
  // Simple, secure, and works perfectly with Clerk authentication
  const { data: polledData } = useQuery({
    queryKey: ["rsvps-poll", event.id],
    queryFn: async () => {
      const response = await fetch(`/api/organizer/rsvps?event_id=${event.id}`);
      if (!response.ok) throw new Error("Failed to fetch RSVPs");
      return response.json();
    },
    refetchInterval: 15000, // Poll every 15 seconds
    refetchIntervalInBackground: true, // Continue polling even when tab is not focused
    staleTime: 15000, // Consider data fresh for 15 seconds
  });

  // Update local state when polled data changes
  // Only apply if there are no pending optimistic updates to avoid race conditions
  useEffect(() => {
    if (polledData?.rsvps && pendingOptimisticUpdatesRef.current === 0) {
      setRsvps(polledData.rsvps);
      lastSyncedRsvpsRef.current = polledData.rsvps;
    }
    // Update registration_form_config from polled data if available
    if (polledData?.registration_form_config !== undefined) {
      setRegistrationFormConfig(polledData.registration_form_config);
    }
  }, [polledData]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  /**
   * Get the display price for an RSVP
   * Priority:
   * 1. base_price_cents (stored discounted base price from promo code - already multiplied by quantity)
   * 2. Fallback to stage/tier price calculation using historical extraction
   *
   * NOTE: base_price_cents is already the total base price (unit price * quantity) with discount applied
   */
  const getRsvpDisplayPrice = (rsvp: (typeof rsvps)[0]): number => {
    // If base_price_cents is stored, use it directly (already accounts for quantity and discounts)
    if (rsvp.base_price_cents !== null && rsvp.base_price_cents !== undefined) {
      return rsvp.base_price_cents;
    }

    // Fallback: Calculate from stage/tier price using historical extraction
    const unitPrice = rsvp.stage_price_cents ?? rsvp.ticket_tiers.price_cents;
    return (
      getBasePriceFromTicket(
        unitPrice,
        rsvp.requested_at,
        rsvp.fee_percentage,
      ) * rsvp.requested_quantity
    );
  };

  const getUserName = (user: {
    first_name: string | null;
    last_name: string | null;
    email: string;
    document_id?: string | null;
  }) => {
    if (user.first_name || user.last_name) {
      return `${user.first_name || ""} ${user.last_name || ""}`.trim();
    }
    return user.email;
  };

  const openConfirmationModal = (
    rsvpId: string,
    action: "approve" | "reject",
    userName: string,
  ) => {
    setConfirmationModal({
      isOpen: true,
      rsvpId,
      action,
      userName,
    });
  };

  const closeConfirmationModal = () => {
    setConfirmationModal(null);
  };

  const openViewModal = (
    rsvpId: string,
    userName: string,
    registrationData: Record<string, any> | null,
  ) => {
    setViewModal({
      isOpen: true,
      rsvpId,
      userName,
      registrationData,
    });
  };

  const closeViewModal = () => {
    setViewModal(null);
  };

  // Handle keyboard events for modals
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (confirmationModal) {
          closeConfirmationModal();
        }
        if (viewModal) {
          closeViewModal();
        }
      }
    };

    if (confirmationModal || viewModal) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [confirmationModal, viewModal]);

  const handleConfirmedAction = () => {
    if (!confirmationModal) return;

    const { rsvpId, action } = confirmationModal;
    closeConfirmationModal();
    setProcessingRsvpId(rsvpId);

    // Increment pending optimistic updates counter before mutation
    pendingOptimisticUpdatesRef.current++;

    // Use React Query mutation instead of direct fetch
    rsvpMutation.mutate(
      { rsvpId, action },
      {
        onSuccess: data => {
          // Optimistically update the local RSVP state
          setRsvps(prevRsvps =>
            prevRsvps.map(rsvp =>
              rsvp.id === rsvpId
                ? {
                    ...rsvp,
                    status: action === "approve" ? "approved" : "rejected",
                    approved_at:
                      action === "approve" ? new Date().toISOString() : null,
                    rejected_at:
                      action === "reject" ? new Date().toISOString() : null,
                  }
                : rsvp,
            ),
          );
          setProcessingRsvpId(null);

          // Decrement counter - optimistic update complete
          pendingOptimisticUpdatesRef.current--;
        },
        onError: error => {
          // Decrement counter even on error to unblock polling updates
          pendingOptimisticUpdatesRef.current--;

          // Clear processing state and show error
          setProcessingRsvpId(null);
          alert(
            error.message || `An error occurred while ${action}ing the RSVP`,
          );
        },
      },
    );
  };

  const handleBackToDashboard = () => {
    setIsLoadingDashboard(true);

    setTimeout(() => {
      const orgParam = organization?.slug ? `&org=${encodeURIComponent(organization.slug)}` : "";
      window.location.href = `/organizer?tab=rsvps${orgParam}`;
    }, 800);
  };

  const filteredRsvps = rsvps.filter(rsvp => {
    if (filter === "all") return true;
    return rsvp.status === filter;
  });

  const rsvpCounts = {
    all: rsvps.length,
    pending: rsvps.filter(r => r.status === "pending").length,
    approved: rsvps.filter(r => r.status === "approved").length,
    rejected: rsvps.filter(r => r.status === "rejected").length,
  };

  // Calculate total RSVPs count (count of purchased, approved and pending RSVPs only)
  const totalRsvpCount = rsvps.filter(
    rsvp =>
      rsvp.status === "purchased" ||
      rsvp.status === "approved" ||
      rsvp.status === "pending",
  ).length;

  // Calculate total ticket capacity (sum of all ticket tier quantities)
  const totalTicketCapacity = event.ticket_tiers.reduce(
    (sum, tier) => sum + tier.quantity_total,
    0,
  );

  const STATUS_COLORS: Record<string, string> = {
    pending: "text-[#FBD68D]",
    approved: "text-[#5DDBB1]",
    purchased: "text-[#5DDBB1]",
    rejected: "text-[#EA3370]",
    auto_cancelled: "text-white-50",
    payment_failed: "text-white-50",
    expired: "text-white-50",
  };

  const getStatusLabel = (status: string) => {
    if (status === "auto_cancelled") return "Auto Cancelled";
    if (status === "payment_failed") return "Payment Failed";
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const handleExportRsvps = useCallback(async () => {
    setIsExportingRsvps(true);
    try {
      // Refetch fresh RSVP data + registration_form_config right before export
      // so a stale cache (from before the form was last edited) can't serve
      // outdated headers or empty answer cells. Pre-Jan 2026 pattern.
      const freshRes = await fetch(
        `/api/organizer/rsvps?event_id=${event.id}`,
        { cache: "no-store" },
      );
      if (!freshRes.ok) {
        throw new Error("Failed to fetch latest RSVP data");
      }
      const fresh = await freshRes.json();
      const freshRsvps = (fresh?.rsvps ?? []) as typeof rsvps;
      const freshFormConfig = (fresh?.registration_form_config ??
        registrationFormConfig) as typeof registrationFormConfig;

      const pendingRsvps = freshRsvps.filter(r => r.status === "pending");
      if (pendingRsvps.length === 0) {
        return;
      }

      const XLSX = await import("xlsx");

      const rawTz = event.timezone?.trim?.() ?? "";
      const formatInTz = (dateStr: string) => {
        try {
          const d = new Date(dateStr);
          if (rawTz) {
            return d.toLocaleString("en-US", { timeZone: rawTz });
          }
          return d.toLocaleString("en-US");
        } catch {
          return new Date(dateStr).toLocaleString("en-US");
        }
      };

      const registrationColumns = normalizeRegistrationExportColumns(
        freshFormConfig ?? undefined,
      );

      const wsData = buildPendingRsvpExportAoa(
        event.name,
        new Date().toLocaleDateString("en-US"),
        pendingRsvps.map(rsvp => ({
          name: getUserName(rsvp.users),
          tier:
            rsvp.ticket_tiers.name +
            (rsvp.stage_name ? ` - ${rsvp.stage_name}` : ""),
          email: rsvp.users.email,
          price: formatCentsAsPrice(
            getRsvpDisplayPrice(rsvp),
            event.currency || "USD",
          ),
          requestedAt: formatInTz(rsvp.requested_at),
          ...(registrationColumns.length > 0 && {
            registrationValues: registrationValuesForExportColumns(
              registrationColumns,
              rsvp.registration_data ?? null,
            ),
          }),
        })),
        registrationColumns.length > 0 ? registrationColumns : undefined,
      );

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const baseCols = [
        { wch: 25 },
        { wch: 25 },
        { wch: 30 },
        { wch: 12 },
        { wch: 22 },
      ];
      ws["!cols"] = [
        ...baseCols,
        ...registrationColumns.map(() => ({ wch: 28 })),
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Pending RSVPs");

      const fileName = `${event.name.replace(/[^a-z0-9]/gi, "_")}_rsvps_pending.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error("Error exporting RSVPs:", err);
      alert("Failed to export RSVPs. Please try again.");
    } finally {
      setIsExportingRsvps(false);
    }
  }, [event, registrationFormConfig]);

  return (
    <div className="max-w-[800px] mx-auto px-4 pt-24 pb-16 flex flex-col gap-[14px]">
      {/* Back + title */}
      <div className="flex flex-col gap-4">
        <button
          onClick={handleBackToDashboard}
          disabled={isLoadingDashboard}
          className="flex items-center gap-2 text-white-100 text-sm font-poppins bg-transparent border-none cursor-pointer p-0 w-fit hover:text-white-80 transition-colors disabled:opacity-50"
        >
          <FiArrowLeft size={20} />
          {isLoadingDashboard ? "Loading..." : "Go Back"}
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl leading-8 font-poppins-medium text-white-100 m-0">
              RSVP Detail
            </h1>
            <p className="text-white-50 text-sm font-poppins mt-1 m-0">
              {event.name}
            </p>
          </div>
          {rsvpCounts.pending > 0 ? (
            <button
              type="button"
              onClick={() => void handleExportRsvps()}
              disabled={isExportingRsvps}
              className="flex items-center gap-2 bg-white-100 text-dark text-sm font-poppins-semibold rounded-pill px-4 py-2 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 shrink-0 border-none"
              title="Export pending RSVPs to Excel"
            >
              {isExportingRsvps ? (
                <FiLoader size={16} className="animate-spin" />
              ) : (
                <FiDownload size={16} />
              )}
              {isExportingRsvps ? "Loading..." : "Export to XLSX"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Stats bar — matches mobile RsvpStatsBar */}
      <div className="flex items-center gap-4 overflow-x-auto">
        <div className="flex items-center gap-2 border-r border-[rgba(255,255,255,0.6)] pr-2 py-1 shrink-0">
          <span className="text-white-100 text-lg font-poppins-semibold uppercase">
            All
          </span>
          <span className="text-white-100 text-sm leading-5 font-poppins-medium">
            :
          </span>
          <span className="text-white-100 text-lg font-poppins-semibold">
            {rsvpCounts.all}
          </span>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-white-100 text-sm leading-5 font-poppins">
            Pending: {rsvpCounts.pending}
          </span>
          <span className="text-white-100 text-sm leading-5 font-poppins">
            Approved: {rsvpCounts.approved}
          </span>
          <span className="text-white-100 text-sm leading-5 font-poppins">
            Rejected: {rsvpCounts.rejected}
          </span>
        </div>
      </div>

      {/* Filter pills — matches mobile */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {(["all", "pending", "approved", "rejected"] as const).map(key => {
          const isActive = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-pill px-4 py-2 text-xs font-poppins-medium transition-colors cursor-pointer whitespace-nowrap border ${
                isActive
                  ? "bg-white-100 text-dark border-white-100"
                  : "bg-transparent text-white-50 border-white-30 hover:text-white-80"
              }`}
            >
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </button>
          );
        })}
      </div>

      {/* RSVP request cards — matches mobile RsvpRequestCard */}
      {filteredRsvps.length === 0 ? (
        <div className="flex flex-col items-center py-12">
          <p className="text-white-50 text-sm font-poppins text-center m-0">
            {filter === "all"
              ? "No RSVPs for this event yet."
              : `No ${filter} RSVPs.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredRsvps.map(rsvp => (
            <div
              key={rsvp.id}
              className="bg-card rounded-card p-[10px] flex flex-col gap-4"
            >
              {/* Header: name + ID | status badge */}
              <div className="flex flex-col gap-2">
                <div className="border-b border-white-20 pb-2 flex items-start justify-between">
                  <div className="flex-1 flex flex-col gap-2">
                    <span className="text-white-100 text-base font-poppins-semibold uppercase">
                      {getUserName(rsvp.users)}
                    </span>
                    {rsvp.users.document_id && (
                      <span className="text-white-100 text-xs leading-4 font-poppins">
                        ID: {formatCedula(rsvp.users.document_id)}
                      </span>
                    )}
                  </div>
                  <div className="w-[60px] flex flex-col items-center shrink-0">
                    <span
                      className={`text-xs leading-4 font-poppins-medium ${STATUS_COLORS[rsvp.status] || "text-white-50"}`}
                    >
                      {getStatusLabel(rsvp.status)}
                    </span>
                  </div>
                </div>

                {/* Info rows — 2x2 grid */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 flex items-center gap-2">
                      <div className="bg-white-10 w-9 h-9 rounded-full flex items-center justify-center shrink-0">
                        <FiTag size={18} className="text-white-100" />
                      </div>
                      <span className="text-white-100 text-sm leading-5 font-poppins-medium truncate">
                        {rsvp.ticket_tiers.name}
                        {rsvp.stage_name ? ` - ${rsvp.stage_name}` : ""}
                      </span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="bg-white-10 w-9 h-9 rounded-full flex items-center justify-center shrink-0">
                        <FiUsers size={18} className="text-white-100" />
                      </div>
                      <span className="text-white-100 text-sm leading-5 font-poppins-medium">
                        {rsvp.requested_quantity}{" "}
                        {rsvp.requested_quantity === 1 ? "ticket" : "tickets"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 flex items-center gap-2">
                      <div className="bg-white-10 w-9 h-9 rounded-full flex items-center justify-center shrink-0">
                        <FiCalendar size={18} className="text-white-100" />
                      </div>
                      <span className="text-white-100 text-sm leading-5 font-poppins-medium">
                        {formatDate(rsvp.requested_at)}
                      </span>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="bg-white-10 w-9 h-9 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-white-100 text-xs font-poppins-semibold">
                          $
                        </span>
                      </div>
                      <span className="text-white-100 text-sm leading-5 font-poppins-medium">
                        {formatCentsAsPrice(
                          getRsvpDisplayPrice(rsvp),
                          event.currency ?? "USD",
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() =>
                    openViewModal(
                      rsvp.id,
                      getUserName(rsvp.users),
                      rsvp.registration_data || null,
                    )
                  }
                  className="border border-white-30 rounded-pill px-[14px] py-2 text-white-100 text-xs leading-4 font-poppins bg-transparent cursor-pointer hover:bg-white-10 transition-colors"
                >
                  View Details
                </button>
                {rsvp.status === "pending" && !isPastEvent && (
                  <>
                    {processingRsvpId === rsvp.id ? (
                      <span className="text-white-50 text-xs font-poppins px-4 py-2">
                        Processing...
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() =>
                            openConfirmationModal(
                              rsvp.id,
                              "reject",
                              getUserName(rsvp.users),
                            )
                          }
                          className="border border-white-30 rounded-pill px-4 py-[10px] text-white-100 text-sm leading-5 font-poppins-medium bg-transparent cursor-pointer hover:bg-white-10 transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() =>
                            openConfirmationModal(
                              rsvp.id,
                              "approve",
                              getUserName(rsvp.users),
                            )
                          }
                          className="bg-white-100 rounded-pill px-6 py-[10px] text-dark text-sm leading-5 font-poppins-medium cursor-pointer hover:opacity-90 transition-opacity border-none"
                        >
                          Approve
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmationModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={closeConfirmationModal}
        >
          <div
            className="bg-surface border border-white-20 rounded-card w-full max-w-[400px] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-white-20">
              <h3 className="text-white-100 text-lg font-poppins-semibold m-0">
                {confirmationModal.action === "approve" ? "Approve" : "Reject"}{" "}
                RSVP
              </h3>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <p className="text-white-80 text-sm font-poppins m-0">
                Are you sure you want to{" "}
                <strong>{confirmationModal.action}</strong> the RSVP request
                from <strong>{confirmationModal.userName}</strong>?
              </p>
              <div className="flex items-center gap-2 text-white-50 text-sm font-poppins">
                {confirmationModal.action === "approve" ? (
                  <FiCheck size={16} />
                ) : (
                  <FiX size={16} />
                )}
                <span>
                  {confirmationModal.action === "approve"
                    ? "The attendee will receive a confirmation email."
                    : "The attendee will be notified of the rejection."}
                </span>
              </div>
            </div>
            <div className="p-5 border-t border-white-20 flex items-center justify-end gap-2">
              <button
                onClick={closeConfirmationModal}
                className="border border-white-30 rounded-pill px-4 py-2.5 text-white-100 text-sm font-poppins-medium bg-transparent cursor-pointer hover:bg-white-10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmedAction}
                className="bg-white-100 text-dark rounded-pill px-6 py-2.5 text-sm font-poppins-medium cursor-pointer border-none transition-opacity hover:opacity-90"
              >
                {confirmationModal.action === "approve"
                  ? "Approve RSVP"
                  : "Reject RSVP"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Registration Data Modal */}
      {viewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={closeViewModal}
        >
          <div
            className="bg-surface border border-white-20 rounded-card w-full max-w-[500px] max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-white-20 flex items-center justify-between">
              <h3 className="text-white-100 text-lg font-poppins-semibold m-0">
                Registration Details
              </h3>
              <button
                onClick={closeViewModal}
                aria-label="Close modal"
                className="w-9 h-9 rounded-full bg-white-10 flex items-center justify-center text-white-50 hover:text-white-100 hover:bg-white-20 transition-colors cursor-pointer border-none"
              >
                <FiX size={20} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex flex-col gap-4">
              <p className="text-white-80 text-sm font-poppins m-0">
                Registration information for{" "}
                <strong className="text-white-100">{viewModal.userName}</strong>
              </p>
              {registrationFormConfig &&
              Array.isArray(registrationFormConfig) &&
              registrationFormConfig.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {registrationFormConfig.map(field => {
                    const value = viewModal.registrationData?.[field.id];
                    return (
                      <div key={field.id} className="flex flex-col gap-1">
                        <span className="text-white-50 text-xs font-poppins-medium">
                          {field.label}
                          {field.required ? " *" : ""}
                          {field.archived ? (
                            <span className="ml-2 text-white-30 font-poppins-light">
                              (archived)
                            </span>
                          ) : null}
                        </span>
                        <span className="text-white-100 text-sm font-poppins">
                          {value !== undefined && value !== null && value !== ""
                            ? field.type === "checkbox"
                              ? value
                                ? "Yes"
                                : "No"
                              : String(value)
                            : "Not provided"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : viewModal.registrationData &&
                Object.keys(viewModal.registrationData).length > 0 ? (
                <div className="flex flex-col gap-3">
                  <p className="text-white-50 text-xs font-poppins italic m-0">
                    No form configuration found. Showing raw submitted data:
                  </p>
                  {Object.entries(viewModal.registrationData).map(
                    ([key, value]) => (
                      <div key={key} className="flex flex-col gap-1">
                        <span className="text-white-50 text-xs font-poppins-medium">
                          {key}
                        </span>
                        <span className="text-white-100 text-sm font-poppins">
                          {value !== undefined && value !== null && value !== ""
                            ? typeof value === "boolean"
                              ? value
                                ? "Yes"
                                : "No"
                              : String(value)
                            : "Not provided"}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <p className="text-white-50 text-sm font-poppins m-0">
                  No registration data submitted.
                </p>
              )}
            </div>
            <div className="p-5 border-t border-white-20">
              <button
                onClick={closeViewModal}
                className="w-full border border-white-30 rounded-pill py-3 text-white-100 text-sm font-poppins-medium bg-transparent cursor-pointer hover:bg-white-10 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Loading Overlay */}
      {isLoadingDashboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <RsvpLoadingPage type="loading-dashboard" />
        </div>
      )}
    </div>
  );
}
