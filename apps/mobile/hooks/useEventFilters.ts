import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  extractUniqueCities,
  extractUniqueOrganizers,
  filterEventsByCity,
  filterEventsByOrganizer,
  DEFAULT_CATALOG_CITY,
  foldForSearch,
} from "@project-flame/lib";
import type { EventCardData } from "@project-flame/ui";
import type { OrgFilterableEvent } from "@project-flame/lib";

export function useEventFilters(allEvents: EventCardData[] | undefined) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCityState] = useState<string | null>(null);
  const [selectedOrganizer, setSelectedOrganizer] = useState<string | null>(
    null,
  );

  const cities = useMemo(
    () => extractUniqueCities((allEvents ?? []) as OrgFilterableEvent[]),
    [allEvents],
  );

  // W0-Q3: default the city filter to DEFAULT_CATALOG_CITY once events load —
  // but only if it actually has events (so other markets aren't filtered to
  // empty), and only until the user touches the filter. Once touched,
  // reset/clear broadens to all cities (decision Jun 3, 2026) — no "return to
  // Quito".
  //
  // Intentional edge: the default is applied exactly once (guarded by
  // hasAppliedDefaultRef/hasUserInteractedRef). If the default city later drops
  // out of `cities` (e.g. its events end) while still selected, selectedCity is
  // NOT auto-cleared — filteredEvents can be empty until the user changes the
  // filter via setSelectedCity. Accepted for this PR.
  const hasUserInteractedRef = useRef(false);
  const hasAppliedDefaultRef = useRef(false);

  const setSelectedCity = useCallback((city: string | null) => {
    hasUserInteractedRef.current = true;
    setSelectedCityState(city);
  }, []);

  useEffect(() => {
    if (
      !hasAppliedDefaultRef.current &&
      !hasUserInteractedRef.current &&
      cities.includes(DEFAULT_CATALOG_CITY)
    ) {
      hasAppliedDefaultRef.current = true;
      setSelectedCityState(DEFAULT_CATALOG_CITY);
    }
  }, [cities]);

  const organizers = useMemo(
    () => extractUniqueOrganizers((allEvents ?? []) as OrgFilterableEvent[]),
    [allEvents],
  );

  const filteredEvents = useMemo(() => {
    if (!allEvents?.length) return [];

    let result = filterEventsByCity(
      allEvents as OrgFilterableEvent[],
      selectedCity,
    );
    result = filterEventsByOrganizer(
      result as OrgFilterableEvent[],
      selectedOrganizer,
    );

    // Accent-insensitive ("carnaval" finds "Carnával" and the other way), like the organizer v2.
    const query = foldForSearch(searchQuery.trim());
    if (!query) return result as EventCardData[];

    return result.filter(
      (e) =>
        foldForSearch((e as EventCardData).title).includes(query) ||
        foldForSearch((e as EventCardData).location).includes(query) ||
        foldForSearch((e as EventCardData).description ?? "").includes(query),
    ) as EventCardData[];
  }, [allEvents, searchQuery, selectedCity, selectedOrganizer]);

  return {
    searchQuery,
    setSearchQuery,
    selectedCity,
    setSelectedCity,
    selectedOrganizer,
    setSelectedOrganizer,
    cities,
    organizers,
    filteredEvents,
  };
}
