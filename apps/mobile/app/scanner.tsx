/**
 * QR Scanner screen — expo-camera barcode scanner for ticket check-in.
 *
 * Web source: apps/web/app/components/QRScannerApp.tsx
 * Web access code management: apps/web/app/components/modals/QRScannerModal.tsx
 * Web access code entry: apps/web/app/components/modals/EnterCodeModal.tsx
 *
 * Two modes (driven by `?public=1` search param):
 *
 *   • **Owner/Admin/Organizer (default)** — requires sign-in, resolves org via
 *     useOrgData, optionally exposes the Access Codes management tab.
 *
 *   • **Public (`?public=1`)** — accessible to non-signed-in staff from the
 *     mobile settings screen. Skips the auth gate, skips org resolution, and
 *     hides the Access Codes management tab. The access code itself is the
 *     credential — verify/checkin/validate-code already accept this on web.
 *
 * Two-tab layout:
 *   1. Access Codes — manage access codes per event (mirrors web's QRScannerModal)
 *   2. QR Scanner  — enter access code → camera scanning (mirrors web's EnterCodeModal + QRScannerApp)
 *
 * All scanner writes go through web API endpoints via lib/api.ts.
 *
 * P8-3 overhaul (Mar 2026):
 *   a. Removed OrgSelector — org comes from useOrgData (selected before navigation)
 *   b. Added Access Codes (management) / QR Scanner (entry + scan) tabs
 *   c. Fixed text colors to use design system white variants
 *   d. Removed ManualCodeEntry (not in web)
 *   e. Camera lens switching deferred (not available in expo-camera ~17.0.10)
 *   f. "Scan Next Ticket" returns to live camera, not idle
 *   g. Full design system review applied
 *
 * v1.0.13 (Apr 2026): Public mode added — see CHANGELOG_IOS_VERSIONS.md.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult } from "expo-camera";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { colors } from "@project-flame/ui";
import { useQRScanner } from "../hooks/useQRScanner";
import type { TicketDetails } from "../hooks/useQRScanner";
import { RequireAuthGate } from "../hooks/useRequireAuth";
import { useOrgData } from "../hooks/useOrgData";
import { useOrgEvents } from "../hooks/useOrgEvents";
import type { OrgEvent } from "../hooks/useOrgEvents";
import { useUpdateEvent } from "../hooks/useUpdateEvent";
import { useMemberRoleContext } from "../contexts/MemberRoleContext";
import { canManageAccessCodes } from "@project-flame/lib";
import { getTabBarPaddingBottom } from "../components/navigation/CustomTabBar";
import {
  filterActiveEvents,
  sanitizeAccessCodeInput,
  validateAccessCode,
} from "@project-flame/lib";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEVICE_ID = `mobile-scanner-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScannerTab = "access-codes" | "qr-scanner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TicketDetailsCard({ ticket }: { ticket: TicketDetails }) {
  return (
    <View className="bg-white-10 border border-white-20 rounded-card p-4 gap-3">
      <Text className="text-white-100 text-lg font-poppins-semibold">
        {ticket.attendee_name}
      </Text>
      <Text className="text-white-50 text-sm font-poppins">
        {ticket.attendee_email}
      </Text>

      <View className="gap-2 mt-1">
        <DetailRow
          icon="ticket-outline"
          text={
            ticket.order?.quantity && ticket.order.quantity > 1
              ? `Ticket ${ticket.sequence_number || 1} of ${ticket.order.quantity}`
              : "Ticket 1"
          }
        />
        <DetailRow
          icon="account-outline"
          text={
            ticket.ticket_tier.name +
            (ticket.metadata?.stage_name
              ? ` - ${ticket.metadata.stage_name}`
              : "")
          }
        />
        <DetailRow
          icon="calendar-outline"
          text={formatDate(ticket.events.starts_at)}
        />
        <DetailRow
          icon="clock-outline"
          text={formatTime(ticket.events.starts_at)}
        />
      </View>

      <View className="bg-white-5 rounded-lg p-3 mt-1">
        <Text className="text-white-100 text-base font-poppins-semibold">
          {ticket.events.name}
        </Text>
        <Text className="text-white-50 text-sm font-poppins mt-1">
          {ticket.events.venue}
        </Text>
      </View>
    </View>
  );
}

function DetailRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <MaterialCommunityIcons
        name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
        size={16}
        color={colors["white-50"]}
      />
      <Text className="text-white-80 text-sm font-poppins">{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Scanner Tabs
// ---------------------------------------------------------------------------

function ScannerTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: ScannerTab;
  onTabChange: (tab: ScannerTab) => void;
}) {
  const tabs: { id: ScannerTab; label: string }[] = [
    { id: "access-codes", label: "Access Codes" },
    { id: "qr-scanner", label: "QR Scanner" },
  ];

  return (
    <View className="flex-row items-center px-4 py-[2px] gap-[6px]">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <Pressable
            key={tab.id}
            className={`flex-1 items-center justify-center p-2 ${
              isActive ? "border-b-[1.5px] border-white-100" : ""
            }`}
            onPress={() => onTabChange(tab.id)}
          >
            <Text
              className={`text-base leading-[22px] font-poppins ${
                isActive ? "text-white-100" : "text-white-80"
              }`}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Access Code Management Tab — mirrors web's QRScannerModal.tsx
// ---------------------------------------------------------------------------

function AccessCodesManagement({
  orgId,
  contentPaddingBottom = 32,
}: {
  orgId: string | null;
  contentPaddingBottom?: number;
}) {
  const { data: allEvents, isLoading } = useOrgEvents(orgId);
  const updateEvent = useUpdateEvent();
  // Only show future/current events (not ended) — past events don't need access codes
  const events = useMemo(
    () => (allEvents ? filterActiveEvents(allEvents) : undefined),
    [allEvents],
  );

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = null;
      }
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = null;
      }
    };
  }, []);

  const selectedEvent = useMemo(
    () => events?.find((e) => e.id === selectedEventId) ?? null,
    [selectedEventId, events],
  );

  const handleSelectEvent = useCallback(
    (event: OrgEvent) => {
      if (selectedEventId === event.id) {
        setSelectedEventId(null);
        setCodeInput("");
      } else {
        setSelectedEventId(event.id);
        setCodeInput(event.qr_scanner_code ?? "");
      }
      setError("");
      setSuccess("");
    },
    [selectedEventId],
  );

  const handleSave = useCallback(() => {
    if (!selectedEventId) {
      setError("Please select an event");
      return;
    }

    const validation = validateAccessCode(codeInput);
    if (!validation.valid) {
      setError(validation.error ?? "Invalid code");
      return;
    }

    setError("");
    updateEvent.mutate(
      { id: selectedEventId, qr_scanner_code: codeInput || "" },
      {
        onSuccess: () => {
          if (successTimeoutRef.current) {
            clearTimeout(successTimeoutRef.current);
            successTimeoutRef.current = null;
          }
          setSuccess("Access code updated successfully");
          successTimeoutRef.current = setTimeout(() => {
            setSuccess("");
            successTimeoutRef.current = null;
          }, 3000);
        },
        onError: (err) => {
          setError(err.message || "Failed to update code");
        },
      },
    );
  }, [selectedEventId, codeInput, updateEvent]);

  const handleCopy = useCallback(
    async (code: string, eventId: string) => {
      try {
        await Clipboard.setStringAsync(code);
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
          copyTimeoutRef.current = null;
        }
        setCopiedId(eventId);
        copyTimeoutRef.current = setTimeout(() => {
          setCopiedId(null);
          copyTimeoutRef.current = null;
        }, 2000);
      } catch {
        Alert.alert("Copy failed", "Could not copy to clipboard.");
      }
    },
    [],
  );

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text className="text-white-50 text-sm font-poppins mt-3">
          Loading events...
        </Text>
      </View>
    );
  }

  if (!events || events.length === 0) {
    return (
      <View className="flex-1 justify-center items-center px-6 gap-3">
        <Ionicons name="calendar-outline" size={48} color={colors["white-30"]} />
        <Text className="text-white-100 text-lg font-poppins-semibold text-center">
          No Events Found
        </Text>
        <Text className="text-white-50 text-sm font-poppins text-center">
          Create an event first, then come back to set up scanner access codes.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: contentPaddingBottom,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Code Editor — shown when an event is selected */}
      {selectedEvent && (
        <View className="bg-white-10 border border-white-20 rounded-card p-4 gap-3 mt-4">
          <Text className="text-white-100 text-base font-poppins-semibold">
            {selectedEvent.name}
          </Text>

          <View className="gap-1">
            <Text className="text-white-50 text-xs font-poppins-medium uppercase tracking-wider">
              Access Code (4-8 characters)
            </Text>
            <TextInput
              className="bg-white-5 border border-white-20 rounded-lg px-4 py-3 text-white-100 text-center text-lg font-poppins-semibold tracking-widest"
              value={codeInput}
              onChangeText={(text) => {
                setCodeInput(sanitizeAccessCodeInput(text));
                setError("");
              }}
              placeholder="CODE123"
              placeholderTextColor={colors["white-30"]}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
          </View>

          {error ? (
            <Text className="text-red-400 text-sm font-poppins text-center">
              {error}
            </Text>
          ) : null}

          {success ? (
            <View className="flex-row items-center justify-center gap-1">
              <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
              <Text className="text-green-400 text-sm font-poppins">
                {success}
              </Text>
            </View>
          ) : null}

          <View className="flex-row gap-2">
            <Pressable
              onPress={() => {
                setSelectedEventId(null);
                setCodeInput("");
                setError("");
                setSuccess("");
              }}
              className="flex-1 border border-white-20 rounded-full py-3 items-center"
            >
              <Text className="text-white-80 text-sm font-poppins-semibold">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={updateEvent.isPending}
              className={`flex-1 rounded-full py-3 items-center ${
                updateEvent.isPending
                  ? "bg-white-100 opacity-60"
                  : "bg-white-100"
              }`}
            >
              {updateEvent.isPending ? (
                <ActivityIndicator color={colors.dark} size="small" />
              ) : (
                <Text
                  style={{ color: colors.dark }}
                  className="text-sm font-poppins-semibold"
                >
                  Save Code
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {/* All Event Codes */}
      <View className="mt-4 gap-2">
        <Text className="text-white-80 text-sm font-poppins-semibold px-1">
          All Event Codes
        </Text>
        {events.map((event) => (
          <EventCodeRow
            key={event.id}
            event={event}
            isSelected={selectedEventId === event.id}
            isCopied={copiedId === event.id}
            onSelect={() => handleSelectEvent(event)}
            onCopy={() => {
              if (event.qr_scanner_code) {
                handleCopy(event.qr_scanner_code, event.id);
              }
            }}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function EventCodeRow({
  event,
  isSelected,
  isCopied,
  onSelect,
  onCopy,
}: {
  event: OrgEvent;
  isSelected: boolean;
  isCopied: boolean;
  onSelect: () => void;
  onCopy: () => void;
}) {
  // Two separate touch areas (no nested Pressables) so copy and select never both fire
  return (
    <View
      className={`bg-white-10 border rounded-card p-4 flex-row items-center justify-between ${
        isSelected ? "border-white-100" : "border-white-20"
      }`}
    >
      <Pressable
        onPress={onSelect}
        className="flex-1 mr-3"
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Text
          className="text-white-100 text-base font-poppins-semibold"
          numberOfLines={1}
        >
          {event.name}
        </Text>
        <Text className="text-white-50 text-xs font-poppins mt-1">
          {new Date(event.starts_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </Text>
      </Pressable>

      {event.qr_scanner_code ? (
        <Pressable
          onPress={onCopy}
          className="flex-row items-center gap-2 bg-white-5 rounded-lg px-3 py-2"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text className="text-white-100 text-sm font-poppins-semibold tracking-wider">
            {event.qr_scanner_code}
          </Text>
          <Ionicons
            name={isCopied ? "checkmark" : "copy-outline"}
            size={16}
            color={isCopied ? "#22c55e" : colors["white-50"]}
          />
        </Pressable>
      ) : (
        <Pressable
          onPress={onSelect}
          className="py-2"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text className="text-white-30 text-sm font-poppins">No code set</Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Access Code Entry — mirrors web's EnterCodeModal (for QR Scanner tab)
// ---------------------------------------------------------------------------

function AccessCodeEntry({
  isValidating,
  onValidate,
}: {
  isValidating: boolean;
  onValidate: (code: string) => Promise<{ valid: boolean; error?: string }>;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Please enter an access code");
      return;
    }

    const validation = validateAccessCode(trimmed);
    if (!validation.valid) {
      setError(validation.error ?? "Invalid code");
      return;
    }

    setError("");
    try {
      const result = await onValidate(trimmed);
      if (!result.valid) {
        setError(result.error || "Invalid code");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Validation failed. Please try again.",
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 justify-center px-6"
    >
      <View className="bg-white-10 border border-white-20 rounded-card p-6 gap-4">
        <View className="items-center gap-2">
          <MaterialCommunityIcons
            name="qrcode-scan"
            size={48}
            color={colors["white-100"]}
          />
          <Text className="text-white-100 text-xl font-poppins-semibold text-center">
            Enter Access Code
          </Text>
          <Text className="text-white-50 text-sm font-poppins text-center">
            Enter the scanner access code for the event you want to check in
            attendees for
          </Text>
        </View>

        <TextInput
          className="bg-white-5 border border-white-20 rounded-lg px-4 py-3 text-white-100 text-center text-lg font-poppins-semibold tracking-widest"
          value={code}
          onChangeText={(text) => {
            setCode(sanitizeAccessCodeInput(text));
            if (error) setError("");
          }}
          placeholder="ABCD1234"
          placeholderTextColor={colors["white-30"]}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
        />

        {error ? (
          <Text className="text-red-400 text-sm font-poppins text-center">
            {error}
          </Text>
        ) : null}

        <Pressable
          onPress={handleSubmit}
          disabled={isValidating}
          className={`rounded-full py-3 px-6 items-center ${
            isValidating ? "bg-white-100 opacity-60" : "bg-white-100"
          }`}
        >
          {isValidating ? (
            <ActivityIndicator color={colors.dark} size="small" />
          ) : (
            <Text
              style={{ color: colors.dark }}
              className="text-base font-poppins-semibold"
            >
              Validate Code
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Main Scanner Screen
// ---------------------------------------------------------------------------

export default function ScannerScreen() {
  // Read `public` once at the top so we can decide whether to gate auth at all.
  // RequireAuthGate must NOT render in public mode — that's the whole point of
  // public mode: staff without a Flame account can scan with just an access code.
  const { public: publicParam } = useLocalSearchParams<{ public?: string }>();
  const isPublicMode = publicParam === "1" || publicParam === "true";

  if (isPublicMode) {
    return <ScannerContent isPublicMode />;
  }

  return (
    <RequireAuthGate>
      <ScannerContent isPublicMode={false} />
    </RequireAuthGate>
  );
}

function ScannerContent({ isPublicMode }: { isPublicMode: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rawParams = useLocalSearchParams<{ orgId?: string | string[] }>();
  const paramOrgId = Array.isArray(rawParams.orgId) ? rawParams.orgId[0] : rawParams.orgId;
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraFacing, setCameraFacing] = useState<"back" | "front">("back");
  const [torchEnabled, setTorchEnabled] = useState(false);
  // Access Codes management is only meaningful for signed-in owners/admins.
  // Public-mode users skip the role lookup entirely.
  const memberRoleContext = useMemberRoleContext();
  const memberRole = isPublicMode ? null : memberRoleContext.memberRole;
  const roleLoading = isPublicMode ? false : memberRoleContext.isLoading;
  const selectedOrgId = isPublicMode ? null : memberRoleContext.selectedOrgId;
  const setSelectedOrgId = memberRoleContext.setSelectedOrgId;

  // Pin context to the route param so check-in + access-code tabs never drift
  // to a different org mid-scan. Ref-keyed to prevent update loops.
  // Skipped in public mode (no signed-in context to sync).
  const syncedOrgIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (isPublicMode) return;
    if (paramOrgId && syncedOrgIdRef.current !== paramOrgId) {
      syncedOrgIdRef.current = paramOrgId;
      setSelectedOrgId(paramOrgId);
    }
  }, [isPublicMode, paramOrgId, setSelectedOrgId]);
  // Role-sync gate — see organizer-admin.tsx. Both signals required:
  // selectedOrgId match (so we're not reading the prior org's role) AND
  // !roleLoading (so memberRole has actually resolved for this org).
  // Public mode is always "synced" — there is no role to resolve.
  const isRoleSynced =
    isPublicMode ||
    !paramOrgId ||
    (selectedOrgId === paramOrgId && !roleLoading);
  const showAccessCodes =
    !isPublicMode && isRoleSynced && canManageAccessCodes(memberRole);
  const [activeTab, setActiveTab] = useState<ScannerTab>("qr-scanner");
  useEffect(() => {
    if (roleLoading || !isRoleSynced) return;
    if (showAccessCodes) {
      setActiveTab((prev) => (prev === "qr-scanner" ? "access-codes" : prev));
    } else {
      setActiveTab((prev) => (prev === "access-codes" ? "qr-scanner" : prev));
    }
  }, [roleLoading, isRoleSynced, showAccessCodes]);
  // Public mode skips org resolution: the access code is the only credential.
  // verify/checkin/validate-code accept the access code in lieu of a Bearer token,
  // and orgId on those endpoints is optional.
  const { data: orgData, isLoading: orgDataLoading } = useOrgData(
    isPublicMode ? null : selectedOrgId,
  );
  // effectiveOrgId is what we pass into useQRScanner (derived from the route
  // param first, falling back to the org resolved from the shared context).
  // Distinct from selectedOrgId above, which is the context's derived org id
  // used to drive role/permission queries. After the ref-sync effect fires,
  // both resolve to the same org — before it fires they can briefly diverge.
  const effectiveOrgId = isPublicMode
    ? null
    : (paramOrgId ?? orgData?.organizationId ?? null);
  // Loading while fetching org (only when not public, and no paramOrgId provided)
  const isResolvingOrg = !isPublicMode && !paramOrgId && orgDataLoading;
  // Public mode bypasses the org-resolution gate — the scanner tab loads directly.
  const isOrgResolved =
    isPublicMode || Boolean(paramOrgId) || Boolean(orgData?.organizationId);

  const deviceIdRef = useRef(DEVICE_ID);

  const {
    scannerState,
    ticketDetails,
    errorMessage,
    activeEventId,
    activeEventName,
    isCheckingIn,
    isValidatingCode,
    validateAccessCode: validateAccessCodeViaApi,
    handleBarcodeScan,
    confirmCheckIn,
    resetScanner,
    clearEventSession,
    startScanning,
    setScannerState,
  } = useQRScanner({ orgId: effectiveOrgId, publicMode: isPublicMode });

  const handleReset = useCallback(() => {
    resetScanner();
    setTorchEnabled(false);
  }, [resetScanner]);

  const handleScanNext = useCallback(() => {
    resetScanner();
    setTorchEnabled(false);
    startScanning();
  }, [resetScanner, startScanning]);

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (scannerState !== "scanning") return;
      handleBarcodeScan(result.data, deviceIdRef.current);
    },
    [scannerState, handleBarcodeScan],
  );

  const handleConfirmCheckIn = useCallback(() => {
    confirmCheckIn(deviceIdRef.current);
  }, [confirmCheckIn]);

  const handleChangeEvent = useCallback(() => {
    if (
      scannerState === "verifying" ||
      scannerState === "checking_in" ||
      isCheckingIn
    ) {
      return;
    }
    clearEventSession();
    setTorchEnabled(false);
  }, [clearEventSession, scannerState, isCheckingIn]);

  const isChangeEventDisabled =
    scannerState === "verifying" ||
    scannerState === "checking_in" ||
    isCheckingIn;

  // ----- Permission denied state -----
  if (permission && !permission.granted && !permission.canAskAgain) {
    return (
      <View
        className="flex-1 bg-background justify-center items-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Ionicons
          name="camera-off-outline"
          size={64}
          color={colors["white-30"]}
        />
        <Text className="text-white-100 text-xl font-poppins-semibold mt-4 text-center">
          Camera Permission Required
        </Text>
        <Text className="text-white-50 text-sm font-poppins mt-2 text-center">
          The QR scanner needs camera access to scan tickets. Please enable
          camera access in your device settings.
        </Text>
        <Pressable
          onPress={async () => {
            try {
              await Linking.openSettings();
            } catch (err) {
              console.error("Failed to open device settings:", err);
              Alert.alert(
                "Unable to Open Settings",
                "Please open your device Settings app and enable camera access for this app manually.",
              );
            }
          }}
          className="bg-white-100 rounded-full py-3 px-8 mt-6"
        >
          <Text
            style={{ color: colors.dark }}
            className="text-base font-poppins-semibold"
          >
            Open Settings
          </Text>
        </Pressable>
        <Pressable onPress={() => router.back()} className="mt-4 py-2">
          <Text className="text-white-50 text-sm font-poppins">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // Org resolution in progress (no paramOrgId, useOrgData still loading)
  if (isResolvingOrg) {
    return (
      <View
        className="flex-1 bg-background justify-center items-center"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <ScannerHeader
          onBack={() => router.back()}
          activeEventName={null}
          onChangeEvent={undefined}
        />
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text className="text-white-50 text-sm font-poppins mt-3">
          Loading...
        </Text>
      </View>
    );
  }

  // No org available — user must select an organization from dashboard first
  if (!isOrgResolved) {
    return (
      <View
        className="flex-1 bg-background justify-center items-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <ScannerHeader
          onBack={() => router.back()}
          activeEventName={null}
          onChangeEvent={undefined}
        />
        <Ionicons
          name="business-outline"
          size={64}
          color={colors["white-30"]}
        />
        <Text className="text-white-100 text-xl font-poppins-semibold mt-4 text-center">
          Select an Organization
        </Text>
        <Text className="text-white-50 text-sm font-poppins mt-2 text-center">
          Open the dashboard and select an organization to use the QR scanner.
        </Text>
        <Pressable onPress={() => router.back()} className="mt-6 py-2">
          <Text className="text-white-80 text-sm font-poppins">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <ScannerHeader
        onBack={() => router.back()}
        activeEventName={activeEventName || null}
        onChangeEvent={activeEventId ? handleChangeEvent : undefined}
      />

      {/* Tabs only for owner/admin — organizers land directly on QR Scanner */}
      {showAccessCodes && (
        <ScannerTabs activeTab={activeTab} onTabChange={setActiveTab} />
      )}

      {/* ACCESS CODES TAB — manage codes per event (owner/admin only) */}
      {showAccessCodes && activeTab === "access-codes" && (
        <AccessCodesManagement
          orgId={effectiveOrgId}
          contentPaddingBottom={getTabBarPaddingBottom(insets.bottom)}
        />
      )}

      {/* QR SCANNER TAB — enter code + scan */}
      {activeTab === "qr-scanner" && (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: getTabBarPaddingBottom(insets.bottom),
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {!activeEventId ? (
            <AccessCodeEntry
              isValidating={isValidatingCode}
              onValidate={validateAccessCodeViaApi}
            />
          ) : (
            <>
              {/* Active event banner */}
              <View className="bg-white-10 border border-white-20 rounded-card p-3 mt-2 flex-row items-center justify-between">
                <View className="flex-1 mr-3">
                  <Text className="text-white-50 text-xs font-poppins-medium uppercase tracking-wider">
                    Scanning for
                  </Text>
                  <Text
                    className="text-white-100 text-base font-poppins-semibold"
                    numberOfLines={1}
                  >
                    {activeEventName}
                  </Text>
                </View>
                <Pressable
                  onPress={handleChangeEvent}
                  disabled={isChangeEventDisabled}
                  className="border border-white-20 rounded-full px-3 py-1.5"
                  style={({ pressed }) => ({
                    opacity: isChangeEventDisabled ? 0.5 : pressed ? 0.8 : 1,
                  })}
                >
                  <Text className="text-white-100 text-xs font-poppins-semibold">
                    Change
                  </Text>
                </Pressable>
              </View>

              {/* IDLE */}
              {scannerState === "idle" && (
                <IdleState
                  onStartScanning={async () => {
                    if (!permission?.granted) {
                      const result = await requestPermission();
                      if (!result.granted) return;
                    }
                    startScanning();
                  }}
                />
              )}

              {/* SCANNING */}
              {scannerState === "scanning" && (
                <View className="flex-1 gap-4 mt-4">
                  <View
                    className="rounded-2xl overflow-hidden"
                    style={{ height: 360 }}
                  >
                    <CameraView
                      style={{ flex: 1 }}
                      facing={cameraFacing}
                      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                      onBarcodeScanned={handleBarcodeScanned}
                      enableTorch={torchEnabled}
                    />
                    <View className="absolute inset-0 items-center justify-center">
                      <View
                        className="border-2 border-white-100 rounded-2xl"
                        style={{ width: 220, height: 220, opacity: 0.6 }}
                      />
                    </View>
                  </View>

                  <View className="flex-row gap-3 justify-center">
                    <Pressable
                      onPress={() =>
                        setCameraFacing((f) =>
                          f === "back" ? "front" : "back",
                        )
                      }
                      className="bg-white-10 border border-white-20 rounded-full p-3"
                    >
                      <Ionicons
                        name="camera-reverse-outline"
                        size={24}
                        color={colors["white-100"]}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => setTorchEnabled((t) => !t)}
                      className={`rounded-full p-3 ${
                        torchEnabled
                          ? "bg-white-100 border border-white-100"
                          : "bg-white-10 border border-white-20"
                      }`}
                    >
                      <Ionicons
                        name="flashlight-outline"
                        size={24}
                        color={
                          torchEnabled ? colors.dark : colors["white-100"]
                        }
                      />
                    </Pressable>
                  </View>

                  <Pressable
                    onPress={() => {
                      setScannerState("idle");
                      setTorchEnabled(false);
                    }}
                    className="border border-white-20 rounded-full py-3 items-center"
                  >
                    <Text className="text-white-80 text-base font-poppins-semibold">
                      Cancel Scanning
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* VERIFYING */}
              {scannerState === "verifying" && (
                <View className="flex-1 justify-center items-center gap-3">
                  <ActivityIndicator size="large" color="#FFFFFF" />
                  <Text className="text-white-100 text-lg font-poppins-semibold">
                    Verifying Ticket...
                  </Text>
                  <Text className="text-white-50 text-sm font-poppins">
                    Please wait while we validate the QR code
                  </Text>
                </View>
              )}

              {/* VERIFIED — show ticket details, confirm check-in */}
              {scannerState === "verified" && ticketDetails && (
                <VerifiedState
                  ticket={ticketDetails}
                  isCheckingIn={isCheckingIn}
                  onConfirm={handleConfirmCheckIn}
                  onCancel={handleReset}
                  onScanNext={handleScanNext}
                />
              )}

              {/* CHECKING IN */}
              {scannerState === "checking_in" && (
                <View className="flex-1 justify-center items-center gap-3">
                  <ActivityIndicator size="large" color="#22c55e" />
                  <Text className="text-white-100 text-lg font-poppins-semibold">
                    Checking In...
                  </Text>
                </View>
              )}

              {/* CHECKED IN — success */}
              {scannerState === "checked_in" && ticketDetails && (
                <View className="flex-1 gap-4 pt-4">
                  <View className="items-center gap-2">
                    <Ionicons
                      name="checkmark-circle"
                      size={80}
                      color="#22c55e"
                    />
                    <Text className="text-green-400 text-xl font-poppins-semibold">
                      Check-In Confirmed!
                    </Text>
                  </View>
                  <TicketDetailsCard ticket={ticketDetails} />
                  <Pressable
                    onPress={handleScanNext}
                    className="bg-white-100 rounded-full py-3 items-center"
                  >
                    <Text
                      style={{ color: colors.dark }}
                      className="text-base font-poppins-semibold"
                    >
                      Scan Next Ticket
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* ERROR */}
              {scannerState === "error" && (
                <View className="flex-1 justify-center items-center gap-4 px-4">
                  <Ionicons name="close-circle" size={64} color="#ef4444" />
                  <Text className="text-white-100 text-xl font-poppins-semibold">
                    Scan Failed
                  </Text>
                  <Text className="text-red-400 text-sm font-poppins text-center">
                    {errorMessage}
                  </Text>
                  <Pressable
                    onPress={handleScanNext}
                    className="bg-white-100 rounded-full py-3 px-8"
                  >
                    <Text
                      style={{ color: colors.dark }}
                      className="text-base font-poppins-semibold"
                    >
                      Try Again
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function ScannerHeader({
  onBack,
  activeEventName,
  onChangeEvent,
}: {
  onBack: () => void;
  activeEventName: string | null;
  onChangeEvent?: () => void;
}) {
  return (
    <View className="px-4 py-3 gap-1">
      <View className="flex-row items-center justify-between">
        <Pressable onPress={onBack} className="flex-row items-center gap-1">
          <Ionicons name="arrow-back" size={20} color={colors["white-100"]} />
          <Text className="text-white-80 text-sm font-poppins">Dashboard</Text>
        </Pressable>
        {onChangeEvent ? (
          <Pressable
            onPress={onChangeEvent}
            className="flex-row items-center gap-1 border border-white-20 rounded-full px-3 py-1"
          >
            <Ionicons
              name="swap-horizontal"
              size={14}
              color={colors["white-50"]}
            />
            <Text className="text-white-100 text-xs font-poppins">
              Change Event
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text className="text-white-100 text-xl font-poppins-semibold">
        QR Scanner
      </Text>
      {activeEventName ? (
        <Text className="text-white-100 text-sm font-poppins">
          {activeEventName}
        </Text>
      ) : (
        <Text className="text-white-80 text-sm font-poppins">
          Verify check-ins and attendance
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Idle state
// ---------------------------------------------------------------------------

function IdleState({ onStartScanning }: { onStartScanning: () => void }) {
  return (
    <View className="flex-1 justify-center items-center gap-4">
      <MaterialCommunityIcons
        name="qrcode-scan"
        size={64}
        color={colors["white-30"]}
      />
      <Text className="text-white-100 text-xl font-poppins-semibold">
        Ready to Scan
      </Text>
      <Text className="text-white-50 text-sm font-poppins text-center px-8">
        Activate your camera to verify and check in attendees with their ticket
        QR codes
      </Text>
      <Pressable
        onPress={onStartScanning}
        className="bg-white-100 rounded-full py-3 px-8"
      >
        <Text
          style={{ color: colors.dark }}
          className="text-base font-poppins-semibold"
        >
          Activate Camera
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Verified state — ticket found, awaiting check-in confirmation
// ---------------------------------------------------------------------------

function VerifiedState({
  ticket,
  isCheckingIn,
  onConfirm,
  onCancel,
  onScanNext,
}: {
  ticket: TicketDetails;
  isCheckingIn: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onScanNext: () => void;
}) {
  const isAlreadyCheckedIn = !!ticket.checked_in_at;

  return (
    <View className="flex-1 gap-4 pt-4">
      <View className="items-center gap-2">
        {isAlreadyCheckedIn ? (
          <>
            <Ionicons name="warning" size={64} color="#d97706" />
            <Text className="text-amber-400 text-lg font-poppins-semibold">
              Already Checked In
            </Text>
            <Text className="text-white-50 text-sm font-poppins">
              Checked in at{" "}
              {new Date(ticket.checked_in_at!).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })}
            </Text>
          </>
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={64} color="#22c55e" />
            <Text className="text-green-400 text-lg font-poppins-semibold">
              Ticket Verified
            </Text>
          </>
        )}
      </View>

      <TicketDetailsCard ticket={ticket} />

      {isAlreadyCheckedIn ? (
        <Pressable
          onPress={onScanNext}
          className="bg-white-100 rounded-full py-3 items-center"
        >
          <Text
            style={{ color: colors.dark }}
            className="text-base font-poppins-semibold"
          >
            Scan Next Ticket
          </Text>
        </Pressable>
      ) : (
        <View className="gap-2">
          <Pressable
            onPress={onConfirm}
            disabled={isCheckingIn}
            className={`rounded-full py-3 items-center ${
              isCheckingIn ? "bg-green-600/50" : "bg-green-600"
            }`}
          >
            <Text className="text-white-100 text-base font-poppins-semibold">
              {isCheckingIn ? "Checking In..." : "Confirm Check-In"}
            </Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            disabled={isCheckingIn}
            className="border border-white-20 rounded-full py-3 items-center"
          >
            <Text className="text-white-80 text-base font-poppins-semibold">
              Cancel
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
