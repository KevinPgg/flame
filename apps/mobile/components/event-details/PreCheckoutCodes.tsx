import { useState, useCallback, useEffect } from "react";
import {
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { FlameText } from "@project-flame/ui";
import type { PromoterValidationStatus } from "../../hooks/useCheckout";

/** Status of the access-code unlock attempt (mirrors PromoterValidationStatus). */
export type AccessCodeStatus = "idle" | "validating" | "valid" | "invalid";

interface PreCheckoutCodesProps {
  promoterCode: string;
  promoterStatus: PromoterValidationStatus;
  onPromoterChange: (code: string) => void;
  onValidatePromoter: (code: string) => void;
  onClearPromoter: () => void;
  // W4-C3 (Jun 2026): access-code input unlocks a hidden tier and auto-selects
  // it. Replaces the prior pre-checkout TicketAccessCodeModal flow.
  accessCode: string;
  accessCodeStatus: AccessCodeStatus;
  accessCodeError: string | null;
  onAccessCodeChange: (code: string) => void;
  onValidateAccessCode: (code: string) => void;
  onClearAccessCode: () => void;
}

export function PreCheckoutCodes({
  promoterCode,
  promoterStatus,
  onPromoterChange,
  onValidatePromoter,
  onClearPromoter,
  accessCode,
  accessCodeStatus,
  accessCodeError,
  onAccessCodeChange,
  onValidateAccessCode,
  onClearAccessCode,
}: PreCheckoutCodesProps) {
  const [localPromoter, setLocalPromoter] = useState(promoterCode);
  const [promoterEditing, setPromoterEditing] = useState(!promoterCode);

  useEffect(() => {
    setLocalPromoter(promoterCode);
    if (promoterCode) setPromoterEditing(false);
  }, [promoterCode]);

  const handlePromoterSubmit = useCallback(() => {
    const trimmed = localPromoter.trim();
    if (trimmed) {
      onPromoterChange(trimmed);
      onValidatePromoter(trimmed);
    }
  }, [localPromoter, onPromoterChange, onValidatePromoter]);

  const handleAccessSubmit = useCallback(() => {
    const trimmed = accessCode.trim();
    if (trimmed) onValidateAccessCode(trimmed);
  }, [accessCode, onValidateAccessCode]);

  return (
    <View className="px-4 gap-4">
      {/* Promoter */}
      <View>
        <FlameText variant="subtitle2" className="text-white-70 mb-2 uppercase">
          Promoter
        </FlameText>
        {promoterStatus === "valid" && !promoterEditing ? (
          <View className="flex-row items-center bg-[#5DDBB1]/10 border border-[#5DDBB1]/30 rounded-card px-4 py-3">
            <Feather name="check-circle" size={16} color="#5DDBB1" />
            <FlameText variant="subtitle1" className="text-[#5DDBB1] ml-2 flex-1">
              {promoterCode}
            </FlameText>
            <Pressable
              hitSlop={8}
              onPress={() => {
                onClearPromoter();
                setLocalPromoter("");
                setPromoterEditing(true);
              }}
            >
              <Feather name="x" size={18} color="#5DDBB1" />
            </Pressable>
          </View>
        ) : (
          <View className="flex-row gap-2 items-center">
            <View className="flex-1 flex-row items-center bg-white-5 border border-white-20 rounded-card px-4 py-3">
              <TextInput
                className="flex-1 text-white-100 font-poppins text-sm"
                placeholder="None"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={localPromoter}
                onChangeText={setLocalPromoter}
                autoCapitalize="characters"
                autoCorrect={false}
                onSubmitEditing={handlePromoterSubmit}
                returnKeyType="done"
              />
              {promoterStatus === "validating" && (
                <ActivityIndicator size="small" color="#FFFFFF" />
              )}
              {promoterStatus === "invalid" && localPromoter.trim().length > 0 && (
                <Feather name="x-circle" size={16} color="#EA3370" />
              )}
            </View>
            <Pressable
              onPress={handlePromoterSubmit}
              className="bg-white-10 border border-white-20 rounded-card px-4 h-[46px] items-center justify-center"
            >
              <FlameText variant="subtitle2" className="text-white-100">
                Apply
              </FlameText>
            </Pressable>
          </View>
        )}
      </View>

      {/* Access code (W4-C3) */}
      <View>
        <FlameText variant="subtitle2" className="text-white-70 mb-2 uppercase">
          Access Code
        </FlameText>
        {accessCodeStatus === "valid" ? (
          <View className="flex-row items-center bg-[#5DDBB1]/10 border border-[#5DDBB1]/30 rounded-card px-4 py-3">
            <Feather name="check-circle" size={16} color="#5DDBB1" />
            <FlameText variant="subtitle1" className="text-[#5DDBB1] ml-2 flex-1">
              {accessCode.trim().toUpperCase()}
            </FlameText>
            <Pressable hitSlop={8} onPress={onClearAccessCode}>
              <Feather name="x" size={18} color="#5DDBB1" />
            </Pressable>
          </View>
        ) : (
          <View>
            <View className="flex-row gap-2 items-center">
              <View className="flex-1 flex-row items-center bg-white-5 border border-white-20 rounded-card px-4 py-3">
                <TextInput
                  className="flex-1 text-white-100 font-poppins text-sm"
                  placeholder="Enter code to unlock a private ticket"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={accessCode}
                  onChangeText={onAccessCodeChange}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onSubmitEditing={handleAccessSubmit}
                  returnKeyType="done"
                  editable={accessCodeStatus !== "validating"}
                />
                {accessCodeStatus === "validating" && (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                )}
                {accessCodeStatus === "invalid" && accessCode.trim().length > 0 && (
                  <Feather name="x-circle" size={16} color="#EA3370" />
                )}
              </View>
              <Pressable
                onPress={handleAccessSubmit}
                disabled={accessCodeStatus === "validating"}
                className="bg-white-10 border border-white-20 rounded-card px-4 h-[46px] items-center justify-center"
              >
                <FlameText variant="subtitle2" className="text-white-100">
                  Apply
                </FlameText>
              </Pressable>
            </View>
            {accessCodeStatus === "invalid" && accessCodeError ? (
              <FlameText
                variant="subtitle2"
                className="text-primary mt-1"
              >
                {accessCodeError}
              </FlameText>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}
