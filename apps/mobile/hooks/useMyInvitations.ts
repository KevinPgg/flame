/**
 * Team invitations for me (fase 4.5), app — same API as the web (GET /api/me/invitations,
 * POST /api/me/invitations/:id { action }). Accepting refreshes "My organizers".
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";

export type MyInvitation = {
  id: string;
  role: "admin" | "organizer";
  expires_at: string;
  organization: { id: string; name: string; slug: string; logo_url: string | null };
};
const KEY = ["me", "invitations"] as const;

export function useMyInvitations() {
  const { isSignedIn, getToken } = useOptionalAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    enabled: isSignedIn === true,
    staleTime: 30_000,
    queryFn: async () => (await apiGet<{ invitations: MyInvitation[] }>("/api/me/invitations", getToken))?.invitations ?? [],
  });
  const answer = async (inv: MyInvitation, action: "accept" | "decline") => {
    await apiPost(`/api/me/invitations/${inv.id}`, { action }, getToken);
    qc.setQueryData<MyInvitation[]>(KEY, (old = []) => old.filter((x) => x.id !== inv.id));
    if (action === "accept") await qc.invalidateQueries({ queryKey: ["user-orgs"], exact: false });
  };
  return { invitations: query.data ?? [], answer, refetch: query.refetch };
}
