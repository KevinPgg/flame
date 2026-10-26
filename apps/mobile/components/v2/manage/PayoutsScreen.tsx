/**
 * Payouts (prototype "ow:payouts", phone view; same APIs and rules as the web PayoutsView): the
 * organization's real Stripe balance — available / available soon per currency, request a payout
 * (one idempotency key per confirmation), history, bank on file, open Stripe. Before that: connect
 * (with country) or finish the Stripe setup. Stripe opens in the browser; coming back to the app
 * re-reads the status (useStripeConnect).
 */
import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_CONNECT_COUNTRY,
  STRIPE_CONNECT_COUNTRIES,
  balanceRows,
  canManagePayouts,
  connectState,
  flameV2Colors as c,
  formatCentsAsPrice,
  payoutMinimumCents,
  payoutTone,
  type BalanceRow,
  type StripeMoney,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiGet, apiPost } from "../../../lib/api";
import { routes } from "../../../lib/v2/routes";
import { apiErrorText, type MyOrganization } from "../../../lib/v2/organizer-api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { useOrganizerModel } from "../../../hooks/v2/useOrganizerModel";
import { useStripeConnect } from "../../../hooks/useStripeConnect";
import { OrganizerShell, TABBAR_SPACE } from "../OrganizerShell";
import { Button, ConfirmDialog, ErrorBox, ErrorText, Icon, Skeleton, SuccessNote } from "../ui";
import { Group, SelectRow } from "../form/ui";

type Payout = { id: string; amount: number; currency: string; status: string; arrival_date: number | null; created: number; automatic: boolean };
type Summary =
  | { connected: false }
  | {
      connected: true;
      defaultCurrency: string;
      schedule: string | null;
      balance: { available: StripeMoney[]; pending: StripeMoney[] };
      payouts: Payout[];
      bank: { bankName: string | null; last4: string | null; currency: string | null } | null;
    };

