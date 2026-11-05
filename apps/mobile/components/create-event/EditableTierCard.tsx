import { useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { View, Text, Pressable, TextInput, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DateTimePickerField } from "./DateTimePickerField";
import { StageCard } from "./StageCard";
import { TierRegistrationFormSheet } from "./TierRegistrationFormSheet";
import { NUMERIC_KEYBOARD_DONE_ID } from "./KeyboardDoneBar";
import type { CreateEventTierInput, CreateEventTierStageInput } from "../../hooks/useCreateEvent";
import { localToUtc, TIER_DESCRIPTION_MAX_LENGTH } from "@project-flame/lib";

/**
 * Structural shape we need to render the per-tier form picker. Compatible with both
 * `@project-flame/lib`'s `FormField` and the local Zod `FormField` in
 * `apps/mobile/hooks/useRsvpManagement.ts` (which permits a wider `type` string).
 */
export interface TierEventFormFieldLike {
  id: string;
  label: string;
  required?: boolean;
  archived?: boolean;
}

function FormInput({
  placeholder,
  value,
  onChangeText,
  onBlur,
  keyboardType,
  inputAccessoryViewID,
  icon,
}: {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  keyboardType?: "default" | "numeric";
  inputAccessoryViewID?: string;
  icon?: ReactNode;
}) {
  return (
    <View className="bg-white-5 border border-white-10 rounded-pill flex-row items-center gap-4 p-4">
      {icon}
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.5)"
        className="flex-1 text-white-100 text-sm leading-5 font-poppins"
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        keyboardType={keyboardType}
        inputAccessoryViewID={inputAccessoryViewID}
      />
    </View>
  );
}

/** W4-C2 (May 2026): multi-line description input with a 0/120 counter. Used
 *  for both tier-level and per-stage descriptions. */
function DescriptionInput({
  placeholder,
  value,
  onChangeText,
  maxLength = TIER_DESCRIPTION_MAX_LENGTH,
}: {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  maxLength?: number;
}) {
  return (
    <View className="bg-white-5 border border-white-10 rounded-card p-4 gap-2">
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.5)"
        className="text-white-100 text-sm leading-5 font-poppins min-h-[40px]"
        value={value}
        onChangeText={(t) => onChangeText(t.slice(0, maxLength))}
        maxLength={maxLength}
        multiline
        numberOfLines={2}
        textAlignVertical="top"
      />
      <Text className="text-white-30 text-[11px] font-poppins-light text-right">
        {value.length}/{maxLength}
      </Text>
    </View>
  );
}

function QuantityStepper({
  value,
  onIncrement,
  onDecrement,
}: {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <Pressable onPress={onDecrement}>
        <Ionicons name="chevron-back" size={24} color="#F9FBFE" />
      </Pressable>
      <View className="bg-white-5 rounded-[2px] w-[40px] items-center justify-center">
        <Text className="text-white-100 text-lg font-poppins-semibold uppercase">
          {value}
        </Text>
      </View>
      <Pressable onPress={onIncrement}>
        <Ionicons name="chevron-forward" size={24} color="#F9FBFE" />
      </Pressable>
    </View>
  );
}

interface EditableTierCardProps {
  tier: CreateEventTierInput;
  index: number;
  onChange: (tier: CreateEventTierInput) => void;
  onRemove: () => void;
  canRemove: boolean;
  eventEndsAt?: string;
  eventTimezone?: string;
  /** Event currency code (e.g. "EUR"), shown in the price placeholders. */
  eventCurrency?: string;
  /** Event-level (non-archived) form fields for the per-tier subset picker.
   *  Empty/omitted → the row is hidden (no event form configured). */
  eventFormFields?: TierEventFormFieldLike[];
}

