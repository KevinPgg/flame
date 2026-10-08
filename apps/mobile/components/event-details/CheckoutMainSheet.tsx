import { useState, useEffect, useCallback } from "react";
import { z } from "zod";
import {
  View,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { FlameText, PillButton, colors } from "@project-flame/ui";
import { formatCentsAsPrice, filterFieldsForTier } from "@project-flame/lib";
import type { TicketTierWithStatus, EventDetail } from "../../hooks/useEventDetails";
import type { PromoterValidationStatus } from "../../hooks/useCheckout";
import { FormFieldSchema } from "../../hooks/useRsvpManagement";
import type { FormField } from "../../hooks/useRsvpManagement";

interface CheckoutMainSheetProps {
  visible: boolean;
  onClose: () => void;
  event: EventDetail;
  tier: TicketTierWithStatus;
  quantity: number;
  isRsvp: boolean;
  error: string | null;
  errorCode: string | null;
  isFree: boolean;
  displayAmounts: {
    subtotal: number;
    fee: number;
    total: number;
    discount: number;
  };
  promoCode: string;
  onApplyPromo: (code: string) => void;
  onClearPromo: () => void;
  promoApplied: boolean;
  isValidatingPromo?: boolean;
  requiresSecretCode?: boolean;
  secretCode: string;
  onSecretCodeChange: (code: string) => void;
  registrationData: Record<string, unknown> | null;
  onRegistrationDataChange: (data: Record<string, unknown> | null) => void;
  promoterCode: string;
  promoterStatus: PromoterValidationStatus;
  onPromoterChange: (code: string) => void;
  onValidatePromoter: (code: string) => void;
  onClearPromoter: () => void;
  onCheckout: () => void;
}

function getButtonLabel(
  isRsvp: boolean,
  isFree: boolean,
  totalCents: number,
  currency?: string
): string {
  if (isRsvp) {
    if (isFree) return "Submit RSVP Request";
    return `Submit RSVP Request - ${formatCentsAsPrice(totalCents, currency)}`;
  }
  if (isFree) return "Claim Free Ticket";
  return `Pay ${formatCentsAsPrice(totalCents, currency)}`;
}

export function CheckoutMainSheet({
  visible,
  onClose,
  event,
  tier,
  quantity,
  isRsvp,
  error: checkoutError,
  errorCode,
  isFree,
  displayAmounts,
  promoCode,
  onApplyPromo,
  onClearPromo,
  promoApplied,
  isValidatingPromo = false,
  requiresSecretCode = false,
  secretCode,
  onSecretCodeChange,
  registrationData,
  onRegistrationDataChange,
  promoterCode,
  promoterStatus,
  onPromoterChange,
  onValidatePromoter,
  onClearPromoter,
  onCheckout,
}: CheckoutMainSheetProps) {
  const [localPromo, setLocalPromo] = useState("");
  const [localPromoter, setLocalPromoter] = useState(promoterCode);
  const [promoterEditing, setPromoterEditing] = useState(!promoterCode);
  const [localFormData, setLocalFormData] = useState<Record<string, unknown>>({});
  // Per-field validation errors (keyed by field.id). Mirrors web's
  // `RegistrationFormModal` pattern: inline red message under each empty/invalid
  // required field, cleared on edit, re-checked on submit press.
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Tier-aware filter. We use `tier.tierId ?? tier.id` so that stage-expanded
  // entries (synthetic composite ids) collapse to the underlying ticket_tier id —
  // switching stages within the same tier keeps the same allowed-field set.
  // `tierFormFieldsKey` and `tierInheritsAll` are kept SEPARATE on purpose: the
  // join(",") representation collapses `null`, `undefined`, and `[]` all to the
  // same empty string, but `filterFieldsForTier` treats `null`/`undefined` (=
  // inherit all non-archived) and `[]` (= collect nothing) as distinct outputs.
  // Without the boolean, switching a tier between those two states wouldn't
  // re-fire this effect and `localFormData` would go stale.
  const resolvedTierId = tier.tierId ?? tier.id;
  const tierInheritsAll = tier.registration_form_fields === null;
  const tierFormFieldsKey = (tier.registration_form_fields ?? []).join(",");
  useEffect(() => {
    if (visible) {
      setFormErrors({});
      const raw = event?.registration_form_config;
      const configParse = z.array(FormFieldSchema).safeParse(raw);
      if (configParse.success) {
        const tierVisible = filterFieldsForTier(
          configParse.data,
          tier.registration_form_fields,
        );
        const allowedIds = new Set(tierVisible.map((f) => f.id));
        const source = registrationData ?? {};
        const filtered: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(source)) {
          if (allowedIds.has(k)) filtered[k] = v;
        }
        setLocalFormData(filtered);
        // Propagate the stale-answer cleanup back to the parent so the API
        // payload doesn't carry data for fields the tier no longer collects.
        const sourceKeys = Object.keys(source);
        const droppedAny = sourceKeys.some((k) => !allowedIds.has(k));
        if (droppedAny) {
          onRegistrationDataChange(
            Object.keys(filtered).length > 0 ? filtered : null,
          );
        }
      } else {
        setLocalFormData(registrationData ?? {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visible,
    event?.registration_form_config,
    resolvedTierId,
    tierInheritsAll,
    tierFormFieldsKey,
  ]);

  useEffect(() => {
    if (promoApplied) setLocalPromo("");
  }, [promoApplied]);

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

  // Tier-effective form config, computed once per render and shared between the
  // form renderer (below) and the validation gate in `handleCheckoutPress`.
  // Mirrors `apps/web/app/api/rsvp/route.ts` semantics via the same helper.
  const rawFormConfig = event?.registration_form_config;
  const configParse = z.array(FormFieldSchema).safeParse(rawFormConfig);
  const parsedFormConfig: FormField[] | null = configParse.success
    ? configParse.data
    : null;
  const tierFormConfig = parsedFormConfig
    ? filterFieldsForTier(parsedFormConfig, tier.registration_form_fields)
    : null;
  const hasForm =
    isRsvp && tierFormConfig !== null && tierFormConfig.length > 0;

  const handleCheckoutPress = useCallback(() => {
    // Client-side required-field gate matching web's RegistrationFormModal.
    // Server still validates (api/rsvp/route.ts) — this exists for UX so users
    // see inline per-field errors instead of a generic server response.
    if (hasForm && tierFormConfig) {
      const errors: Record<string, string> = {};
      for (const field of tierFormConfig) {
        if (!field.required) continue;
        const value = localFormData[field.id];
        const isEmpty =
          value === undefined ||
          value === null ||
          (typeof value === "string" && value.trim() === "") ||
          (field.type === "checkbox" && value !== true);
        if (isEmpty) {
          errors[field.id] = "This field is required";
        }
      }
      if (Object.keys(errors).length > 0) {
        setFormErrors(errors);
        return;
      }
    }
    setFormErrors({});
    onCheckout();
  }, [hasForm, tierFormConfig, localFormData, onCheckout]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable
          className="flex-1 bg-[rgba(0,0,0,0.6)]"
          onPress={onClose}
        />
        <View className="bg-surface rounded-t-[24px] px-6 pt-4 pb-10 max-h-[85%]">
          <View className="self-center w-[40px] h-[4px] rounded-full bg-white-20 mb-4" />
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <View className="flex-row items-center justify-between mb-6">
              <FlameText variant="h4" className="text-white-100">
                Order Summary
              </FlameText>
              <Pressable onPress={onClose} className="p-1">
                <Feather name="x" size={24} color={colors["white-100"]} />
              </Pressable>
            </View>

            <FlameText
              variant="subtitle2-light"
              className="text-white-50 mb-4 uppercase"
            >
              {event.name}
            </FlameText>

            <View className="bg-white-5 rounded-card p-4 mb-4">
              <View className="flex-row justify-between items-center">
                <View className="flex-1 mr-4">
                  <FlameText variant="subtitle1" className="text-white-100">
                    {tier.name}
                  </FlameText>
                  <FlameText
                    variant="subtitle2-light"
                    className="text-white-50 mt-1"
                  >
                    {quantity} x {formatCentsAsPrice(tier.displayPrice, event.currency)}
                  </FlameText>
                </View>
                <FlameText variant="subtitle1" className="text-white-100">
                  {formatCentsAsPrice(tier.displayPrice * quantity, event.currency)}
                </FlameText>
              </View>
            </View>

            {/* Access Code — W4-C3 (Jun 2026). With the new unlock flow the
                code was already entered + verified on the event detail page,
                so the checkout sheet just shows a read-only green "applied"
                indicator (matching promo + promoter below). The legacy editable
                input is gone — to change the code, the user closes the sheet
                and edits via the event page's access-code input. */}
            {secretCode.length > 0 && (
              <View className="mb-4">
                <FlameText
                  variant="subtitle2"
                  className="text-white-70 mb-2 uppercase"
                >
                  Access Code
                </FlameText>
                <View className="flex-row items-center bg-[#5DDBB1]/10 border border-[#5DDBB1]/30 rounded-card px-4 py-3">
                  <Feather name="check-circle" size={16} color="#5DDBB1" />
                  <FlameText
                    variant="subtitle1"
                    className="text-[#5DDBB1] ml-2 flex-1"
                  >
                    {secretCode}
                  </FlameText>
                </View>
              </View>
            )}

            {/* Registration Form — shown for events with registration_form_config.
                Archived fields are hidden from the registrant form but remain in
                the event's config for organizer display + XLSX export. */}
            {hasForm && tierFormConfig && (
              <View className="mb-4">
                <FlameText variant="subtitle2" className="text-white-70 mb-2 uppercase">
                  Registration Info
                </FlameText>
                <View className="gap-3">
                  {tierFormConfig.map((field) => {
                    const fieldError = formErrors[field.id];
                    const clearFieldError = () => {
                      if (formErrors[field.id]) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next[field.id];
                          return next;
                        });
                      }
                    };
                    if (field.type === "checkbox") {
                      return (
                        <View key={field.id}>
                          <Pressable
                            className="flex-row items-center gap-3"
                            onPress={() => {
                              const updated = { ...localFormData, [field.id]: !localFormData[field.id] };
                              setLocalFormData(updated);
                              onRegistrationDataChange(updated);
                              clearFieldError();
                            }}
                          >
                            <View className={`w-5 h-5 rounded border items-center justify-center ${localFormData[field.id] ? "bg-white-100 border-white-100" : fieldError ? "border-primary" : "border-white-30"}`}>
                              {Boolean(localFormData[field.id]) && (
                                <Feather name="check" size={14} color="#041C2B" />
                              )}
                            </View>
                            <FlameText variant="subtitle1" className="text-white-80 flex-1">
                              {field.label}{field.required ? " *" : ""}
                            </FlameText>
                          </Pressable>
                          {fieldError && (
                            <FlameText variant="subtitle2-light" className="text-primary mt-1">
                              {fieldError}
                            </FlameText>
                          )}
                        </View>
                      );
                    }
                    return (
                      <View key={field.id}>
                        <FlameText variant="subtitle2-light" className="text-white-50 mb-1">
                          {field.label}{field.required ? " *" : ""}
                        </FlameText>
                        <TextInput
                          className={`bg-white-5 border rounded-card px-4 py-3 text-white-100 font-poppins text-sm ${fieldError ? "border-primary" : "border-white-20"}`}
                          placeholder={field.placeholder || field.label}
                          placeholderTextColor="rgba(255,255,255,0.3)"
                          value={String(localFormData[field.id] ?? "")}
                          onChangeText={(text) => {
                            const updated = { ...localFormData, [field.id]: text };
                            setLocalFormData(updated);
                            onRegistrationDataChange(updated);
                            clearFieldError();
                          }}
                          keyboardType={field.type === "email" ? "email-address" : field.type === "number" ? "numeric" : "default"}
                          autoCapitalize={field.type === "email" ? "none" : "sentences"}
                          autoCorrect={false}
                        />
                        {fieldError && (
                          <FlameText variant="subtitle2-light" className="text-primary mt-1">
                            {fieldError}
                          </FlameText>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            <View className="mb-4">
              <FlameText
                variant="subtitle2"
                className="text-white-70 mb-2 uppercase"
              >
                Discount Code
              </FlameText>
              {promoApplied ? (
                <View className="flex-row items-center bg-[#5DDBB1]/10 border border-[#5DDBB1]/30 rounded-card px-4 py-3">
                  <Feather name="check-circle" size={16} color="#5DDBB1" />
                  <FlameText
                    variant="subtitle1"
                    className="text-[#5DDBB1] ml-2 flex-1"
                  >
                    {promoCode} applied
                  </FlameText>
                  <Pressable onPress={onClearPromo}>
                    <Feather name="x" size={18} color="#5DDBB1" />
                  </Pressable>
                </View>
              ) : (
                <View className="flex-row gap-2">
                  <TextInput
                    className="flex-1 bg-white-5 border border-white-20 rounded-card px-4 py-3 text-white-100 font-poppins text-sm"
                    placeholder="Enter code"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={localPromo}
                    onChangeText={setLocalPromo}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!isValidatingPromo}
                  />
                  <Pressable
                    onPress={() => {
                      if (localPromo.trim() && !isValidatingPromo) onApplyPromo(localPromo.trim());
                    }}
                    disabled={isValidatingPromo || !localPromo.trim()}
                    className={`bg-white-10 border border-white-20 rounded-card px-4 items-center justify-center flex-row gap-1 ${isValidatingPromo ? "opacity-60" : ""}`}
                  >
                    {isValidatingPromo && (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    )}
                    <FlameText variant="subtitle2" className="text-white-100">
                      {isValidatingPromo ? "..." : "Apply"}
                    </FlameText>
                  </Pressable>
                </View>
              )}
            </View>

            <View className="mb-4">
              <FlameText
                variant="subtitle2"
                className="text-white-70 mb-2 uppercase"
              >
                Promoter
              </FlameText>
              {promoterStatus === "valid" && !promoterEditing ? (
                <View className="flex-row items-center bg-[#5DDBB1]/10 border border-[#5DDBB1]/30 rounded-card px-4 py-3">
                  <Feather name="check-circle" size={16} color="#5DDBB1" />
                  <FlameText
                    variant="subtitle1"
                    className="text-[#5DDBB1] ml-2 flex-1"
                  >
                    {promoterCode}
                  </FlameText>
                  <Pressable
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
                      <Feather name="x-circle" size={16} color={colors.primary} />
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

            {checkoutError ? (
              <View className="mb-4 bg-primary/10 rounded-card px-4 py-3">
                <FlameText variant="subtitle2" className="text-primary">
                  {checkoutError}
                </FlameText>
              </View>
            ) : null}

            <View className="border-t border-white-10 pt-4 mb-6 gap-3">
              <View className="flex-row justify-between">
                <FlameText variant="subtitle1" className="text-white-50">
                  Subtotal
                </FlameText>
                <FlameText variant="subtitle1" className="text-white-100">
                  {formatCentsAsPrice(displayAmounts.subtotal, event.currency)}
                </FlameText>
              </View>
              {displayAmounts.discount > 0 && (
                <View className="flex-row justify-between">
                  <FlameText variant="subtitle1" className="text-[#5DDBB1]">
                    Discount
                  </FlameText>
                  <FlameText variant="subtitle1" className="text-[#5DDBB1]">
                    -{formatCentsAsPrice(displayAmounts.discount, event.currency)}
                  </FlameText>
                </View>
              )}
              {displayAmounts.fee > 0 && (
                <View className="flex-row justify-between">
                  <FlameText variant="subtitle1" className="text-white-50">
                    Service fee
                  </FlameText>
                  <FlameText variant="subtitle1" className="text-white-100">
                    {formatCentsAsPrice(displayAmounts.fee, event.currency)}
                  </FlameText>
                </View>
              )}
              <View className="flex-row justify-between border-t border-white-10 pt-3">
                <FlameText variant="h4" className="text-white-100">
                  Total
                </FlameText>
                <FlameText variant="h4" className="text-white-100">
                  {formatCentsAsPrice(displayAmounts.total, event.currency)}
                </FlameText>
              </View>
            </View>

            <PillButton
              label={getButtonLabel(isRsvp, isFree, displayAmounts.total, event.currency)}
              variant="solid"
              onPress={handleCheckoutPress}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
