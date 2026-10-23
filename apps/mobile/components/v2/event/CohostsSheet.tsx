/**
 * Co-hosts of an event (owner/admin of the owning organization), as a bottom sheet: current
 * co-hosts with remove (confirmation), search approved organizations and add. Web API only:
 * GET/POST/DELETE /api/organizations/[id]/cohost-assignments (+ ?search= for the search).
 */
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "../../../lib/i18n";
import { apiClient, apiGet, apiPost } from "../../../lib/api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { apiErrorText } from "../../../lib/v2/organizer-api";
import { useKeyboardHeight } from "../../../hooks/v2/useKeyboardVisible";
import { Button, ConfirmDialog, ErrorText, Field, Icon, OrgAvatar, Skeleton } from "../ui";

type OrgLite = { id: string; name: string; slug: string; logo_url: string | null; city?: string | null };
type Assignment = { id: string; cohost_organization_id: string; cohost_org: OrgLite | null };

export function cohostsKey(orgId: string, eventId: string) {
  return ["v2", "cohost-assignments", orgId, eventId];
}

/** Current co-hosts (also used for the count on the event header). */
export function useEventCohosts(orgId: string, eventId: string, enabled: boolean) {
  const { getToken } = useOptionalAuth();
  return useQuery<Assignment[]>({
    queryKey: cohostsKey(orgId, eventId),
    queryFn: async () => (await apiGet<{ assignments?: Assignment[] }>(`/api/organizations/${orgId}/cohost-assignments?event_id=${eventId}`, getToken)).assignments ?? [],
    enabled,
    staleTime: 30_000,
  });
}

