"use client";

/**
 * Modal for assigning co-host organizations to an event.
 *
 * Mirrors mobile CoHostAssignmentSheet:
 *   - lists current cohosts with remove option
 *   - debounced org search (anon-readable approved orgs)
 *   - add via POST /api/organizations/[id]/cohost-assignments
 *
 * Entry point: OrgEventDetailClient "Co-hosts" card.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { IoClose } from "react-icons/io5";
import { FiSearch, FiTrash2 } from "react-icons/fi";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase/client";
import type { OrganizationPublic } from "@project-flame/lib";

interface CohostAssignmentRow {
  id: string;
  event_id: string;
  cohost_organization_id: string;
  cohost_org: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  } | null;
}

interface CoHostAssignmentModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  eventId: string;
  eventName: string;
  /** Panel background/border. v1 keeps its translucent card; Flame 2.0 passes a solid surface. */
  surfaceClassName?: string;
}

function useEventCohosts(orgId: string, eventId: string, enabled: boolean) {
  return useQuery<CohostAssignmentRow[]>({
    queryKey: ["cohost-assignments", orgId, eventId],
    queryFn: async () => {
      const res = await fetch(
        `/api/organizations/${orgId}/cohost-assignments?event_id=${eventId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch cohosts");
      const json = await res.json();
      return (json.assignments ?? []) as CohostAssignmentRow[];
    },
    enabled,
    staleTime: 30 * 1000,
  });
}

/** Debounced search of approved organizations (uses anon client — RLS already
 *  exposes approved orgs publicly). */
function useApprovedOrgSearch(excludeIds: string[]) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrganizationPublic[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);
  const excludeRef = useRef(excludeIds);
  excludeRef.current = excludeIds;

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const search = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = q.trim();
    if (!trimmed) {
      reqIdRef.current += 1;
      setResults([]);
      setError(null);
      setSearching(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      if (!supabase) {
        setError("Search unavailable");
        return;
      }
      const requestId = ++reqIdRef.current;
      setSearching(true);
      setError(null);
      try {
        let q2 = supabase
          .from("organizations")
          .select(
            "id, name, slug, logo_url, cover_image_url, description, instagram_handle, city",
          )
          .eq("approved", true)
          .ilike("name", `%${trimmed}%`)
          .order("name", { ascending: true })
          .limit(20);
        if (excludeRef.current.length > 0) {
          q2 = q2.not("id", "in", `(${excludeRef.current.join(",")})`);
        }
        const { data, error: qErr } = await q2;
        if (requestId !== reqIdRef.current) return;
        if (qErr) throw qErr;
        setResults((data ?? []) as OrganizationPublic[]);
      } catch (err) {
        if (requestId !== reqIdRef.current) return;
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
      } finally {
        if (requestId === reqIdRef.current) setSearching(false);
      }
    }, 350);
  }, []);

  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    reqIdRef.current += 1;
    setQuery("");
    setResults([]);
    setError(null);
    setSearching(false);
  }, []);

  return { query, results, searching, error, search, clear };
}

export default function CoHostAssignmentModal({
  open,
  onClose,
  orgId,
  eventId,
  eventName,
  surfaceClassName = "bg-card border border-white-20",
}: CoHostAssignmentModalProps) {
  const queryClient = useQueryClient();
  const { data: cohosts, isLoading: cohostsLoading } = useEventCohosts(
    orgId,
    eventId,
    open,
  );

  const currentCohostIds = useMemo(
    () => (cohosts ?? []).map(c => c.cohost_organization_id),
    [cohosts],
  );
  const excludeIds = useMemo(
    () => [orgId, ...currentCohostIds],
    [orgId, currentCohostIds],
  );

  const { query, results, searching, error, search, clear } =
    useApprovedOrgSearch(excludeIds);

  const addMutation = useMutation({
    mutationFn: async (cohostOrgId: string) => {
      const res = await fetch(
        `/api/organizations/${orgId}/cohost-assignments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, cohostOrgId }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to add cohost");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["cohost-assignments", orgId, eventId],
      });
      queryClient.invalidateQueries({ queryKey: ["organizer-data"], exact: false });
      clear();
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const res = await fetch(
        `/api/organizations/${orgId}/cohost-assignments?id=${assignmentId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to remove cohost");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["cohost-assignments", orgId, eventId],
      });
      queryClient.invalidateQueries({ queryKey: ["organizer-data"], exact: false });
    },
  });

  // Reset search when modal closes
  useEffect(() => {
    if (!open) clear();
  }, [open, clear]);

  // Escape closes the modal — matches sibling modals (EnterCodeModal,
  // QRScannerModal, OnboardingModal, RegistrationFormModal).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isMutating = addMutation.isPending || removeMutation.isPending;
  const mutationError = addMutation.error?.message || removeMutation.error?.message;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className={`${surfaceClassName} rounded-card w-full max-w-[520px] max-h-[85vh] flex flex-col overflow-hidden`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cohost-modal-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-white-20">
          <div className="flex-1 min-w-0">
            <h2
              id="cohost-modal-title"
              className="text-xl font-poppins-semibold text-white-100 m-0"
            >
              Co-hosts
            </h2>
            <p className="text-white-50 text-sm font-poppins truncate m-0 mt-0.5">
              {eventName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 w-8 h-8 rounded-full bg-white-10 hover:bg-white-20 flex items-center justify-center text-white-50 transition-colors"
            aria-label="Close"
          >
            <IoClose size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Current cohosts */}
          {cohostsLoading ? (
            <p className="text-white-50 text-sm font-poppins">Loading…</p>
          ) : (cohosts ?? []).length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-white-50 text-xs font-poppins-medium uppercase tracking-wider m-0">
                Current Co-hosts
              </h3>
              {(cohosts ?? []).map(row => {
                const name = row.cohost_org?.name ?? "Unknown org";
                return (
                  <div
                    key={row.id}
                    className="flex items-center gap-3 bg-white-5 border border-white-10 rounded-card px-3 py-2.5"
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-base font-poppins-semibold shrink-0"
                      style={{
                        backgroundColor: "#238FDA20",
                        color: "#238FDA",
                      }}
                    >
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <span className="flex-1 text-white-100 text-sm font-poppins-medium truncate">
                      {name}
                    </span>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${name} as co-host?`)) {
                          removeMutation.mutate(row.id);
                        }
                      }}
                      disabled={isMutating}
                      className="text-white-50 hover:text-primary disabled:opacity-40 transition-colors p-1"
                      aria-label={`Remove ${name}`}
                    >
                      <FiTrash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Search */}
          <div className="flex flex-col gap-2">
            <h3 className="text-white-50 text-xs font-poppins-medium uppercase tracking-wider m-0">
              Add Co-host Organization
            </h3>
            <div className="flex items-center gap-2 bg-white-5 border border-white-10 rounded-card px-3 py-2.5">
              <FiSearch size={16} className="text-white-50 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={e => search(e.target.value)}
                placeholder="Search by organization name…"
                disabled={isMutating || cohostsLoading}
                className="flex-1 bg-transparent text-white-100 text-sm font-poppins placeholder:text-white-50 outline-none min-w-0 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Inline error */}
          {(error || mutationError) && (
            <p className="text-primary text-sm font-poppins m-0">
              {mutationError || error}
            </p>
          )}

          {/* Results */}
          {searching && (
            <p className="text-white-50 text-sm font-poppins text-center">
              Searching…
            </p>
          )}
          {!searching && query.trim() && results.length === 0 && !error && (
            <p className="text-white-50 text-sm font-poppins text-center">
              No organizations found
            </p>
          )}
          {results.length > 0 && (
            <div className="flex flex-col gap-2">
              {results.map(org => (
                <div
                  key={org.id}
                  className="flex items-center gap-3 bg-white-5 border border-white-10 rounded-card px-3 py-2.5"
                >
                  <div className="w-10 h-10 rounded-full bg-white-10 flex items-center justify-center text-white-80 text-base font-poppins-semibold shrink-0">
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white-100 text-sm font-poppins-medium truncate m-0">
                      {org.name}
                    </p>
                    {org.city && (
                      <p className="text-white-50 text-xs font-poppins truncate m-0">
                        {org.city}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => addMutation.mutate(org.id)}
                    disabled={isMutating}
                    className="px-3 py-1.5 rounded-card text-xs font-poppins-medium text-white-100 disabled:opacity-40 transition-opacity"
                    style={{ backgroundColor: "#238FDA" }}
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
