import { useQuery } from "@tanstack/react-query";
import type { UserTicket, UserTicketsResponse } from "@project-flame/lib";

export interface UseUserTicketsOptions {
  enabled?: boolean;
}

export function useUserTickets(options?: UseUserTicketsOptions) {
  return useQuery<UserTicketsResponse>({
    queryKey: ["user-tickets"],
    queryFn: async () => {
      const response = await fetch("/api/user/tickets");

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Failed to fetch user tickets: ${
            errorData.error || response.statusText
          }`
        );
      }

      return response.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
    enabled: options?.enabled ?? true, // Default to enabled for backward compatibility
  });
}

export type { UserTicket, UserTicketsResponse };
