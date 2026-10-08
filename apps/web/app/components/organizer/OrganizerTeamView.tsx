"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FiArrowLeft,
  FiPlus,
  FiX,
  FiMoreVertical,
  FiCheck,
  FiSearch,
} from "react-icons/fi";
import type { OrgMemberRole } from "@project-flame/lib";
import { Skeleton } from "../ui/Skeleton";

interface OrgLite {
  id: string;
  name: string;
  slug: string;
}

interface OrgMember {
  id: string;
  user_id: string;
  organization_id: string;
  role: OrgMemberRole;
  user_first_name: string | null;
  user_last_name: string | null;
  user_email: string | null;
}

interface EventAssignment {
  id: string;
  event_id: string;
  user_id: string | null;
  organization_id: string;
}

const ROLE_LABELS: Record<OrgMemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  organizer: "Organizer",
  viewer: "Viewer",
};

const ROLE_PRIORITY: Record<OrgMemberRole, number> = {
  owner: 0,
  admin: 1,
  organizer: 2,
  viewer: 3,
};

function roleColor(role: OrgMemberRole) {
  if (role === "admin") return "text-[#238FDA]";
  if (role === "organizer") return "text-[#5DDBB1]";
  return "text-white-50";
}

function getInitials(m: OrgMember) {
  const a = m.user_first_name?.charAt(0) ?? "";
  const b = m.user_last_name?.charAt(0) ?? "";
  if (a || b) return (a + b).toUpperCase();
  return (m.user_email?.charAt(0) ?? "?").toUpperCase();
}

function getDisplayName(m: OrgMember) {
  const parts = [m.user_first_name, m.user_last_name].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return m.user_email ?? "Unknown";
}

