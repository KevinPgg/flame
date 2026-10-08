/**
 * Support-only org-approval queue (W7-H1), rendered on the mobile profile
 * screen below "Create new organizer". Mirrors the web `SupportAdminSection`.
 * Only renders its lists when the caller is in the server-side admin allowlist
 * (the web API is the real boundary). Reads/writes go through the admin-gated
 * web API via `useAdminOrganizations` hooks.
 */

import { useState } from "react";
import { View, Text, Pressable, TextInput, Alert } from "react-native";
import { colors } from "@project-flame/ui";
import { PastItemsAccordion } from "../shared/PastItemsAccordion";
import { TicketSearchBar } from "../dashboard/TicketSearchBar";
import {
  useIsSupportAdmin,
  useAdminOrganizations,
  useApproveOrg,
  useRejectOrg,
  useDeleteOrg,
  type AdminOrganization,
  type AdminOrgStatus,
} from "../../hooks/useAdminOrganizations";

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

export function SupportAdminSection() {
  const { isAdmin, isLoading } = useIsSupportAdmin();

  if (isLoading || !isAdmin) return null;

  return (
    <>
      <OrgQueue status="pending" title="Pending approvals" />
      <OrgQueue status="rejected" title="Rejected" />
    </>
  );
}

function OrgQueue({ status, title }: { status: AdminOrgStatus; title: string }) {
  const query = useAdminOrganizations(status, true);
  const orgs = query.data?.organizations ?? [];
  const [search, setSearch] = useState("");
  // Only filter when the search input is shown (list at/above the threshold),
  // so shrinking the list with a stale query can't hide rows.
  const showSearch = orgs.length >= SEARCH_THRESHOLD;
  const filtered = showSearch ? filterOrgs(orgs, search) : orgs;

  return (
    <View className="px-4 mt-[30px]">
      <PastItemsAccordion label={title} count={orgs.length}>
        {query.isLoading ? (
          <Text className="text-white-50 text-sm font-poppins py-2">Loading…</Text>
        ) : query.error ? (
          <Text className="text-white-50 text-sm font-poppins py-2">
            Couldn't load {title.toLowerCase()}.
          </Text>
        ) : orgs.length === 0 ? (
          <Text className="text-white-50 text-sm font-poppins py-2">
            {status === "pending"
              ? "No pending organizations."
              : "No rejected organizations."}
          </Text>
        ) : (
          <>
            {showSearch && (
              <TicketSearchBar
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name or email"
              />
            )}
            {filtered.map((org) => (
              <AdminOrgRow key={org.id} org={org} status={status} />
            ))}
            {filtered.length === 0 && (
              <Text className="text-white-50 text-sm font-poppins py-2">No matches.</Text>
            )}
          </>
        )}
      </PastItemsAccordion>
    </View>
  );
}

function AdminOrgRow({
  org,
  status,
}: {
  org: AdminOrganization;
  status: AdminOrgStatus;
}) {
  const approve = useApproveOrg();
  const reject = useRejectOrg();
  const del = useDeleteOrg();

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const busy = approve.isPending || reject.isPending || del.isPending;
  const initials = org.name.charAt(0).toUpperCase();
  const createdAt = new Date(org.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const handleDelete = () => {
    Alert.alert(
      "Delete organization",
      `Delete "${org.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => del.mutate(org.id) },
      ],
    );
  };

  const handleApprove = () => {
    Alert.alert(
      "Approve organization",
      `Approve "${org.name}"? The organizer will be able to create events and will be notified by email.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Approve", onPress: () => approve.mutate(org.id) },
      ],
    );
  };

  const handleReject = () => {
    reject.mutate(
      { orgId: org.id, reason: reason.trim() || undefined },
      { onSuccess: () => setRejecting(false) },
    );
  };

  const errorMessage =
    approve.error?.message || reject.error?.message || del.error?.message;

  return (
    <View className="bg-white-5 border border-white-5 rounded-card p-3 gap-3">
      <View className="flex-row items-center gap-3">
        <View className="size-[52px] rounded-card bg-white-10 items-center justify-center">
          <Text className="text-white-100 text-lg font-poppins-semibold">
            {initials}
          </Text>
        </View>
        <View className="flex-1 min-w-0">
          <Text
            className="text-white-100 text-base leading-[22px] font-poppins-semibold"
            numberOfLines={1}
          >
            {org.name}
          </Text>
          <Text
            className="text-white-50 text-xs leading-4 font-poppins-light mt-[2px]"
            numberOfLines={1}
          >
            {org.owner_email ?? "No owner email"}
            {org.owner_name ? ` · ${org.owner_name}` : ""}
          </Text>
          <Text className="text-white-50 text-xs leading-4 font-poppins-light mt-[2px]">
            Created {createdAt}
          </Text>
          {status === "rejected" && org.rejection_reason ? (
            <Text
              className="text-white-50 text-xs leading-4 font-poppins-light mt-[2px]"
              numberOfLines={2}
            >
              Reason: {org.rejection_reason}
            </Text>
          ) : null}
        </View>
      </View>

      {rejecting ? (
        <View className="gap-2">
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Reason (optional)"
            placeholderTextColor={colors["white-50"]}
            maxLength={500}
            multiline
            className="bg-white-5 border border-white-10 rounded-card px-3 py-2 text-white-100 text-sm font-poppins"
          />
          <View className="flex-row items-center justify-end gap-2">
            <ActionButton
              onPress={() => setRejecting(false)}
              disabled={busy}
              variant="ghost"
            >
              Cancel
            </ActionButton>
            <ActionButton onPress={handleReject} disabled={busy} variant="danger">
              Confirm reject
            </ActionButton>
          </View>
        </View>
      ) : (
        <View className="flex-row items-center justify-end gap-2 flex-wrap">
          <ActionButton onPress={handleApprove} disabled={busy} variant="primary">
            {status === "rejected" ? "Approve anyway" : "Approve"}
          </ActionButton>
          {status === "pending" ? (
            <ActionButton
              onPress={() => setRejecting(true)}
              disabled={busy}
              variant="ghost"
            >
              Reject
            </ActionButton>
          ) : null}
          <ActionButton onPress={handleDelete} disabled={busy} variant="danger">
            Delete
          </ActionButton>
        </View>
      )}

      {errorMessage ? (
        <Text className="text-error text-xs font-poppins">{errorMessage}</Text>
      ) : null}
    </View>
  );
}

function ActionButton({
  onPress,
  disabled,
  variant,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  variant: "primary" | "danger" | "ghost";
  children: React.ReactNode;
}) {
  const styles: Record<"primary" | "danger" | "ghost", string> = {
    primary: "bg-white-100",
    danger: "bg-white-5 border border-white-20",
    ghost: "bg-white-5 border border-white-20",
  };
  const textStyles: Record<"primary" | "danger" | "ghost", string> = {
    primary: "text-dark",
    danger: "text-error",
    ghost: "text-white-100",
  };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`rounded-pill px-4 py-1.5 ${styles[variant]} ${disabled ? "opacity-50" : ""}`}
    >
      <Text className={`text-xs font-poppins-medium ${textStyles[variant]}`}>
        {children}
      </Text>
    </Pressable>
  );
}
