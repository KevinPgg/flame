/**
 * Organizer Public — Screen 2 of the mobile nav restructure.
 *
 * Public-facing organizer profile reached from event details or a shared link.
 * Mirrors the Organizer Admin layout (Screen 3) minus all admin actions:
 *   - Top: ← Go Back text link (matches event-detail pattern)
 *   - Org header row: logo + name + (📍 city, Instagram handle) + Share icon
 *   - Description
 *   - Search bar
 *   - Spotlight card for the next upcoming event (matches the BIG card on Discover)
 *   - Remaining events as a vertical list
 *   - Past events accordion
 *
 * Event taps go to the public event detail (`/event/:id`).
 */

import { useState, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Share,
  Linking,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import {
  FlameImage,
  FlameText,
  colors,
  CustomRefreshControl,
  Skeleton,
  type EventCardData,
} from "@project-flame/ui";
import { getTabBarPaddingBottom } from "../../components/navigation/CustomTabBar";
import { TicketSearchBar } from "../../components/dashboard/TicketSearchBar";
import { PastItemsAccordion } from "../../components/shared/PastItemsAccordion";
import { useAppEvents } from "../../hooks/useAppEvents";
import { useOrganizations } from "../../hooks/useOrganizations";
import { usePastOrgEvents } from "../../hooks/usePastOrgEvents";
import { useOrgCohostEventIds } from "../../hooks/useOrgCohostEventIds";
import { filterEventsByOrganizer } from "@project-flame/lib";
import { attendeeV2Enabled } from "../../lib/v2/flags";
import { OrganizerProfile } from "../../components/v2/attendee/organizer/OrganizerProfile";

/** Public organizer profile: Flame 2.0 (fase 2.4) unless EXPO_PUBLIC_ATTENDEE_V1=true. */
export default function OrganizerScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const clean = (typeof slug === "string" ? slug : Array.isArray(slug) ? slug[0] : "")?.trim() ?? "";
  return attendeeV2Enabled() ? <OrganizerProfile slug={clean} /> : <OrganizerEventsScreen />;
}

function OrganizerEventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const trimmedSlug =
    (typeof slug === "string"
      ? slug
      : Array.isArray(slug)
        ? slug[0]
        : undefined)?.trim() || null;

  const [searchQuery, setSearchQuery] = useState("");

  // Deep-linked users (universal-link / notification) have no back stack;
  // fall back to Home rather than a no-op.
  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  const { data, isLoading, isError, refetch } = useAppEvents();
  const {
    data: organizations,
    isLoading: organizationsLoading,
    isError: organizationsError,
    refetch: refetchOrganizations,
  } = useOrganizations();

  const org = useMemo(() => {
    if (!trimmedSlug || !organizations) return undefined;
    return organizations.find((o) => o.slug === trimmedSlug);
  }, [organizations, trimmedSlug]);
  // Don't render the org header/profile from a cached events fallback while
  // the `organizations` query is still loading — otherwise users briefly see
  // a ghost profile ("Organizer" + empty meta) that snaps to real data when
  // the query settles. Only flag not-found once the query has actually finished.
  const organizationsSettled = !organizationsLoading && !organizationsError;
  const notFound = organizationsSettled && !!trimmedSlug && !org;

  const {
    data: pastEvents,
    refetch: refetchPastEvents,
  } = usePastOrgEvents(org?.id);

  // Event IDs where this org is a co-host. Public read enabled by
  // `Anyone can view cohost links for published events` policy.
  const {
    data: cohostEventIds,
    isLoading: cohostIdsLoading,
    refetch: refetchCohostEventIds,
  } = useOrgCohostEventIds(org?.id);

  const orgEvents = useMemo(() => {
    if (!trimmedSlug) return [];
    const all = data?.allEvents ?? [];
    const owned = filterEventsByOrganizer(all, trimmedSlug);
    if (!cohostEventIds || cohostEventIds.size === 0) return owned;
    const ownedIds = new Set(owned.map(e => e.id));
    const cohosted = all.filter(
      e => cohostEventIds.has(e.id) && !ownedIds.has(e.id),
    );
    return [...owned, ...cohosted];
  }, [data?.allEvents, trimmedSlug, cohostEventIds]);

  const orgName = useMemo(() => {
    if (org?.name) return org.name;
    const first = orgEvents.find((e) => e.organizationName);
    return first?.organizationName ?? trimmedSlug ?? "Organizer";
  }, [org, orgEvents, trimmedSlug]);

  const handleShare = useCallback(async () => {
    if (!trimmedSlug) return;
    try {
      await Share.share({
        message: `Check out ${orgName} on Flame!`,
        url: `https://flme.co/organizer/${trimmedSlug}`,
      });
    } catch (err) {
      console.error("[OrganizerEvents] share failed:", err);
    }
  }, [orgName, trimmedSlug]);

  const filteredEvents = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return orgEvents;
    return orgEvents.filter(
      (e) =>
        e.title.toLowerCase().includes(query) ||
        e.location.toLowerCase().includes(query) ||
        (e.description ?? "").toLowerCase().includes(query),
    );
  }, [orgEvents, searchQuery]);

  const filteredPastEvents = useMemo(() => {
    if (!pastEvents) return [];
    const query = searchQuery.toLowerCase().trim();
    if (!query) return pastEvents;
    return pastEvents.filter(
      (e) =>
        e.title.toLowerCase().includes(query) ||
        e.location.toLowerCase().includes(query) ||
        (e.description ?? "").toLowerCase().includes(query),
    );
  }, [pastEvents, searchQuery]);

  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const handleRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        refetchOrganizations(),
        org?.id ? refetchPastEvents() : Promise.resolve(),
        org?.id ? refetchCohostEventIds() : Promise.resolve(),
      ]);
    } catch (err) {
      console.error("[OrganizerEvents] handleRefresh failed", {
        action: "refresh",
        slug: trimmedSlug ?? undefined,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRefreshing(false);
      isRefreshingRef.current = false;
    }
  }, [refetch, refetchOrganizations, refetchPastEvents, refetchCohostEventIds, org?.id, trimmedSlug]);

  const hasData = !!data?.allEvents?.length;
  // Wait for BOTH the events AND organizations queries before we can commit to
  // a loader vs loaded vs not-found state. Without this the header would
  // render a ghost profile from cached events while orgs is still resolving.
  const showLoader =
    (!hasData && isLoading) ||
    (!!trimmedSlug && organizationsLoading && !org);
  const showError = !hasData && isError;
  const showNotFound = notFound;

  const initials = orgName.charAt(0).toUpperCase();
  const normalizedInstagram =
    org?.instagram_handle?.trim().replace(/^@+/, "") || "";
  const hasMetaRow = Boolean(org?.city || normalizedInstagram);

  return (
    <View className="flex-1 bg-background">
      {showLoader ? (
        <>
          <BackButton onPress={handleBack} />
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        </>
      ) : showNotFound ? (
        <>
          <BackButton onPress={handleBack} />
          <View className="flex-1 items-center justify-center px-6 gap-3">
            <Ionicons
              name="alert-circle-outline"
              size={36}
              color={colors["white-30"]}
            />
            <Text className="text-white-80 text-base font-poppins-semibold text-center">
              Organizer not found
            </Text>
            <Text className="text-white-50 text-sm font-poppins text-center">
              We couldn't find an organizer with that link.
            </Text>
          </View>
        </>
      ) : showError ? (
        <>
          <BackButton onPress={handleBack} />
          <View className="flex-1 items-center justify-center px-6 gap-3">
            <Ionicons
              name="alert-circle-outline"
              size={36}
              color={colors["white-30"]}
            />
            <Text className="text-white-50 text-sm font-poppins text-center">
              Failed to load events. Please try again.
            </Text>
            <Pressable
              onPress={handleRefresh}
              className="bg-white-10 rounded-card px-4 py-2"
            >
              <Text className="text-white-100 text-sm font-poppins-medium">
                Retry
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: 14,
            paddingBottom: getTabBarPaddingBottom(insets.bottom),
          }}
          refreshControl={
            <CustomRefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          }
        >
          <View className="gap-[30px]">
            {/* ← Go Back */}
            <BackButton onPress={handleBack} />

            {/* Org header */}
            <View className="px-4 gap-3">
              <View className="flex-row items-start gap-3">
                <View className="size-[70px] rounded-card bg-white-10 items-center justify-center overflow-hidden">
                  {org?.logo_url ? (
                    <FlameImage
                      source={{ uri: org.logo_url }}
                      className="w-full h-full"
                      contentFit="cover"
                    />
                  ) : (
                    <Text className="text-white-100 text-2xl font-poppins-semibold">
                      {initials}
                    </Text>
                  )}
                </View>
                <View className="flex-1 min-w-0">
                  <Text
                    className="text-white-100 text-lg leading-7 font-poppins-semibold"
                    numberOfLines={1}
                  >
                    {orgName}
                  </Text>
                  {hasMetaRow && (
                    <View className="gap-1 mt-[2px]">
                      {org?.city ? (
                        <View className="flex-row items-center gap-1">
                          <Ionicons
                            name="location-outline"
                            size={14}
                            color={colors["white-50"]}
                          />
                          <Text className="text-white-50 text-xs leading-4 font-poppins">
                            {org.city}
                          </Text>
                        </View>
                      ) : null}
                      {normalizedInstagram ? (
                        <Pressable
                          onPress={async () => {
                            const url = `https://instagram.com/${normalizedInstagram}`;
                            try {
                              const supported = await Linking.canOpenURL(url);
                              if (!supported) {
                                console.warn("[OrganizerPublic] cannot open instagram url", {
                                  screen: "organizer/[slug]",
                                  action: "open instagram",
                                  url,
                                });
                                return;
                              }
                              await Linking.openURL(url);
                            } catch (err) {
                              console.error("[OrganizerPublic] open instagram failed", {
                                screen: "organizer/[slug]",
                                action: "open instagram",
                                url,
                                error: err instanceof Error ? err.message : String(err),
                              });
                            }
                          }}
                          accessibilityRole="link"
                          accessibilityLabel={`Instagram @${normalizedInstagram}`}
                        >
                          <View className="flex-row items-center gap-1">
                            <Ionicons
                              name="logo-instagram"
                              size={14}
                              color={colors["white-50"]}
                            />
                            <Text className="text-white-50 text-xs leading-4 font-poppins">
                              @{normalizedInstagram}
                            </Text>
                          </View>
                        </Pressable>
                      ) : null}
                    </View>
                  )}
                </View>
                <Pressable
                  onPress={handleShare}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Share"
                  className="size-[38px] rounded-circle bg-white-5 items-center justify-center"
                >
                  <Ionicons
                    name="share-outline"
                    size={18}
                    color={colors["white-100"]}
                  />
                </Pressable>
              </View>

              {org?.description && (
                <Text className="text-white-80 text-sm leading-5 font-poppins mt-1">
                  {org.description}
                </Text>
              )}
            </View>

            {/* Events */}
            <View className="px-4 gap-6">
              <Text className="text-white-100 text-sm leading-5 font-poppins-semibold uppercase">
                {"Current & upcoming events"}
              </Text>
              <TicketSearchBar
                value={searchQuery}
                onChangeText={setSearchQuery}
              />

              {cohostIdsLoading && filteredEvents.length === 0 ? (
                /* Cohost-only orgs need a placeholder while event_assignments
                   resolves — otherwise "No events" flashes before the cohost
                   events merge in. Card-grid skeleton matches the actual
                   EventGrid shape that's about to paint (Luma / Eventbrite
                   pattern). */
                <EventGridSkeleton count={2} />
              ) : filteredEvents.length === 0 ? (
                <View className="py-12 items-center">
                  <Text className="text-white-50 text-sm font-poppins text-center">
                    {searchQuery.trim()
                      ? "No events match your search."
                      : "No current or upcoming events."}
                  </Text>
                </View>
              ) : (
                <EventGrid
                  events={filteredEvents}
                  onEventPress={(eventId) =>
                    router.push(`/event/${eventId}`)
                  }
                />
              )}

              {/* Past events: no placeholder while loading. Accordion only
                  appears once it has content — collapsed footprint is small
                  enough that pop-in is unobtrusive, and an empty-section
                  skeleton would mislead orgs with zero past events. */}
              {filteredPastEvents.length > 0 ? (
                <PastItemsAccordion
                  label="Past events"
                  count={filteredPastEvents.length}
                >
                  <EventGrid
                    events={filteredPastEvents}
                    onEventPress={(eventId) =>
                      router.push(`/event/${eventId}`)
                    }
                  />
                </PastItemsAccordion>
              ) : null}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row gap-[7px] items-center px-4"
    >
      <Feather name="arrow-left" size={24} color={colors["white-100"]} />
      <FlameText variant="subtitle1" className="text-white-100">
        Go Back
      </FlameText>
    </Pressable>
  );
}

