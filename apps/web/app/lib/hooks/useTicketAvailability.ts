import { useEffect, useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

interface StageAvailability {
  stage_id: string;
  stage_name: string;
  stage_price_cents: number;
  stage_order: number;
  total_quantity: number;
  sold_quantity: number;
  held_quantity: number;
  available_quantity: number;
  is_current_stage: boolean;
}

interface TierAvailability {
  id: string;
  name: string;
  price_cents: number;
  quantity_total: number;
  quantity_sold: number;
  per_user_limit: number;
  sales_start: string | null;
  sales_end: string | null;
  available: number;
  held: number;
}

interface AvailabilityResponse {
  tier: TierAvailability;
  stages: StageAvailability[];
  currentStage: StageAvailability | null;
  timestamp: string;
}

/**
 * Hook to fetch and auto-refresh ticket availability in real-time
 *
 * This hook:
 * - Fetches real-time availability from the API (which cleans up expired holds first)
 * - Automatically refetches every `refetchInterval` milliseconds
 * - Provides loading, error, and data states
 * - Can be manually refetched using the `refetch` function
 *
 * @param tierId - The ID of the ticket tier to monitor
 * @param options.enabled - Whether to enable automatic fetching (default: true)
 * @param options.refetchInterval - How often to refetch in milliseconds (default: 10000 = 10 seconds)
 */
export function useTicketAvailability(
  tierId: string | null,
  options?: {
    enabled?: boolean;
    refetchInterval?: number;
  }
) {
  const enabled = options?.enabled ?? true;
  const refetchInterval = options?.refetchInterval ?? 10000; // Default: 10 seconds

  const { data, isLoading, error, refetch, dataUpdatedAt } =
    useQuery<AvailabilityResponse>({
      queryKey: ["ticket-availability", tierId],
      queryFn: async () => {
        if (!tierId) {
          throw new Error("Tier ID is required");
        }

        const response = await fetch(
          `/api/ticket-tiers/${tierId}/availability`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to fetch availability");
        }

        return response.json();
      },
      enabled: enabled && !!tierId,
      refetchInterval: enabled ? refetchInterval : false,
      refetchOnWindowFocus: true, // Refetch when user returns to tab
      staleTime: 5000, // Consider data stale after 5 seconds
    });

  // Track if data has changed since last render
  const [lastDataHash, setLastDataHash] = useState<string | null>(null);
  const [hasDataChanged, setHasDataChanged] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any existing timeout before creating a new one
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (data) {
      // Create a simple hash of the availability data to detect changes
      const currentHash = JSON.stringify({
        tierAvailable: data.tier.available,
        stagesAvailable: data.stages.map(s => ({
          id: s.stage_id,
          available: s.available_quantity,
        })),
        currentStageId: data.currentStage?.stage_id,
      });

      // Read previous hash before updating to avoid dependency cycle
      const prevHash = lastDataHash;
      setLastDataHash(currentHash);

      if (prevHash && prevHash !== currentHash) {
        setHasDataChanged(true);
        // Reset the flag after 3 seconds
        timeoutRef.current = setTimeout(() => {
          setHasDataChanged(false);
          timeoutRef.current = null;
        }, 3000);
      }
    }

    // Always return cleanup function to clear timeout on unmount or re-run
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [data]); // Removed lastDataHash from dependencies to prevent redundant runs

  // Helper to check if a specific stage is available
  const isStageAvailable = useCallback(
    (stageId: string): boolean => {
      if (!data) return false;
      const stage = data.stages.find(s => s.stage_id === stageId);
      return stage ? stage.available_quantity > 0 : false;
    },
    [data]
  );

  // Helper to get available quantity for a stage
  const getStageAvailableQuantity = useCallback(
    (stageId: string): number => {
      if (!data) return 0;
      const stage = data.stages.find(s => s.stage_id === stageId);
      return stage?.available_quantity || 0;
    },
    [data]
  );

  // Helper to check if the current stage has changed
  const getCurrentStageId = useCallback((): string | null => {
    return data?.currentStage?.stage_id || null;
  }, [data]);

  return {
    // Data
    availability: data,
    tier: data?.tier,
    stages: data?.stages || [],
    currentStage: data?.currentStage,

    // Status
    isLoading,
    error: error as Error | null,
    lastUpdated: dataUpdatedAt,
    hasDataChanged,

    // Actions
    refetch,

    // Helpers
    isStageAvailable,
    getStageAvailableQuantity,
    getCurrentStageId,
  };
}

