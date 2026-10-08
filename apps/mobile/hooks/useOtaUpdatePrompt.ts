/**
 * useOtaUpdatePrompt — runs the expo-updates check + download flow and
 * exposes a `ready` boolean for <OtaRestartSheet>.
 *
 * Lifecycle:
 *   1. On mount + on AppState → "active", call Updates.checkForUpdateAsync().
 *   2. If isAvailable, Updates.fetchUpdateAsync() to pull the new bundle.
 *   3. Read the new bundle's updateId. If it doesn't match the suppressed
 *      updateId (or suppression has expired), set ready=true.
 *
 * Suppression policy (Tier-1 fix from the second-pass review):
 *   "Later" stores { updateId, suppressedAt } in SecureStore. The 24h timer
 *   is keyed by updateId — if a second OTA ships within 24h, the new
 *   updateId !== suppressed updateId so the prompt re-fires immediately.
 *
 * Failure handling: every call is try/caught — the OTA prompt is purely
 * additive UX and must never crash the app.
 *
 * Production-only:
 *   - Skipped in dev/preview by default. Set EXPO_PUBLIC_DEV_FORCE_OTA_PROMPT=1
 *     in apps/mobile/.env to force the UI on with a fake updateId for the
 *     local test matrix (see EAS_OTA_UPDATES.md).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";
import { isProductionBuild } from "../lib/internal";

const SUPPRESS_KEY = "ota_restart_suppression_v1";
const SUPPRESS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const FORCE_OTA_PROMPT_IN_DEV =
  __DEV__ && process.env.EXPO_PUBLIC_DEV_FORCE_OTA_PROMPT === "1";
const DEV_FAKE_UPDATE_ID =
  __DEV__ ? process.env.EXPO_PUBLIC_DEV_FAKE_UPDATE_ID : undefined;

type SuppressionState = {
  updateId: string;
  suppressedAt: number;
};

async function readSuppression(): Promise<SuppressionState | null> {
  try {
    const raw = await SecureStore.getItemAsync(SUPPRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SuppressionState;
    if (
      typeof parsed?.updateId !== "string" ||
      typeof parsed?.suppressedAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeSuppression(state: SuppressionState): Promise<void> {
  try {
    await SecureStore.setItemAsync(SUPPRESS_KEY, JSON.stringify(state));
  } catch {
    // best-effort
  }
}

function isSuppressionActive(
  suppression: SuppressionState | null,
  candidateUpdateId: string,
): boolean {
  if (!suppression) return false;
  if (suppression.updateId !== candidateUpdateId) return false;
  if (Date.now() - suppression.suppressedAt > SUPPRESS_TTL_MS) return false;
  return true;
}

export function useOtaUpdatePrompt() {
  const [ready, setReady] = useState(false);
  const [currentUpdateId, setCurrentUpdateId] = useState<string | null>(null);
  const inFlight = useRef(false);

  // Dev-only short-circuit: surface the sheet immediately with a fake updateId.
  useEffect(() => {
    if (!FORCE_OTA_PROMPT_IN_DEV) return;
    const fakeId = DEV_FAKE_UPDATE_ID || "dev-fake-update-1";
    (async () => {
      const suppression = await readSuppression();
      if (!isSuppressionActive(suppression, fakeId)) {
        setCurrentUpdateId(fakeId);
        setReady(true);
      }
    })();
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (!isProductionBuild) return;
    if (inFlight.current) return;
    if (!Updates.isEnabled) return;

    inFlight.current = true;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) return;

      const fetched = await Updates.fetchUpdateAsync();
      if (!fetched.isNew) return;

      // expo-updates uses different field shapes across versions; defensive read.
      const updateId =
        (fetched.manifest as { id?: string } | undefined)?.id ?? null;
      if (!updateId) return;

      const suppression = await readSuppression();
      if (isSuppressionActive(suppression, updateId)) {
        return;
      }

      setCurrentUpdateId(updateId);
      setReady(true);
    } catch (err) {
      // Never crash on OTA failure — this prompt is purely additive UX.
      if (__DEV__) console.warn("[useOtaUpdatePrompt] check/fetch failed", err);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (FORCE_OTA_PROMPT_IN_DEV) return; // already handled above
    void checkForUpdate();
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") {
        void checkForUpdate();
      }
    });
    return () => sub.remove();
  }, [checkForUpdate]);

  const postpone = useCallback(async () => {
    setReady(false);
    if (!currentUpdateId) return;
    await writeSuppression({
      updateId: currentUpdateId,
      suppressedAt: Date.now(),
    });
  }, [currentUpdateId]);

  return { ready, postpone };
}