function EventGrid({
  events,
  onEventPress,
}: {
  events: EventCardData[];
  onEventPress: (eventId: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {events.map((event) => (
        <View key={event.id} style={{ width: "48.5%" }}>
          <EventGridCard event={event} onPress={() => onEventPress(event.id)} />
        </View>
      ))}
    </View>
  );
}

/** Placeholder rendered while events are loading — mirrors EventGrid /
 *  EventGridCard layout (2-col, aspect-square image, title + date lines)
 *  so the structure stays stable when real cards swap in. */
function EventGridSkeleton({ count = 2 }: { count?: number }) {
  return (
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ width: "48.5%" }}>
          <View className="bg-card rounded-card p-2 pb-3">
            <Skeleton className="aspect-square w-full rounded-card" />
            <View className="mt-2 gap-2">
              <Skeleton className="h-[22px] w-4/5 rounded" />
              <Skeleton className="h-4 w-3/5 rounded" />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function EventGridCard({
  event,
  onPress,
}: {
  event: EventCardData;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="bg-card rounded-card p-2 pb-3">
      <View className="aspect-square w-full rounded-card overflow-hidden relative">
        <FlameImage
          source={{ uri: event.imageUrl }}
          className="w-full h-full"
          contentFit="cover"
        />
        <View className="absolute top-[7px] left-[6px] bg-[rgba(0,0,0,0.55)] rounded-badge px-[10px] py-[6px] flex-row items-center gap-2">
          <FlameText
            variant="subtitle1"
            className="text-white font-poppins-bold uppercase"
          >
            {event.day}
          </FlameText>
          <FlameText
            variant="subtitle1"
            className="text-white font-poppins-light"
          >
            {event.month}
          </FlameText>
        </View>
      </View>
      <View className="mt-2 gap-2">
        <Text
          className="text-white-100 text-base leading-[22px] font-poppins-semibold"
          numberOfLines={2}
        >
          {event.title}
        </Text>
        <View className="flex-row items-center gap-2">
          <Feather name="calendar" size={14} color={colors["white-100"]} />
          <Text
            className="text-white-100 text-xs leading-4 font-poppins-light flex-1"
            numberOfLines={1}
          >
            {event.date}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
