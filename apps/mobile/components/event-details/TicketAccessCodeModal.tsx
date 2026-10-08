import { useState, useEffect, useCallback } from "react";
import {
  Modal,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { FlameText, PillButton, colors } from "@project-flame/ui";
import { normalizeTicketTierSecretCode } from "@project-flame/lib";
import { apiPost, ApiError } from "../../lib/api";

interface TicketAccessCodeModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called with trimmed uppercase code after server validation succeeds. */
  onVerified: (code: string) => void;
  ticketTierId: string;
  tierName: string;
  getToken: () => Promise<string | null>;
}

/**
 * Mirrors web `TicketCodeModal.tsx`: validates access code via POST
 * `/api/ticket-tiers/validate-code` before checkout continues (hold / RSVP).
 */
export function TicketAccessCodeModal({
  visible,
  onClose,
  onVerified,
  ticketTierId,
  tierName,
  getToken,
}: TicketAccessCodeModalProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setCode("");
      setError("");
      setSubmitting(false);
    }
  }, [visible]);

  const handleSubmit = useCallback(async () => {
    const normalized = normalizeTicketTierSecretCode(code);
    if (normalized.length < 3) {
      setError("Access code must be at least 3 characters.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await apiPost<{ valid?: boolean }>(
        "/api/ticket-tiers/validate-code",
        {
          ticket_tier_id: ticketTierId,
          secret_code: normalized,
        },
        getToken,
      );
      onVerified(normalized);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "INVALID_SECRET_CODE") {
          setError("Invalid access code. Please try again.");
        } else if (err.code === "NO_CODE_REQUIRED") {
          setError(err.message);
        } else {
          setError(err.message || "Failed to validate access code.");
        }
      } else {
        setError(
          err instanceof Error ? err.message : "Failed to validate access code.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }, [code, getToken, onVerified, ticketTierId]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => { if (!submitting) onClose(); }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-center bg-black/60 px-4"
      >
        <View className="rounded-card border border-white-30 bg-surface p-5">
          <View className="mb-4 flex-row items-center justify-between">
            <FlameText variant="h4" className="text-white-100">
              Enter access code
            </FlameText>
            <Pressable onPress={() => { if (!submitting) onClose(); }} hitSlop={12} accessibilityRole="button">
              <Feather name="x" size={22} color={colors["white-80"]} />
            </Pressable>
          </View>

          <FlameText variant="subtitle1-light" className="text-white-70 mb-4">
            {`Enter the access code to unlock ${tierName} tickets.`}
          </FlameText>

          <FlameText variant="subtitle2" className="text-white-50 mb-1">
            Access code
          </FlameText>
          <TextInput
            className="mb-2 rounded-lg border border-white-30 bg-card px-3 py-3 font-poppins text-base text-white-100"
            placeholder="CODE"
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={code}
            editable={!submitting}
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={(t) => {
              setCode(t.toUpperCase());
              setError("");
            }}
            onSubmitEditing={() => void handleSubmit()}
          />
          {error ? (
            <FlameText variant="subtitle2" className="mb-3 text-red-400">
              {error}
            </FlameText>
          ) : (
            <View className="mb-3" />
          )}

          <View className="flex-row gap-3">
            <View className="flex-1">
              <PillButton label="Cancel" variant="ghost" onPress={onClose} disabled={submitting} />
            </View>
            <View className="flex-1">
              {submitting ? (
                <View className="h-12 items-center justify-center">
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : (
                <PillButton label="Continue" variant="solid" onPress={() => void handleSubmit()} />
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