export function CohostsSheet({
  open,
  onClose,
  orgId,
  eventId,
  eventName,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  eventId: string;
  eventName: string;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { getToken } = useOptionalAuth();
  const queryClient = useQueryClient();
  const cohosts = useEventCohosts(orgId, eventId, open);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrgLite[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Assignment | null>(null);
  const reqId = useRef(0);

  // Android: lift the sheet above the keyboard ourselves (see useKeyboardHeight). If the device
  // does resize the modal window, subtract what it already shrank so the lift isn't doubled.
  const keyboard = useKeyboardHeight();
  const fullHeight = useRef(0);
  const [height, setHeight] = useState(0);
  const shrunk = fullHeight.current > 0 && height > 0 ? Math.max(0, fullHeight.current - height) : 0;
  const lift = Platform.OS === "android" ? Math.max(0, keyboard - shrunk) : 0;

  // Debounced search (350 ms, like the web modal); stale answers are dropped.
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      reqId.current += 1;
      setResults(null);
      setSearching(false);
      return;
    }
    const id = ++reqId.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const json = await apiGet<{ organizations: OrgLite[] }>(
          `/api/organizations/${orgId}/cohost-assignments?search=${encodeURIComponent(term)}&event_id=${eventId}`,
          getToken,
        );
        if (id === reqId.current) setResults(json.organizations ?? []);
      } catch (e) {
        if (id === reqId.current) setError(apiErrorText(e, t("errors.generic")));
      } finally {
        if (id === reqId.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, orgId, eventId, getToken, t]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: cohostsKey(orgId, eventId) });
    onChanged();
  };

  async function add(o: OrgLite) {
    setBusy(o.id);
    setError(null);
    try {
      await apiPost(`/api/organizations/${orgId}/cohost-assignments`, { eventId, cohostOrgId: o.id }, getToken);
      setQuery("");
      await refresh();
    } catch (e) {
      setError(apiErrorText(e, t("errors.generic")));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(removing.id);
    setError(null);
    try {
      await apiClient(`/api/organizations/${orgId}/cohost-assignments?id=${encodeURIComponent(removing.id)}`, { method: "DELETE", getToken });
      await refresh();
    } catch (e) {
      setError(apiErrorText(e, t("errors.generic")));
    } finally {
      setRemoving(null);
      setBusy(null);
    }
  }

  const list = cohosts.data ?? [];

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        enabled={Platform.OS === "ios"}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          fullHeight.current = Math.max(fullHeight.current, h);
          setHeight(h);
        }}
      >
      <Pressable className="flex-1 bg-black/60" onPress={onClose} accessibilityLabel={t("common.close")} />
      <View
        testID="cohosts-sheet"
        style={{ paddingBottom: (lift > 0 ? 12 : insets.bottom + 12), marginBottom: lift }}
        className="max-h-[85%] rounded-t-v2-sheet bg-v2-ink2 px-4 pt-3"
      >
        <View className="mb-3 h-1 w-10 self-center rounded-full bg-v2-c30" />
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text accessibilityRole="header" className="font-v2-display-bold text-[20px] text-v2-cream">{t("eventAdmin.cohosts")}</Text>
            <Text numberOfLines={1} className="font-v2-ui text-[13px] text-v2-c50">{eventName}</Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8} className="h-9 w-9 items-center justify-center rounded-full active:bg-v2-ink3">
            <Icon name="close" size={20} />
          </Pressable>
        </View>
        <Text className="mt-2 font-v2-ui text-[13px] leading-[19px] text-v2-c70">{t("eventAdmin.cohostsSheet.lede")}</Text>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingTop: 14, paddingBottom: 8 }}>
          <View>
            <Text className="mb-2 font-v2-ui-semibold text-[12px] uppercase tracking-[0.6px] text-v2-c50">{t("eventAdmin.cohostsSheet.current")}</Text>
            {cohosts.isLoading ? (
              <Skeleton width="100%" height={56} radius={14} />
            ) : list.length === 0 ? (
              <Text className="font-v2-ui text-[14px] text-v2-c50">{t("eventAdmin.noCohosts")}</Text>
            ) : (
              list.map((a) => (
                <View key={a.id} className="flex-row items-center gap-3 py-2">
                  <OrgAvatar name={a.cohost_org?.name ?? "?"} logoUrl={a.cohost_org?.logo_url ?? null} size={36} />
                  <Text numberOfLines={1} className="flex-1 font-v2-ui-semibold text-[14px] text-v2-cream">{a.cohost_org?.name ?? "—"}</Text>
                  <Button
                    small
                    variant="danger"
                    label={t("eventAdmin.cohostsSheet.remove")}
                    accessibilityLabel={`${t("eventAdmin.cohostsSheet.remove")} ${a.cohost_org?.name ?? ""}`}
                    disabled={busy !== null}
                    onPress={() => setRemoving(a)}
                  />
                </View>
              ))
            )}
          </View>

          <View className="gap-2">
            <Field value={query} onChangeText={setQuery} placeholder={t("eventAdmin.cohostsSheet.search")} accessibilityLabel={t("eventAdmin.cohostsSheet.search")} autoCapitalize="none" />
            {searching && <Text className="font-v2-ui text-[13px] text-v2-c50">{t("eventAdmin.cohostsSheet.searching")}</Text>}
            {!searching && results?.length === 0 && <Text className="font-v2-ui text-[13px] text-v2-c50">{t("eventAdmin.cohostsSheet.noResults")}</Text>}
            {results?.map((o) => (
              <View key={o.id} className="flex-row items-center gap-3 py-1.5">
                <OrgAvatar name={o.name} logoUrl={o.logo_url} size={36} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-v2-ui-semibold text-[14px] text-v2-cream">{o.name}</Text>
                  {o.city ? <Text className="font-v2-ui text-[12px] text-v2-c50">{o.city}</Text> : null}
                </View>
                <Button small icon="plus" variant="primary" label={t("eventAdmin.cohostsSheet.add")} accessibilityLabel={`${t("eventAdmin.cohostsSheet.add")} ${o.name}`} disabled={busy !== null} onPress={() => add(o)} />
              </View>
            ))}
            {error && <ErrorText>{error}</ErrorText>}
          </View>
        </ScrollView>
      </View>
      </KeyboardAvoidingView>

      <ConfirmDialog
        open={removing !== null}
        message={t("eventAdmin.cohostsSheet.removeConfirm", { name: removing?.cohost_org?.name ?? "" })}
        detail={t("eventAdmin.cohostsSheet.removeDetail")}
        confirmLabel={t("eventAdmin.cohostsSheet.remove")}
        busy={busy !== null}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Modal>
  );
}

