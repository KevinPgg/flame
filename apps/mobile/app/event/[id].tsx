import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Animated,
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  Dimensions,
  Share,
  type LayoutChangeEvent,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  FlameText,
  PillButton,
  colors,
  GlowBlob,
  CustomRefreshControl,
} from "@project-flame/ui";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EventHero } from "../../components/event-details/EventHero";
import { TicketSelection } from "../../components/event-details/TicketSelection";
import { PreCheckoutCodes } from "../../components/event-details/PreCheckoutCodes";
import { CheckoutCTA } from "../../components/event-details/CheckoutCTA";
import { CheckoutSheet } from "../../components/event-details/CheckoutSheet";
import {
  useEventDetails,
  enrichTier,
  UnlockedTierSchema,
  type TicketTierWithStatus,
} from "../../hooks/useEventDetails";
import {
  buildTimeRange,
  isValidIanaTimezone,
  normalizeTicketTierSecretCode,
  type TicketTier,
} from "@project-flame/lib";
import { useCheckout } from "../../hooks/useCheckout";
import { apiPost, ApiError } from "../../lib/api";
import { useOptionalAuth } from "../../hooks/useOptionalAuth";
import { useUserTickets } from "../../hooks/useUserTickets";
import { attendeeV2Enabled } from "../../lib/v2/flags";
import { EventHeader } from "../../components/v2/attendee/event/EventHeader";
import { MoreFromOrganizer, useOrganizerFromFeed } from "../../components/v2/attendee/event/MoreFromOrganizer";
import { AccessCode } from "../../components/v2/attendee/event/AccessCode";
import {
  getTabBarPaddingBottom,
  TAB_BAR_PILL_HEIGHT,
  TAB_BAR_PILL_MARGIN,
} from "../../components/navigation/CustomTabBar";

const FLOATING_PILL_HEIGHT = 56;

// ---------------------------------------------------------------------------
// Event Detail Screen
// ---------------------------------------------------------------------------

