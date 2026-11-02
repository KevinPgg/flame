/**
 * Team (prototype "ow:team", phone view; same endpoints and rules as the web TeamView): members
 * with role and, for organizers, how many events they're scoped to. Owner/admin add people
 * (restricted search, PeoplePicker), change role, assign events, remove. Owners can't be changed.
 */
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ASSIGNABLE_ROLES,
  assignableEvents,
  assignmentsToSave,
  assignedEventIds,
  assignmentCounts,
  canManageMembers,
  editableRole,
  flameV2Colors as c,
  formatEventDateTime,
  memberHasActions,
  memberName,
  sortTeam,
  type AssignableRole,
  type OrgMemberRole,
  type TeamAssignment,
  type TeamMember,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiClient, apiGet, apiPost } from "../../../lib/api";
import { routes } from "../../../lib/v2/routes";
import { apiErrorText, type MyOrganization } from "../../../lib/v2/organizer-api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { useOrganizerModel } from "../../../hooks/v2/useOrganizerModel";
import { useMe } from "../../../hooks/v2/useMe";
import { OrganizerShell, TABBAR_SPACE } from "../OrganizerShell";
import { Button, ConfirmDialog, ErrorBox, ErrorText, Icon, Skeleton, StatusTag } from "../ui";
import { Sheet } from "../Sheet";
import { Avatar, PeoplePicker, type Person } from "../people/PeoplePicker";

type Dialog = { kind: "add" } | { kind: "menu" | "role" | "assign" | "remove"; member: TeamMember } | null;

export function teamKeys(orgId: string) {
  return { members: ["v2", "team-members", orgId], assignments: ["v2", "team-assignments", orgId] };
}

