/**
 * Password, e-mails and security — in the app, no browser (2026-11-02, Kevin: the Settings row used
 * to open Clerk's hosted page on accounts.dev). Uses the Clerk SDK on the signed-in user:
 *   · e-mails: list (primary / not verified), add with a 6-digit code, make primary, remove
 *   · password: change it (or add one when you only sign in with Google/Apple), optionally
 *     signing out the other devices
 *   · connected accounts (Google, Apple…): shown, read only
 *   · devices signed in: this one marked, sign out the others
 * If Clerk asks to re-verify (sensitive actions after a long session), we say "sign in again".
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { flameV2Colors as c } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { clerkErrorCode, clerkErrorMessage, useClerkUser, useCurrentSessionId, type ClerkEmail, type ClerkSession } from "../../../hooks/v2/useClerkUser";
import { useTimeAgo } from "../attendee/InboxCard";
import { Button, ConfirmDialog, ErrorText, Icon, Skeleton, StatusTag, SuccessNote } from "../ui";
import { Group, Input, Labeled, SwitchRow } from "../form/ui";

const PROVIDER: Record<string, string> = { oauth_google: "Google", google: "Google", oauth_apple: "Apple", apple: "Apple", oauth_facebook: "Facebook", facebook: "Facebook" };
const providerName = (p: string) => PROVIDER[p] ?? p.replace(/^oauth_/, "").replace(/^\w/, (x) => x.toUpperCase());

export function AccountSecurity() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoaded, user } = useClerkUser();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/v2/settings" as Href));

  // Re-render after SDK mutations (the user object is mutated in place, then reloaded).
  const [, setTick] = useState(0);
  const refresh = useCallback(async () => {
    try {
      await user?.reload();
    } finally {
      setTick((n) => n + 1);
    }
  }, [user]);

  const errorText = (e: unknown) => (clerkErrorCode(e) === "session_reverification_required" ? t("accountSecurity.reverify") : clerkErrorMessage(e) ?? t("accountSecurity.error"));

  return (
    <View className="flex-1 bg-v2-ink">
      <View style={{ paddingTop: insets.top }} className="border-b border-[#141414] bg-v2-ink">
        <View className="h-14 flex-row items-center gap-1 px-2">
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={6} className="h-10 w-10 items-center justify-center rounded-v2-sm active:bg-v2-c10">
            <Icon name="back" size={22} color={c.cream} />
          </Pressable>
          <Text accessibilityRole="header" numberOfLines={1} className="flex-1 px-1 font-v2-display-bold text-[18px] tracking-[-0.5px] text-v2-cream">{t("accountSecurity.title")}</Text>
        </View>
      </View>
      {!isLoaded || !user ? (
        <View className="gap-3 p-4">
          <Skeleton width="100%" height={140} radius={16} />
          <Skeleton width="100%" height={180} radius={16} />
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: insets.bottom + 40 }}>
          <Emails emails={user.emailAddresses} primaryId={user.primaryEmailAddressId} onMakePrimary={(id) => user.update({ primaryEmailAddressId: id })} onCreate={(email) => user.createEmailAddress({ email })} refresh={refresh} errorText={errorText} />
          <Password hasPassword={user.passwordEnabled} providers={user.externalAccounts.map((a) => providerName(a.provider))} onSave={(p) => user.updatePassword(p)} refresh={refresh} errorText={errorText} />
          {user.externalAccounts.length > 0 ? (
            <Block title={t("accountSecurity.connected")}>
              <Group>
                {user.externalAccounts.map((a) => (
                  <View key={a.id} className="flex-row items-center gap-3 px-4 py-3">
                    <Icon name="link" size={18} />
                    <View className="min-w-0 flex-1">
                      <Text className="font-v2-ui-semibold text-[15px] text-v2-cream">{providerName(a.provider)}</Text>
                      <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c50">{a.emailAddress}</Text>
                    </View>
                  </View>
                ))}
              </Group>
            </Block>
          ) : null}
          <Devices load={() => user.getSessions()} errorText={errorText} />
        </ScrollView>
      )}
    </View>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="px-1 font-v2-ui-semibold text-[12.5px] uppercase tracking-[0.6px] text-v2-c50">{title}</Text>
      {children}
    </View>
  );
}

function Emails({
  emails,
  primaryId,
  onMakePrimary,
  onCreate,
  refresh,
  errorText,
}: {
  emails: ClerkEmail[];
  primaryId: string | null;
  onMakePrimary: (id: string) => Promise<unknown>;
  onCreate: (email: string) => Promise<ClerkEmail>;
  refresh: () => Promise<void>;
  errorText: (e: unknown) => string;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [removing, setRemoving] = useState<ClerkEmail | null>(null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<ClerkEmail | null>(null);
  const [code, setCode] = useState("");

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    setDone(false);
    try {
      await fn();
      await refresh();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const sendCode = () =>
    run("send", async () => {
      // Re-use an unverified address the person already added instead of creating it twice.
      const existing = emails.find((e) => e.emailAddress.toLowerCase() === email.trim().toLowerCase());
      const target = existing ?? (await onCreate(email.trim()));
      await target.prepareVerification({ strategy: "email_code" });
      setPending(target);
    });
  const verify = async () => {
    if (!pending) return;
    const ok = await run("verify", () => pending.attemptVerification({ code: code.trim() }));
    if (ok) {
      setPending(null);
      setAdding(false);
      setEmail("");
      setCode("");
      setDone(true);
    }
  };
  const cancelAdd = () => {
    setAdding(false);
    setPending(null);
    setEmail("");
    setCode("");
    setError(null);
  };

  return (
    <Block title={t("accountSecurity.emails")}>
      <Group>
        {emails.map((e) => {
          const isPrimary = e.id === primaryId;
          const verified = e.verification?.status === "verified";
          return (
            <View key={e.id} className="gap-2 px-4 py-3">
              <View className="flex-row items-center gap-2">
                <Text numberOfLines={1} className="min-w-0 flex-1 font-v2-ui-medium text-[15px] text-v2-cream">{e.emailAddress}</Text>
                {isPrimary ? <StatusTag tone="good">{t("accountSecurity.primary")}</StatusTag> : !verified ? <StatusTag tone="warn">{t("accountSecurity.unverified")}</StatusTag> : null}
              </View>
              {!isPrimary ? (
                <View className="flex-row flex-wrap gap-2">
                  {verified ? <Button small label={t("accountSecurity.makePrimary")} onPress={() => void run(`primary:${e.id}`, () => onMakePrimary(e.id))} disabled={busy !== null} /> : null}
                  <Button small variant="danger" label={t("accountSecurity.remove")} onPress={() => setRemoving(e)} disabled={busy !== null} />
                </View>
              ) : null}
            </View>
          );
        })}
      </Group>
      {adding ? (
        <View className="gap-3 rounded-v2-card bg-v2-ink2 p-4">
          {!pending ? (
            <>
              <Labeled label={t("accountSecurity.newEmail")}>
                <Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" accessibilityLabel={t("accountSecurity.newEmail")} />
              </Labeled>
              <View className="flex-row gap-2">
                <Button small variant="primary" label={t("accountSecurity.sendCode")} onPress={() => void sendCode()} disabled={busy !== null || !/^\S+@\S+\.\S+$/.test(email.trim())} />
                <Button small variant="ghost" label={t("accountSecurity.cancel")} onPress={cancelAdd} />
              </View>
            </>
          ) : (
            <>
              <Text className="font-v2-ui text-[13.5px] text-v2-c70">{t("accountSecurity.codeSent", { email: pending.emailAddress })}</Text>
              <Labeled label={t("accountSecurity.code")}>
                <Input value={code} onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" accessibilityLabel={t("accountSecurity.code")} />
              </Labeled>
              <View className="flex-row gap-2">
                <Button small variant="primary" label={t("accountSecurity.verify")} onPress={() => void verify()} disabled={busy !== null || code.length !== 6} />
                <Button small variant="ghost" label={t("accountSecurity.cancel")} onPress={cancelAdd} />
              </View>
            </>
          )}
        </View>
      ) : (
        <View className="flex-row">
          <Button small icon="plus" label={t("accountSecurity.addEmail")} onPress={() => setAdding(true)} disabled={busy !== null} />
        </View>
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {done ? <SuccessNote>{t("accountSecurity.emailAdded")}</SuccessNote> : null}
      <ConfirmDialog
        open={removing !== null}
        message={t("accountSecurity.removeConfirm", { email: removing?.emailAddress ?? "" })}
        confirmLabel={t("accountSecurity.remove")}
        busy={busy !== null}
        onConfirm={() => {
          const target = removing;
          setRemoving(null);
          if (target) void run(`remove:${target.id}`, () => target.destroy());
        }}
        onCancel={() => setRemoving(null)}
      />
    </Block>
  );
}

function Password({
  hasPassword,
  providers,
  onSave,
  refresh,
  errorText,
}: {
  hasPassword: boolean;
  providers: string[];
  onSave: (p: { newPassword: string; currentPassword?: string; signOutOfOtherSessions?: boolean }) => Promise<unknown>;
  refresh: () => Promise<void>;
  errorText: (e: unknown) => string;
}) {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [others, setOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaved(false);
    if (next.length < 8) return setError(t("accountSecurity.passwordShort"));
    if (next !== repeat) return setError(t("accountSecurity.passwordMismatch"));
    setBusy(true);
    setError(null);
    try {
      await onSave({ newPassword: next, ...(hasPassword ? { currentPassword: current } : {}), signOutOfOtherSessions: others });
      setCurrent("");
      setNext("");
      setRepeat("");
      setSaved(true);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Block title={t("accountSecurity.password")}>
      <View className="gap-3 rounded-v2-card bg-v2-ink2 p-4">
        <Text className="font-v2-ui text-[13px] text-v2-c70">
          {hasPassword ? t("accountSecurity.passwordHintSet") : t("accountSecurity.passwordHintNone", { providers: providers.join(", ") || "Google" })}
        </Text>
        {hasPassword ? (
          <Labeled label={t("accountSecurity.currentPassword")}>
            <Input value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" accessibilityLabel={t("accountSecurity.currentPassword")} />
          </Labeled>
        ) : null}
        <Labeled label={t("accountSecurity.newPassword")}>
          <Input value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" accessibilityLabel={t("accountSecurity.newPassword")} />
        </Labeled>
        <Labeled label={t("accountSecurity.confirmPassword")}>
          <Input value={repeat} onChangeText={setRepeat} secureTextEntry autoComplete="new-password" accessibilityLabel={t("accountSecurity.confirmPassword")} />
        </Labeled>
        <SwitchRow title={t("accountSecurity.signOutOthers")} checked={others} onChange={setOthers} />
        {error ? <ErrorText>{error}</ErrorText> : null}
        {saved ? <SuccessNote>{t("accountSecurity.passwordSaved")}</SuccessNote> : null}
        <Button
          variant="primary"
          label={hasPassword ? t("accountSecurity.savePassword") : t("accountSecurity.setPassword")}
          onPress={() => void save()}
          disabled={busy || !next || !repeat || (hasPassword && !current)}
        />
      </View>
    </Block>
  );
}

function Devices({ load, errorText }: { load: () => Promise<ClerkSession[]>; errorText: (e: unknown) => string }) {
  const { t } = useI18n();
  const timeAgo = useTimeAgo();
  const currentId = useCurrentSessionId();
  const [sessions, setSessions] = useState<ClerkSession[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setSessions(await load());
    } catch (e) {
      setError(errorText(e));
      setSessions([]);
    }
  }, [load, errorText]);
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when the screen opens
  }, []);

  const revoke = async (s: ClerkSession) => {
    setBusy(s.id);
    setError(null);
    try {
      await s.revoke();
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const sorted = (sessions ?? []).slice().sort((a, b) => (a.id === currentId ? -1 : b.id === currentId ? 1 : new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()));
  return (
    <Block title={t("accountSecurity.devices")}>
      {sessions === null ? (
        <Skeleton width="100%" height={110} radius={16} />
      ) : (
        <Group>
          {sorted.map((s) => {
            const a = s.latestActivity ?? {};
            const name = [a.browserName, a.deviceType].filter(Boolean).join(" · ") || t("accountSecurity.unknownDevice");
            const where = [a.city, a.country].filter(Boolean).join(", ");
            const mine = s.id === currentId;
            return (
              <View key={s.id} className="flex-row items-center gap-3 px-4 py-3">
                <Icon name={a.isMobile ? "user" : "settings"} size={18} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-v2-ui-medium text-[15px] text-v2-cream">{name}</Text>
                  <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c50">
                    {[where, t("accountSecurity.lastActive", { when: timeAgo(new Date(s.lastActiveAt).toISOString()) })].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                {mine ? (
                  <StatusTag tone="good">{t("accountSecurity.thisDevice")}</StatusTag>
                ) : (
                  <Button small variant="ghost" label={t("accountSecurity.signOutDevice")} onPress={() => void revoke(s)} disabled={busy !== null} />
                )}
              </View>
            );
          })}
        </Group>
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Block>
  );
}