export default function OrganizerTeamView({ org }: { org: OrgLite }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<OrgMember | null>(null);
  const [assignMember, setAssignMember] = useState<OrgMember | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const membersQuery = useQuery<{ members: OrgMember[] }>({
    queryKey: ["team-members", org.id],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${org.id}/members`);
      if (!res.ok) throw new Error("Failed to load members");
      return res.json();
    },
  });

  const assignmentsQuery = useQuery<{ assignments: EventAssignment[] }>({
    queryKey: ["team-event-assignments", org.id],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${org.id}/event-assignments`);
      if (!res.ok) throw new Error("Failed to load assignments");
      return res.json();
    },
  });

  const assignmentCountByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of assignmentsQuery.data?.assignments ?? []) {
      if (a.user_id) map.set(a.user_id, (map.get(a.user_id) ?? 0) + 1);
    }
    return map;
  }, [assignmentsQuery.data]);

  const sortedMembers = useMemo(() => {
    const list = [...(membersQuery.data?.members ?? [])];
    list.sort((a, b) => {
      const r = ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role];
      if (r !== 0) return r;
      return getDisplayName(a).localeCompare(getDisplayName(b));
    });
    return list;
  }, [membersQuery.data]);

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const res = await fetch("/api/organizations/members/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: org.id, memberId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Remove failed (${res.status})`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members", org.id] });
      queryClient.invalidateQueries({
        queryKey: ["team-event-assignments", org.id],
      });
    },
  });

  const handleRemove = useCallback(
    (member: OrgMember) => {
      setOpenMenuId(null);
      const name = getDisplayName(member);
      if (!window.confirm(`Remove ${name} from this organization?`)) return;
      removeMutation.mutate(member.id, {
        onError: err =>
          alert(err instanceof Error ? err.message : "Failed to remove"),
      });
    },
    [removeMutation],
  );

  return (
    <div className="flex flex-col gap-[30px]">
      {/* Back row */}
      <Link
        href={`/organizer?org=${encodeURIComponent(org.slug)}`}
        className="self-start flex items-center gap-2 text-white-100 hover:text-white-80 transition-colors"
      >
        <FiArrowLeft size={20} />
        <span className="text-sm font-poppins-medium">Go Back</span>
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <h1 className="text-white-100 text-lg leading-7 font-poppins-semibold">
            Team
          </h1>
          <p className="text-white-50 text-xs font-poppins">{org.name}</p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          aria-label="Add member"
          className="w-11 h-11 rounded-full bg-white-5 hover:bg-white-10 flex items-center justify-center transition-colors"
        >
          <FiPlus size={20} className="text-white-100" />
        </button>
      </div>

      {/* Member list */}
      <div className="flex flex-col gap-1">
        {membersQuery.isLoading ? (
          <>
            <MemberRowSkeleton />
            <MemberRowSkeleton />
            <MemberRowSkeleton />
          </>
        ) : membersQuery.error ? (
          <p className="text-white-50 text-sm font-poppins text-center py-6">
            Failed to load team. Please try again.
          </p>
        ) : sortedMembers.length === 0 ? (
          <p className="text-white-50 text-sm font-poppins text-center py-6">
            No team members yet.
          </p>
        ) : (
          sortedMembers.map(member => {
            const isOwnerRow = member.role === "owner";
            const showMenu = !isOwnerRow;
            const menuOpen = openMenuId === member.id;
            const assigned =
              member.role === "organizer"
                ? (assignmentCountByUser.get(member.user_id) ?? 0)
                : null;

            return (
              <div
                key={member.id}
                className="flex items-center gap-3 py-3 border-b border-white-10 last:border-b-0"
              >
                <div className="w-11 h-11 rounded-full bg-white-10 flex items-center justify-center shrink-0">
                  <span className="text-white-80 text-sm font-poppins-semibold">
                    {getInitials(member)}
                  </span>
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-white-100 text-sm font-poppins-medium truncate">
                    {getDisplayName(member)}
                  </span>
                  {member.user_email && (
                    <span className="text-white-50 text-xs font-poppins-light truncate">
                      {member.user_email}
                    </span>
                  )}
                  <span
                    className={`text-xs font-poppins-medium ${roleColor(member.role)}`}
                  >
                    {ROLE_LABELS[member.role]}
                    {assigned !== null &&
                      !assignmentsQuery.isLoading &&
                      ` — ${
                        assigned > 0
                          ? `${assigned} event${assigned !== 1 ? "s" : ""} assigned`
                          : "No events assigned"
                      }`}
                  </span>
                </div>

                {showMenu && (
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenMenuId(menuOpen ? null : member.id)
                      }
                      aria-label="Member options"
                      className="w-8 h-8 rounded-full hover:bg-white-10 flex items-center justify-center transition-colors"
                    >
                      <FiMoreVertical size={18} className="text-white-50" />
                    </button>
                    {menuOpen && (
                      <div className="absolute right-0 top-10 z-10 w-48 bg-card border border-white-20 rounded-card shadow-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            setEditMember(member);
                          }}
                          className="w-full text-left px-4 py-3 text-white-100 text-sm font-poppins hover:bg-white-10 transition-colors"
                        >
                          Change Role
                        </button>
                        {member.role === "organizer" && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              setAssignMember(member);
                            }}
                            className="w-full text-left px-4 py-3 text-white-100 text-sm font-poppins hover:bg-white-10 transition-colors border-t border-white-10"
                          >
                            Assign Events
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemove(member)}
                          className="w-full text-left px-4 py-3 text-[#FF4444] text-sm font-poppins hover:bg-white-10 transition-colors border-t border-white-10"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {addOpen && (
        <AddMemberModal
          orgId={org.id}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            queryClient.invalidateQueries({
              queryKey: ["team-members", org.id],
            });
            setAddOpen(false);
          }}
        />
      )}

      {editMember && (
        <EditRoleModal
          orgId={org.id}
          member={editMember}
          onClose={() => setEditMember(null)}
          onSaved={() => {
            queryClient.invalidateQueries({
              queryKey: ["team-members", org.id],
            });
            queryClient.invalidateQueries({
              queryKey: ["team-event-assignments", org.id],
            });
            setEditMember(null);
          }}
        />
      )}

      {assignMember && (
        <AssignEventsModal
          orgSlug={org.slug}
          orgId={org.id}
          member={assignMember}
          onClose={() => setAssignMember(null)}
          onSaved={() => {
            queryClient.invalidateQueries({
              queryKey: ["team-event-assignments", org.id],
            });
            setAssignMember(null);
          }}
        />
      )}
    </div>
  );
}

function MemberRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-white-10">
      <Skeleton className="w-11 h-11 rounded-full" />
      <div className="flex-1 flex flex-col gap-1">
        <Skeleton className="h-4 w-2/5 rounded" />
        <Skeleton className="h-3 w-3/5 rounded" />
      </div>
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60">
      <div className="bg-background border border-white-20 rounded-card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-white-10">
          <h2 className="text-white-100 text-base font-poppins-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-white-50 hover:text-white-100 transition-colors"
          >
            <FiX size={20} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function AddMemberModal({
  orgId,
  onClose,
  onAdded,
}: {
  orgId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [email, setEmail] = useState("");
  const [foundUser, setFoundUser] = useState<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [role, setRole] = useState<AssignableRole>("organizer");
  const [adding, setAdding] = useState(false);

  const handleSearch = async () => {
    setSearching(true);
    setSearchError(null);
    setFoundUser(null);
    try {
      const res = await fetch(
        `/api/organizer/search-users?email=${encodeURIComponent(email.trim())}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Search failed");
      }
      const data = await res.json();
      if (data.users?.length) setFoundUser(data.users[0]);
      else setSearchError("No user with that email. They must sign up first.");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async () => {
    if (!foundUser) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: foundUser.id, role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed (${res.status})`);
      }
      onAdded();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAdding(false);
    }
  };

  return (
    <ModalShell title="Add Member" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-white-50 text-xs font-poppins-medium">
            Email
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="flex-1 bg-white-5 border border-white-10 rounded-pill px-4 py-2.5 text-white-100 text-sm font-poppins placeholder:text-white-50 outline-none focus:border-white-50 transition-colors"
              onKeyDown={e => {
                if (e.key === "Enter") handleSearch();
              }}
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={!email.trim() || searching}
              className="bg-white-5 hover:bg-white-10 rounded-full w-11 h-11 flex items-center justify-center transition-colors disabled:opacity-60"
              aria-label="Search"
            >
              <FiSearch size={18} className="text-white-100" />
            </button>
          </div>
          {searchError && (
            <p className="text-[#FF4444] text-xs font-poppins">{searchError}</p>
          )}
        </div>

        {foundUser && (
          <>
            <div className="bg-white-5 border border-white-10 rounded-card p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white-10 flex items-center justify-center">
                <span className="text-white-80 text-sm font-poppins-semibold">
                  {(
                    foundUser.first_name?.charAt(0) ??
                    foundUser.email.charAt(0)
                  ).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white-100 text-sm font-poppins-medium truncate">
                  {[foundUser.first_name, foundUser.last_name]
                    .filter(Boolean)
                    .join(" ") || foundUser.email}
                </p>
                <p className="text-white-50 text-xs font-poppins-light truncate">
                  {foundUser.email}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-white-50 text-xs font-poppins-medium">
                Role
              </label>
              <RoleSelect value={role} onChange={setRole} />
            </div>

            <button
              type="button"
              onClick={handleAdd}
              disabled={adding}
              className="bg-white-100 text-dark font-poppins-medium text-sm rounded-pill px-6 py-2.5 hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {adding ? "Adding..." : "Add Member"}
            </button>
          </>
        )}
      </div>
    </ModalShell>
  );
}

function EditRoleModal({
  orgId,
  member,
  onClose,
  onSaved,
}: {
  orgId: string;
  member: OrgMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Roles other than admin/organizer (e.g. legacy viewer, or owner) aren't
  // assignable — default to "organizer" so the picker stays in a deterministic
  // state. Mirrors mobile EditRoleSheet.
  const [role, setRole] = useState<AssignableRole>(
    member.role === "admin" || member.role === "organizer"
      ? member.role
      : "organizer",
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (role === member.role) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/organizations/${orgId}/members/${member.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed (${res.status})`);
      }
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Change Role" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-white-80 text-sm font-poppins">
          {getDisplayName(member)}
        </p>
        <RoleSelect value={role} onChange={setRole} />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-white-100 text-dark font-poppins-medium text-sm rounded-pill px-6 py-2.5 hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}

type AssignableRole = "admin" | "organizer";

function RoleSelect({
  value,
  onChange,
}: {
  value: AssignableRole;
  onChange: (r: AssignableRole) => void;
}) {
  const options: { id: AssignableRole; label: string; hint: string }[] = [
    { id: "admin", label: "Admin", hint: "Full access except ownership transfer." },
    {
      id: "organizer",
      label: "Organizer",
      hint: "Manages only the events you assign to them.",
    },
  ];
  return (
    <div className="flex flex-col gap-2">
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`text-left px-3 py-3 rounded-card border transition-colors ${
            value === opt.id
              ? "bg-white-10 border-white-50"
              : "bg-white-5 border-white-10 hover:bg-white-10"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-white-100 text-sm font-poppins-medium">
              {opt.label}
            </span>
            {value === opt.id && (
              <FiCheck size={16} className="text-white-100" />
            )}
          </div>
          <span className="text-white-50 text-xs font-poppins-light">
            {opt.hint}
          </span>
        </button>
      ))}
    </div>
  );
}

function AssignEventsModal({
  orgSlug,
  orgId,
  member,
  onClose,
  onSaved,
}: {
  orgSlug: string;
  orgId: string;
  member: OrgMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Both owned and cohosted events are assignable: a cohost-org admin may want
  // to scope one of their organizers to a specific cohost event. Mirrors
  // mobile useOrgEvents which already unions both sources.
  const eventsQuery = useQuery<{
    events: Array<{ id: string; name: string; isCohost: boolean }>;
  }>({
    queryKey: ["organizer-events-for-assign", orgSlug],
    queryFn: async () => {
      const res = await fetch(
        `/api/organizer/data?org=${encodeURIComponent(orgSlug)}`,
      );
      if (!res.ok) throw new Error("Failed to load events");
      const data = await res.json();
      const owned: Array<{ id: string; name: string; isCohost: boolean }> = (
        data.events ?? []
      ).map((e: { id: string; name: string }) => ({
        id: e.id,
        name: e.name,
        isCohost: false,
      }));
      const cohosted: Array<{ id: string; name: string; isCohost: boolean }> = (
        data.cohost_events ?? []
      ).map((entry: { event: { id: string; name: string } }) => ({
        id: entry.event.id,
        name: entry.event.name,
        isCohost: true,
      }));
      // Dedupe in case an event appears in both (defensive)
      const seen = new Set<string>();
      const events = [...owned, ...cohosted].filter(e => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });
      return { events };
    },
  });

  const assignmentsQuery = useQuery<{ assignments: EventAssignment[] }>({
    queryKey: ["team-event-assignments", orgId],
  });

  const initialSelected = useMemo(() => {
    const set = new Set<string>();
    for (const a of assignmentsQuery.data?.assignments ?? []) {
      if (a.user_id === member.user_id) set.add(a.event_id);
    }
    return set;
  }, [assignmentsQuery.data, member.user_id]);

  const [selected, setSelected] = useState<Set<string>>(initialSelected);
  useEffect(() => {
    setSelected(initialSelected);
  }, [initialSelected]);

  const [saving, setSaving] = useState(false);

  const toggle = (eventId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/organizations/${orgId}/event-assignments`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: member.user_id,
            eventIds: Array.from(selected),
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed (${res.status})`);
      }
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save assignments");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Assign Events" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-white-80 text-sm font-poppins">
          {getDisplayName(member)} will only see and manage the events you
          check below.
        </p>

        {eventsQuery.isLoading ? (
          <Skeleton className="h-32 w-full rounded-card" />
        ) : eventsQuery.error ? (
          <p className="text-[#FF4444] text-xs font-poppins">
            Failed to load events.
          </p>
        ) : (eventsQuery.data?.events ?? []).length === 0 ? (
          <p className="text-white-50 text-sm font-poppins text-center py-6">
            No events to assign yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            {(eventsQuery.data?.events ?? []).map(ev => {
              const checked = selected.has(ev.id);
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => toggle(ev.id)}
                  className={`text-left px-3 py-3 rounded-card border transition-colors flex items-center justify-between gap-2 ${
                    checked
                      ? "bg-white-10 border-white-50"
                      : "bg-white-5 border-white-10 hover:bg-white-10"
                  }`}
                >
                  <span className="text-white-100 text-sm font-poppins truncate flex items-center gap-2 min-w-0">
                    <span className="truncate">{ev.name}</span>
                    {ev.isCohost && (
                      <span
                        className="text-[10px] leading-[14px] font-poppins-medium uppercase rounded-badge px-1.5 py-0.5 shrink-0 text-white-100"
                        style={{ backgroundColor: "#238FDA" }}
                      >
                        Co-host
                      </span>
                    )}
                  </span>
                  {checked && (
                    <FiCheck size={16} className="text-white-100 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || eventsQuery.isLoading}
          className="bg-white-100 text-dark font-poppins-medium text-sm rounded-pill px-6 py-2.5 hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Assignments"}
        </button>
      </div>
    </ModalShell>
  );
}