export function TeamScreen({ organization }: { organization: MyOrganization }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { getToken } = useOptionalAuth();
  const me = useMe();
  const { data, model } = useOrganizerModel(organization);
  const keys = teamKeys(organization.id);
  const canEdit = canManageMembers(organization.role);
  const [dialog, setDialog] = useState<Dialog>(null);

  const membersQuery = useQuery<{ members: TeamMember[] }>({
    queryKey: keys.members,
    queryFn: () => apiGet(`/api/organizations/${organization.id}/members`, getToken),
  });
  const assignmentsQuery = useQuery<{ assignments: TeamAssignment[] }>({
    queryKey: keys.assignments,
    queryFn: () => apiGet(`/api/organizations/${organization.id}/event-assignments`, getToken),
  });

  const members = useMemo(() => sortTeam(membersQuery.data?.members ?? [], locale), [membersQuery.data, locale]);
  const assignments = assignmentsQuery.data?.assignments ?? [];
  const counts = assignmentCounts(assignments);
  const events = useMemo(() => (data ? assignableEvents(data as never) : []), [data]);
  const isMe = (m: TeamMember) => Boolean(me?.email && m.user_email && m.user_email.toLowerCase() === me.email);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.members }),
      queryClient.invalidateQueries({ queryKey: keys.assignments }),
      queryClient.invalidateQueries({ queryKey: ["v2", "organizer-data"] }),
    ]);
  };
  const eventsLabel = (m: TeamMember) =>
    m.role === "organizer"
      ? (counts.get(m.user_id) ?? 0) > 0
        ? t("team.eventsAssigned", { count: counts.get(m.user_id) ?? 0 })
        : t("team.noEventsAssigned")
      : t("team.allEvents");

  const back = () => (router.canGoBack() ? router.back() : router.replace(routes.manage(organization) as Href));

  return (
    <OrganizerShell
      organization={organization}
      pending={model?.pending ?? 0}
      section="manage"
      title={t("team.title")}
      onBack={back}
      actions={
        canEdit ? (
          <Pressable onPress={() => setDialog({ kind: "add" })} accessibilityRole="button" accessibilityLabel={t("team.addMember")} className="h-9 w-9 items-center justify-center rounded-full bg-v2-cream active:bg-v2-paper">
            <Icon name="plus" size={20} color={c.ink} />
          </Pressable>
        ) : null
      }
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: TABBAR_SPACE + insets.bottom }}
        refreshControl={<RefreshControl refreshing={membersQuery.isRefetching} onRefresh={() => void refresh()} tintColor={c.cream} />}
      >
        <Text className="font-v2-ui text-[14px] leading-[20px] text-v2-c70">{t("team.lede", { org: organization.name })}</Text>
        {membersQuery.isError ? (
          <ErrorBox onRetry={() => void membersQuery.refetch()} />
        ) : membersQuery.isLoading ? (
          <View className="gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width="100%" height={64} radius={16} />
            ))}
          </View>
        ) : members.length === 0 ? (
          <View className="rounded-v2-card bg-v2-ink2 px-4 py-12">
            <Text className="text-center font-v2-ui text-[14px] text-v2-c50">{t("team.empty")}</Text>
          </View>
        ) : (
          <View className="overflow-hidden rounded-v2-card bg-v2-ink2">
            {members.map((m, i) => (
              <View key={m.id} className={`flex-row items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-v2-c06" : ""}`}>
                <Avatar name={memberName(m)} size={40} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-v2-ui-semibold text-[14px] text-v2-cream">
                    {memberName(m)}
                    {isMe(m) ? <Text className="font-v2-ui text-v2-c50"> ({t("team.you")})</Text> : null}
                  </Text>
                  <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c50">{m.user_email}</Text>
                  <View className="mt-1 flex-row items-center gap-2">
                    <RolePill role={m.role} />
                    <Text numberOfLines={1} className="shrink font-v2-ui text-[12px] text-v2-c70">{eventsLabel(m)}</Text>
                  </View>
                </View>
                {canEdit && memberHasActions(m) && (
                  <Pressable
                    onPress={() => setDialog({ kind: "menu", member: m })}
                    accessibilityRole="button"
                    accessibilityLabel={t("team.options", { name: memberName(m) })}
                    hitSlop={6}
                    className="h-9 w-9 items-center justify-center rounded-full active:bg-v2-ink3"
                  >
                    <Icon name="settings" size={18} />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {dialog?.kind === "add" && (
        <AddMemberSheet
          organization={organization}
          members={members}
          onClose={() => setDialog(null)}
          onAdded={async () => {
            await refresh();
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "menu" && (
        <Sheet open title={memberName(dialog.member)} subtitle={dialog.member.user_email ?? undefined} onClose={() => setDialog(null)}>
          <View className="gap-1">
            <MenuRow icon="user" label={t("team.changeRole")} onPress={() => setDialog({ kind: "role", member: dialog.member })} />
            {dialog.member.role === "organizer" && <MenuRow icon="cal" label={t("team.assignEvents")} onPress={() => setDialog({ kind: "assign", member: dialog.member })} />}
            <MenuRow icon="trash" label={t("team.remove")} danger onPress={() => setDialog({ kind: "remove", member: dialog.member })} />
          </View>
        </Sheet>
      )}
      {dialog?.kind === "role" && (
        <RoleSheet
          member={dialog.member}
          onClose={() => setDialog(null)}
          onSave={async (role) => {
            await apiClient(`/api/organizations/${organization.id}/members/${dialog.member.id}`, { method: "PATCH", body: JSON.stringify({ role }), getToken });
            await refresh();
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "assign" && (
        <AssignSheet
          member={dialog.member}
          events={events}
          initial={assignedEventIds(assignments, dialog.member.user_id)}
          onClose={() => setDialog(null)}
          onSave={async (eventIds) => {
            await apiClient(`/api/organizations/${organization.id}/event-assignments`, { method: "PUT", body: JSON.stringify({ userId: dialog.member.user_id, eventIds }), getToken });
            await refresh();
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "remove" && (
        <RemoveDialog
          member={dialog.member}
          self={isMe(dialog.member)}
          onClose={() => setDialog(null)}
          onRemove={async () => {
            await apiPost("/api/organizations/members/remove", { orgId: organization.id, memberId: dialog.member.id }, getToken);
            const self = isMe(dialog.member);
            setDialog(null);
            if (self) router.replace(routes.myOrganizers() as Href);
            else await refresh();
          }}
        />
      )}
    </OrganizerShell>
  );
}

function RolePill({ role }: { role: OrgMemberRole }) {
  const { t } = useI18n();
  return <StatusTag tone={role === "owner" ? "flame" : role === "admin" ? "warn" : "neutral"}>{t(`organizer.roles.${role}`)}</StatusTag>;
}

function MenuRow({ icon, label, onPress, danger }: { icon: "user" | "cal" | "trash"; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="h-12 flex-row items-center gap-3 rounded-v2-md px-3 active:bg-v2-ink3">
      <Icon name={icon} size={19} color={danger ? c.errorText : c.c70} />
      <Text className={`font-v2-ui-medium text-[15px] ${danger ? "text-v2-errorText" : "text-v2-cream"}`}>{label}</Text>
    </Pressable>
  );
}

function RolePicker({ value, onChange }: { value: AssignableRole; onChange: (r: AssignableRole) => void }) {
  const { t } = useI18n();
  return (
    <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel={t("team.colRole")}>
      {ASSIGNABLE_ROLES.map((r) => {
        const on = value === r;
        return (
          <Pressable
            key={r}
            onPress={() => onChange(r)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t(`organizer.roles.${r}`)}
            className={`flex-row items-start gap-3 rounded-v2-md border p-3 ${on ? "border-v2-c30 bg-v2-ink3" : "border-v2-c10"}`}
          >
            <View className={`mt-0.5 h-4 w-4 items-center justify-center rounded-full border ${on ? "border-v2-cream" : "border-v2-c30"}`}>
              {on && <View className="h-2 w-2 rounded-full bg-v2-cream" />}
            </View>
            <View className="flex-1">
              <Text className="font-v2-ui-semibold text-[14px] text-v2-cream">{t(`organizer.roles.${r}`)}</Text>
              <Text className="font-v2-ui text-[12.5px] text-v2-c70">{r === "admin" ? t("team.roleAdminHint") : t("team.roleOrganizerHint")}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function SheetActions({ onCancel, onSave, saveLabel, busy, disabled }: { onCancel: () => void; onSave: () => void; saveLabel: string; busy: boolean; disabled?: boolean }) {
  const { t } = useI18n();
  return (
    <View className="flex-row gap-2">
      <View className="flex-1">
        <Button label={t("common.cancel")} onPress={onCancel} disabled={busy} />
      </View>
      <View className="flex-[2]">
        <Button variant="primary" label={saveLabel} onPress={onSave} disabled={busy || disabled} />
      </View>
    </View>
  );
}

function AddMemberSheet({ organization, members, onClose, onAdded }: { organization: MyOrganization; members: TeamMember[]; onClose: () => void; onAdded: () => Promise<void> }) {
  const { t } = useI18n();
  const { getToken } = useOptionalAuth();
  const [person, setPerson] = useState<Person | null>(null);
  const [role, setRole] = useState<AssignableRole>("organizer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const already = person ? members.some((m) => m.user_id === person.id) : false;

  const add = async () => {
    if (!person || already) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/organizations/${organization.id}/members`, { userId: person.id, role }, getToken);
      await onAdded();
    } catch (e) {
      setError(apiErrorText(e, t("errors.generic")));
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      title={t("team.addMember")}
      subtitle={organization.name}
      onClose={onClose}
      footer={<SheetActions onCancel={onClose} onSave={() => void add()} saveLabel={busy ? t("team.adding") : t("team.add")} busy={busy} disabled={!person || already} />}
    >
      <View className="gap-4">
        <PeoplePicker organization={organization} value={person} onChange={setPerson} disabled={busy} />
        {person && already && <Text accessibilityRole="alert" className="font-v2-ui text-[13px] text-v2-warn">{t("team.alreadyMember", { name: [person.first_name, person.last_name].filter(Boolean).join(" ") || person.email })}</Text>}
        {person && !already && <RolePicker value={role} onChange={setRole} />}
        {error ? <ErrorText>{error}</ErrorText> : null}
      </View>
    </Sheet>
  );
}

function RoleSheet({ member, onClose, onSave }: { member: TeamMember; onClose: () => void; onSave: (role: AssignableRole) => Promise<void> }) {
  const { t } = useI18n();
  const [role, setRole] = useState<AssignableRole>(editableRole(member.role));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (role === member.role) return onClose();
    setBusy(true);
    setError(null);
    try {
      await onSave(role);
    } catch (e) {
      setError(apiErrorText(e, t("errors.generic")));
      setBusy(false);
    }
  };
  return (
    <Sheet open title={t("team.changeRole")} subtitle={memberName(member)} onClose={onClose} footer={<SheetActions onCancel={onClose} onSave={() => void save()} saveLabel={busy ? t("team.saving") : t("team.save")} busy={busy} />}>
      <RolePicker value={role} onChange={setRole} />
      {error ? <View className="mt-3"><ErrorText>{error}</ErrorText></View> : null}
    </Sheet>
  );
}

function AssignSheet({
  member,
  events,
  initial,
  onClose,
  onSave,
}: {
  member: TeamMember;
  events: ReturnType<typeof assignableEvents>;
  initial: string[];
  onClose: () => void;
  onSave: (eventIds: string[]) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  // Only the offered (not ended) events are listed and counted; past assignments are kept on save.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial.filter((id) => events.some((e) => e.id === id))));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(assignmentsToSave(selected, events, initial));
    } catch (e) {
      setError(apiErrorText(e, t("errors.generic")));
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      title={t("team.assignEvents")}
      subtitle={t("team.selectedCount", { count: selected.size })}
      onClose={onClose}
      footer={<SheetActions onCancel={onClose} onSave={() => void save()} saveLabel={busy ? t("team.saving") : t("team.save")} busy={busy} />}
    >
      <Text className="mb-3 font-v2-ui text-[14px] text-v2-c70">{t("team.assignHint", { name: memberName(member) })}</Text>
      {events.length === 0 ? (
        <Text className="py-6 text-center font-v2-ui text-[14px] text-v2-c50">{t("team.noEvents")}</Text>
      ) : (
        <View className="gap-1">
          {events.map((e) => {
            const on = selected.has(e.id);
            const when = e.starts_at ? formatEventDateTime(e.starts_at, null, locale).date : "";
            return (
              <Pressable
                key={e.id}
                onPress={() => toggle(e.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={e.name}
                className={`flex-row items-center gap-3 rounded-v2-md p-2.5 ${on ? "bg-v2-ink3" : "active:bg-v2-ink3"}`}
              >
                <View className={`h-5 w-5 items-center justify-center rounded-[5px] border ${on ? "border-v2-flame bg-v2-flame" : "border-v2-c30"}`}>
                  {on && <Icon name="check" size={14} color={c.cream} />}
                </View>
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-v2-ui-medium text-[14px] text-v2-cream">{e.name}</Text>
                  <Text className="font-v2-ui text-[12px] text-v2-c50">
                    {when}
                    {e.cohost ? ` · ${t("team.cohost")}` : ""}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      {error ? <View className="mt-3"><ErrorText>{error}</ErrorText></View> : null}
    </Sheet>
  );
}

function RemoveDialog({ member, self, onClose, onRemove }: { member: TeamMember; self: boolean; onClose: () => void; onRemove: () => Promise<void> }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await onRemove();
    } catch (e) {
      setError(apiErrorText(e, t("errors.generic")));
      setBusy(false);
    }
  };
  return (
    <ConfirmDialog
      open
      message={t("team.removeConfirm", { name: memberName(member) })}
      detail={error ?? (self ? t("team.removeSelfDetail") : t("team.removeDetail"))}
      confirmLabel={t("team.remove")}
      busy={busy}
      onConfirm={() => void remove()}
      onCancel={onClose}
    />
  );
}
