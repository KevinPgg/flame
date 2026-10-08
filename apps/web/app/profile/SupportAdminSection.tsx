"use client";

import { useState } from "react";
import {
  useIsSupportAdmin,
  useAdminOrganizations,
  useApproveOrg,
  useRejectOrg,
  useDeleteOrg,
  type AdminOrganization,
} from "../lib/hooks/useAdminOrganizations";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { SearchInput } from "../components/SearchInput";
import { ConfirmModal } from "../components/ConfirmModal";

/** Show a search bar once a list reaches this many orgs. */
const SEARCH_THRESHOLD = 8;

function filterOrgs(orgs: AdminOrganization[], query: string): AdminOrganization[] {
  const q = query.trim().toLowerCase();
  if (!q) return orgs;
  return orgs.filter(
    (o) =>
      o.name.toLowerCase().includes(q) ||
      (o.owner_email ?? "").toLowerCase().includes(q) ||
      (o.owner_name ?? "").toLowerCase().includes(q),
  );
}

/**
 * Support-only org-approval queue (W7-H1), rendered on the profile page below
 * "Create new organizer". Only mounts its lists when the caller is in the
 * server-side admin allowlist (the API is the real boundary).
 */
export default function SupportAdminSection() {
  const { isAdmin, isLoading } = useIsSupportAdmin();

  if (isLoading || !isAdmin) return null;

  return (
    <>
      <OrgQueue status="pending" title="Pending approvals" />
      <OrgQueue status="rejected" title="Rejected" />
    </>
  );
}

function OrgQueue({
  status,
  title,
}: {
  status: "pending" | "rejected";
  title: string;
}) {
  const query = useAdminOrganizations(status, true);
  const orgs = query.data?.organizations ?? [];
  const [search, setSearch] = useState("");
  // Only filter when the search input is shown (list at/above the threshold),
  // so shrinking the list with a stale query can't hide rows.
  const showSearch = orgs.length >= SEARCH_THRESHOLD;
  const filtered = showSearch ? filterOrgs(orgs, search) : orgs;

  return (
    <CollapsibleSection title={title} count={orgs.length} defaultOpen={false}>
      {query.isLoading ? (
        <p className="text-white-50 text-sm font-poppins py-2">Loading…</p>
      ) : query.error ? (
        <p className="text-white-50 text-sm font-poppins py-2">
          Couldn&apos;t load {title.toLowerCase()}.
        </p>
      ) : orgs.length === 0 ? (
        <p className="text-white-50 text-sm font-poppins py-2">
          {status === "pending" ? "No pending organizations." : "No rejected organizations."}
        </p>
      ) : (
        <>
          {showSearch && (
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by name or email"
            />
          )}
          {filtered.map((org) => (
            <AdminOrgRow key={org.id} org={org} status={status} />
          ))}
          {filtered.length === 0 && (
            <p className="text-white-50 text-sm font-poppins py-2">No matches.</p>
          )}
        </>
      )}
    </CollapsibleSection>
  );
}

function AdminOrgRow({
  org,
  status,
}: {
  org: AdminOrganization;
  status: "pending" | "rejected";
}) {
  const approve = useApproveOrg();
  const reject = useRejectOrg();
  const del = useDeleteOrg();

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmAction, setConfirmAction] = useState<"approve" | "delete" | null>(null);

  const busy = approve.isPending || reject.isPending || del.isPending;
  const initials = org.name.charAt(0).toUpperCase();
  const createdAt = new Date(org.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const handleConfirm = () => {
    if (confirmAction === "approve") approve.mutate(org.id);
    else if (confirmAction === "delete") del.mutate(org.id);
    setConfirmAction(null);
  };

  const handleReject = () => {
    reject.mutate(
      { orgId: org.id, reason: reason.trim() || undefined },
      { onSuccess: () => setRejecting(false) },
    );
  };

  return (
    <div className="bg-white-5 border border-white-5 rounded-card p-3 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-[52px] h-[52px] rounded-card bg-white-10 flex items-center justify-center shrink-0">
          <span className="text-white-100 text-lg font-poppins-semibold">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white-100 text-base leading-[22px] font-poppins-semibold truncate">
            {org.name}
          </p>
          <p className="text-white-50 text-xs leading-4 font-poppins-light mt-[2px] truncate">
            {org.owner_email ?? "No owner email"}
            {org.owner_name ? ` · ${org.owner_name}` : ""}
          </p>
          <p className="text-white-50 text-xs leading-4 font-poppins-light mt-[2px]">
            Created {createdAt}
          </p>
          {status === "rejected" && org.rejection_reason && (
            <p className="text-white-50 text-xs leading-4 font-poppins-light mt-[2px] truncate">
              Reason: {org.rejection_reason}
            </p>
          )}
        </div>
      </div>

      {rejecting ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            maxLength={500}
            rows={2}
            className="bg-white-5 border border-white-10 rounded-card px-3 py-2 text-white-100 text-sm font-poppins resize-none focus:outline-none focus:border-white-20"
          />
          <div className="flex items-center justify-end gap-2">
            <ActionButton onClick={() => setRejecting(false)} disabled={busy} variant="ghost">
              Cancel
            </ActionButton>
            <ActionButton onClick={handleReject} disabled={busy} variant="danger">
              Confirm reject
            </ActionButton>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <ActionButton onClick={() => setConfirmAction("approve")} disabled={busy} variant="primary">
            {status === "rejected" ? "Approve anyway" : "Approve"}
          </ActionButton>
          {status === "pending" && (
            <ActionButton onClick={() => setRejecting(true)} disabled={busy} variant="ghost">
              Reject
            </ActionButton>
          )}
          <ActionButton onClick={() => setConfirmAction("delete")} disabled={busy} variant="danger">
            Delete
          </ActionButton>
        </div>
      )}

      {(approve.error || reject.error || del.error) && (
        <p className="text-error text-xs font-poppins">
          {(approve.error || reject.error || del.error)?.message}
        </p>
      )}

      <ConfirmModal
        open={confirmAction !== null}
        title={confirmAction === "delete" ? "Delete organization" : "Approve organization"}
        message={
          confirmAction === "delete" ? (
            <>
              Delete <strong>{org.name}</strong>? This cannot be undone.
            </>
          ) : (
            <>
              Approve <strong>{org.name}</strong>? The organizer will be able to create
              events and will be notified by email.
            </>
          )
        }
        confirmLabel={confirmAction === "delete" ? "Delete" : "Approve"}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  variant,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant: "primary" | "danger" | "ghost";
  children: React.ReactNode;
}) {
  const styles: Record<typeof variant, string> = {
    primary: "bg-white-100 text-dark hover:opacity-90",
    danger: "bg-white-5 border border-white-20 text-error hover:bg-white-10",
    ghost: "bg-white-5 border border-white-20 text-white-100 hover:bg-white-10",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-pill px-4 py-1.5 text-xs font-poppins-medium transition-colors disabled:opacity-50 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}
