"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ASSIGNABLE_ROLES,
  assignableEvents,
  assignedEventIds,
  assignmentCounts,
  editableRole,
  formatEventDateTime,
  isLikelyEmail,
  memberHasActions,
  memberInitials,
  memberName,
  normalizeEmail,
  sortTeam,
  type AssignableRole,
  type OrgMemberRole,
  type TeamAssignment,
  type TeamMember,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ErrorBox } from "../../components/ErrorBox";
import { Skeleton } from "../../components/Skeleton";
import { apiErrorMessage } from "../../lib/api-error";
import { routes } from "../../lib/routes";
import { OrganizerShell, type ShellUser } from "../OrganizerShell";
import { useOrganizerModel, type Org } from "../useOrganizerModel";

type Dialog =
  | { kind: "add" }
  | { kind: "menu"; member: TeamMember }
  | { kind: "role"; member: TeamMember }
  | { kind: "assign"; member: TeamMember }
  | { kind: "remove"; member: TeamMember }
  | null;

const primary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-v2-pill bg-v2-cream px-4 text-[14px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper disabled:opacity-50";
const ghost = "inline-flex h-10 items-center justify-center rounded-v2-pill bg-v2-ink3 px-4 text-[14px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4";
const field =
  "h-11 w-full min-w-0 rounded-v2-md bg-v2-ink3 px-4 text-[14px] text-v2-cream placeholder:text-v2-c50 focus:outline-none focus:ring-1 focus:ring-v2-c30";

/**
 * Team v2 (prototype "ow:team"): members with role and, for organizers, how many events they're
 * scoped to. Add (existing Flame account by e-mail), change role, assign events, remove.
 * Same endpoints and rules as v1; owners can't be changed or removed here.
 */
export default function TeamView({
  organization,
  organizations,
  role,
  me = null,
}: {
  organization: Org;
  organizations: Org[];
  role: OrgMemberRole | null;
  me?: ShellUser | null;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, model } = useOrganizerModel(organization, role);
  const [dialog, setDialog] = useState<Dialog>(null);

  // Same cache keys as v1's Team screen.
  const membersKey = ["team-members", organization.id];
  const assignmentsKey = ["team-event-assignments", organization.id];
  const membersQuery = useQuery<{ members: TeamMember[] }>({
    queryKey: membersKey,
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organization.id}/members`);
      if (!res.ok) throw new Error(`members ${res.status}`);
      return res.json();
    },
  });
  const assignmentsQuery = useQuery<{ assignments: TeamAssignment[] }>({
    queryKey: assignmentsKey,
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organization.id}/event-assignments`);
      if (!res.ok) throw new Error(`assignments ${res.status}`);
      return res.json();
    },
  });

  const members = useMemo(() => sortTeam(membersQuery.data?.members ?? [], locale), [membersQuery.data, locale]);
  const assignments = assignmentsQuery.data?.assignments ?? [];
  const counts = assignmentCounts(assignments);
  const events = useMemo(() => (data ? assignableEvents(data) : []), [data]);
  const isMe = (m: TeamMember) => Boolean(me?.email && m.user_email && m.user_email.toLowerCase() === me.email);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: membersKey }),
      queryClient.invalidateQueries({ queryKey: assignmentsKey }),
      queryClient.invalidateQueries({ queryKey: ["organizer-data"], exact: false }),
    ]);
  };

  const eventsLabel = (m: TeamMember) =>
    m.role === "organizer"
      ? (counts.get(m.user_id) ?? 0) > 0
        ? t("team.eventsAssigned", { count: counts.get(m.user_id) ?? 0 })
        : t("team.noEventsAssigned")
      : t("team.allEvents");

  return (
    <OrganizerShell
      organization={organization}
      organizations={organizations}
      role={role}
      pending={model?.pending ?? 0}
      currentEvents={model?.current ?? []}
      pastEvents={model?.past ?? []}
      section="team"
      title={t("team.title")}
      backHref={routes.dashboard(organization.slug)}
      crumbs={[
        { label: t("organizer.myOrganizers"), href: routes.organizers() },
        { label: organization.name, href: routes.dashboard(organization.slug) },
        { label: t("team.title") },
      ]}
      actions={
        <button type="button" onClick={() => setDialog({ kind: "add" })} aria-label={t("team.addMember")} className={primary}>
          <Icon name="plus" size={17} strokeWidth={2.2} />
          <span className="hidden sm:inline">{t("team.addMember")}</span>
        </button>
      }
      me={me}
    >
      <section className="mx-auto max-w-[1120px] px-4 pt-5 lg:px-10 lg:pt-8">
        <p className="mb-5 text-[14px] text-v2-c70">{t("team.lede", { org: organization.name })}</p>

        {membersQuery.isError ? (
          <ErrorBox onRetry={() => void membersQuery.refetch()} />
        ) : membersQuery.isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-v2-card" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <p className="rounded-v2-card bg-v2-ink2 px-4 py-12 text-center text-[14px] text-v2-c50">{t("team.empty")}</p>
        ) : (
          <div className="overflow-hidden rounded-v2-card bg-v2-ink2">
            <div className="hidden grid-cols-[minmax(0,2fr)_140px_minmax(0,1fr)_48px] gap-4 border-b border-v2-c06 px-5 py-3 text-[11px] font-v2-ui-semibold uppercase tracking-[0.08em] text-v2-c50 md:grid">
              <span>{t("team.colMember")}</span>
              <span>{t("team.colRole")}</span>
              <span>{t("team.colEvents")}</span>
              <span />
            </div>
            <ul className="divide-y divide-v2-c06">
              {members.map((m) => (
                <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,2fr)_140px_minmax(0,1fr)_48px] md:gap-4 md:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-v2-ink4 text-[13px] font-v2-ui-bold">{memberInitials(m)}</span>
                    <span className="min-w-0">
                      <b className="block truncate text-[14px] font-v2-ui-semibold">
                        {memberName(m)}
                        {isMe(m) && <span className="font-v2-ui text-v2-c50"> ({t("team.you")})</span>}
                      </b>
                      <small className="block truncate text-[12.5px] text-v2-c50">{m.user_email}</small>
                      <small className="mt-1 block text-[12px] text-v2-c70 md:hidden">
                        {t(`organizer.roles.${m.role}`)} · {eventsLabel(m)}
                      </small>
                    </span>
                  </div>
                  <span className="hidden md:block">
                    <RolePill role={m.role} />
                  </span>
                  <span className="hidden truncate text-[13px] text-v2-c70 md:block">{eventsLabel(m)}</span>
                  <span className="flex justify-end">
                    {memberHasActions(m) && (
                      <button
                        type="button"
                        onClick={() => setDialog({ kind: "menu", member: m })}
                        aria-label={t("team.options", { name: memberName(m) })}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-v2-sm text-v2-c70 hover:bg-v2-c10 hover:text-v2-cream"
                      >
                        <Icon name="settings" size={17} />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {dialog?.kind === "add" && (
        <AddMemberDialog
          orgId={organization.id}
          members={members}
          onClose={() => setDialog(null)}
          onAdded={async () => {
            await refresh();
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "menu" && (
        <Modal open title={memberName(dialog.member)} onClose={() => setDialog(null)}>
          <div className="flex flex-col gap-1">
            <MenuButton icon="user" label={t("team.changeRole")} onClick={() => setDialog({ kind: "role", member: dialog.member })} />
            {dialog.member.role === "organizer" && (
              <MenuButton icon="cal" label={t("team.assignEvents")} onClick={() => setDialog({ kind: "assign", member: dialog.member })} />
            )}
            <MenuButton icon="trash" label={t("team.remove")} danger onClick={() => setDialog({ kind: "remove", member: dialog.member })} />
          </div>
        </Modal>
      )}
      {dialog?.kind === "role" && (
        <RoleDialog
          orgId={organization.id}
          member={dialog.member}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            await refresh();
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "assign" && (
        <AssignDialog
          orgId={organization.id}
          member={dialog.member}
          events={events}
          initial={assignedEventIds(assignments, dialog.member.user_id)}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            await refresh();
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "remove" && (
        <RemoveDialog
          orgId={organization.id}
          member={dialog.member}
          self={isMe(dialog.member)}
          onClose={() => setDialog(null)}
          onRemoved={async () => {
            const self = isMe(dialog.member);
            setDialog(null);
            if (self) router.push(routes.organizers());
            else await refresh();
          }}
        />
      )}
    </OrganizerShell>
  );
}

function RolePill({ role }: { role: OrgMemberRole }) {
  const { t } = useI18n();
  const tone = role === "owner" ? "bg-v2-cream text-v2-ink" : role === "admin" ? "bg-v2-flame/30 text-v2-cream" : "bg-v2-ink4 text-v2-c90";
  return <span className={`inline-flex rounded-v2-pill px-2.5 py-1 text-[12px] font-v2-ui-semibold ${tone}`}>{t(`organizer.roles.${role}`)}</span>;
}

function MenuButton({ icon, label, onClick, danger }: { icon: "user" | "cal" | "trash"; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 items-center gap-3 rounded-v2-md px-3 text-left text-[14px] font-v2-ui-medium hover:bg-v2-ink3 ${danger ? "text-v2-errorText" : "text-v2-cream"}`}
    >
      <Icon name={icon} size={18} />
      {label}
    </button>
  );
}

function RolePicker({ value, onChange }: { value: AssignableRole; onChange: (r: AssignableRole) => void }) {
  const { t } = useI18n();
  return (
    <div role="radiogroup" aria-label={t("team.colRole")} className="flex flex-col gap-2">
      {ASSIGNABLE_ROLES.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={value === r}
          onClick={() => onChange(r)}
          className={`flex items-start gap-3 rounded-v2-md border p-3 text-left ${value === r ? "border-v2-c30 bg-v2-ink3" : "border-v2-c10 hover:bg-v2-ink3"}`}
        >
          <span aria-hidden className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${value === r ? "border-v2-cream" : "border-v2-c30"}`}>
            {value === r && <span className="h-2 w-2 rounded-full bg-v2-cream" />}
          </span>
          <span>
            <b className="block text-[14px] font-v2-ui-semibold">{t(`organizer.roles.${r}`)}</b>
            <small className="text-[12.5px] text-v2-c70">{r === "admin" ? t("team.roleAdminHint") : t("team.roleOrganizerHint")}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

async function send(url: string, method: string, body: unknown, generic: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.ok ? null : await apiErrorMessage(res, generic);
  } catch {
    return generic;
  }
}

type FoundUser = { id: string; email: string; first_name: string | null; last_name: string | null };

function AddMemberDialog({
  orgId,
  members,
  onClose,
  onAdded,
}: {
  orgId: string;
  members: TeamMember[];
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [found, setFound] = useState<FoundUser | null>(null);
  const [role, setRole] = useState<AssignableRole>("organizer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const already = found ? members.some((m) => m.user_id === found.id) : false;
  const foundName = found ? [found.first_name, found.last_name].filter(Boolean).join(" ") || found.email : "";

  const search = async () => {
    setError(null);
    setFound(null);
    if (!isLikelyEmail(email)) return setError(t("team.invalidEmail"));
    setBusy(true);
    try {
      const res = await fetch(`/api/organizer/search-users?email=${encodeURIComponent(normalizeEmail(email))}`);
      if (!res.ok) return setError(await apiErrorMessage(res, t("errors.generic")));
      const json = (await res.json()) as { users?: FoundUser[] };
      if (!json.users?.length) return setError(t("team.notFound"));
      setFound(json.users[0]!);
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!found || already) return;
    setBusy(true);
    const err = await send(`/api/organizations/${orgId}/members`, "POST", { userId: found.id, role }, t("errors.generic"));
    if (err) {
      setError(err);
      setBusy(false);
      return;
    }
    await onAdded();
  };

  return (
    <Modal
      open
      title={t("team.addMember")}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghost}>
            {t("common.cancel")}
          </button>
          <button type="button" onClick={() => void add()} disabled={!found || already || busy} className={primary}>
            {busy && found ? t("team.adding") : t("team.add")}
          </button>
        </>
      }
    >
      <label htmlFor="tm-email" className="mb-1.5 block text-[12.5px] text-v2-c70">
        {t("team.email")}
      </label>
      <div className="flex gap-2">
        <input
          id="tm-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFound(null);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder={t("team.emailPlaceholder")}
          autoComplete="off"
          className={field}
        />
        <button type="button" onClick={() => void search()} disabled={!email.trim() || busy} className={ghost}>
          {busy && !found ? t("team.searching") : t("team.search")}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-[13px] text-v2-errorText">{error}</p>}
      {found && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-v2-md bg-v2-ink3 p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-v2-ink4 text-[13px] font-v2-ui-bold">
              {(found.first_name?.charAt(0) || found.email.charAt(0)).toUpperCase()}
            </span>
            <span className="min-w-0">
              <b className="block truncate text-[14px] font-v2-ui-semibold">{foundName}</b>
              <small className="block truncate text-[12.5px] text-v2-c50">{found.email}</small>
            </span>
          </div>
          {already ? (
            <p role="alert" className="text-[13px] text-v2-warn">{t("team.alreadyMember", { name: foundName })}</p>
          ) : (
            <RolePicker value={role} onChange={setRole} />
          )}
        </div>
      )}
    </Modal>
  );
}

function RoleDialog({ orgId, member, onClose, onSaved }: { orgId: string; member: TeamMember; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const [role, setRole] = useState<AssignableRole>(editableRole(member.role));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (role === member.role) return onClose();
    setBusy(true);
    setError(null);
    const err = await send(`/api/organizations/${orgId}/members/${member.id}`, "PATCH", { role }, t("errors.generic"));
    if (err) {
      setError(err);
      setBusy(false);
      return;
    }
    await onSaved();
  };
  return (
    <Modal
      open
      title={t("team.changeRole")}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={ghost}>
            {t("common.cancel")}
          </button>
          <button type="button" onClick={() => void save()} disabled={busy} className={primary}>
            {busy ? t("team.saving") : t("team.save")}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[14px] text-v2-c70">{memberName(member)}</p>
      <RolePicker value={role} onChange={setRole} />
      {error && <p role="alert" className="mt-3 text-[13px] text-v2-errorText">{error}</p>}
    </Modal>
  );
}

function AssignDialog({
  orgId,
  member,
  events,
  initial,
  onClose,
  onSaved,
}: {
  orgId: string;
  member: TeamMember;
  events: ReturnType<typeof assignableEvents>;
  initial: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
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
    const err = await send(
      `/api/organizations/${orgId}/event-assignments`,
      "PUT",
      { userId: member.user_id, eventIds: events.map((e) => e.id).filter((id) => selected.has(id)) },
      t("errors.generic"),
    );
    if (err) {
      setError(err);
      setBusy(false);
      return;
    }
    await onSaved();
  };
  return (
    <Modal
      open
      title={t("team.assignEvents")}
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto self-center text-[12.5px] text-v2-c50">{t("team.selectedCount", { count: selected.size })}</span>
          <button type="button" onClick={onClose} className={ghost}>
            {t("common.cancel")}
          </button>
          <button type="button" onClick={() => void save()} disabled={busy} className={primary}>
            {busy ? t("team.saving") : t("team.save")}
          </button>
        </>
      }
    >
      <p className="mb-3 text-[14px] text-v2-c70">{t("team.assignHint", { name: memberName(member) })}</p>
      {events.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-v2-c50">{t("team.noEvents")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {events.map((e) => {
            const on = selected.has(e.id);
            const when = e.starts_at ? formatEventDateTime(e.starts_at, null, locale).date : "";
            return (
              <li key={e.id}>
                <label className={`flex cursor-pointer items-center gap-3 rounded-v2-md p-2.5 hover:bg-v2-ink3 ${on ? "bg-v2-ink3" : ""}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(e.id)} className="h-4 w-4 accent-[#880517]" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14px] font-v2-ui-medium">{e.name}</b>
                    <small className="text-[12px] text-v2-c50">
                      {when}
                      {e.cohost ? ` · ${t("team.cohost")}` : ""}
                    </small>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-[13px] text-v2-errorText">{error}</p>}
    </Modal>
  );
}

function RemoveDialog({
  orgId,
  member,
  self,
  onClose,
  onRemoved,
}: {
  orgId: string;
  member: TeamMember;
  self: boolean;
  onClose: () => void;
  onRemoved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true);
    setError(null);
    const err = await send("/api/organizations/members/remove", "POST", { orgId, memberId: member.id }, t("errors.generic"));
    if (err) {
      setError(err);
      setBusy(false);
      return;
    }
    await onRemoved();
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
