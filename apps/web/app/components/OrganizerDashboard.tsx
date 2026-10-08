"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import {
  FiCheck,
  FiX,
  FiAlertTriangle,
  FiDownload,
  FiArrowLeft,
} from "react-icons/fi";
import CreateEventForm from "./forms/CreateEventForm";
import LoadingSpinner from "./LoadingSpinner";
import {
  type OrganizerData,
  type Event as OrganizerEvent,
  type CohostEventEntry,
  type OwnerCohostAssignment,
} from "../lib/hooks/useOrganizerData";
import { useMemberRoleContext } from "../contexts/MemberRoleContext";
import { separateEventsByDate } from "../lib/utils/event-filters";
import { formatCentsAsPrice } from "@project-flame/lib";
import type { Purchase } from "../lib/utils/purchase-data";
import OrganizerAdminView from "./organizer/OrganizerAdminView";
import RsvpsView from "./organizer/RsvpsView";

interface OrganizerDashboardProps {
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    emailAddresses: { emailAddress: string }[];
  } | null;
  organization: {
    id: string;
    name: string;
    slug: string;
    approved?: boolean;
    created_at?: string;
    logo_url?: string | null;
  };
  organizations?: Array<{
    id: string;
    name: string;
    slug: string;
    approved?: boolean;
    created_at?: string;
    role?: string;
    logo_url?: string | null;
  }>;
  events: OrganizerEvent[];
  /** SSR-prefetched cohost events so the dashboard renders cohosted events on
   *  first paint instead of waiting for the 15s poll to fill them in. */
  initialCohostEvents?: CohostEventEntry[];
  /** SSR-prefetched owner-side cohort assignments — events this org owns and
   *  has assigned cohorts to. Renders "Co-host with X" pills on owned events. */
  initialOwnerCohostAssignments?: OwnerCohostAssignment[];
}

type DashboardViewTab = "dashboard" | "create-event" | "rsvps";

// Purchase Details Section Component
export interface PurchaseDetailsSectionProps {
  eventId: string;
  eventName?: string;
  eventDate?: string;
  eventCurrency?: string;
  purchases: Purchase[];
  currentPage: number;
  onPageChange: (page: number) => void;
}

