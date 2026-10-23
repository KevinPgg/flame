/**
 * Door scanner v2 in the app (fase 1b.6, prototype "ow:scanner"): pick an event you can scan
 * with your account → camera → big colour-coded result → check in → recent scans.
 *
 * Access is by person (decisions 2026-10-16): members of the organizer or a co-host org and
 * people added to the event scan without any code. GET /api/qr-scanner/events lists exactly those
 * events; verify / check-in authorize with the session. The access code (phones without an
 * account) stays as the separate v1 public scanner, linked at the bottom of the picker.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Text, Vibration, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import {
  flameV2Colors as c,
  formatEventDateTime,
  isHappeningNow,
  parseTicketQr,
  scanErrorKind,
  scanResultKind,
  scannerEventList,
  type ScanResultKind,
  type VerifiedTicket,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiGet, apiPost } from "../../../lib/api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { Button, ErrorBox, Flyer, Icon, Skeleton } from "../ui";

export type ScanEvent = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  venue: string | null;
  city: string | null;
  timezone: string | null;
  image_url: string | null;
  organization_name: string | null;
};

type Ticket = VerifiedTicket & { attendee_email?: string | null };
type Result =
  | { kind: "checking" }
  | { kind: Exclude<ScanResultKind, "error"> | "checked_in"; ticket?: Ticket; promo?: boolean; message?: string }
  | { kind: "error"; message?: string };
type LogEntry = { at: number; name: string; kind: "checked_in" | "already" | "invalid" | "wrong_event" | "error" };

/** One id per app run, like the v1 scanner (the API logs it with each check-in). */
const DEVICE_ID = `app-scanner-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
export const PUBLIC_SCANNER_HREF = "/scanner?public=1";

export function ScannerApp({ onExit }: { onExit: () => void }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getToken } = useOptionalAuth();
  const params = useLocalSearchParams<{ event?: string }>();
  const eventId = (Array.isArray(params.event) ? params.event[0] : params.event) ?? null;

  const eventsQuery = useQuery<{ events: ScanEvent[] }>({
    queryKey: ["v2", "scanner-events"],
    queryFn: () => apiGet("/api/qr-scanner/events", getToken),
    staleTime: 60_000,
  });
  const events = useMemo(() => scannerEventList(eventsQuery.data?.events ?? []), [eventsQuery.data]);
  const event = events.find((e) => e.id === eventId) ?? null;
  const choose = useCallback((id: string | null) => router.setParams({ event: id ?? "" }), [router]);

  // Only one event on right now → open it directly.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || eventId || events.length === 0) return;
    const live = events.filter((e) => isHappeningNow(e));
    if (live.length === 1) {
      autoOpened.current = true;
      choose(live[0]!.id);
    }
  }, [eventId, events, choose]);

  return (
    <View className="flex-1 bg-v2-ink">
      <View style={{ paddingTop: insets.top }} className="border-b border-[#141414] bg-v2-ink">
        <View className="h-14 flex-row items-center gap-1 px-2">
          <Pressable
            onPress={() => (event ? choose(null) : onExit())}
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            hitSlop={6}
            className="h-10 w-10 items-center justify-center rounded-v2-sm active:bg-v2-c10"
          >
            <Icon name="back" size={22} color={c.cream} />
          </Pressable>
          <View className="min-w-0 flex-1 px-1">
            {event && <Text className="font-v2-ui text-[12px] text-v2-c50">{t("scanner.title")}</Text>}
            <Text numberOfLines={1} accessibilityRole="header" className="font-v2-display-bold text-[18px] tracking-[-0.5px] text-v2-cream">
              {event ? event.name : t("scanner.title")}
            </Text>
          </View>
          {event && <Button small label={t("scanner.changeEvent")} onPress={() => choose(null)} />}
        </View>
      </View>

      {eventsQuery.isError ? (
        <View className="px-4 pt-5">
          <ErrorBox message={t("scanner.loadError")} onRetry={() => void eventsQuery.refetch()} />
        </View>
      ) : eventsQuery.isLoading ? (
        <View className="gap-2 px-4 pt-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width="100%" height={76} radius={18} />
          ))}
        </View>
      ) : event ? (
        <ScanView key={event.id} event={event} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          <Text className="font-v2-display-bold text-[22px] tracking-[-0.6px] text-v2-cream">{t("scanner.pickTitle")}</Text>
          <Text className="mb-5 mt-1 font-v2-ui text-[14px] text-v2-c70">{t("scanner.pickLede")}</Text>
          {events.length === 0 ? (
            <Text className="rounded-v2-card bg-v2-ink2 px-5 py-10 text-center font-v2-ui text-[14px] leading-[20px] text-v2-c70">{t("scanner.none")}</Text>
          ) : (
            <View className="gap-2">
              {events.map((e) => {
                const when = formatEventDateTime(e.starts_at, e.timezone, locale);
                return (
                  <Pressable
                    key={e.id}
                    onPress={() => choose(e.id)}
                    accessibilityRole="button"
                    accessibilityLabel={e.name}
                    className="flex-row items-center gap-3 rounded-v2-card bg-v2-ink2 p-3 active:bg-v2-ink3"
                  >
                    <Flyer src={e.image_url} size={52} />
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="font-v2-ui-semibold text-[15px] text-v2-cream">{e.name}</Text>
                      <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c70">
                        {when.date} · {when.time}
                        {e.venue ? ` · ${e.venue}` : ""}
                      </Text>
                      {e.organization_name && <Text numberOfLines={1} className="font-v2-ui text-[12px] text-v2-c50">{e.organization_name}</Text>}
                    </View>
                    {isHappeningNow(e) && (
                      <View className="rounded-v2-pill bg-[rgba(76,215,135,0.15)] px-2.5 py-1">
                        <Text className="font-v2-ui-semibold text-[12px] text-v2-good">{t("scanner.now")}</Text>
                      </View>
                    )}
                    <Icon name="chev" size={16} color={c.c50} />
                  </Pressable>
                );
              })}
            </View>
          )}
          <Pressable onPress={() => router.push(PUBLIC_SCANNER_HREF as Href)} accessibilityRole="link" className="mt-6 items-center py-2">
            <Text className="font-v2-ui text-[13px] text-v2-c50 underline">{t("scanner.codeLink")}</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

function ScanView({ event }: { event: ScanEvent }) {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const { getToken } = useOptionalAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOn, setCameraOn] = useState(false);
  const [torch, setTorch] = useState(false);
  // Turning the flash off remounts the camera: on some Android phones the torch didn't switch off
  // through the prop alone (Kevin, 2026-10-23). A new camera always starts with the torch off.
  const [cameraKey, setCameraKey] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const lastText = useRef<{ text: string; at: number } | null>(null);
  const handling = useRef(false);

  const addLog = (name: string, kind: LogEntry["kind"]) => setLog((l) => [{ at: Date.now(), name, kind }, ...l].slice(0, 20));
  const time = (iso: string | number) => {
    try {
      return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: event.timezone || undefined }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleTimeString();
    }
  };

  const toggleTorch = () => {
    if (torch) {
      setTorch(false);
      setCameraKey((k) => k + 1);
    } else {
      setTorch(true);
    }
  };

  const startCamera = async () => {
    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) return;
    }
    setCameraOn(true);
  };

  const stopCamera = () => {
    setCameraOn(false);
    setResult(null);
    if (torch) {
      setTorch(false);
      setCameraKey((k) => k + 1);
    }
  };

  const onScanned = async ({ data }: BarcodeScanningResult) => {
    // One result at a time; the same QR within 3 s is the camera seeing it again.
    if (result || busy || handling.current) return;
    const now = Date.now();
    if (lastText.current && lastText.current.text === data && now - lastText.current.at < 3000) return;
    const qr = parseTicketQr(data);
    if (!qr) return;
    handling.current = true;
    lastText.current = { text: data, at: now };
    Vibration.vibrate(150);
    try {
      if (qr.eventId !== event.id) {
        setResult({ kind: "wrong_event" });
        addLog("—", "wrong_event");
        return;
      }
      setResult({ kind: "checking" });
      try {
        const json = await apiPost<{ ticket?: Ticket; isPromotionalTicket?: boolean }>(
          "/api/qr-scanner/verify",
          { qrData: qr as unknown as Record<string, unknown>, deviceId: DEVICE_ID },
          getToken,
        );
        if (!json?.ticket) {
          setResult({ kind: "error" });
          addLog("—", "error");
          return;
        }
        const kind = scanResultKind(json.ticket);
        setResult({ kind: kind === "error" ? "invalid" : kind, ticket: json.ticket, promo: json.isPromotionalTicket === true } as Result);
        if (kind !== "valid") addLog(json.ticket.attendee_name ?? "—", kind === "already" ? "already" : "invalid");
      } catch (e) {
        const err = e as { status?: number; message?: string };
        const kind = scanErrorKind(err.status ?? 500);
        setResult({ kind, message: err.message } as Result);
        addLog("—", kind === "already" ? "already" : kind === "invalid" ? "invalid" : "error");
      }
    } finally {
      handling.current = false;
    }
  };

  const checkIn = async () => {
    if (!result || result.kind !== "valid" || !result.ticket) return;
    setBusy(true);
    const ticket = result.ticket;
    const name = ticket.attendee_name ?? "—";
    try {
      const json = await apiPost<{ checked_in_at?: string }>(
        "/api/qr-scanner/checkin",
        { ticketId: ticket.id, deviceId: DEVICE_ID, isPromotionalTicket: result.promo === true },
        getToken,
      );
      setResult({ kind: "checked_in", ticket: { ...ticket, checked_in_at: json?.checked_in_at ?? new Date().toISOString() } });
      addLog(name, "checked_in");
    } catch (e) {
      const err = e as { status?: number; message?: string };
      if (err.status === 409) {
        setResult({ kind: "already", ticket });
        addLog(name, "already");
      } else {
        setResult({ kind: "error", message: err.message });
        addLog(name, "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const denied = permission && !permission.granted && !permission.canAskAgain;
  const tone =
    result?.kind === "valid" || result?.kind === "checked_in"
      ? "bg-[#0f2f1f] border-[rgba(76,215,135,0.5)]"
      : result?.kind === "already"
        ? "bg-[#33260e] border-[rgba(255,180,67,0.5)]"
        : result?.kind === "checking"
          ? "bg-v2-ink2 border-v2-c10"
          : "bg-[#3a0a12] border-v2-flame";
  const headline = (r: Result) =>
    r.kind === "checking"
      ? t("scanner.checking")
      : r.kind === "valid"
        ? t("scanner.valid")
        : r.kind === "checked_in"
          ? t("scanner.checkedIn")
          : r.kind === "already"
            ? t("scanner.already")
            : r.kind === "wrong_event"
              ? t("scanner.wrongEvent")
              : r.kind === "invalid"
                ? t("scanner.invalid")
                : t("scanner.error");

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}>
      <View className="overflow-hidden rounded-v2-card bg-v2-ink2">
        <View style={{ aspectRatio: 3 / 4, maxHeight: 520 }} className="w-full bg-black">
          {cameraOn && !denied ? (
            <>
              <CameraView
                key={cameraKey}
                testID="scanner-camera"
                style={{ flex: 1 }}
                facing="back"
                enableTorch={torch}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={result ? undefined : onScanned}
              />
              {!result && (
                <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
                  <View style={{ width: "62%", aspectRatio: 1 }} className="rounded-v2-card border-2 border-white/80" />
                </View>
              )}
            </>
          ) : (
            <View className="flex-1 items-center justify-center gap-2 p-6">
              <Icon name="scan" size={30} color={c.c70} />
              {denied ? (
                <>
                  <Text className="text-center font-v2-ui text-[14px] leading-[20px] text-v2-c70">{t("scanner.cameraDenied")}</Text>
                  <View className="mt-2">
                    <Button variant="primary" label={t("scanner.openSettings")} onPress={() => void Linking.openSettings()} />
                  </View>
                </>
              ) : (
                <>
                  <Text className="font-v2-ui-semibold text-[16px] text-v2-cream">{t("scanner.ready")}</Text>
                  <Text className="max-w-[280px] text-center font-v2-ui text-[13px] text-v2-c70">{t("scanner.readyHint")}</Text>
                  <View className="mt-2">
                    <Button variant="primary" label={t("scanner.activate")} onPress={() => void startCamera()} />
                  </View>
                </>
              )}
            </View>
          )}

          {result && (
            <View accessibilityRole="alert" accessibilityLiveRegion="assertive" className={`absolute bottom-3 left-3 right-3 rounded-v2-card border p-4 ${tone}`}>
              <Text className="font-v2-display-bold text-[20px] tracking-[-0.4px] text-v2-cream">{headline(result)}</Text>
              {"ticket" in result && result.ticket && (
                <View className="mt-1">
                  <Text className="font-v2-ui-semibold text-[14px] text-v2-c90">{result.ticket.attendee_name}</Text>
                  <Text className="font-v2-ui text-[14px] text-v2-c70">
                    {result.ticket.ticket_tier?.name}
                    {result.ticket.order && result.ticket.order.quantity > 1 && result.ticket.sequence_number
                      ? ` · ${t("scanner.ticketOf", { n: result.ticket.sequence_number, total: result.ticket.order.quantity })}`
                      : ""}
                  </Text>
                  {result.kind === "already" && result.ticket.checked_in_at && (
                    <Text className="font-v2-ui text-[14px] text-v2-warn">{t("scanner.alreadyAt", { time: time(result.ticket.checked_in_at) })}</Text>
                  )}
                </View>
              )}
              {"message" in result && result.message && result.kind !== "already" ? (
                <Text className="mt-1 font-v2-ui text-[13px] text-v2-c70">{result.message}</Text>
              ) : null}
              {result.kind !== "checking" && (
                <View className="mt-3 flex-row gap-2">
                  {result.kind === "valid" && (
                    <Pressable
                      onPress={() => void checkIn()}
                      disabled={busy}
                      accessibilityRole="button"
                      className={`h-12 flex-[1.5] flex-row items-center justify-center gap-2 rounded-v2-pill bg-v2-good px-4 ${busy ? "opacity-60" : ""}`}
                    >
                      <Icon name="check" size={18} color="#000" />
                      <Text className="font-v2-ui-bold text-[15px] text-black">{busy ? t("scanner.checkingIn") : t("scanner.checkIn")}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => setResult(null)}
                    accessibilityRole="button"
                    className="h-12 flex-1 items-center justify-center rounded-v2-pill bg-black/40 px-4"
                  >
                    <Text className="font-v2-ui-semibold text-[14px] text-v2-cream">{t("scanner.scanNext")}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>

        {cameraOn && !denied && (
          <View className="flex-row flex-wrap items-center gap-2 p-3">
            <Button
              small
              label={torch ? t("scanner.torchOff") : t("scanner.torchOn")}
              accessibilityLabel={torch ? t("scanner.torchOff") : t("scanner.torchOn")}
              onPress={toggleTorch}
              variant={torch ? "primary" : "soft"}
            />
            <View className="flex-1" />
            <Button small label={t("scanner.stop")} onPress={stopCamera} />
          </View>
        )}
      </View>

      <View>
        <Text className="mb-2 font-v2-ui-semibold text-[12px] uppercase tracking-[0.6px] text-v2-c50">{t("scanner.recent")}</Text>
        {log.length === 0 ? (
          <Text className="rounded-v2-card bg-v2-ink2 px-4 py-8 text-center font-v2-ui text-[13px] text-v2-c50">{t("scanner.recentEmpty")}</Text>
        ) : (
          <View className="overflow-hidden rounded-v2-card bg-v2-ink2">
            {log.map((l, i) => (
              <View key={l.at} className={`flex-row items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-v2-c06" : ""}`}>
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-v2-ui-semibold text-[14px] text-v2-cream">{l.name}</Text>
                  <Text className="font-v2-ui text-[12px] text-v2-c50">{time(l.at)}</Text>
                </View>
                <View
                  className={`rounded-v2-pill px-2.5 py-1 ${
                    l.kind === "checked_in" ? "bg-[rgba(76,215,135,0.15)]" : l.kind === "already" ? "bg-[rgba(255,180,67,0.15)]" : "bg-[rgba(136,5,23,0.3)]"
                  }`}
                >
                  <Text className={`font-v2-ui-semibold text-[12px] ${l.kind === "checked_in" ? "text-v2-good" : l.kind === "already" ? "text-v2-warn" : "text-v2-cream"}`}>
                    {l.kind === "checked_in"
                      ? t("scanner.checkedIn")
                      : l.kind === "already"
                        ? t("scanner.already")
                        : l.kind === "wrong_event"
                          ? t("scanner.wrongEvent")
                          : l.kind === "invalid"
                            ? t("scanner.invalid")
                            : t("scanner.error")}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