export default function EventDetailScreen() {
  const { id, promoter } = useLocalSearchParams<{
    id: string;
    promoter?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: event, isLoading, error, refetch } = useEventDetails(id);
  // Fase 2.4: Flame 2.0 surroundings (header + "More from") around the unchanged purchase block.
  const v2 = attendeeV2Enabled();
  const feedOrg = useOrganizerFromFeed(id);

  const { isSignedIn, isConfigured, getToken } = useOptionalAuth();

  // Fetch user tickets to check for existing RSVPs (mirrors web EventDetail.tsx)
  const { data: userTicketsData, isLoading: isLoadingUserTickets } = useUserTickets({
    enabled: isSignedIn && Boolean(event?.requires_rsvp),
  });

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // --- Ticket selection state ---
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [showCheckout, setShowCheckout] = useState(false);

  // --- Access code (W4-C3) ---
  // Unlocks a hidden tier server-side via POST /api/ticket-tiers/unlock and
  // adds the enriched tier to the displayed list with auto-selection. The
  // typed code is mirrored into checkoutState.secretCode so the hold/RSVP
  // payload still carries it for server re-verification.
  const [accessCodeInput, setAccessCodeInput] = useState("");
  const [accessCodeStatus, setAccessCodeStatus] = useState<
    "idle" | "validating" | "valid" | "invalid"
  >("idle");
  const [accessCodeError, setAccessCodeError] = useState<string | null>(null);
  const [unlockedTiers, setUnlockedTiers] = useState<TicketTierWithStatus[]>([]);

  // Derived values
  const isRsvp = Boolean(event?.requires_rsvp);
  // W4-C3 (Jun 2026) follow-up: sort merged tiers so an unlocked tier slots
  // into its natural position by price (matching web). Without this, the
  // unlocked tier always rendered last. Mirrors the sort in useEventDetails.
  const displayedTiers = useMemo<TicketTierWithStatus[]>(() => {
    const merged = [...(event?.ticket_tiers ?? []), ...unlockedTiers];
    return merged.sort((a, b) => {
      const priceDiff = a.displayPrice - b.displayPrice;
      if (priceDiff !== 0) return priceDiff;
      const orderDiff =
        (a.order_index ?? Infinity) - (b.order_index ?? Infinity);
      if (orderDiff !== 0) return orderDiff;
      return a.id.localeCompare(b.id);
    });
  }, [event?.ticket_tiers, unlockedTiers]);
  const hasTicketTiers = displayedTiers.length > 0;
  const selectedTier = useMemo(
    () => displayedTiers.find(t => t.id === selectedTierId),
    [displayedTiers, selectedTierId],
  );
  const maxQuantity = useMemo(() => {
    if (!selectedTier) return 1;
    const available =
      selectedTier.quantity_total -
      selectedTier.quantity_sold -
      (selectedTier.quantity_reserved || 0);
    if (available <= 0) return 0;
    const cap =
      selectedTier.per_user_limit != null
        ? Math.min(available, selectedTier.per_user_limit)
        : available;
    return Math.max(0, cap);
  }, [selectedTier]);

  // Clamp quantity when available inventory shrinks (e.g. concurrent purchases)
  useEffect(() => {
    if (quantity > maxQuantity) {
      setQuantity(maxQuantity);
    }
  }, [maxQuantity, quantity]);

  // --- Checkout hook ---
  const initialPromoterCode =
    typeof promoter === "string" && promoter.trim()
      ? promoter.trim()
      : undefined;
  const checkoutState = useCheckout({
    event,
    tier: selectedTier,
    quantity,
    isRsvp,
    promoterCode: initialPromoterCode,
  });

  // Clear any previously verified access code when the user switches tiers so
  // the modal logic fires correctly for the newly selected tier.
  const prevTierIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevTierIdRef.current !== null && prevTierIdRef.current !== selectedTierId) {
      checkoutState.resetCheckout();
    }
    prevTierIdRef.current = selectedTierId ?? null;
  }, [selectedTierId, checkoutState]);

  // --- Handlers ---
  const handleSelectTier = useCallback(
    (tierId: string) => {
      if (selectedTierId === tierId) {
        // Tapping already-selected tier deselects it
        setSelectedTierId(null);
        setQuantity(1);
        return;
      }
      // W4-C3 (Jun 2026) follow-up: when selecting an unlocked (hidden) tier,
      // re-apply the access code from local input. Otherwise the tier-switch
      // effect (line 159+) runs resetCheckout() and wipes secretCode, leaving
      // the green "Access Code applied" UI lying — checkout would send no
      // code and hit 403 MISSING_SECRET_CODE. Pre-updating prevTierIdRef
      // here suppresses the reset so the secret code we set survives.
      const isUnlockedTier =
        unlockedTiers.some((t) => t.id === tierId) &&
        accessCodeInput.trim().length > 0;
      if (isUnlockedTier) {
        prevTierIdRef.current = tierId;
        setSelectedTierId(tierId);
        setQuantity(1);
        checkoutState.setSecretCode(
          normalizeTicketTierSecretCode(accessCodeInput.trim()),
        );
        return;
      }
      setSelectedTierId(tierId);
      setQuantity(1); // Reset qty on tier change
    },
    [selectedTierId, unlockedTiers, accessCodeInput, checkoutState],
  );

  const handleQuantityChange = useCallback(
    (newQty: number) => {
      const minQty = maxQuantity <= 0 ? 0 : 1;
      setQuantity(Math.max(minQty, Math.min(newQty, maxQuantity)));
    },
    [maxQuantity],
  );

  // W4-C3: unlock a hidden tier by access code.
  // In-flight token guards against out-of-order responses if the user submits
  // multiple unlock requests (e.g. fast Apply taps before the disabled-state
  // takes effect). Mirrors web's latestUnlockTokenRef pattern.
  const latestUnlockTokenRef = useRef(0);
  const validateAccessCode = useCallback(
    async (rawCode: string) => {
      const trimmed = rawCode.trim();
      if (!event?.id || trimmed.length < 1) {
        setAccessCodeStatus("idle");
        setAccessCodeError(null);
        return;
      }
      if (!isSignedIn) {
        setAccessCodeStatus("invalid");
        setAccessCodeError("Sign in to use an access code.");
        return;
      }
      const token = ++latestUnlockTokenRef.current;
      setAccessCodeStatus("validating");
      setAccessCodeError(null);
      try {
        const json = await apiPost<{ tier: unknown }>(
          "/api/ticket-tiers/unlock",
          { event_id: event.id, code: trimmed },
          getToken,
        );
        if (token !== latestUnlockTokenRef.current) return;
        const parsed = UnlockedTierSchema.safeParse(json.tier);
        if (!parsed.success) {
          console.error("[unlock-tier] response shape invalid", parsed.error);
          setAccessCodeStatus("invalid");
          setAccessCodeError("Unexpected response. Try again.");
          return;
        }
        // Zod schema is broader than the shared TicketTier type (nullable
        // description). The runtime shape is compatible — cast at the boundary
        // so enrichTier's signature stays narrow.
        const enriched = enrichTier(parsed.data as unknown as TicketTier);
        if (enriched.length === 0) {
          setAccessCodeStatus("invalid");
          setAccessCodeError("Invalid access code");
          return;
        }
        setUnlockedTiers((prev) => {
          const existingIds = new Set(prev.map((t) => t.id));
          return [
            ...prev,
            ...enriched.filter((t) => !existingIds.has(t.id)),
          ];
        });
        // Pick the first available stage-expanded entry if multiple (waterfall),
        // otherwise the single entry.
        const target =
          enriched.find((t) => t.status === "available") ?? enriched[0];
        // W4-C3 (Jun 2026) follow-up: pre-update prevTierIdRef so the
        // tier-switch effect (event/[id].tsx:149) doesn't fire
        // `checkoutState.resetCheckout()` and wipe the secretCode we're
        // about to set — that was the cause of the "pre-selected tier, then
        // enter code → green container doesn't appear, code not applied" bug.
        prevTierIdRef.current = target.id;
        setSelectedTierId(target.id);
        setQuantity(1);
        checkoutState.setSecretCode(normalizeTicketTierSecretCode(trimmed));
        setAccessCodeStatus("valid");
        setAccessCodeError(null);
      } catch (err) {
        if (token !== latestUnlockTokenRef.current) return;
        if (err instanceof ApiError) {
          setAccessCodeStatus("invalid");
          if (err.code === "INVALID_ACCESS_CODE" || err.status === 404) {
            setAccessCodeError("Invalid access code");
          } else if (err.status === 401) {
            setAccessCodeError("Sign in to use an access code.");
          } else {
            // 5xx etc. — surface the server message so prod issues aren't
            // silently masked as "wrong code".
            console.error("[validateAccessCode] server error", err.status, err.message);
            setAccessCodeError(err.message || "Something went wrong. Try again.");
          }
        } else {
          console.error("[validateAccessCode] unexpected error", err);
          setAccessCodeStatus("invalid");
          setAccessCodeError("Something went wrong. Try again.");
        }
      }
    },
    [event?.id, isSignedIn, getToken, checkoutState],
  );

  const clearAccessCode = useCallback(() => {
    // Bump the in-flight token so any pending unlock response is ignored.
    latestUnlockTokenRef.current++;
    const unlockedIds = new Set(unlockedTiers.map((t) => t.id));
    if (selectedTierId && unlockedIds.has(selectedTierId)) {
      setSelectedTierId(null);
      setQuantity(1);
    }
    setUnlockedTiers([]);
    setAccessCodeInput("");
    setAccessCodeStatus("idle");
    setAccessCodeError(null);
    checkoutState.setSecretCode("");
  }, [unlockedTiers, selectedTierId, checkoutState]);

  const handleAccessCodeChange = useCallback((value: string) => {
    setAccessCodeInput(value);
    setAccessCodeStatus((prev) => (prev === "invalid" ? "idle" : prev));
    setAccessCodeError(null);
  }, []);

  const handleContinueToCheckout = useCallback(() => {
    if (!selectedTier) return;

    if (!isConfigured) {
      Alert.alert(
        "Configuration Error",
        "Authentication is not configured (missing Clerk key). Checkout is disabled.",
      );
      return;
    }

    if (!isSignedIn) {
      router.push("/sign-in");
      return;
    }

    // Block checkout while loading user tickets for RSVP (mirrors web EventDetail.tsx — button disabled when isLoadingUserTickets)
    if (isRsvp && isLoadingUserTickets) {
      return;
    }

    // Duplicate RSVP check — port from web EventDetail.tsx handlePurchaseClick
    if (isRsvp && userTicketsData?.tickets) {
      const existingTicketOrRsvp = userTicketsData.tickets.find(
        (ticket) =>
          ticket.ticket_tier?.event?.id === event?.id &&
          ticket.status === "pending",
      );

      if (existingTicketOrRsvp) {
        Alert.alert(
          "RSVP Pending",
          "You already have a pending RSVP for this event. You can request again once it's been processed.",
        );
        return;
      }
    }

    // W4-C3 (Jun 2026): no pre-checkout code modal. Hidden tiers are unlocked
    // by entering the access code in the inline input below the tier list,
    // which populates `checkoutState.secretCode`. The hold/RSVP routes
    // re-verify the code server-side for any tier with is_hidden=true.
    checkoutState.resetStep();
    setShowCheckout(true);
  }, [
    selectedTier,
    isSignedIn,
    isConfigured,
    isRsvp,
    event?.id,
    userTicketsData,
    isLoadingUserTickets,
    router,
    checkoutState,
  ]);

  const handleShare = useCallback(async () => {
    if (!event) return;
    if (!event.slug) {
      console.warn("[EventDetail] share skipped — event.slug is missing", { eventId: event.id });
      return;
    }
    try {
      const shareUrl = `https://flme.co/events/${event.slug}`;
      // Share URL only (no prefix text) — iOS/Android combine message + url otherwise.
      await Share.share({ message: shareUrl });
    } catch (err) {
      console.error("[EventDetail] share failed:", err);
    }
  }, [event]);

  const handleCloseCheckout = useCallback(() => {
    if (checkoutState.isProcessing) return;
    setShowCheckout(false);
  }, [checkoutState.isProcessing]);

  const handleViewTickets = useCallback(() => {
    setShowCheckout(false);
    router.replace("/(tabs)/dashboard");
  }, [router]);

  // --- Scroll tracking for floating pill ---
  const scrollRef = useRef<ScrollView>(null);
  const ticketSectionY = useRef(0);
  const pillOpacity = useRef(new Animated.Value(1)).current;
  const pillVisible = useRef(true);
  const [pillMounted, setPillMounted] = useState(true);

  const onTicketSectionLayout = useCallback((e: LayoutChangeEvent) => {
    ticketSectionY.current = e.nativeEvent.layout.y;
  }, []);

  const [pillAcceptingTouches, setPillAcceptingTouches] = useState(true);

  const fadePillOut = useCallback(() => {
    if (!pillVisible.current) return;
    pillVisible.current = false;
    setPillAcceptingTouches(false); // Disable touches immediately so fading overlay doesn't intercept taps
    Animated.timing(pillOpacity, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setPillMounted(false));
  }, [pillOpacity]);

  const handleScrollEvent = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    if (!pillVisible.current) return;
    const offsetY = event.nativeEvent.contentOffset.y;
    const screenH = Dimensions.get("window").height;
    const measured = ticketSectionY.current;
    const threshold = measured > 0 ? measured * 0.15 : screenH * 0.12; // tweak multipliers to fade pill earlier/later
    if (offsetY >= threshold) {
      fadePillOut();
    }
  }, [fadePillOut]);

  const scrollToTickets = useCallback(() => {
    fadePillOut();
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, ticketSectionY.current - 24),
        animated: true,
      });
    }, 50);
  }, [fadePillOut]);

  const scrollToCheckout = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  const prevSelectedTierIdRef = useRef<string | null>(null);
  useEffect(() => {
    const tierChanged = prevSelectedTierIdRef.current !== selectedTierId;
    prevSelectedTierIdRef.current = selectedTierId;
    if (tierChanged && selectedTier && quantity > 0) {
      scrollToCheckout();
    }
  }, [selectedTierId, selectedTier, quantity, scrollToCheckout]);

  // --- Loading state ---
  if (isLoading && !event) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  // --- Fetch error state (retryable) ---
  if (error && !event) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <FlameText variant="h4" className="text-white-100 text-center mb-2">
          Unable to load event
        </FlameText>
        <FlameText
          variant="subtitle1"
          className="text-white-70 text-center mb-4"
        >
          {error instanceof Error && error.message
            ? error.message
            : "Something went wrong. Please try again."}
        </FlameText>
        <PillButton
          label="Retry"
          variant="solid"
          onPress={() => handleRefresh()}
        />
        <View className="mt-3">
          <PillButton
            label="Go Back"
            variant="ghost"
            onPress={() => router.back()}
          />
        </View>
      </View>
    );
  }

  // --- Not found state ---
  if (!event) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <FlameText variant="h4" className="text-white-100 text-center mb-4">
          Event not found
        </FlameText>
        <PillButton
          label="Go Back"
          variant="solid"
          onPress={() => router.back()}
        />
      </View>
    );
  }

  // --- Derived display values ---
  const rawTz = event.timezone ?? "";
  const tz = isValidIanaTimezone(rawTz) ? rawTz : "America/Guayaquil";
  const timeRange = buildTimeRange(event.starts_at, event.ends_at, tz, event.city);
  const location = [event.venue, event.city].filter(Boolean).join(", ");
  const primaryOrgName = event.organization_name || event.organizations?.name;
  const organizerName =
    primaryOrgName && event.cohost_org_names?.length
      ? [primaryOrgName, ...event.cohost_org_names].join(" & ")
      : primaryOrgName;

  return (
    <View className={v2 ? "flex-1 bg-black" : "flex-1 bg-background"}>
      <ScrollView
        ref={scrollRef}
        onScroll={handleScrollEvent}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        bounces
        contentContainerStyle={{
          paddingBottom:
            getTabBarPaddingBottom(insets.bottom) + FLOATING_PILL_HEIGHT,
        }}
        refreshControl={
          <CustomRefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
      >
        {/* Background glow blobs (v1 only) */}
        {!v2 && (<>
        <GlowBlob
          top={100}
          left={-100}
          width={600}
          height={700}
          color="rgba(255, 20, 0, 0.06)"
        />
        <GlowBlob
          top={800}
          left={-150}
          width={500}
          height={600}
          color="rgba(255, 10, 0, 0.05)"
        />
        </>)}

        <View className="gap-[21px]">
          {v2 ? (
            <EventHeader
              event={event}
              organizer={organizerName ? { names: organizerName, slug: feedOrg?.slug ?? event.organizations?.slug ?? null, logoUrl: feedOrg?.logo_url ?? null } : null}
              onShare={handleShare}
            />
          ) : (
          <>
          {/* ─── Back Navigation ─── */}
          {/* Figma node 518:7762 — arrow-left + "Go Back" */}
          <Pressable
            onPress={() => router.back()}
            className="flex-row gap-[7px] items-center px-4"
          >
            <Feather name="arrow-left" size={24} color={colors["white-100"]} />
            <FlameText variant="subtitle1" className="text-white-100">
              Go Back
            </FlameText>
          </Pressable>

          {/* ─── Event Hero ─── */}
          <EventHero
            event={event}
            organizerName={organizerName}
            timeRange={timeRange}
            location={location}
            isRsvp={!!isRsvp}
            onShare={handleShare}
          />

          </>
          )}

          {/* ─── Ticket Selection (onLayout captures scroll offset) ─── */}
          {/* W4-C3: Promoter + Access Code render via the `belowTitle` slot so
              they sit between the "Select Your Ticket" header and the tier
              cards (mirrors web EventDetail.tsx). */}
          {hasTicketTiers && (
            <View onLayout={onTicketSectionLayout}>
              <TicketSelection
                tiers={displayedTiers}
                selectedTierId={selectedTierId}
                quantity={quantity}
                maxQuantity={maxQuantity}
                isRsvp={isRsvp}
                currency={event.currency}
                onSelectTier={handleSelectTier}
                onQuantityChange={handleQuantityChange}
                belowTitle={
                  // Flame 2.0 (Kevin 2026-10-27): only the tiers here; promoter + discount in the
                  // checkout sheet, access code from "Have an access code?" below.
                  v2 ? undefined : <PreCheckoutCodes
                    promoterCode={checkoutState.promoterCode}
                    promoterStatus={checkoutState.promoterStatus}
                    onPromoterChange={checkoutState.setPromoterCode}
                    onValidatePromoter={checkoutState.validatePromoter}
                    onClearPromoter={checkoutState.clearPromoter}
                    accessCode={accessCodeInput}
                    accessCodeStatus={accessCodeStatus}
                    accessCodeError={accessCodeError}
                    onAccessCodeChange={handleAccessCodeChange}
                    onValidateAccessCode={validateAccessCode}
                    onClearAccessCode={clearAccessCode}
                  />
                }
              />
              {v2 ? (
                <View className="mt-4">
                  <AccessCode
                    value={accessCodeInput}
                    status={accessCodeStatus}
                    error={accessCodeError}
                    onChange={handleAccessCodeChange}
                    onUnlock={validateAccessCode}
                    onClear={clearAccessCode}
                  />
                </View>
              ) : null}
            </View>
          )}

          {selectedTier && quantity > 0 && (
            <CheckoutCTA
              isSignedIn={isSignedIn}
              quantity={quantity}
              onPress={handleContinueToCheckout}
              disabled={isRsvp && isLoadingUserTickets}
              loadingLabel={
                isRsvp && isLoadingUserTickets ? "Loading..." : undefined
              }
            />
          )}
        </View>
        {v2 ? (
          <MoreFromOrganizer
            eventId={event.id}
            organizerSlug={feedOrg?.slug ?? event.organizations?.slug ?? null}
            organizerName={primaryOrgName ?? ""}
          />
        ) : null}
      </ScrollView>

      {/* ─── Floating CTA (above tab bar, matches tab bar dimensions) ─── */}
      {hasTicketTiers && pillMounted && (
        <Animated.View
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            bottom:
              insets.bottom +
              TAB_BAR_PILL_MARGIN +
              TAB_BAR_PILL_HEIGHT +
              12,
            opacity: pillOpacity,
            zIndex: 10,
            elevation: 10,
          }}
          pointerEvents={pillAcceptingTouches ? "auto" : "none"}
        >
          <Pressable
            className="items-center justify-center bg-white-100 rounded-full"
            style={{
              height: FLOATING_PILL_HEIGHT,
              borderRadius: FLOATING_PILL_HEIGHT / 2,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
            onPress={scrollToTickets}
          >
            <Text
              className="text-base font-poppins-semibold"
              style={{ color: colors.dark }}
            >
              {isRsvp ? "Request RSVP" : "Buy Tickets"}
            </Text>
          </Pressable>
        </Animated.View>
      )}

      {/* ─── Checkout Bottom Sheet ─── */}
      {selectedTier && (
        <>
          <CheckoutSheet
            visible={showCheckout}
            onClose={handleCloseCheckout}
            event={event}
            tier={selectedTier}
            quantity={quantity}
            isRsvp={isRsvp}
            // Checkout state
            step={checkoutState.step}
            error={checkoutState.error}
            errorCode={checkoutState.errorCode}
            isProcessing={checkoutState.isProcessing}
            isFree={checkoutState.isFree}
            result={checkoutState.result}
            // Amounts
            displayAmounts={checkoutState.displayAmounts}
            // Promo
            promoCode={checkoutState.promoCode}
            onApplyPromo={checkoutState.validatePromo}
            onClearPromo={checkoutState.clearPromo}
            promoApplied={!!checkoutState.promoValidation}
            isValidatingPromo={checkoutState.isValidatingPromo}
            // Secret code
            secretCode={checkoutState.secretCode}
            onSecretCodeChange={checkoutState.setSecretCode}
            // Registration form
            registrationData={checkoutState.registrationData}
            onRegistrationDataChange={checkoutState.setRegistrationData}
            // Promoter
            promoterCode={checkoutState.promoterCode}
            promoterStatus={checkoutState.promoterStatus}
            onPromoterChange={checkoutState.setPromoterCode}
            onValidatePromoter={checkoutState.validatePromoter}
            onClearPromoter={checkoutState.clearPromoter}
            // Actions
            onCheckout={checkoutState.checkout}
            onReset={checkoutState.resetCheckout}
            onViewTickets={handleViewTickets}
          />
        </>
      )}
    </View>
  );
}