const PAYOUT_STATUSES = ["paid", "pending", "in_transit", "canceled", "failed"] as const;
const isPayoutStatus = (s: string): s is (typeof PAYOUT_STATUSES)[number] => (PAYOUT_STATUSES as readonly string[]).includes(s);
const newKey = () => `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

export function payoutsKey(orgId: string) {
  return ["v2", "payouts-summary", orgId];
}

export function PayoutsScreen({ organization }: { organization: MyOrganization }) {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { model } = useOrganizerModel(organization);
  const allowed = canManagePayouts(organization.role);
  const stripe = useStripeConnect(allowed ? organization.id : undefined);
  const state = stripe.status ? connectState(stripe.status) : null;
  const back = () => (router.canGoBack() ? router.back() : router.replace(routes.manage(organization) as Href));

  let body: React.ReactNode;
  if (!allowed) body = <ErrorBox message={t("payouts.ownersOnly")} onRetry={back} retryLabel={t("common.back")} />;
  else if (stripe.isLoading) body = <Skeleton width="100%" height={180} radius={16} />;
  else if (stripe.fetchError || !state) body = <ErrorBox onRetry={() => void stripe.refreshStatus()} />;
  else if (state === "not_connected") body = <ConnectCard orgName={organization.name} opening={stripe.onboarding} error={stripe.onboardError} onConnect={(country) => void stripe.handleConnect(country)} />;
  else if (state === "incomplete")
    body = (
      <IncompleteCard
        orgName={organization.name}
        charges={Boolean(stripe.status?.chargesEnabled)}
        payouts={Boolean(stripe.status?.payoutsEnabled)}
        opening={stripe.onboarding}
        error={stripe.onboardError}
        onFinish={() => void stripe.handleConnect()}
      />
    );
  else body = <Balance organization={organization} opening={stripe.onboarding} onboardError={stripe.onboardError} onManage={() => void stripe.handleConnect()} />;

  return (
    <OrganizerShell organization={organization} pending={model?.pending ?? 0} section="manage" title={t("payouts.title")} onBack={back}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: TABBAR_SPACE + insets.bottom }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void stripe.refreshStatus()} tintColor={c.cream} />}
      >
        <Text className="font-v2-ui text-[14px] leading-[20px] text-v2-c70">{t("payouts.lede", { org: organization.name })}</Text>
        {body}
      </ScrollView>
    </OrganizerShell>
  );
}

function Card({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return <View className={`gap-3 rounded-v2-card bg-v2-ink2 p-4 ${highlight ? "border border-v2-flame" : ""}`}>{children}</View>;
}

function ConnectCard({ orgName, opening, error, onConnect }: { orgName: string; opening: boolean; error: string | null; onConnect: (country: string) => void }) {
  const { t } = useI18n();
  const [country, setCountry] = useState<string>(DEFAULT_CONNECT_COUNTRY);
  return (
    <Card>
      <View className="flex-row items-start gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-v2-md bg-v2-ink3">
          <Icon name="bank" size={20} />
        </View>
        <View className="flex-1">
          <Text className="font-v2-ui-semibold text-[17px] text-v2-cream">{t("payouts.connectTitle")}</Text>
          <Text className="mt-1 font-v2-ui text-[13.5px] leading-[19px] text-v2-c70">{t("payouts.connectLede", { org: orgName })}</Text>
        </View>
      </View>
      <View className="overflow-hidden rounded-v2-md border border-v2-c10">
        <Group>
          <SelectRow label={t("payouts.country")} value={country} options={STRIPE_CONNECT_COUNTRIES.map((x) => ({ value: x.code, label: x.name }))} onChange={setCountry} />
        </Group>
      </View>
      <Text className="font-v2-ui text-[12.5px] text-v2-c50">{t("payouts.countryHint")}</Text>
      <Button variant="primary" label={opening ? t("payouts.opening") : t("payouts.connect")} onPress={() => onConnect(country)} disabled={opening} />
      {error ? <ErrorText>{t("payouts.onboardError")}</ErrorText> : null}
    </Card>
  );
}

function IncompleteCard({ orgName, charges, payouts, opening, error, onFinish }: { orgName: string; charges: boolean; payouts: boolean; opening: boolean; error: string | null; onFinish: () => void }) {
  const { t } = useI18n();
  const item = (ok: boolean, label: string) => (
    <View className="flex-row items-center gap-2">
      <Icon name={ok ? "check" : "alert"} size={16} color={ok ? c.good : c.warn} />
      <Text className="font-v2-ui text-[14px] text-v2-c90">{label}</Text>
    </View>
  );
  return (
    <Card>
      <Text className="font-v2-ui-semibold text-[17px] text-v2-cream">{t("payouts.incompleteTitle")}</Text>
      <Text className="font-v2-ui text-[13.5px] leading-[19px] text-v2-c70">{t("payouts.incompleteLede", { org: orgName })}</Text>
      {item(charges, t("payouts.charges"))}
      {item(payouts, t("payouts.payoutsEnabled"))}
      <Button variant="primary" label={opening ? t("payouts.opening") : t("payouts.finish")} onPress={onFinish} disabled={opening} />
      {error ? <ErrorText>{t("payouts.onboardError")}</ErrorText> : null}
    </Card>
  );
}

function Balance({ organization, opening, onboardError, onManage }: { organization: MyOrganization; opening: boolean; onboardError: string | null; onManage: () => void }) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const { getToken } = useOptionalAuth();
  const key = payoutsKey(organization.id);
  const summary = useQuery<Summary>({
    queryKey: key,
    queryFn: () => apiGet(`/api/organizer/payouts/summary?organizationId=${encodeURIComponent(organization.id)}`, getToken),
  });
  const [confirm, setConfirm] = useState<{ row: BalanceRow; idempotencyKey: string } | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  if (summary.isLoading) return <Skeleton width="100%" height={220} radius={16} />;
  if (summary.isError || !summary.data || !summary.data.connected) {
    return (
      <View className="gap-3">
        <Text className="font-v2-ui text-[13.5px] text-v2-c70">{t("payouts.loadError")}</Text>
        <ErrorBox onRetry={() => void summary.refetch()} />
      </View>
    );
  }
  const data = summary.data;
  const rows = balanceRows(data.balance, data.defaultCurrency);
  const money = (cents: number, cur: string) => formatCentsAsPrice(cents, cur);
  const bankLabel = data.bank ? [data.bank.bankName, data.bank.last4 ? `•• ${data.bank.last4}` : null].filter(Boolean).join(" ") : null;
  const date = (unix: number | null) =>
    unix ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(unix * 1000)) : "—";

  const request = async () => {
    if (!confirm) return;
    setRequesting(true);
    setRequestError(null);
    setNotice(null);
    try {
      const json = await apiPost<{ payout?: { amount: number; currency: string } }>(
        "/api/organizer/payouts/create",
        { organizationId: organization.id, currency: confirm.row.currency, clientIdempotencyKey: confirm.idempotencyKey },
        getToken,
      );
      if (json.payout) setNotice(t("payouts.requested", { amount: money(json.payout.amount, json.payout.currency) }));
      else setRequestError(t("payouts.requestError"));
    } catch (e) {
      const status = (e as { status?: number }).status;
      // 409 = one already in progress; 400 carries the reason (minimum, no funds).
      setRequestError(status === 409 ? t("payouts.inProgress") : status === 400 ? apiErrorText(e, t("payouts.requestError")) : t("payouts.requestError"));
    } finally {
      setRequesting(false);
      setConfirm(null);
      await queryClient.invalidateQueries({ queryKey: key });
    }
  };

  return (
    <View className="gap-5">
      {notice ? <SuccessNote>{notice}</SuccessNote> : null}
      {requestError ? <ErrorText>{requestError}</ErrorText> : null}

      {rows.map((row) => (
        <View key={row.currency} className="gap-3" testID={`balance-${row.currency}`}>
          <Card highlight>
            <Text className="font-v2-ui-semibold text-[12.5px] text-v2-c50">
              {t("payouts.available")}
              {rows.length > 1 ? ` · ${row.currency}` : ""}
            </Text>
            <Text className="font-v2-display-bold text-[30px] tracking-[-0.6px] text-v2-cream">{money(row.available, row.currency)}</Text>
            {row.available < 0 ? (
              <Text className="font-v2-ui text-[12px] text-v2-c50">{t("payouts.negative")}</Text>
            ) : (
              <>
                <Button
                  variant="primary"
                  label={requesting && confirm?.row.currency === row.currency ? t("payouts.requesting") : t("payouts.request")}
                  disabled={!row.canPayout || requesting}
                  onPress={() => {
                    setRequestError(null);
                    setConfirm({ row, idempotencyKey: newKey() });
                  }}
                />
                {!row.canPayout && <Text className="font-v2-ui text-[12px] text-v2-c50">{t("payouts.belowMinimum", { min: money(payoutMinimumCents(row.currency), row.currency) })}</Text>}
              </>
            )}
          </Card>
          <Card>
            <Text className="font-v2-ui-semibold text-[12.5px] text-v2-c50">
              {t("payouts.soon")}
              {rows.length > 1 ? ` · ${row.currency}` : ""}
            </Text>
            <Text className="font-v2-display-bold text-[24px] tracking-[-0.5px] text-v2-cream">{money(row.pending, row.currency)}</Text>
            <View className="flex-row items-center gap-1.5">
              <Icon name="clock" size={13} color={c.c50} />
              <Text className="flex-1 font-v2-ui text-[12px] text-v2-c50">{t("payouts.soonNote")}</Text>
            </View>
          </Card>
        </View>
      ))}

      <View>
        <Text className="mb-2 font-v2-ui-semibold text-[12px] uppercase tracking-[0.7px] text-v2-c50">{t("payouts.history")}</Text>
        {data.payouts.length === 0 ? (
          <View className="rounded-v2-card bg-v2-ink2 px-4 py-8">
            <Text className="text-center font-v2-ui text-[14px] text-v2-c50">{t("payouts.historyEmpty")}</Text>
          </View>
        ) : (
          <View className="overflow-hidden rounded-v2-card bg-v2-ink2">
            {data.payouts.map((p, i) => {
              const tone = payoutTone(p.status);
              const [bg, fg] =
                tone === "good" ? ["bg-[rgba(76,215,135,0.15)]", "text-v2-good"] : tone === "warn" ? ["bg-[rgba(255,180,67,0.15)]", "text-v2-warn"] : tone === "bad" ? ["bg-[rgba(136,5,23,0.45)]", "text-v2-errorText"] : ["bg-v2-ink3", "text-v2-c70"];
              return (
                <View key={p.id} className={`flex-row items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-v2-c06" : ""}`}>
                  <View className="min-w-0 flex-1 gap-1">
                    <Text className="font-v2-ui-semibold text-[14px] text-v2-cream">
                      {p.status === "paid" ? t("payouts.arrived", { date: date(p.arrival_date) }) : t("payouts.arrives", { date: date(p.arrival_date) })}
                      {p.automatic ? <Text className="font-v2-ui text-[12px] text-v2-c50">  {t("payouts.automatic")}</Text> : null}
                    </Text>
                    <View className={`self-start rounded-v2-pill px-2.5 py-0.5 ${bg}`}>
                      <Text className={`font-v2-ui text-[12px] ${fg}`}>{isPayoutStatus(p.status) ? t(`payouts.statuses.${p.status}`) : p.status}</Text>
                    </View>
                  </View>
                  <Text className="font-v2-ui-semibold text-[14px] text-v2-cream">{money(p.amount, p.currency)}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <Card>
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-v2-md bg-[#635BFF]">
            <Text className="font-v2-ui-bold text-[15px] text-white">S</Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="font-v2-ui-semibold text-[14px] text-v2-cream">{t("payouts.bankTitle")}</Text>
            <Text className="font-v2-ui text-[13px] text-v2-c50">
              {bankLabel ?? t("payouts.bankNone")} · {t("payouts.viaStripe")}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center justify-between gap-3">
          <View className="rounded-v2-pill bg-[rgba(76,215,135,0.15)] px-2.5 py-1">
            <Text className="font-v2-ui text-[12px] text-v2-good">{t("payouts.connected")}</Text>
          </View>
          <Button small label={opening ? t("payouts.opening") : t("payouts.manage")} onPress={onManage} disabled={opening} />
        </View>
        {onboardError ? <ErrorText>{t("payouts.onboardError")}</ErrorText> : null}
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        message={confirm ? t("payouts.confirmTitle", { amount: money(confirm.row.available, confirm.row.currency) }) : ""}
        detail={confirm ? t("payouts.confirmDetail", { currency: confirm.row.currency, bank: bankLabel ?? t("payouts.yourBank") }) : ""}
        confirmLabel={t("payouts.request")}
        busy={requesting}
        onConfirm={() => void request()}
        onCancel={() => setConfirm(null)}
      />
    </View>
  );
}

