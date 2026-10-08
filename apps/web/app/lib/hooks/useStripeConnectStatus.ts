import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

const stripeStatusSchema = z.object({
  connected: z.boolean(),
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(),
});

export type StripeConnectStatus = z.infer<typeof stripeStatusSchema>;

export function useStripeConnectStatus(orgId: string | null | undefined) {
  return useQuery<StripeConnectStatus>({
    queryKey: ["stripe-connect-status", orgId],
    queryFn: async () => {
      if (!orgId) {
        throw new Error(
          "[useStripeConnectStatus] orgId required (queryFn fired with falsy id)",
        );
      }
      try {
        const response = await fetch(
          `/api/stripe/connect/status?organizationId=${encodeURIComponent(orgId)}`,
        );
        if (!response.ok) {
          throw new Error(
            `[useStripeConnectStatus] fetch failed (orgId=${orgId}, status=${response.status})`,
          );
        }
        const data = await response.json();
        return stripeStatusSchema.parse(data);
      } catch (err) {
        if (err instanceof Error) {
          throw new Error(
            `[useStripeConnectStatus] failed for orgId=${orgId}: ${err.message}`,
            { cause: err },
          );
        }
        throw err;
      }
    },
    enabled: Boolean(orgId),
    staleTime: 60 * 1000,
  });
}
