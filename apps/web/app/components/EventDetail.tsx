"use client";

import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from "react";
import { useAuth, SignInButton } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import {
  FiCalendar,
  FiMapPin,
  FiUsers,
  FiClock,
  FiTag,
  FiInfo,
  FiCheck,
  FiX,
  FiMinus,
  FiPlus,
  FiAlertTriangle,
  FiArrowLeft,

} from "react-icons/fi";
import {
  formatCentsAsPrice,
  buildTimeRange,
  type Event,
  normalizeOptionalTicketTierSecretCode,
  normalizeTicketTierSecretCode,
  filterFieldsForTier,
} from "@project-flame/lib";
import { useRsvpSubmission, type ApiError } from "../lib/hooks/useRsvp";
import { useMultipleTicketAvailability } from "../lib/hooks/useTicketAvailability";
import { useUserTickets } from "../lib/hooks/useUserTickets";
import { LinkifiedText } from "../lib/utils/linkify-text";
import { supabase } from "../lib/supabase/client";
import RegistrationFormModal, {
  FormField,
} from "./modals/RegistrationFormModal";
import RsvpPaymentModal from "./modals/RsvpPaymentModal";
import ConfirmationModal from "./modals/ConfirmationModal";

/** Event shape for EventDetail; extends shared Event with nested relations. */
interface EventDetailEvent extends Pick<
  Event,
  "id" | "name" | "description" | "slug" | "city" | "venue" | "starts_at" | "ends_at" |
  "image_url" | "requires_rsvp" | "currency" | "timezone"
> {
  max_attendees?: number;
  total_rsvps?: number;
  registration_form_config?: FormField[] | null;
  organizations: { id: string; name: string; slug: string };
  cohost_org_names?: string[];
  ticket_tiers: {
    id: string;
    name: string;
    description: string | null;
    price_cents: number;
    quantity_total: number;
    quantity_sold: number;
    quantity_reserved: number;
    per_user_limit: number;
    order_index?: number;
    sales_start: string | null;
    sales_end: string | null;
    registration_form_fields?: string[] | null;
    /** True when the organizer has set a secret_code on this tier. The raw
     *  code is never sent to the client — only this boolean is provided so
     *  the UI can prompt for a code before starting checkout. */
    has_secret_code?: boolean;
    /** W4-C1: organizer override that forces the tier to render as "Sold Out"
     *  on attendee surfaces regardless of capacity. */
    is_manually_sold_out?: boolean;
    ticket_stages?: {
      id: string;
      name: string;
      price_cents: number;
      quantity: number;
      sold_quantity: number;
      order_index: number;
      quantity_reserved?: number;
      // W4-C2 (May 2026): per-stage description rendered on attendee cards in
      // place of the tier-level description while this stage is active.
      description?: string | null;
    }[];
  }[];
}

interface EventDetailProps {
  event: EventDetailEvent;
  /**
   * Flame 2.0 page (fase 2.4, decision 1a): the v2 page brings its own header (flyer, organizer,
   * title, when, where, description) and what follows the tickets; the purchase block in between
   * (tiers, codes, quantity, checkout, RSVP, modals) is this component, unchanged. Fase 3
   * replaces it. Without these props the v1 page renders exactly as before.
   */
  header?: ReactNode;
  footer?: ReactNode;
}

// Type aliases for strong typing
type TicketTier = EventDetailProps["event"]["ticket_tiers"][number];
type TicketStage = NonNullable<TicketTier["ticket_stages"]>[number];

/** Strict registration form payload (replaces Record<string, any>) */
export type RegistrationDataValue = string | number | boolean | string[] | null;
export type RegistrationData = Record<string, RegistrationDataValue>;