function PurchaseDetailsSection({
  eventId,
  eventName,
  eventDate,
  eventCurrency,
  purchases,
  currentPage,
  onPageChange,
}: PurchaseDetailsSectionProps) {
  const ITEMS_PER_PAGE = 10;

  // Sort purchases by purchase date (createdAt) from oldest to most recent
  // Memoized to avoid re-sorting on every render (e.g., when pagination changes)
  const sortedPurchases = useMemo(
    () =>
      [...purchases].sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateA - dateB; // Oldest first
      }),
    [purchases],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(sortedPurchases.length / ITEMS_PER_PAGE),
  );
  const clampedPage = Math.min(currentPage, totalPages);

  const startIndex = (clampedPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedPurchases = sortedPurchases.slice(startIndex, endIndex);

  // Get organization slug from URL for fetching correct organization data
  const searchParams = useSearchParams();
  const orgSlug = searchParams.get("org");

  // State for export loading
  const [isExporting, setIsExporting] = useState(false);

  // Ref to track abort controller for export operation
  const exportAbortControllerRef = useRef<AbortController | null>(null);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (exportAbortControllerRef.current) {
        exportAbortControllerRef.current.abort();
        exportAbortControllerRef.current = null;
      }
    };
  }, []);

  // Export to Excel function - fetches fresh data before exporting
  const handleExportToExcel = async () => {
    if (!eventName || !eventDate) {
      alert("Event information is missing");
      return;
    }

    setIsExporting(true);

    // Create abort controller for this export
    exportAbortControllerRef.current = new AbortController();

    try {
      // Fetch fresh organizer data to get the latest purchase information
      // Include organization slug in the URL to fetch the correct organization's events
      const url = orgSlug
        ? `/api/organizer/data?org=${encodeURIComponent(orgSlug)}`
        : "/api/organizer/data";
      const response = await fetch(url, {
        signal: exportAbortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to fetch latest purchase data");
      }

      // Check if fetch was aborted before proceeding
      if (exportAbortControllerRef.current?.signal.aborted) {
        return;
      }

      const data = await response.json();

      // Check again after async operation
      if (exportAbortControllerRef.current?.signal.aborted) {
        return;
      }

      // Find the current event in the fresh data
      const currentEvent = data.events?.find((e: any) => e.id === eventId);

      if (!currentEvent) {
        throw new Error("Event not found in latest data");
      }

      const freshPurchases = currentEvent.purchases || [];

      // Sort purchases by purchase date (createdAt) from oldest to most recent
      const sortedPurchases = [...freshPurchases].sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateA - dateB; // Oldest first
      });

      // Format date for display
      const formattedDate = new Date(eventDate).toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      // Helper function to format timestamp to ISO format in Ecuador time (UTC-5)
      const formatEcuadorTimestamp = (utcTimestamp: string) => {
        if (!utcTimestamp) return "";

        const utcDate = new Date(utcTimestamp);
        const ECUADOR_OFFSET_MINUTES = -300; // UTC-5

        // Convert to Ecuador time using the same approach as utcToEcuadorLocal
        const ecuadorTime = new Date(
          utcDate.getTime() + ECUADOR_OFFSET_MINUTES * 60 * 1000,
        );

        // Format as YYYY-MM-DD HH:MM:SS (with seconds for Excel export)
        const year = ecuadorTime.getUTCFullYear();
        const month = String(ecuadorTime.getUTCMonth() + 1).padStart(2, "0");
        const day = String(ecuadorTime.getUTCDate()).padStart(2, "0");
        const hours = String(ecuadorTime.getUTCHours()).padStart(2, "0");
        const minutes = String(ecuadorTime.getUTCMinutes()).padStart(2, "0");
        const seconds = String(ecuadorTime.getUTCSeconds()).padStart(2, "0");

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      };

      // Create worksheet data
      const wsData = [
        [`Event: ${eventName}`],
        [`Date: ${formattedDate}`],
        [], // Empty row
        [
          "Customer",
          "Email",
          "Ticket Tier",
          "Quantity",
          "Purchased At (ECT)",
          "Total Cost",
        ],
        ...sortedPurchases.map((purchase: Purchase) => [
          purchase.userName,
          purchase.email || "",
          purchase.tierName +
            (purchase.stageName ? ` - ${purchase.stageName}` : ""),
          purchase.quantity,
          formatEcuadorTimestamp(purchase.createdAt),
          formatCentsAsPrice(purchase.basePrice, currentEvent.currency || "USD"),
        ]),
      ];

      // Create worksheet
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Set column widths
      ws["!cols"] = [
        { wch: 25 }, // Customer
        { wch: 30 }, // Email
        { wch: 25 }, // Ticket Tier
        { wch: 10 }, // Quantity
        { wch: 20 }, // Purchased At (ECT)
        { wch: 12 }, // Total Cost
      ];

      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Purchase Details");

      // Generate filename with event name and date
      const fileName = `${eventName.replace(/[^a-z0-9]/gi, "_")}_purchases_${
        new Date(eventDate).toISOString().split("T")[0]
      }.xlsx`;

      // Check one more time before file operations
      if (exportAbortControllerRef.current?.signal.aborted) {
        return;
      }

      // Save file
      XLSX.writeFile(wb, fileName);
    } catch (error) {
      // Check if error was due to abort
      if (error instanceof Error && error.name === "AbortError") {
        // Silently exit if aborted - component may be unmounting
        return;
      }

      // Only show error if not aborted and component is still mounted
      if (
        exportAbortControllerRef.current &&
        !exportAbortControllerRef.current.signal.aborted
      ) {
        console.error("Error exporting to Excel:", error);
        alert(
          error instanceof Error
            ? error.message
            : "Failed to export purchases. Please try again.",
        );
      }
    } finally {
      // Only update state if not aborted (component still mounted)
      if (
        exportAbortControllerRef.current &&
        !exportAbortControllerRef.current.signal.aborted
      ) {
        setIsExporting(false);
      }
      // Clean up the abort controller
      exportAbortControllerRef.current = null;
    }
  };

  return (
    <>
      {purchases.length > 0 && (
        <>
          <div className="flex items-center justify-between mt-8 mb-4 gap-4 flex-wrap">
            <h4 className="text-lg font-poppins-semibold text-white-100 m-0">
              Purchase Details ({purchases.length} total)
            </h4>
            <button
              onClick={handleExportToExcel}
              className="flex items-center gap-2 bg-white-10 border border-white-20 text-white-100 text-sm font-poppins-medium rounded-pill px-4 py-2 hover:bg-white-20 transition-colors cursor-pointer"
              title="Export all purchases to Excel"
              disabled={isExporting}
            >
              <FiDownload size={16} />
              {isExporting ? "Downloading..." : "Export to Excel"}
            </button>
          </div>

          {/* Purchase Cards */}
          <div className="flex flex-col gap-2">
            {paginatedPurchases.map((purchase: Purchase) => (
              <div
                key={purchase.id}
                className="bg-white-5 border border-white-20 rounded-card p-3 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white-100 text-sm font-poppins-semibold m-0 truncate">{purchase.userName}</p>
                  <p className="text-white-50 text-xs font-poppins-light m-0 mt-0.5">
                    {purchase.tierName}{purchase.stageName && ` - ${purchase.stageName}`} &middot; {purchase.quantity}x
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-poppins-medium px-2 py-0.5 rounded-badge ${
                    purchase.scanned
                      ? "bg-green-500/20 text-green-400"
                      : "bg-white-10 text-white-50"
                  }`}>
                    {purchase.scanned ? "Scanned" : "Not Scanned"}
                  </span>
                  <span className="text-white-100 text-sm font-poppins-semibold">
                    {formatCentsAsPrice(purchase.basePrice, eventCurrency || "USD")}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-4">
              <button
                onClick={() => onPageChange(Math.max(1, clampedPage - 1))}
                disabled={clampedPage === 1}
                className="bg-white-10 border border-white-20 text-white-100 text-sm font-poppins-medium rounded-pill px-4 py-2 hover:bg-white-20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-white-50 text-sm font-poppins">
                Page {clampedPage} of {totalPages}
              </span>
              <button
                onClick={() =>
                  onPageChange(Math.min(totalPages, clampedPage + 1))
                }
                disabled={clampedPage === totalPages}
                className="bg-white-10 border border-white-20 text-white-100 text-sm font-poppins-medium rounded-pill px-4 py-2 hover:bg-white-20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {purchases.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-white-50 text-sm font-poppins m-0">No purchases for this event yet</p>
        </div>
      )}
    </>
  );
}

export default function OrganizerDashboard({
  user,
  organization,
  organizations = [],
  events: initialEvents,
  initialCohostEvents = [],
  initialOwnerCohostAssignments = [],
}: OrganizerDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [isMounted, setIsMounted] = useState(false);
  const [showConnectSuccess, setShowConnectSuccess] = useState(false);
  const [showConnectError, setShowConnectError] = useState(false);
  const [connectErrorMessage, setConnectErrorMessage] = useState("");

  // Track when component is mounted to prevent blank screen during hydration
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Sync the MemberRoleContext's selectedOrgId with the dashboard's org so any
  // tab (Dashboard, RSVPs, etc.) gets the right role-scoped data even when the
  // user lands here directly (e.g. via "Go back" from /organizer/rsvps/[id]).
  // Previously this lived inside OrganizerAdminView and only ran when the
  // Dashboard tab was active — landing on RSVPs left selectedOrgId stale,
  // which produced "No events with RSVPs yet" instead of the cohort list.
  const { setSelectedOrgId } = useMemberRoleContext();
  const syncedOrgIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (organization.id && syncedOrgIdRef.current !== organization.id) {
      syncedOrgIdRef.current = organization.id;
      setSelectedOrgId(organization.id);
    }
  }, [organization.id, setSelectedOrgId]);

  // Clear the connect query parameter from URL
  const clearConnectParam = useCallback(() => {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete("connect");
    currentUrl.searchParams.delete("error");
    router.replace(currentUrl.pathname + currentUrl.search, { scroll: false });
  }, [router]);

  // Dismiss the connect success banner and clear URL param
  const dismissConnectSuccess = useCallback(() => {
    clearConnectParam();
    setShowConnectSuccess(false);
  }, [clearConnectParam]);

  // Dismiss the connect error banner and clear URL param
  const dismissConnectError = useCallback(() => {
    clearConnectParam();
    setShowConnectError(false);
    setConnectErrorMessage("");
  }, [clearConnectParam]);

  // Check for Stripe Connect success message
  useEffect(() => {
    const connectSuccess = searchParams.get("connect");
    if (connectSuccess === "success") {
      setShowConnectSuccess(true);

      // Remove the connect parameter from URL after 5 seconds
      const timeoutId = window.setTimeout(() => {
        dismissConnectSuccess();
      }, 5000);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [searchParams, dismissConnectSuccess]);

  // Check for Stripe Connect error message
  useEffect(() => {
    const connectError = searchParams.get("error");
    if (connectError) {
      setShowConnectError(true);
      setConnectErrorMessage(
        connectError === "access_denied"
          ? "Stripe Connect setup was cancelled. You can try again anytime."
          : "There was an error connecting your Stripe account. Please try again.",
      );

      // Remove the error parameter from URL after 7 seconds
      const timeoutId = window.setTimeout(() => {
        dismissConnectError();
      }, 7000);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [searchParams, dismissConnectError]);

  // Use React Query for tracking refetch states
  // Provide SSR data as initialData and disable refetch on mount (SSR data is already fresh)
  const orgSlug = searchParams.get("org") || organization.slug;
  const {
    data: queryData,
    isLoading: queryLoading,
  } = useQuery<OrganizerData>({
    queryKey: ["organizer-data", orgSlug],
    queryFn: async () => {
      console.log(
        `[OrganizerDashboard] 🔄 Refetching organizer data for org: ${orgSlug}`,
      );
      const url = `/api/organizer/data?org=${encodeURIComponent(orgSlug)}`;
      const response = await fetch(url);
      if (!response.ok) {
        console.error(
          `[OrganizerDashboard] ❌ Failed to fetch organizer data: ${response.status} ${response.statusText}`,
        );
        throw new Error("Failed to fetch organizer data");
      }
      const data = await response.json();
      console.log(
        `[OrganizerDashboard] ✅ Refetch completed. Events count: ${
          data?.events?.length || 0
        }`,
        {
          eventsCount: data?.events?.length || 0,
          events:
            data?.events?.map((e: any) => ({
              id: e.id,
              name: e.name,
              purchasesCount: e.purchases?.length || 0,
              totalRevenue: e.totalRevenue || 0,
              totalAttendees: e.totalAttendees || 0,
            })) || [],
        },
      );
      return data;
    },
    initialData: {
      organization,
      events: initialEvents,
      cohost_events: initialCohostEvents,
      owner_cohost_assignments: initialOwnerCohostAssignments,
    } as OrganizerData,
    staleTime: 30000, // Consider data fresh for 30 seconds (SSR data is accurate thanks to webhook cache revalidation)
    refetchOnMount: false, // Don't refetch on mount - SSR data is fresh and correct (includes both Stripe and Datafast)
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    refetchInterval: 15000, // 🔄 Poll every 15 seconds for real-time RSVP updates
    refetchIntervalInBackground: false, // Pause polling when tab is not focused to reduce server load
    placeholderData: previousData => previousData, // Keep previous data during refetch to prevent flickering to empty state
  });

  // Use query data (will use initialData on first render, then fresh data after manual refetches)
  // Fallback to initialEvents if queryData is undefined or events array is empty (to prevent showing 0 after failed refetch)
  // The placeholderData option above ensures we keep previous data during refetch, but this provides an extra safety net
  const events =
    queryData?.events && queryData.events.length > 0
      ? queryData.events
      : initialEvents;

  const cohostEvents = queryData?.cohost_events ?? initialCohostEvents;
  const ownerCohostAssignments =
    queryData?.owner_cohost_assignments ?? initialOwnerCohostAssignments;


  // Navigate to a specific tab view (fast client-side + URL update)
  const navigateToView = (viewId: string) => {
    // 1. Instant client-side state change (drives UI immediately)
    setActiveView(viewId as DashboardViewTab);

    // Preserve the org query parameter if it exists
    const currentOrg = searchParams.get("org");
    const urlParams = new URLSearchParams();

    if (viewId !== "dashboard") {
      urlParams.set("tab", viewId);
    }

    if (currentOrg) {
      urlParams.set("org", currentOrg);
    }

    const queryString = urlParams.toString();
    const newUrl = queryString ? `/organizer?${queryString}` : "/organizer";

    // 2. Instant URL update for visual feedback (replaceState is synchronous)
    // This gives users immediate feedback in the address bar
    // Safe null handling: window.history.state can be null on initial load
    window.history.replaceState(
      window.history.state
        ? { ...window.history.state, as: newUrl, url: newUrl }
        : { as: newUrl, url: newUrl },
      "",
      newUrl,
    );

    // 3. Also notify Next.js router (async, non-blocking)
    // This keeps Next.js's internal state in sync
    // The router.replace is async but won't cause re-render since state already changed
    router.replace(newUrl, { scroll: false });
  };

  // Initialize activeView from URL parameter
  const getInitialView = (): DashboardViewTab => {
    if (tabParam === "rsvps") return "rsvps";
    if (tabParam === "create-event") return "create-event";
    return "dashboard";
  };

  const [activeView, setActiveView] =
    useState<DashboardViewTab>(getInitialView());
  // Track which "Past Events" sections are expanded in different views
  const [expandedSections, setExpandedSections] = useState<{
    events: boolean;
    ticketTiers: boolean;
    rsvps: boolean;
  }>({
    events: false,
    ticketTiers: false,
    rsvps: false,
  });

  // Sync activeView with URL parameter (for back/forward navigation and direct URL access)
  // Next.js router + useSearchParams handles this automatically
  useEffect(() => {
    const newView = getInitialView();
    if (newView !== activeView) {
      setActiveView(newView);
    }
  }, [tabParam]);

  const renderMainContent = () => {
    switch (activeView) {
      case "dashboard": {
        return (
          <OrganizerAdminView
            events={events}
            cohostEvents={cohostEvents}
            ownerCohostAssignments={ownerCohostAssignments}
            organization={organization}
          />
        );
      }

      case "create-event":
        return (
          <div className="flex flex-col gap-6">
            <button
              type="button"
              onClick={() => navigateToView("dashboard")}
              className="self-start flex items-center gap-2 text-white-50 hover:text-white-100 transition-colors text-sm font-poppins-medium"
            >
              <FiArrowLeft size={16} />
              Go Back
            </button>
            <div>
              <h2 className="text-2xl leading-8 font-poppins-medium text-white-100 m-0">Create New Event</h2>
              <p className="text-white-50 text-sm font-poppins mt-1 m-0">Add a new event for {organization.name}</p>
            </div>
            <CreateEventForm organizationId={organization.id} />
          </div>
        );

      case "rsvps": {
        return (
          <div className="flex flex-col gap-6">
            <button
              type="button"
              onClick={() => navigateToView("dashboard")}
              className="self-start flex items-center gap-2 text-white-50 hover:text-white-100 transition-colors text-sm font-poppins-medium"
            >
              <FiArrowLeft size={16} />
              Go Back
            </button>
            <RsvpsView
              events={events}
              cohostEvents={cohostEvents}
              expandedSections={expandedSections}
              setExpandedSections={setExpandedSections}
              separateEventsByDate={separateEventsByDate}
              currentOrgId={organization.id}
            />
          </div>
        );
      }

      default:
        return null;
    }
  };

  // Show loading spinner during initial mount/hydration to prevent blank screen
  if (!isMounted) {
    return (
      <LoadingSpinner
        title="Loading Organizer Dashboard"
        subtitle="Preparing your events and data..."
        fullHeight={true}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Stripe Connect Success Banner */}
      {showConnectSuccess && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-green-600/90 backdrop-blur-sm">
          <div className="max-w-[800px] mx-auto px-4 py-3 flex items-center gap-3">
            <FiCheck size={20} className="text-white shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white-100 text-sm font-poppins-semibold m-0">Stripe Connected Successfully!</p>
              <p className="text-white-80 text-xs font-poppins m-0">Your payment account is now set up and ready to accept payments.</p>
            </div>
            <button
              onClick={dismissConnectSuccess}
              className="text-white-80 hover:text-white-100 cursor-pointer bg-transparent border-none p-1"
              aria-label="Close notification"
            >
              <FiX size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Stripe Connect Error Banner */}
      {showConnectError && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-error/90 backdrop-blur-sm">
          <div className="max-w-[800px] mx-auto px-4 py-3 flex items-center gap-3">
            <FiAlertTriangle size={20} className="text-white shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white-100 text-sm font-poppins-semibold m-0">Stripe Connection Issue</p>
              <p className="text-white-80 text-xs font-poppins m-0">{connectErrorMessage}</p>
            </div>
            <button
              onClick={dismissConnectError}
              className="text-white-80 hover:text-white-100 cursor-pointer bg-transparent border-none p-1"
              aria-label="Close notification"
            >
              <FiX size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-[800px] mx-auto px-4 pt-24 pb-16 flex flex-col gap-8">
        {renderMainContent()}
      </div>

    </div>
  );
}