/**
 * Hook to monitor multiple tiers at once
 *
 * Useful for event pages with multiple ticket tiers
 * Uses a single query to fetch all tiers in parallel to avoid Rules of Hooks violations
 */
export function useMultipleTicketAvailability(
  tierIds: string[],
  options?: {
    enabled?: boolean;
    refetchInterval?: number;
  }
) {
  const enabled = options?.enabled ?? true;
  const refetchInterval = options?.refetchInterval ?? 10000; // Default: 10 seconds

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery<
    Record<string, AvailabilityResponse>
  >({
    queryKey: ["ticket-availability-multiple", [...(tierIds || [])].sort()], // Sort a copy for stable query key (don't mutate input, guard against null/undefined)
    queryFn: async () => {
      if (!tierIds || tierIds.length === 0) {
        return {};
      }

      // Fetch all tiers in parallel
      const responses = await Promise.all(
        tierIds.map(async tierId => {
          const response = await fetch(
            `/api/ticket-tiers/${tierId}/availability`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
              },
            }
          );

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
              `Failed to fetch availability for tier ${tierId}: ${
                errorData.error || "Unknown error"
              }`
            );
          }

          const availabilityData = await response.json();
          return { tierId, availability: availabilityData };
        })
      );

      // Map responses back to tierIds
      const result: Record<string, AvailabilityResponse> = {};
      responses.forEach(({ tierId, availability }) => {
        result[tierId] = availability;
      });

      return result;
    },
    enabled: enabled && tierIds.length > 0,
    refetchInterval: enabled ? refetchInterval : false,
    refetchOnWindowFocus: true,
    staleTime: 5000,
  });

  // Track if data has changed since last render
  const [lastDataHash, setLastDataHash] = useState<string | null>(null);
  const [hasDataChanged, setHasDataChanged] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any existing timeout before creating a new one
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (data) {
      // Create a simple hash of the availability data to detect changes
      const currentHash = JSON.stringify(
        Object.entries(data).map(([tierId, availability]) => ({
          tierId,
          tierAvailable: availability.tier.available,
          stagesAvailable: availability.stages.map(s => ({
            id: s.stage_id,
            available: s.available_quantity,
          })),
          currentStageId: availability.currentStage?.stage_id,
        }))
      );

      // Read previous hash before updating to avoid dependency cycle
      const prevHash = lastDataHash;
      setLastDataHash(currentHash);

      if (prevHash && prevHash !== currentHash) {
        setHasDataChanged(true);
        // Reset the flag after 3 seconds
        timeoutRef.current = setTimeout(() => {
          setHasDataChanged(false);
          timeoutRef.current = null;
        }, 3000);
      }
    }

    // Always return cleanup function to clear timeout on unmount or re-run
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [data]); // Removed lastDataHash from dependencies to prevent redundant runs

  // Map data to results array matching the original API
  const results = tierIds.map(tierId => {
    const availability = data?.[tierId];
    return {
      availability,
      tier: availability?.tier,
      stages: availability?.stages || [],
      currentStage: availability?.currentStage,
      isLoading: isLoading && !availability, // Loading if query is loading and this tier's data isn't available yet
      error: availability ? null : (error as Error | null), // Error if query errored and this tier has no data
      lastUpdated: dataUpdatedAt,
      hasDataChanged: hasDataChanged && !!availability, // Only mark as changed if this tier has data
      refetch,
      isStageAvailable: (stageId: string): boolean => {
        if (!availability) return false;
        const stage = availability.stages.find(s => s.stage_id === stageId);
        return stage ? stage.available_quantity > 0 : false;
      },
      getStageAvailableQuantity: (stageId: string): number => {
        if (!availability) return 0;
        const stage = availability.stages.find(s => s.stage_id === stageId);
        return stage?.available_quantity || 0;
      },
      getCurrentStageId: (): string | null => {
        return availability?.currentStage?.stage_id || null;
      },
    };
  });

  const hasError = !!error || results.some(r => r.error);

  const refetchAll = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    results,
    isLoading,
    hasError,
    hasDataChanged,
    refetchAll,
  };
}