export function EditableTierCard({
  tier,
  index,
  onChange,
  onRemove,
  canRemove,
  eventEndsAt,
  eventTimezone,
  eventCurrency = "USD",
  eventFormFields,
}: EditableTierCardProps) {
  const [stagesExpanded, setStagesExpanded] = useState(true);
  const [showFormFieldsSheet, setShowFormFieldsSheet] = useState(false);
  // Memoized so a parent re-render (e.g. React Query background refetch) while
  // the per-tier picker sheet is open doesn't produce a new array reference and
  // re-fire the sheet's reset effect, stomping the draft selection.
  const visibleEventFormFields = useMemo(
    () => (eventFormFields ?? []).filter((f) => !f.archived),
    [eventFormFields],
  );
  const hasEventForm = visibleEventFormFields.length > 0;
  // W4-C3 (Jun 2026): access-code toggle. Local state so the input collapses
  // when unchecked; the actual code lives on tier.secret_code.
  const [requireAccessCode, setRequireAccessCode] = useState(
    !!tier.secret_code,
  );
  const [stageName, setStageName] = useState("");
  const [stagePrice, setStagePrice] = useState("");
  const [stageQuantity, setStageQuantity] = useState("");
  // W4-C2 (May 2026): description for the next stage being added inline.
  const [stageDescription, setStageDescription] = useState("");
  const [priceText, setPriceText] = useState<string>(() =>
    tier.price_cents === 0 ? "" : (tier.price_cents / 100).toFixed(2)
  );
  const [quantityText, setQuantityText] = useState<string>(() =>
    tier.quantity_total ? String(tier.quantity_total) : ""
  );

  const updateTier = useCallback(
    (updates: Partial<CreateEventTierInput>) => {
      onChange({ ...tier, ...updates });
    },
    [tier, onChange]
  );

  const handleAddStage = useCallback(() => {
    if (!stageName.trim()) {
      Alert.alert("Validation", "Stage name is required.");
      return;
    }
    const priceCents = Math.round(parseFloat(stagePrice || "0") * 100);
    if (isNaN(priceCents) || priceCents < 0) {
      Alert.alert("Validation", "Stage price must be a valid non-negative number.");
      return;
    }
    const qty = parseInt(stageQuantity, 10);
    if (isNaN(qty) || qty < 1) {
      Alert.alert("Validation", "Stage quantity must be at least 1.");
      return;
    }
    const trimmedDescription = stageDescription.trim();
    const newStages: CreateEventTierStageInput[] = [
      ...(tier.stages ?? []),
      {
        name: stageName.trim(),
        price_cents: priceCents,
        quantity: qty,
        description: trimmedDescription.length === 0 ? null : trimmedDescription,
      },
    ];
    const newTotal = newStages.reduce((sum, s) => sum + s.quantity, 0);
    updateTier({ stages: newStages, quantity_total: newTotal });
    setStageName("");
    setStagePrice("");
    setStageQuantity("");
    setStageDescription("");
  }, [stageName, stagePrice, stageQuantity, stageDescription, tier.stages, tier.quantity_total, updateTier]);

  const handleRemoveStage = useCallback(
    (stageIndex: number) => {
      const current = tier.stages ?? [];
      if (current.length <= 1) return;
      const newStages = current.filter((_, i) => i !== stageIndex);
      const newTotal = newStages.reduce((sum, s) => sum + s.quantity, 0);
      updateTier({ stages: newStages, quantity_total: newTotal });
    },
    [tier.stages, updateTier]
  );

  // Commit valid values on every keystroke: onBlur alone isn't enough because
  // tapping "Create Event" while a field is still focused submits before the
  // blur fires, which saved the tier with price 0. Blur still normalizes.
  const handlePriceTextChange = useCallback(
    (text: string) => {
      setPriceText(text);
      const cents = Math.round(parseFloat(text || "0") * 100);
      const validated = isNaN(cents) || cents < 0 ? 0 : cents;
      if (validated !== tier.price_cents) {
        updateTier({ price_cents: validated });
      }
    },
    [tier.price_cents, updateTier]
  );

  const handleQuantityTextChange = useCallback(
    (text: string) => {
      setQuantityText(text);
      // Empty/invalid → 0 (not the previous value) so the tier can't be
      // submitted with a stale quantity; create-event's validation rejects
      // < 1 and blur still normalizes the field to 1.
      const n = parseInt(text, 10);
      const validated = isNaN(n) || n < 1 ? 0 : n;
      if (validated !== tier.quantity_total) {
        updateTier({ quantity_total: validated });
      }
    },
    [tier.quantity_total, updateTier]
  );

  const flushPriceToTier = useCallback(() => {
    const cents = Math.round(parseFloat(priceText || "0") * 100);
    const validated = isNaN(cents) || cents < 0 ? 0 : cents;
    if (validated !== tier.price_cents) {
      updateTier({ price_cents: validated });
    }
  }, [priceText, tier.price_cents, updateTier]);

  const flushQuantityToTier = useCallback(() => {
    const n = parseInt(quantityText, 10);
    const validated = isNaN(n) || n < 1 ? 1 : n;
    setQuantityText(String(validated));
    if (validated !== tier.quantity_total) {
      updateTier({ quantity_total: validated });
    }
  }, [quantityText, tier.quantity_total, updateTier]);

  const handleUseStagesToggle = useCallback(
    (useStages: boolean) => {
      if (useStages) {
        updateTier({
          useStages: true,
          quantity_total: tier.quantity_total || 50,
          stages: [],
        });
      } else {
        const total = (tier.stages ?? []).reduce((sum, s) => sum + s.quantity, 0);
        updateTier({
          useStages: false,
          stages: undefined,
          quantity_total: total || tier.quantity_total,
        });
      }
    },
    [tier.price_cents, tier.quantity_total, tier.stages, updateTier]
  );

  useEffect(() => {
    if (eventEndsAt && !tier.sales_end) {
      updateTier({ sales_end: eventEndsAt });
    }
  }, [eventEndsAt, tier.sales_end, updateTier]);

  // Sync text from tier state only when it no longer represents the stored
  // value (external change); otherwise keep the user's in-progress text (e.g.
  // "12." while typing "12.50") instead of reformatting it mid-keystroke.
  useEffect(() => {
    setPriceText((prev) => {
      const parsed = Math.round(parseFloat(prev || "0") * 100);
      const prevCents = isNaN(parsed) || parsed < 0 ? 0 : parsed;
      if (prevCents === tier.price_cents) return prev;
      return tier.price_cents === 0 ? "" : (tier.price_cents / 100).toFixed(2);
    });
  }, [tier.price_cents]);

  useEffect(() => {
    setQuantityText((prev) => {
      const parsed = parseInt(prev, 10);
      const prevQty = isNaN(parsed) || parsed < 1 ? 0 : parsed;
      if (prevQty === tier.quantity_total) return prev;
      return tier.quantity_total ? String(tier.quantity_total) : "";
    });
  }, [tier.quantity_total]);

  const tz = eventTimezone || "America/Guayaquil";

  const salesEndMinDate = tier.sales_start
    ? (() => {
        const utc = localToUtc(tier.sales_start, tz);
        return utc ? new Date(utc) : undefined;
      })()
    : undefined;

  return (
    <View className="bg-white-5 rounded-card p-4 gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-white-100 text-lg font-poppins-semibold">
          Tier {index + 1}
        </Text>
        <View className="flex-row items-center gap-2">
          <Pressable
            className="flex-row items-center gap-[6px]"
            onPress={() => handleUseStagesToggle(!tier.useStages)}
          >
            <Ionicons
              name={tier.useStages ? "checkbox" : "square-outline"}
              size={20}
              color={tier.useStages ? "#F9FBFE" : "rgba(255,255,255,0.5)"}
            />
            <Text className="text-white-80 text-sm font-poppins">Use Price Stages</Text>
          </Pressable>
          {canRemove && (
            <Pressable
              className="bg-white-100 rounded-full size-[36px] items-center justify-center"
              onPress={onRemove}
            >
              <Ionicons name="trash-outline" size={18} color="#292D32" />
            </Pressable>
          )}
        </View>
      </View>

      <View className="gap-2">
        <FormInput
          placeholder="Tier name"
          value={tier.name}
          onChangeText={(v) => updateTier({ name: v })}
          icon={<Ionicons name="pricetag-outline" size={20} color="rgba(255,255,255,0.5)" />}
        />
        {/* W4-C2 (May 2026): tier-level description shown on attendee tier
            cards under the price. Stage description (if set) replaces this on
            the public surface while the stage is active. */}
        <DescriptionInput
          placeholder="Description (optional) — what's included?"
          value={tier.description ?? ""}
          onChangeText={(v) => updateTier({ description: v })}
        />
        {!tier.useStages && (
          <>
            <FormInput
              placeholder="Total tickets quantity"
              value={quantityText}
              onChangeText={handleQuantityTextChange}
              onBlur={flushQuantityToTier}
              keyboardType="numeric"
              inputAccessoryViewID={NUMERIC_KEYBOARD_DONE_ID}
              icon={<Ionicons name="layers-outline" size={20} color="rgba(255,255,255,0.5)" />}
            />
            <FormInput
              placeholder={`Price (${eventCurrency}, e.g. 25.00)`}
              value={priceText}
              onChangeText={handlePriceTextChange}
              onBlur={flushPriceToTier}
              keyboardType="numeric"
              inputAccessoryViewID={NUMERIC_KEYBOARD_DONE_ID}
              icon={<Ionicons name="cash-outline" size={20} color="rgba(255,255,255,0.5)" />}
            />
          </>
        )}
        <DateTimePickerField
          title="Sale start date (optional)"
          placeholder="Sale start date and time (optional)"
          value={tier.sales_start}
          onChange={(v) => updateTier({ sales_start: v })}
          timezone={tz}
        />
        <DateTimePickerField
          title="Sale end date"
          placeholder="Sale end date and time"
          value={tier.sales_end}
          onChange={(v) => updateTier({ sales_end: v })}
          minimumDate={salesEndMinDate}
          timezone={tz}
        />
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="text-white-100 text-base font-poppins">Per user limit</Text>
        <QuantityStepper
          value={Math.max(1, Math.min(50, tier.per_user_limit ?? 1))}
          onIncrement={() =>
            updateTier({ per_user_limit: Math.min(50, (tier.per_user_limit ?? 1) + 1) })
          }
          onDecrement={() =>
            updateTier({ per_user_limit: Math.max(1, (tier.per_user_limit ?? 1) - 1) })
          }
        />
      </View>

      {/* W4-C3 (Jun 2026): Access code toggle + input. Mirrors EditTiersTab's
          add-new and edit-existing forms so organizers can set the code at
          create-event time. The code only takes effect when is_hidden=true. */}
      <Pressable
        onPress={() => {
          const next = !requireAccessCode;
          setRequireAccessCode(next);
          if (!next) updateTier({ secret_code: null });
        }}
        className="flex-row items-center gap-3 bg-white-5 border border-white-10 rounded-pill px-4 py-3"
      >
        <View
          className={`w-5 h-5 rounded border-2 items-center justify-center ${requireAccessCode ? "bg-white-100 border-white-100" : "bg-transparent border-white-30"}`}
        >
          {requireAccessCode && (
            <Ionicons name="checkmark" size={12} color="#041C2B" />
          )}
        </View>
        <Text className="text-white-100 text-sm leading-5 font-poppins flex-1">
          Require Access Code
        </Text>
      </Pressable>
      {requireAccessCode && (
        <>
          <FormInput
            placeholder="Min. 3 characters"
            value={tier.secret_code ?? ""}
            onChangeText={(t) => {
              // Trim + uppercase so the stored value matches the edit-flow
              // normalization. Empty → null (not "") so the server's hidden-
              // tier gate (`is_hidden && secret_code`) treats unset as unset.
              const normalized = t.trim().toUpperCase();
              updateTier({
                secret_code: normalized.length === 0 ? null : normalized,
              });
            }}
            icon={<Ionicons name="key-outline" size={20} color="rgba(255,255,255,0.5)" />}
          />
          {!tier.is_hidden && (
            <Text className="text-[#FBD68D] text-xs font-poppins -mt-2">
              Access codes only work on hidden tiers. Enable &ldquo;Hide tier&rdquo; below to require this code for unlock.
            </Text>
          )}
        </>
      )}

      {/* W4-C3 (Jun 2026): visibility + manual sold-out toggles. */}
      <View className="bg-white-5 border border-white-10 rounded-card">
        <Pressable
          onPress={() =>
            updateTier({ is_manually_sold_out: !tier.is_manually_sold_out })
          }
          className="flex-row items-start gap-3 px-4 py-3"
        >
          <View
            className={`w-5 h-5 rounded border-2 items-center justify-center mt-0.5 ${tier.is_manually_sold_out ? "bg-white-100 border-white-100" : "bg-transparent border-white-30"}`}
          >
            {tier.is_manually_sold_out && (
              <Ionicons name="checkmark" size={12} color="#041C2B" />
            )}
          </View>
          <View className="flex-1">
            <Text className="text-white-100 text-sm font-poppins-medium">
              Mark as sold out
            </Text>
            <Text className="text-white-50 text-xs font-poppins mt-0.5">
              Prevent new purchases. Attendees see &ldquo;Sold Out&rdquo;. Existing tickets and pending RSVPs are unaffected.
            </Text>
          </View>
        </Pressable>
        <View className="h-px bg-white-10" />
        <Pressable
          onPress={() => updateTier({ is_hidden: !tier.is_hidden })}
          className="flex-row items-start gap-3 px-4 py-3"
        >
          <View
            className={`w-5 h-5 rounded border-2 items-center justify-center mt-0.5 ${tier.is_hidden ? "bg-white-100 border-white-100" : "bg-transparent border-white-30"}`}
          >
            {tier.is_hidden && (
              <Ionicons name="checkmark" size={12} color="#041C2B" />
            )}
          </View>
          <View className="flex-1">
            <Text className="text-white-100 text-sm font-poppins-medium">
              Hide tier
            </Text>
            <Text className="text-white-50 text-xs font-poppins mt-0.5">
              Hide from attendees entirely. You&rsquo;ll still see and manage this tier on your dashboard.
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Per-tier registration form subset. Hidden when no event form is configured. */}
      {hasEventForm && (
        <Pressable
          onPress={() => setShowFormFieldsSheet(true)}
          className="flex-row items-center justify-between bg-white-5 border border-white-10 rounded-card px-4 py-3"
        >
          <View className="flex-1 mr-3">
            <Text className="text-white-100 text-sm font-poppins-medium">
              Registration form
            </Text>
            <Text className="text-white-50 text-xs font-poppins mt-0.5">
              {tier.registration_form_fields === null ||
              tier.registration_form_fields === undefined
                ? `All ${visibleEventFormFields.length} event field${visibleEventFormFields.length === 1 ? "" : "s"}`
                : `${tier.registration_form_fields.length} of ${visibleEventFormFields.length} selected`}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color="rgba(255,255,255,0.5)"
          />
        </Pressable>
      )}

      {tier.useStages && (
        <View className="gap-4">
          <Text className="text-white-80 text-base font-poppins-semibold">
            Price Stages
          </Text>
          <View className="gap-2">
            <FormInput
              placeholder="Stage name"
              value={stageName}
              onChangeText={setStageName}
              icon={<Ionicons name="pricetag-outline" size={20} color="rgba(255,255,255,0.5)" />}
            />
            <FormInput
              placeholder={`Price (${eventCurrency}, e.g. 10.00)`}
              value={stagePrice}
              onChangeText={setStagePrice}
              keyboardType="numeric"
              inputAccessoryViewID={NUMERIC_KEYBOARD_DONE_ID}
              icon={<Ionicons name="cash-outline" size={20} color="rgba(255,255,255,0.5)" />}
            />
            <FormInput
              placeholder="Quantity"
              value={stageQuantity}
              onChangeText={setStageQuantity}
              keyboardType="numeric"
              inputAccessoryViewID={NUMERIC_KEYBOARD_DONE_ID}
              icon={<Ionicons name="layers-outline" size={20} color="rgba(255,255,255,0.5)" />}
            />
            {/* W4-C2 (May 2026): per-stage description (optional). Shown on
                attendee tier cards while this stage is active. */}
            <DescriptionInput
              placeholder="Stage description (optional)"
              value={stageDescription}
              onChangeText={setStageDescription}
            />
            <Pressable
              onPress={handleAddStage}
              className="bg-white-100 rounded-pill py-[10px] px-6 self-start"
            >
              <Text className="text-dark text-sm font-poppins-medium">Add Stage</Text>
            </Pressable>
          </View>
          {(tier.stages ?? []).length > 0 && (
            <View className="gap-2">
              <Pressable
                className="flex-row items-center justify-between py-2"
                onPress={() => setStagesExpanded(!stagesExpanded)}
              >
                <Text className="text-white-100 font-poppins-semibold">
                  {tier.stages!.length} Stages
                </Text>
                <Ionicons
                  name={stagesExpanded ? "chevron-up" : "chevron-down"}
                  size={24}
                  color="#F9FBFE"
                />
              </Pressable>
              {stagesExpanded && (
                <View className="gap-2">
                  {tier.stages!.map((stage, stageIndex) => (
                    <StageCard
                      key={`stage-${stageIndex}`}
                      stage={{
                        id: `stage-${stageIndex}`,
                        stageName: stage.name,
                        tierName: tier.name,
                        price: stage.price_cents / 100,
                        startDate: tier.sales_start || "TBD",
                        endDate: tier.sales_end || "TBD",
                        ticketCount: stage.quantity,
                      }}
                      onDelete={
                        tier.stages!.length > 1
                          ? () => handleRemoveStage(stageIndex)
                          : undefined
                      }
                    />
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {hasEventForm && (
        <TierRegistrationFormSheet
          visible={showFormFieldsSheet}
          eventFormFields={visibleEventFormFields}
          value={tier.registration_form_fields ?? null}
          onChange={(next) => updateTier({ registration_form_fields: next })}
          onClose={() => setShowFormFieldsSheet(false)}
        />
      )}
    </View>
  );
}
