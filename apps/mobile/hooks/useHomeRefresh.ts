import { useState, useCallback, useRef } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

interface UseHomeRefreshOptions {
  refetch: UseQueryResult["refetch"];
  userId: string | undefined;
}

export function useHomeRefresh({ refetch, userId }: UseHomeRefreshOptions) {
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);

  const handleRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setRefreshing(true);
    try {
      const result = await refetch();
      if (result.error) {
        console.error("[Home] handleRefresh failed", {
          action: "handleRefresh",
          userId,
          err:
            result.error instanceof Error
              ? result.error.message
              : String(result.error),
        });
      }
    } catch (err) {
      console.error("[Home] handleRefresh failed", {
        action: "handleRefresh",
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRefreshing(false);
      isRefreshingRef.current = false;
    }
  }, [refetch, userId]);

  return { refreshing, handleRefresh };
}