export default function EventDetail({ event, header, footer }: EventDetailProps) {
  const v2Frame = header !== undefined;
  const { isSignedIn, userId } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1);
  const [rsvpMessage, setRsvpMessage] = useState<string>("");
  const [rsvpMessageType, setRsvpMessageType] = useState<
    "success" | "error" | null
  >(null);
  const [creatingHold, setCreatingHold] = useState(false);
  // W4-C3 (Jun 2026): access-code unlocks hidden tiers in-page; no pre-checkout
  // modal. `verifiedSecretCode` is the code the user typed in the access-code
  // input — re-sent in the checkout payload so the server can re-verify the
  // hidden tier at hold/RSVP creation time.
  const [verifiedSecretCode, setVerifiedSecretCode] = useState<string | null>(
    null
  );
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [registrationData, setRegistrationData] = useState<RegistrationData | null>(null);

  // Payment Modal State
  const [showRsvpPaymentModal, setShowRsvpPaymentModal] = useState(false);
  
  // Success Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successModalVariant, setSuccessModalVariant] = useState<
    "loading" | "success"
  >("loading");
  const [isFreeClaimSuccess, setIsFreeClaimSuccess] = useState(false);

  // Duplicate RSVP Modal State
  const [showDuplicateRsvpModal, setShowDuplicateRsvpModal] = useState(false);

  // Hydration fix: only render auth-dependent UI after mount
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // "Buy Tickets" floating pill — visible initially, hides on scroll (matching mobile)
  const [showBuyTicketsPill, setShowBuyTicketsPill] = useState(true);
  useEffect(() => {
    if (v2Frame) {
      // Flame 2.0 frame scrolls inside its own container (not the window): hide the pill once
      // the tickets are on screen.
      const section = document.getElementById("ticket-section");
      if (!section || typeof IntersectionObserver === "undefined") return;
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) setShowBuyTicketsPill(false);
      });
      io.observe(section);
      return () => io.disconnect();
    }
    const handleScroll = () => {
      if (showBuyTicketsPill && window.scrollY > window.innerHeight * 0.15) {
        setShowBuyTicketsPill(false);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [showBuyTicketsPill, v2Frame]);

  // Capture promoter code from URL to preserve through checkout
  const promoterCode = searchParams?.get("promoter");

  // Promoter code state — editable field matching mobile CheckoutMainSheet.tsx
  const [promoterInput, setPromoterInput] = useState(promoterCode || "");
  const [promoterStatus, setPromoterStatus] = useState<
    "idle" | "validating" | "valid" | "invalid"
  >(promoterCode ? "validating" : "idle");

  // Request-id guard: prevent out-of-order completions from overwriting newer state
  const latestValidateTokenRef = useRef(0);

  const validatePromoterCode = useCallback(
    async (code: string) => {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed || trimmed.length < 3) {
        setPromoterStatus(trimmed ? "invalid" : "idle");
        return;
      }
      const token = ++latestValidateTokenRef.current;
      setPromoterStatus("validating");
      try {
        if (!supabase) {
          if (token === latestValidateTokenRef.current) setPromoterStatus("idle");
          return;
        }
        const { data: row, error: dbError } = await supabase
          .from("promoter_links")
          .select("id")
          .eq("event_id", event.id)
          .eq("promoter_code", trimmed)
          .maybeSingle();
        if (token !== latestValidateTokenRef.current) return;
        if (dbError) {
          console.error("[validatePromoter] DB error:", {
            action: "validatePromoter",
            error: dbError,
            eventId: event.id,
            userId: userId ?? null,
          });
          setPromoterStatus("idle");
          return;
        }
        if (row) {
          setPromoterInput(trimmed);
          setPromoterStatus("valid");
        } else {
          setPromoterStatus("invalid");
        }
      } catch (err) {
        console.error("[validatePromoter] Exception:", {
          action: "validatePromoter",
          error: err,
          eventId: event.id,
          userId: userId ?? null,
        });
        if (token === latestValidateTokenRef.current) setPromoterStatus("idle");
      }
    },
    [event.id, userId],
  );

  const clearPromoter = useCallback(() => {
    setPromoterInput("");
    setPromoterStatus("idle");
  }, []);

  // ─── Access code (W4-C3) ─────────────────────────────────────────────────
  // Unlocks a hidden tier and auto-selects it. Server-side verification via
  // POST /api/ticket-tiers/unlock. The typed code is kept in
  // `verifiedSecretCode` so the checkout payload can pass it for server
  // re-verification at hold/RSVP creation.
  type UnlockedTier = EventDetailEvent["ticket_tiers"][number];
  const [accessCodeInput, setAccessCodeInput] = useState("");
  const [accessCodeStatus, setAccessCodeStatus] = useState<
    "idle" | "validating" | "valid" | "invalid"
  >("idle");
  const [accessCodeError, setAccessCodeError] = useState<string | null>(null);
  const [unlockedTiers, setUnlockedTiers] = useState<UnlockedTier[]>([]);
  const latestUnlockTokenRef = useRef(0);

  const validateAccessCode = useCallback(
    async (rawCode: string) => {
      const trimmed = rawCode.trim();
      if (trimmed.length < 1) {
        setAccessCodeStatus("idle");
        setAccessCodeError(null);
        return;
      }
      const token = ++latestUnlockTokenRef.current;
      setAccessCodeStatus("validating");
      setAccessCodeError(null);
      try {
        const res = await fetch("/api/ticket-tiers/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_id: event.id, code: trimmed }),
        });
        if (token !== latestUnlockTokenRef.current) return;
        if (res.status === 401) {
          setAccessCodeStatus("invalid");
          setAccessCodeError("Sign in to use an access code.");
          return;
        }
        if (res.status === 404) {
          setAccessCodeStatus("invalid");
          setAccessCodeError("Invalid access code");
          return;
        }
        if (!res.ok) {
          // 5xx or other unexpected status — distinguish from a wrong code so
          // users (and us in dev) can tell when something's broken vs. when the
          // code is just wrong.
          let serverMessage = "Something went wrong. Try again.";
          try {
            const body = (await res.json()) as { error?: string };
            if (body?.error) serverMessage = body.error;
          } catch {
            /* response wasn't JSON — keep the generic message */
          }
          console.error("[validateAccessCode] non-ok", res.status, serverMessage);
          setAccessCodeStatus("invalid");
          setAccessCodeError(serverMessage);
          return;
        }
        const json = (await res.json()) as { tier?: UnlockedTier };
        if (!json.tier) {
          setAccessCodeStatus("invalid");
          setAccessCodeError("Invalid access code");
          return;
        }
        const tier = json.tier;
        setUnlockedTiers((prev) =>
          prev.some((t) => t.id === tier.id) ? prev : [...prev, tier],
        );
        setVerifiedSecretCode(normalizeTicketTierSecretCode(trimmed));
        setSelectedTier(tier.id);
        // If the unlocked tier has stages, default to the first AVAILABLE
        // stage by waterfall (sold + reserved < quantity). Falls back to the
        // first by order_index when every stage is full — checkout would
        // still fail but the UI matches the rest of the page. Picking
        // strictly by order_index here would target a sold-out stage and
        // trip the availability check at hold-create time.
        if (tier.ticket_stages && tier.ticket_stages.length > 0) {
          const sortedStages = [...tier.ticket_stages].sort(
            (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
          );
          const firstAvailable = sortedStages.find((s) => {
            const reserved =
              (s as { quantity_reserved?: number }).quantity_reserved ?? 0;
            return (s.sold_quantity ?? 0) + reserved < s.quantity;
          });
          const targetStage = firstAvailable ?? sortedStages[0];
          setSelectedStageId(targetStage?.id ?? "");
        } else {
          setSelectedStageId("");
        }
        setSelectedQuantity(1);
        setAccessCodeStatus("valid");
        setAccessCodeError(null);
      } catch (err) {
        console.error("[validateAccessCode] Exception:", err);
        if (token === latestUnlockTokenRef.current) {
          setAccessCodeStatus("invalid");
          setAccessCodeError("Something went wrong. Try again.");
        }
      }
    },
    [event.id],
  );

  // Merged tier list: server-visible tiers + any tiers unlocked by access code.
  // Used everywhere we render or look up tiers by id so the unlocked tier
  // participates in selection, pricing, and the empty-state guard.
  const allTiers = useMemo<UnlockedTier[]>(
    () => [...event.ticket_tiers, ...unlockedTiers],
    [event.ticket_tiers, unlockedTiers],
  );

  const clearAccessCode = useCallback(() => {
    latestUnlockTokenRef.current++;
    const unlockedIds = new Set(unlockedTiers.map((t) => t.id));
    if (unlockedIds.has(selectedTier)) {
      setSelectedTier("");
      setSelectedStageId("");
      setSelectedQuantity(1);
    }
    setUnlockedTiers([]);
    setVerifiedSecretCode(null);
    setAccessCodeInput("");
    setAccessCodeStatus("idle");
    setAccessCodeError(null);
  }, [unlockedTiers, selectedTier]);

  // Auto-validate promoter from URL on mount
  useEffect(() => {
    if (promoterCode) validatePromoterCode(promoterCode);
  }, [promoterCode, validatePromoterCode]);

  // Effective promoter code for checkout (only use when validated)
  const effectivePromoterCode =
    promoterStatus === "valid" && promoterInput.trim()
      ? promoterInput.trim().toUpperCase()
      : undefined;

  // Fetch user tickets to check for existing RSVPs
  // Only fetch when user is signed in AND event requires RSVP to avoid wasted fetches
  const { data: userTicketsData, isLoading: isLoadingUserTickets } =
    useUserTickets({
      enabled: isSignedIn && event.requires_rsvp,
    });

  // React Query mutation for RSVP submission
  const rsvpMutation = useRsvpSubmission();

  // ⚡ REAL-TIME AVAILABILITY: Poll for live availability updates every 10 seconds
  // This ensures users see changes when holds expire or purchases complete
  const tierIds = event.ticket_tiers.map(tier => tier.id);
  const {
    results: availabilityResults,
    hasDataChanged,
    isLoading: isLoadingAvailability,
  } = useMultipleTicketAvailability(tierIds, {
    enabled: !event.requires_rsvp, // Only poll for non-RSVP events (RSVP uses different flow)
    refetchInterval: 10000, // Poll every 10 seconds
  });

  // Create a map of tierId -> availability data for quick lookup
  const availabilityMap = new Map(
    availabilityResults.map((result, index) => [tierIds[index], result])
  );

  // Track if we've shown the "availability updated" notification
  const [showAvailabilityUpdate, setShowAvailabilityUpdate] = useState(false);

  // Show subtle notification when availability changes
  useEffect(() => {
    if (hasDataChanged && !isLoadingAvailability) {
      setShowAvailabilityUpdate(true);
      // Hide notification after 3 seconds
      const timer = setTimeout(() => setShowAvailabilityUpdate(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [hasDataChanged, isLoadingAvailability]);

  // Shared helper function to reset selections and invalidate cache on sold-out/availability errors
  const handleAvailabilityError = () => {
    // Reset selections
    setSelectedTier("");
    setSelectedStageId("");
    setSelectedQuantity(1);
    setVerifiedSecretCode(null); // Clear verified code

    // Invalidate queries to refetch fresh data
    queryClient.invalidateQueries({
      queryKey: ["events"],
    });
    queryClient.invalidateQueries({
      queryKey: ["user-tickets"],
    });
    // Invalidate real-time availability queries
    queryClient.invalidateQueries({
      queryKey: ["ticket-availability-multiple"],
    });
    queryClient.invalidateQueries({
      queryKey: ["ticket-availability"],
    });

    // Refresh server-side data
    router.refresh();
  };

  // Guard: validate currency and timezone before formatCentsAsPrice/toLocaleTimeString
  const currency = (event.currency?.trim() || "USD") as string;
  const tz = (event.timezone?.trim() || "America/Guayaquil") as string;
  const isConfigError = !event.currency?.trim() && !event.timezone?.trim();

  // Format functions (use event timezone for display)
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: tz,
    });
  };


  const getTierPriceDisplay = (tier: TicketTier) => {
    // If tier has stages, show the price range from stages (base price only)
    if (tier.ticket_stages && tier.ticket_stages.length > 0) {
      const stagePrices = tier.ticket_stages.map(
        (s: TicketStage) => s.price_cents
      );
      const minPrice = Math.min(...stagePrices);
      const maxPrice = Math.max(...stagePrices);

      if (minPrice === maxPrice) {
        return formatCentsAsPrice(minPrice, currency);
      }

      return `${formatCentsAsPrice(minPrice, currency)} - ${formatCentsAsPrice(maxPrice, currency)}`;
    }

    // price_cents now stores base price directly (after migration)
    return formatCentsAsPrice(tier.price_cents, currency);
  };

  // Helper to get display data for stages (for rendering as separate ticket options)
  // For RSVP events: uses cumulative tier-level sold + reserved counts
  // For non-RSVP events: uses real-time availability data when available, falls back to SSR data
  const getStageDisplayData = (tier: TicketTier) => {
    if (!tier.ticket_stages || tier.ticket_stages.length === 0) {
      return null;
    }

    const sortedStages = [...tier.ticket_stages].sort(
      (a, b) => a.order_index - b.order_index
    );

    // For RSVP events: Use cumulative approach (tier-level sold + reserved)
    if (event.requires_rsvp) {
      let cumulativeQuantity = 0;
      const totalSoldAndReserved =
        (tier.quantity_sold || 0) + (tier.quantity_reserved || 0);

      return sortedStages.map(stage => {
        const stageStart = cumulativeQuantity;
        const stageEnd = cumulativeQuantity + stage.quantity;

        // Calculate how many sold/reserved in this stage
        const soldAndReservedInStage = Math.max(
          0,
          Math.min(stage.quantity, totalSoldAndReserved - stageStart)
        );
        const availableInStage = stage.quantity - soldAndReservedInStage;

        cumulativeQuantity = stageEnd;

        return {
          ...stage,
          available: availableInStage,
          isSoldOut: availableInStage <= 0,
          isCurrentStage:
            totalSoldAndReserved >= stageStart &&
            totalSoldAndReserved < stageEnd,
        };
      });
    }

    // For non-RSVP events: Use real-time availability data if available
    const realTimeAvailability = availabilityMap.get(tier.id);

    if (
      realTimeAvailability?.stages &&
      realTimeAvailability.stages.length > 0
    ) {
      // Use real-time data from API
      return realTimeAvailability.stages
        .map(apiStage => {
          const stage = sortedStages.find(s => s.id === apiStage.stage_id);
          if (!stage) return null;

          return {
            id: stage.id,
            name: stage.name,
            price_cents: stage.price_cents,
            quantity: stage.quantity,
            order_index: stage.order_index,
            // W4-C2: preserve the per-stage description across real-time polling
            // so the staged-tier display keeps showing the stage-specific copy
            // instead of falling back to the tier description.
            description: stage.description,
            quantity_reserved: apiStage.held_quantity || 0,
            available: apiStage.available_quantity || 0,
            isSoldOut: apiStage.available_quantity <= 0,
            isCurrentStage: apiStage.is_current_stage || false,
          };
        })
        .filter(Boolean) as any[];
    }

    // Fallback to SSR data if real-time data not available yet
    const stageData = sortedStages.map(stage => {
      const soldInStage = stage.sold_quantity || 0;
      const reservedInStage = stage.quantity_reserved || 0;
      const availableInStage = stage.quantity - soldInStage - reservedInStage;

      return {
        ...stage,
        available: availableInStage,
        soldInStage,
        reservedInStage,
      };
    });

    // For non-RSVP events: A stage has opened if all previous stages are full
    return stageData.map((stage, index) => {
      let isStageOpen = index === 0;
      if (!isStageOpen) {
        isStageOpen = stageData
          .slice(0, index)
          .every(prevStage => prevStage.available <= 0);
      }

      const isSoldOut = stage.available <= 0;

      return {
        id: stage.id,
        name: stage.name,
        price_cents: stage.price_cents,
        quantity: stage.quantity,
        order_index: stage.order_index,
        // W4-C2: carry the per-stage description through the SSR fallback map
        // (same reason as the real-time branch above).
        description: stage.description,
        quantity_reserved: stage.quantity_reserved,
        available: stage.available,
        isSoldOut,
        isCurrentStage: isStageOpen && !isSoldOut,
      };
    });
  };

  // Check if tier is available
  const isTierAvailable = (tier: TicketTier) => {
    // W4-C1: organizer-forced sold-out short-circuits availability so the
    // tier renders the standard "Sold Out" status even when capacity remains.
    if (tier.is_manually_sold_out) return false;

    const now = new Date();
    const salesStart = tier.sales_start ? new Date(tier.sales_start) : null;
    const salesEnd = tier.sales_end ? new Date(tier.sales_end) : null;

    // Check if sales period is active
    if (salesStart && now < salesStart) return false;
    if (salesEnd && now > salesEnd) return false;

    // Check if sold out (must include both sold AND reserved tickets)
    const totalSoldAndReserved =
      tier.quantity_sold + (tier.quantity_reserved || 0);
    return totalSoldAndReserved < tier.quantity_total;
  };

  // Check if tier hasn't started yet (future sales_start)
  const isTierNotStarted = (tier: TicketTier) => {
    const now = new Date();
    const salesStart = tier.sales_start ? new Date(tier.sales_start) : null;
    return salesStart && now < salesStart;
  };

  // Check if tier has ended (past sales_end)
  const isTierExpired = (tier: TicketTier) => {
    const now = new Date();
    const salesEnd = tier.sales_end ? new Date(tier.sales_end) : null;
    return salesEnd && now > salesEnd;
  };

  const getAvailableTickets = (tier: TicketTier) => {
    // Use real-time availability if available, otherwise fall back to SSR data
    const realTimeAvailability = availabilityMap.get(tier.id);
    if (realTimeAvailability?.tier?.available !== undefined) {
      return realTimeAvailability.tier.available;
    }

    // Fallback to SSR data
    return (
      tier.quantity_total - tier.quantity_sold - (tier.quantity_reserved || 0)
    );
  };

  const getMaxQuantityForTier = (tier: TicketTier) => {
    const available = getAvailableTickets(tier);
    const userLimit =
      tier.per_user_limit !== null ? tier.per_user_limit : available;
    return Math.min(available, userLimit);
  };

  // Helper function to calculate effective price
  const getEffectivePrice = (tierId: string, stageId?: string) => {
    const selectedTierInfo = allTiers.find(t => t.id === tierId);
    const selectedStageInfo =
      stageId && selectedTierInfo?.ticket_stages
        ? selectedTierInfo.ticket_stages.find(s => s.id === stageId)
        : null;
    return selectedStageInfo?.price_cents ?? selectedTierInfo?.price_cents ?? 0;
  };

  // Handle RSVP submission (for events that require RSVP)
  const handleRsvpSubmit = (
    secretCode?: string | null,
    formData?: RegistrationData
  ) => {
    setIsFreeClaimSuccess(false); // Reset success state
    if (!selectedTier || !isSignedIn) return;

    const dataToUse = formData || registrationData;

    // Check if event has a registration form and we haven't collected data yet.
    // Use the tier-filtered config so tiers with `registration_form_fields: []`
    // (collect nothing) don't open an empty modal. `filterFieldsForTier` also
    // applies the archived-field hide.
    const tierFilteredFormConfig = Array.isArray(event.registration_form_config)
      ? filterFieldsForTier(
          event.registration_form_config,
          selectedTierData?.registration_form_fields,
        )
      : [];

    if (tierFilteredFormConfig.length > 0 && !dataToUse) {
      setShowRegistrationModal(true);
      return;
    }

    // Store pending data in state
    if (formData) {
      setRegistrationData(formData);
    }
    // Update secret code if provided
    if (secretCode !== undefined) {
      setVerifiedSecretCode(
        normalizeOptionalTicketTierSecretCode(
          typeof secretCode === "string" ? secretCode : undefined,
        ),
      );
    }

    // Calculate the effective price for this ticket
    const effectivePrice = getEffectivePrice(selectedTier, selectedStageId);

    // For free tickets, bypass payment modal and submit directly
    // Pass formData and secretCode directly to avoid async state race condition
    if (effectivePrice === 0) {
      submitRsvpToBackend(undefined, dataToUse, secretCode);
      return;
    }

    // For paid tickets, show payment modal for authorization
    setShowRsvpPaymentModal(true);
  };

  // Callback for successful payment authorization
  const handleRsvpPaymentSuccess = (
    paymentIntentId?: string,
    registrationDataOverride?: RegistrationData | null,
    secretCodeOverride?: string | null,
    promotionalCodeId?: string | null
  ) => {
    setShowRsvpPaymentModal(false);

    // Now proceed with actual RSVP submission
    // Use the values passed from the modal to avoid stale state issues
    submitRsvpToBackend(
      paymentIntentId,
      registrationDataOverride,
      secretCodeOverride,
      promotionalCodeId
    );
  };

  const submitRsvpToBackend = (
    paymentIntentId?: string,
    formDataOverride?: RegistrationData | null,
    secretCodeOverride?: string | null,
    promotionalCodeId?: string | null
  ) => {
    setRsvpMessage("");
    setRsvpMessageType(null);

    // Show loading modal immediately
    setSuccessModalVariant("loading");
    setShowSuccessModal(true);

    // Use override values if provided (for free tickets), otherwise use state (for paid tickets)
    const codeToUse =
      secretCodeOverride !== undefined
        ? secretCodeOverride
        : verifiedSecretCode;
    const formDataToUse =
      formDataOverride !== undefined ? formDataOverride : registrationData;

    // Use React Query mutation instead of direct fetch
    rsvpMutation.mutate(
      {
        event_id: event.id,
        ticket_tier_id: selectedTier,
        quantity: selectedQuantity,
        ...(selectedStageId && { stage_id: selectedStageId }), // Include stage_id if a stage is selected
        ...(codeToUse && { secret_code: codeToUse }), // Include secret_code if verified
        ...(effectivePromoterCode && { promoter_code: effectivePromoterCode }), // Include validated promoter code
        ...(formDataToUse && { registration_data: formDataToUse }), // Include form data
        paymentIntentId: paymentIntentId, // Include payment intent ID
        ...(promotionalCodeId && { promotional_code_id: promotionalCodeId }), // Include promo code ID if available
      },
      {
        onSuccess: data => {
          // Transition loading modal to success state
          setSuccessModalVariant("success");
          
          // Clear all selections and state
          setSelectedTier("");
          setSelectedStageId(""); // Clear stage selection on success
          setVerifiedSecretCode(null); // Clear verified code on success
          setRegistrationData(null); // Clear registration data
          
          // Clear any error messages
          setRsvpMessage("");
          setRsvpMessageType(null);

          // Invalidate queries to refresh data with updated availability
          queryClient.invalidateQueries({
            queryKey: ["events"],
          });
          queryClient.invalidateQueries({
            queryKey: ["user-tickets"],
          });
        },
        onError: (error: ApiError) => {
          // Hide the loading modal
          setShowSuccessModal(false);
          
          setRsvpMessage(
            error.message || "An error occurred while submitting your RSVP"
          );
          setRsvpMessageType("error");

          // Check for structured error codes for sold-out/availability issues
          if (
            error.code === "SOLD_OUT" ||
            error.code === "INSUFFICIENT_QUANTITY" ||
            error.code === "AVAILABILITY_ERROR"
          ) {
            // Use shared helper to reset selections and invalidate cache
            setTimeout(() => {
              handleAvailabilityError();
            }, 2000); // Give user time to read the error message
          } else if (error.code === "DUPLICATE_RSVP") {
            // For duplicate RSVP, also reset selections and invalidate cache
            // This ensures the user sees updated data after attempting a duplicate
            setTimeout(() => {
              handleAvailabilityError();
            }, 2000); // Give user time to read the error message
          } else if (
            error.code === "MISSING_SECRET_CODE" ||
            error.code === "INVALID_SECRET_CODE"
          ) {
            // W4-C3: code rejected at submission time. Clear access-code state
            // and surface the inline error so the user can re-enter it in the
            // input above (no modal anymore).
            clearAccessCode();
            setAccessCodeStatus("invalid");
            setAccessCodeError("Access code was rejected. Re-enter to retry.");
          }
        },
      }
    );
  };

  // Handle direct purchase (for events that don't require RSVP)
  // Note: Registration forms currently only apply to RSVP events.
  // If needed for direct purchase events, add form collection logic here similar to handleRsvpSubmit.
  const handleDirectPurchase = async (
    secretCode?: string | null,
    formData?: RegistrationData
  ) => {
    setIsFreeClaimSuccess(false); // Reset success state
    if (!selectedTier || !isSignedIn) return;

    setRsvpMessage("");
    setRsvpMessageType(null);
    setCreatingHold(true);

    // Use the provided secretCode parameter, or fall back to state
    const codeToUse =
      secretCode !== undefined ? secretCode : verifiedSecretCode;

    const dataToUse = formData || registrationData;

    try {
      const response = await fetch("/api/holds/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_id: event.id,
          ticket_tier_id: selectedTier,
          quantity: selectedQuantity,
          ...(selectedStageId && { stage_id: selectedStageId }), // Include stage_id if a stage is selected
          ...(codeToUse && { secret_code: codeToUse }), // Include secret_code if verified
          ...(dataToUse && { registration_data: dataToUse }), // Include form data if provided
          ...(effectivePromoterCode && { promoter_code: effectivePromoterCode }), // Include validated promoter code
        }),
      });

      if (!response.ok) {
        // Try to parse JSON error, fall back to text
        let errorMessage = "Failed to create reservation";
        let errorCode: string | undefined;

        try {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
          errorCode = data.code;
        } catch {
          const text = await response.text();
          errorMessage = text || errorMessage;
        }

        setRsvpMessage(errorMessage);
        setRsvpMessageType("error");

        // Check for structured error codes for sold-out/availability issues
        if (
          errorCode === "SOLD_OUT" ||
          errorCode === "INSUFFICIENT_QUANTITY" ||
          errorCode === "AVAILABILITY_ERROR" ||
          errorCode === "STAGE_NOT_AVAILABLE"
        ) {
          // Use shared helper to reset selections and invalidate cache
          setTimeout(() => {
            handleAvailabilityError();
          }, 2000); // Give user time to read the error message
        } else if (
          errorCode === "MISSING_SECRET_CODE" ||
          errorCode === "INVALID_SECRET_CODE"
        ) {
          // W4-C3: code rejected at submission time. Clear access-code state
          // and surface the inline error so the user can re-enter it in the
          // input above (no modal anymore).
          clearAccessCode();
          setAccessCodeStatus("invalid");
          setAccessCodeError("Access code was rejected. Re-enter to retry.");
        }
        return;
      }

      const data = await response.json();

      // Check if it's a free ticket
      const price = data.stage_price_cents ?? data.ticket_tier?.price_cents ?? 0;

      if (price === 0) {
        // Complete the purchase immediately for free tickets
        try {
          const completeResponse = await fetch(
            "/api/purchase/complete-hold-free",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                holdSessionId: data.hold_session_id,
                promoter_code: effectivePromoterCode,
              }),
            }
          );

          if (!completeResponse.ok) {
            throw new Error("Failed to claim free ticket");
          }

          // Show success modal
          setSuccessModalVariant("success");
          setIsFreeClaimSuccess(true);
          setShowSuccessModal(true);

          // Clear selections
          setSelectedTier("");
          setSelectedStageId("");
          setSelectedQuantity(1);
          setVerifiedSecretCode(null);

          // Invalidate queries to refresh data
          queryClient.invalidateQueries({ queryKey: ["events"] });
          queryClient.invalidateQueries({ queryKey: ["user-tickets"] });

          return;
        } catch (err) {
          console.error("Error completing free purchase:", err);
          setRsvpMessage("Failed to claim free ticket. Please try again.");
          setRsvpMessageType("error");
          return;
        }
      }

      // Redirect to purchase page with hold session for paid tickets
      // Include promoter code in URL for deployment safety (belt-and-suspenders)
      // Even though it's stored in the hold, this provides fallback during rolling deployments
      const purchaseUrl = effectivePromoterCode
        ? `/purchase?session=${
            data.hold_session_id
          }&promoter=${encodeURIComponent(effectivePromoterCode)}`
        : `/purchase?session=${data.hold_session_id}`;

      window.location.href = purchaseUrl;
    } catch (error) {
      console.error("Error creating hold:", error);
      setRsvpMessage(
        "Reservation failed. Please refresh the page and try again."
      );
      setRsvpMessageType("error");

      // Clear selection on error
      setSelectedTier("");
      setSelectedStageId("");
      setSelectedQuantity(1);
    } finally {
      setCreatingHold(false);
    }
  };

  // Handle purchase/RSVP click
  const handlePurchaseClick = () => {
    if (!selectedTier || !isSignedIn) return;

    // Check for existing RSVP/Ticket for this event (RSVP events only)
    // Non-RSVP events (holds) support repeat purchases, so we don't gate them.
    if (event.requires_rsvp && userTicketsData?.tickets) {
      const existingTicketOrRsvp = userTicketsData.tickets.find(
        ticket =>
          ticket.ticket_tier?.event?.id === event.id &&
          // Only block if there is already a pending RSVP under review.
          // approved, purchased, rejected, expired, issued, and checked_in all allow re-application.
          ticket.status === "pending"
      );

      if (existingTicketOrRsvp) {
        setShowDuplicateRsvpModal(true);
        return;
      }
    }

    // W4-C3 (Jun 2026): no pre-checkout code modal. Hidden tiers are reached
    // by entering the access code in the in-page input, which sets
    // `verifiedSecretCode` and unlocks the tier. The submit handlers below
    // forward that code in the payload; the server re-verifies at hold/RSVP
    // creation time for any tier with is_hidden=true.
    if (event.requires_rsvp) {
      handleRsvpSubmit();
    } else {
      handleDirectPurchase();
    }
  };

  // Compute the selected tier and stage once for reuse
  const normalizedSelectedTierId = selectedTier || undefined;
  const normalizedSelectedStageId = selectedStageId || undefined;
  const selectedTierData = normalizedSelectedTierId
    ? allTiers.find(t => t.id === normalizedSelectedTierId)
    : null;

  const selectedStageData =
    normalizedSelectedStageId && selectedTierData?.ticket_stages
      ? selectedTierData.ticket_stages.find(
          s => s.id === normalizedSelectedStageId
        )
      : null;

  if (isConfigError) {
    return (
      <div className="p-4 text-red-500">
        Event configuration error: missing currency and timezone. Please refresh.
      </div>
    );
  }

  return (
    <div className={v2Frame ? "pb-8" : "min-h-screen bg-background pb-8 pt-16"}>
      {/* ─── Modals (unchanged) ─── */}
      {event.registration_form_config &&
        (() => {
          // Single source of truth — see packages/lib/src/utils/registration-form.ts.
          // Handles tier-subset filtering AND archived-field hide.
          //   - selectedTierData?.registration_form_fields == null/undefined → all non-archived
          //   - selectedTierData?.registration_form_fields == []              → no fields
          //   - selectedTierData?.registration_form_fields == [ids]           → only those
          const filteredFormConfig = filterFieldsForTier(
            event.registration_form_config,
            selectedTierData?.registration_form_fields,
          );

          return (
            <RegistrationFormModal
              isOpen={showRegistrationModal}
              onClose={() => setShowRegistrationModal(false)}
              onSuccess={data => {
                setRegistrationData(data);
                setShowRegistrationModal(false);
                handleRsvpSubmit(undefined, data);
              }}
              formConfig={filteredFormConfig}
            />
          );
        })()}
      {selectedTierData && (
        <RsvpPaymentModal
          isOpen={showRsvpPaymentModal}
          onClose={() => setShowRsvpPaymentModal(false)}
          onSuccess={handleRsvpPaymentSuccess}
          eventId={event.id}
          eventName={event.name}
          eventDate={event.starts_at}
          eventVenue={event.venue}
          ticketTierId={selectedTierData.id}
          ticketTierName={selectedTierData.name}
          quantity={selectedQuantity}
          stageId={normalizedSelectedStageId}
          stageName={selectedStageData?.name ?? undefined}
          stagePrice={selectedStageData?.price_cents ?? undefined}
          tierPrice={selectedTierData.price_cents}
          currency={currency}
          registrationData={registrationData}
          secretCode={verifiedSecretCode}
          promoterCode={effectivePromoterCode}
        />
      )}
      <ConfirmationModal
        isOpen={showSuccessModal}
        variant={successModalVariant}
        title={
          successModalVariant === "loading"
            ? "Processing..."
            : isFreeClaimSuccess
            ? "Free Ticket Claimed!"
            : "RSVP Submitted Successfully!"
        }
        message={
          successModalVariant === "loading"
            ? "Please wait while we process your request."
            : isFreeClaimSuccess
            ? "Visit my account to see your ticket"
            : "Your request has been submitted. Check your email for approval status from the event organizer."
        }
        actionButtonText={
          isFreeClaimSuccess ? "My Account" : "Continue Browsing"
        }
        onAction={() => {
          if (isFreeClaimSuccess) {
            router.push("/account");
          } else {
            setShowSuccessModal(false);
          }
        }}
        showActionButton={successModalVariant === "success"}
      />
      <ConfirmationModal
        isOpen={showDuplicateRsvpModal}
        variant="error"
        title="You already have a pending RSVP for this event"
        message="Your RSVP request is being reviewed. You can request again once it's been processed."
        actionButtonText="Close"
        onAction={() => setShowDuplicateRsvpModal(false)}
        showActionButton={true}
      />

      {/* ─── Main Content — max-w-[800px] matching all other pages ─── */}
      <div className="max-w-[800px] mx-auto px-4 pt-6 flex flex-col gap-[21px]">
        {v2Frame ? header : (
          <>
        {/* ─── Back Navigation (matching mobile) ─── */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-[7px] bg-transparent border-none cursor-pointer p-0 self-start"
        >
          <FiArrowLeft size={24} className="text-white-100" />
          <span className="text-white-100 text-sm font-poppins">Go Back</span>
        </button>

        {/* ─── Event Hero — true 4:5 poster, width-capped on desktop so the
             stored 4:5 aspect survives. On mobile it fills the column (4:5
             rendered edge-to-edge matches the native app hero). On desktop we
             cap to 384px wide → 480px tall, centered, so the 800px container
             doesn't balloon the hero to 800×1000. We do NOT cap height — that
             previously letterboxed the image into a 5:3 landscape. */}
        <div className="w-full">
          {event.image_url ? (
            <div className="relative w-full aspect-[4/5] md:max-w-[384px] md:mx-auto rounded-card overflow-hidden">
              <Image
                src={event.image_url}
                alt={event.name}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 384px"
                placeholder="empty"
              />
            </div>
          ) : (
            <div className="w-full aspect-[4/5] md:max-w-[384px] md:mx-auto rounded-card bg-surface flex items-center justify-center">
              <FiCalendar size={64} className="text-white-30" />
            </div>
          )}
        </div>

        {/* ─── Organizer badge ─── */}
        <div className="flex items-center gap-2 text-white-80 text-base font-poppins">
          <FiUsers size={16} />
          <span>
            By{" "}
            {event.cohost_org_names?.length
              ? [event.organizations.name, ...event.cohost_org_names].join(" & ")
              : event.organizations.name}
          </span>
        </div>

        {/* ─── Title + Description ─── */}
        <div className="flex flex-col gap-2">
          <h1 className="text-white-100 text-3xl font-poppins-semibold uppercase m-0">
            {event.name}
          </h1>
          {event.description && (
            <p className="text-white-80 text-base leading-[22px] font-poppins-light whitespace-pre-wrap m-0 [&_a]:text-blue-400 [&_a]:underline">
              <LinkifiedText text={event.description} />
            </p>
          )}
        </div>

        {/* ─── Event Meta — matching mobile EventMeta ─── */}
        <div className="flex flex-col gap-4">
          {event.requires_rsvp && (
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 rounded-full bg-white-10 flex items-center justify-center shrink-0">
                <FiAlertTriangle size={20} className="text-white-100" />
              </div>
              <p className="text-white-100 text-sm font-poppins-light m-0">RSVP Required</p>
            </div>
          )}
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-full bg-white-10 flex items-center justify-center shrink-0">
              <FiCalendar size={20} className="text-white-100" />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-white-100 text-sm font-poppins m-0">{formatDate(event.starts_at)}</p>
              <p className="text-white-100 text-sm font-poppins m-0">
                {buildTimeRange(event.starts_at, event.ends_at, tz, event.city)}
              </p>
            </div>
          </div>
          {(event.venue || event.city) && (
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 rounded-full bg-white-10 flex items-center justify-center shrink-0">
                <FiMapPin size={20} className="text-white-100" />
              </div>
              <p className="text-white-100 text-sm font-poppins m-0">
                {[event.venue, event.city].filter(Boolean).join(", ")}
              </p>
            </div>
          )}
        </div>

          </>
        )}

        {/* ─── Ticket Tiers — glass cards matching mobile TicketTierCard ─── */}
        <div id="ticket-section">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-white-100 text-2xl font-poppins-semibold uppercase m-0">
              Select Your Ticket
            </h2>
            {showAvailabilityUpdate && (
              <span className="text-[#5DDBB1] text-sm font-poppins-medium transition-opacity duration-300">
                • Updated
              </span>
            )}
          </div>

          {/* ─── Promoter Code + Access Code (W4-C3) ─── */}
          <div className="mb-6 flex flex-col gap-4">
            {/* Promoter */}
            <div>
              <h3 className="text-white-70 text-xs font-poppins-semibold uppercase tracking-wider mb-2 m-0">
                Promoter Code
              </h3>
              {promoterStatus === "valid" ? (
                <div className="flex items-center bg-[#5DDBB1]/10 border border-[#5DDBB1]/30 rounded-card px-4 py-3">
                  <FiCheck size={16} className="text-[#5DDBB1]" />
                  <span className="text-[#5DDBB1] ml-2 flex-1 text-sm font-poppins">
                    {promoterInput}
                  </span>
                  <button
                    type="button"
                    aria-label="Clear promoter"
                    onClick={clearPromoter}
                    className="text-[#5DDBB1] hover:opacity-70 transition-opacity bg-transparent border-none cursor-pointer p-0"
                  >
                    <FiX size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <div className="flex-1 flex items-center bg-white-5 border border-white-20 rounded-card px-4 py-3">
                    <input
                      type="text"
                      placeholder="None"
                      value={promoterInput}
                      onChange={e => setPromoterInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && promoterInput.trim()) {
                          validatePromoterCode(promoterInput);
                        }
                      }}
                      className="flex-1 bg-transparent text-white-100 text-sm font-poppins outline-none border-none placeholder:text-white-30 uppercase"
                    />
                    {promoterStatus === "validating" && (
                      <div className="w-4 h-4 border-2 border-white-30 border-t-white-100 rounded-full animate-spin" />
                    )}
                    {promoterStatus === "invalid" && promoterInput.trim().length > 0 && (
                      <FiX size={16} className="text-error" />
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (promoterInput.trim()) validatePromoterCode(promoterInput);
                    }}
                    className="bg-white-10 border border-white-20 rounded-card px-4 h-[46px] flex items-center justify-center text-white-100 text-sm font-poppins-semibold hover:bg-white-20 transition-colors cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              )}
              {promoterStatus === "invalid" && promoterInput.trim().length > 0 && (
                <p className="text-error text-xs font-poppins mt-1 m-0">
                  Invalid promoter code
                </p>
              )}
            </div>

            {/* Access code (unlocks a hidden tier — W4-C3) */}
            <div>
              <h3 className="text-white-70 text-xs font-poppins-semibold uppercase tracking-wider mb-2 m-0">
                Access Code
              </h3>
              {accessCodeStatus === "valid" ? (
                <div className="flex items-center bg-[#5DDBB1]/10 border border-[#5DDBB1]/30 rounded-card px-4 py-3">
                  <FiCheck size={16} className="text-[#5DDBB1]" />
                  <span className="text-[#5DDBB1] ml-2 flex-1 text-sm font-poppins">
                    {accessCodeInput.trim().toUpperCase()}
                  </span>
                  <button
                    type="button"
                    aria-label="Clear access code"
                    onClick={clearAccessCode}
                    className="text-[#5DDBB1] hover:opacity-70 transition-opacity bg-transparent border-none cursor-pointer p-0"
                  >
                    <FiX size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <div className="flex-1 flex items-center bg-white-5 border border-white-20 rounded-card px-4 py-3">
                    <input
                      type="text"
                      placeholder="Enter code to unlock a private ticket"
                      value={accessCodeInput}
                      onChange={e => {
                        setAccessCodeInput(e.target.value);
                        if (accessCodeStatus === "invalid") {
                          setAccessCodeStatus("idle");
                          setAccessCodeError(null);
                        }
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter" && accessCodeInput.trim()) {
                          validateAccessCode(accessCodeInput);
                        }
                      }}
                      className="flex-1 bg-transparent text-white-100 text-sm font-poppins outline-none border-none placeholder:text-white-30 uppercase"
                    />
                    {accessCodeStatus === "validating" && (
                      <div className="w-4 h-4 border-2 border-white-30 border-t-white-100 rounded-full animate-spin" />
                    )}
                    {accessCodeStatus === "invalid" && accessCodeInput.trim().length > 0 && (
                      <FiX size={16} className="text-error" />
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (accessCodeInput.trim()) validateAccessCode(accessCodeInput);
                    }}
                    disabled={accessCodeStatus === "validating"}
                    className="bg-white-10 border border-white-20 rounded-card px-4 h-[46px] flex items-center justify-center text-white-100 text-sm font-poppins-semibold hover:bg-white-20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Apply
                  </button>
                </div>
              )}
              {accessCodeStatus === "invalid" && accessCodeError && (
                <p className="text-error text-xs font-poppins mt-1 m-0">
                  {accessCodeError}
                </p>
              )}
            </div>
          </div>

          {allTiers.length === 0 ? (
            <div className="flex items-center gap-3 p-8 bg-white-5 rounded-card text-white-50 justify-center">
              <FiInfo size={24} />
              <p className="m-0">Ticket information coming soon. Check back later!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {[...allTiers]
                .sort((a, b) => {
                  const priceA =
                    a.ticket_stages && a.ticket_stages.length > 0
                      ? Math.min(...a.ticket_stages.map(s => s.price_cents))
                      : a.price_cents;
                  const priceB =
                    b.ticket_stages && b.ticket_stages.length > 0
                      ? Math.min(...b.ticket_stages.map(s => s.price_cents))
                      : b.price_cents;
                  const priceDiff = priceA - priceB;
                  if (priceDiff !== 0) return priceDiff;
                  const orderDiff =
                    (a.order_index ?? Infinity) - (b.order_index ?? Infinity);
                  if (orderDiff !== 0) return orderDiff;
                  return a.id.localeCompare(b.id);
                })
                .map(tier => {
                  const isAvailable = isTierAvailable(tier);
                  const stageData = getStageDisplayData(tier);

                  if (stageData && stageData.length > 0) {
                    return stageData.map(stage => {
                      const isStageAvailable =
                        stage.isCurrentStage && !stage.isSoldOut && isAvailable;
                      const isThisSelected =
                        selectedTier === tier.id && selectedStageId === stage.id;

                      const statusLabel = isStageAvailable
                        ? "Available"
                        : isTierNotStarted(tier)
                        ? "Not available yet"
                        : isTierExpired(tier)
                        ? "Sales Ended"
                        : !stage.isCurrentStage && !stage.isSoldOut
                        ? "Not available yet"
                        : "Sold Out";
                      const statusColor = isStageAvailable
                        ? "text-[#5DDBB1]"
                        : isTierNotStarted(tier) ||
                          (!stage.isCurrentStage && !stage.isSoldOut)
                        ? "text-[#FBD68D]"
                        : "text-[#F99175]";

                      return (
                        <button
                          type="button"
                          key={`${tier.id}-${stage.id}`}
                          disabled={!isStageAvailable}
                          aria-disabled={!isStageAvailable}
                          onClick={() => {
                            if (isStageAvailable) {
                              // W4-C3 (Jun 2026): preserve the verified code
                              // when selecting an unlocked tier — otherwise
                              // re-selecting after a tier switch sends no
                              // secret_code and hits 403. Mirrors the mobile
                              // handleSelectTier fix.
                              const isUnlocked =
                                unlockedTiers.some((t) => t.id === tier.id) &&
                                accessCodeInput.trim().length > 0;
                              setSelectedTier(tier.id);
                              setSelectedStageId(stage.id);
                              setSelectedQuantity(1);
                              setVerifiedSecretCode(
                                isUnlocked
                                  ? normalizeTicketTierSecretCode(
                                      accessCodeInput.trim(),
                                    )
                                  : null,
                              );
                            }
                          }}
                          className={`appearance-none w-full text-left rounded-card px-4 py-3 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white-50 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                            !isStageAvailable
                              ? "bg-white-10 opacity-60 cursor-not-allowed"
                              : isThisSelected
                              ? "bg-white-5 border border-white-100 cursor-pointer"
                              : "bg-white-5 border border-white-20 hover:border-white-30 cursor-pointer"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <h3 className="text-white-100 font-poppins-medium text-lg m-0 flex-1 mr-2">
                              {stage.name}
                            </h3>
                            <span className={`text-xs font-poppins-medium shrink-0 ${statusColor}`}>
                              {statusLabel}
                            </span>
                          </div>
                          <p className="font-poppins-medium text-base text-white-100 m-0 mb-1">
                            {tier.name}
                          </p>
                          {/* W4-C2 (May 2026): prefer the per-stage description.
                              Falls back to the tier-level description when the
                              stage doesn't have its own. */}
                          {(stage.description || tier.description) && (
                            <p className="text-white-50 text-sm font-poppins-light m-0 mb-2 whitespace-pre-wrap [&_a]:text-blue-400 [&_a]:underline">
                              <LinkifiedText
                                text={stage.description || tier.description || ""}
                              />
                            </p>
                          )}
                          <div className="flex items-center justify-between">
                            <span className={`font-poppins-bold text-xl ${isStageAvailable ? "text-white-80" : "text-[#A9ABAD]"}`}>
                              {formatCentsAsPrice(stage.price_cents, currency)}
                            </span>
                            {tier.per_user_limit > 1 && (
                              <span className="text-white-50 text-xs font-poppins-light">
                                Limit {tier.per_user_limit} per person
                              </span>
                            )}
                          </div>
                          {isThisSelected && (
                            <div className="flex items-center gap-1.5 mt-2 text-white-100 text-xs font-poppins-medium">
                              <FiTag size={14} />
                              <span>Selected</span>
                            </div>
                          )}
                        </button>
                      );
                    });
                  }

                  const isThisSelected = selectedTier === tier.id;
                  const statusLabel = isAvailable
                    ? "Available"
                    : isTierNotStarted(tier)
                    ? "Not available yet"
                    : isTierExpired(tier)
                    ? "Sales Ended"
                    : "Sold Out";
                  const statusColor = isAvailable
                    ? "text-[#5DDBB1]"
                    : isTierNotStarted(tier)
                    ? "text-[#FBD68D]"
                    : "text-[#F99175]";

                  return (
                    <button
                      type="button"
                      key={tier.id}
                      disabled={!isAvailable}
                      aria-disabled={!isAvailable}
                      onClick={() => {
                        if (isAvailable) {
                          // W4-C3 (Jun 2026): preserve verified code when
                          // selecting an unlocked tier — see staged-tier
                          // handler above for full rationale.
                          const isUnlocked =
                            unlockedTiers.some((t) => t.id === tier.id) &&
                            accessCodeInput.trim().length > 0;
                          setSelectedTier(tier.id);
                          setSelectedStageId("");
                          setSelectedQuantity(1);
                          setVerifiedSecretCode(
                            isUnlocked
                              ? normalizeTicketTierSecretCode(
                                  accessCodeInput.trim(),
                                )
                              : null,
                          );
                        }
                      }}
                      className={`appearance-none w-full text-left rounded-card px-4 py-3 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white-50 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                        !isAvailable
                          ? "bg-white-10 opacity-60 cursor-not-allowed"
                          : isThisSelected
                          ? "bg-white-5 border border-white-100 cursor-pointer"
                          : "bg-white-5 border border-white-20 hover:border-white-30 cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-white-100 font-poppins-medium text-lg m-0 flex-1 mr-2">
                          {tier.name}
                        </h3>
                        <span className={`text-xs font-poppins-medium shrink-0 ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </div>
                      {tier.description && (
                        <p className="text-white-50 text-sm font-poppins-light m-0 mb-2 whitespace-pre-wrap [&_a]:text-blue-400 [&_a]:underline">
                          <LinkifiedText text={tier.description || ""} />
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className={`font-poppins-bold text-xl ${isAvailable ? "text-white-80" : "text-[#A9ABAD]"}`}>
                          {formatCentsAsPrice(tier.price_cents, currency)}
                        </span>
                        {tier.per_user_limit > 1 && (
                          <span className="text-white-50 text-xs font-poppins-light">
                            Limit {tier.per_user_limit} per person
                          </span>
                        )}
                      </div>
                      {isThisSelected && (
                        <div className="flex items-center gap-1.5 mt-2 text-white-100 text-xs font-poppins-medium">
                          <FiTag size={14} />
                          <span>Selected</span>
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>
          )}

          {/* Quantity Selection — matching mobile QuantitySelector */}
          {selectedTier && (
            <div className="mt-4 p-4 bg-white-5 border border-white-20 rounded-card">
              <div className="flex items-center justify-between">
                {(() => {
                  const maxQuantity = selectedTierData
                    ? getMaxQuantityForTier(selectedTierData)
                    : 1;
                  return (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        onClick={() => setSelectedQuantity(Math.max(1, selectedQuantity - 1))}
                        disabled={selectedQuantity <= 1}
                        className="w-9 h-9 rounded-full bg-white-10 border border-white-20 flex items-center justify-center text-white-100 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white-20 transition-colors cursor-pointer"
                      >
                        <FiMinus size={16} />
                      </button>
                      <span className="text-white-100 font-poppins-semibold text-lg min-w-[28px] text-center">
                        {selectedQuantity}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() => setSelectedQuantity(Math.min(maxQuantity, selectedQuantity + 1))}
                        disabled={selectedQuantity >= maxQuantity}
                        className="w-9 h-9 rounded-full bg-white-10 border border-white-20 flex items-center justify-center text-white-100 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white-20 transition-colors cursor-pointer"
                      >
                        <FiPlus size={16} />
                      </button>
                    </div>
                  );
                })()}
                <div className="text-right">
                  <p className="text-white-100 font-poppins-semibold text-base m-0">
                    Subtotal:{" "}
                    {(() => {
                      if (!selectedTierData) return formatCentsAsPrice(0, currency);
                      let unitBasePrice = 0;
                      if (selectedStageId && selectedTierData.ticket_stages) {
                        const selectedStage = selectedTierData.ticket_stages.find(
                          s => s.id === selectedStageId
                        );
                        if (selectedStage) unitBasePrice = selectedStage.price_cents;
                      } else {
                        unitBasePrice = selectedTierData.price_cents;
                      }
                      return formatCentsAsPrice(unitBasePrice * selectedQuantity, currency);
                    })()}
                  </p>
                  <p className="text-white-50 text-xs font-poppins-light m-0 italic">
                    Fees calculated at checkout
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── Checkout CTA — inline matching mobile CheckoutCTA ─── */}
        {allTiers.length > 0 && selectedTier && (
          <div className="flex justify-end">
            {!mounted || !isSignedIn ? (
              <SignInButton
                mode="modal"
                forceRedirectUrl={`/events/${event.slug}${
                  promoterInput.trim()
                    ? `?promoter=${encodeURIComponent(promoterInput.trim())}`
                    : ""
                }`}
                signUpForceRedirectUrl={`/events/${event.slug}${
                  promoterInput.trim()
                    ? `?promoter=${encodeURIComponent(promoterInput.trim())}`
                    : ""
                }`}
              >
                <button className="bg-white-100 text-dark font-poppins-semibold text-sm px-8 py-3 rounded-pill hover:opacity-90 transition-opacity cursor-pointer border-none">
                  Sign In to Continue
                </button>
              </SignInButton>
            ) : event.requires_rsvp ? (
              <button
                onClick={handlePurchaseClick}
                disabled={
                  !selectedTier ||
                  rsvpMutation.isPending ||
                  isLoadingUserTickets
                }
                className="bg-white-100 text-dark font-poppins-semibold text-sm px-8 py-3 rounded-pill hover:opacity-90 transition-opacity cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {rsvpMutation.isPending
                  ? "Submitting..."
                  : isLoadingUserTickets
                  ? "Loading..."
                  : "Request RSVP"}
              </button>
            ) : (
              <button
                onClick={handlePurchaseClick}
                disabled={
                  creatingHold || !selectedTier || isLoadingUserTickets
                }
                className="bg-white-100 text-dark font-poppins-semibold text-sm px-8 py-3 rounded-pill hover:opacity-90 transition-opacity cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingHold
                  ? "Creating Reservation..."
                  : isLoadingUserTickets
                  ? "Loading..."
                  : (() => {
                      const price = getEffectivePrice(
                        selectedTier,
                        selectedStageId
                      );
                      if (price === 0) return "Claim Free Ticket";
                      return "Continue to Checkout";
                    })()}
              </button>
            )}
          </div>
        )}

        {/* Auth prompt when no tier selected yet */}
        {allTiers.length > 0 && !selectedTier && (!mounted || !isSignedIn) && (
          <div className="flex flex-col items-center gap-4 p-6 bg-white-5 rounded-card">
            <FiInfo size={24} className="text-white-50" />
            <p className="text-white-50 text-sm font-poppins m-0 text-center">
              Please sign in to{" "}
              {event.requires_rsvp ? "request" : "purchase"} tickets for this event
            </p>
            <SignInButton
              mode="modal"
              forceRedirectUrl={`/events/${event.slug}${
                promoterInput.trim()
                  ? `?promoter=${encodeURIComponent(promoterInput.trim())}`
                  : ""
              }`}
              signUpForceRedirectUrl={`/events/${event.slug}${
                promoterInput.trim()
                  ? `?promoter=${encodeURIComponent(promoterInput.trim())}`
                  : ""
              }`}
            >
              <button className="bg-white-100 text-dark font-poppins-semibold text-sm px-8 py-3 rounded-pill hover:opacity-90 transition-opacity cursor-pointer border-none">
                Sign In
              </button>
            </SignInButton>
          </div>
        )}

        {rsvpMessage && rsvpMessageType === "error" && (
          <div className="bg-error/10 border border-error/30 rounded-card px-4 py-3 text-error text-sm font-poppins text-center">
            {rsvpMessage}
          </div>
        )}
      </div>

      {footer}

      {/* ─── Floating "Buy Tickets" / "Request RSVP" pill (matching mobile) ─── */}
      {allTiers.length > 0 && (
        <div
          className={`fixed ${v2Frame ? "bottom-[92px] lg:bottom-6" : "bottom-6"} left-6 right-6 z-50 max-w-[800px] mx-auto transition-opacity duration-200 ${
            showBuyTicketsPill ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
        >
          <button
            onClick={() => {
              setShowBuyTicketsPill(false);
              const ticketSection = document.getElementById("ticket-section");
              if (ticketSection && v2Frame) {
                ticketSection.scrollIntoView({ behavior: "smooth", block: "start" });
              } else if (ticketSection) {
                const NAVBAR_HEIGHT = 64; // h-16 fixed navbar
                const top = ticketSection.getBoundingClientRect().top + window.scrollY - NAVBAR_HEIGHT - 16;
                window.scrollTo({ top, behavior: "smooth" });
              }
            }}
            className="w-full h-14 bg-white-100 text-dark font-poppins-semibold text-base rounded-pill cursor-pointer border-none shadow-card hover:opacity-95 transition-opacity"
          >
            {event.requires_rsvp ? "Request RSVP" : "Buy Tickets"}
          </button>
        </div>
      )}
    </div>
  );
}
