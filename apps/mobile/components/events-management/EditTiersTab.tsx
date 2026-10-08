/**
 * Edit tiers tab for existing events — wired to /api/ticket-tiers CRUD.
 *
 * Ported from: apps/web/app/components/organizer/TierInlineForm.tsx
 * and apps/web/app/api/ticket-tiers/route.ts (POST, PATCH, DELETE)
 */

import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  utcToLocal,
  localToUtc,
  formatCentsAsPrice,
  normalizeOptionalTicketTierSecretCode,
  normalizeTicketTierSecretCode,
  MAX_TICKET_TIERS_PER_EVENT,
  TIER_DESCRIPTION_MAX_LENGTH,
} from "@project-flame/lib";
import {
  useCreateTier,
  useUpdateTier,
  useDeleteTier,
  useForceReduceTier,
} from "../../hooks/useTierMutations";
import { DateTimePickerField } from "../create-event/DateTimePickerField";
import { StageCard } from "../create-event/StageCard";
import { TierRegistrationFormSheet } from "../create-event/TierRegistrationFormSheet";
import type { OrgEvent, OrgEventTier } from "../../hooks/useOrgEvents";
import type { FormField } from "../../hooks/useRsvpManagement";

function FormInput({
  placeholder,
  value,
  onChangeText,
  keyboardType,
  icon,
  editable = true,
  autoCapitalize,
  autoCorrect,
}: {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: "default" | "numeric";
  icon?: ReactNode;
  editable?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
}) {
  return (
    <View className={`bg-white-5 border border-white-10 rounded-pill flex-row items-center gap-4 p-4 ${!editable ? "opacity-50" : ""}`}>
      {icon}
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.5)"
        className="flex-1 text-white-100 text-sm leading-5 font-poppins"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        editable={editable}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
      />
    </View>
  );
}

// Managed stage shape — includes sold_quantity for delete guard
interface ManagedStage {
  id?: string;
  name: string;
  price_cents: number;
  quantity: number;
  order_index: number;
  sold_quantity: number;
  /** W4-C2 (May 2026): per-stage description (max 120 chars), optional. */
  description?: string | null;
}

/** W4-C2 (May 2026): multi-line description input with a 0/120 counter. Used
 *  in both the tier-level form and per-stage input. Kept inline so we don't
 *  introduce a new shared file just for two call sites. */
function DescriptionInput({
  placeholder,
  value,
  onChangeText,
}: {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <View className="bg-white-5 border border-white-10 rounded-card p-4 gap-2">
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.5)"
        className="text-white-100 text-sm leading-5 font-poppins min-h-[40px]"
        value={value}
        onChangeText={(t) => onChangeText(t.slice(0, TIER_DESCRIPTION_MAX_LENGTH))}
        maxLength={TIER_DESCRIPTION_MAX_LENGTH}
        multiline
        numberOfLines={2}
        textAlignVertical="top"
      />
      <Text className="text-white-30 text-[11px] font-poppins-light text-right">
        {value.length}/{TIER_DESCRIPTION_MAX_LENGTH}
      </Text>
    </View>
  );
}

function ExistingTierCard({
  tier,
  index,
  onDelete,
  deleting,
  readOnly,
  eventTimezone,
  eventEndsAt,
  eventCurrency,
  eventFormFields,
}: {
  tier: OrgEventTier;
  index: number;
  onDelete: () => void;
  deleting: boolean;
  readOnly?: boolean;
  eventTimezone: string;
  /** W0-Q4: event end (UTC) — pre-fills a null sales_end to the event end. */
  eventEndsAt?: string;
  eventCurrency: string;
  /** Non-archived event-level form fields. Empty/undefined → row is hidden. */
  eventFormFields?: FormField[];
}) {
  // W0-Q4: when a tier has no explicit sales_end, default the editor to the
  // event end (Ecuador-local), mirroring the create-event auto-fill. An
  // explicit sales_end is always preserved.
  const defaultSalesEndLocal = eventEndsAt
    ? utcToLocal(eventEndsAt, eventTimezone)
    : "";
  const available = Math.max(0, tier.quantity_total - tier.quantity_sold - (tier.quantity_reserved ?? 0));
  const pending = tier.quantity_reserved ?? 0;
  const hasSales = tier.quantity_sold > 0;
  const hasExistingStages = !!(tier.ticket_stages && tier.ticket_stages.length > 0);
  const [editing, setEditing] = useState(false);

  const updateTier = useUpdateTier();

  const initManagedStages = (): ManagedStage[] => {
    if (!tier.ticket_stages || tier.ticket_stages.length === 0) return [];
    return [...tier.ticket_stages]
      .sort((a, b) => ((a as { order_index?: number }).order_index ?? 0) - ((b as { order_index?: number }).order_index ?? 0))
      .map((s, i) => ({
        id: s.id,
        name: s.name,
        price_cents: s.price_cents,
        quantity: s.quantity,
        order_index: i,
        sold_quantity: s.sold_quantity,
        // W4-C2: persist existing description through the round-trip.
        description: typeof s.description === "string" ? s.description : null,
      }));
  };

  const [editName, setEditName] = useState(tier.name);
  const [editPrice, setEditPrice] = useState((tier.price_cents / 100).toFixed(2));
  const [editQuantity, setEditQuantity] = useState(String(tier.quantity_total));
  const [editPerUserLimit, setEditPerUserLimit] = useState(tier.per_user_limit != null ? String(tier.per_user_limit) : "");
  const [editSalesStart, setEditSalesStart] = useState(
    tier.sales_start ? utcToLocal(tier.sales_start, eventTimezone) : ""
  );
  const [editSalesEnd, setEditSalesEnd] = useState(
    tier.sales_end ? utcToLocal(tier.sales_end, eventTimezone) : defaultSalesEndLocal
  );
  const [requireAccessCode, setRequireAccessCode] = useState(!!tier.secret_code);
  const [editSecretCode, setEditSecretCode] = useState(
    tier.secret_code ? normalizeTicketTierSecretCode(tier.secret_code) : "",
  );
  const [editFormFields, setEditFormFields] = useState<string[] | null>(
    tier.registration_form_fields ?? null,
  );
  const [showFormFieldsSheet, setShowFormFieldsSheet] = useState(false);
  // W4-C1 (May 2026): organizer toggles. Both default false on tiers created
  // before the migration; only surfaced in edit mode (creation flow stays
  // minimal so organizers don't reach for these on first publish).
  const [editIsManuallySoldOut, setEditIsManuallySoldOut] = useState(
    tier.is_manually_sold_out === true,
  );
  const [editIsHidden, setEditIsHidden] = useState(tier.is_hidden === true);
  // W4-C2 (May 2026): tier-level description editor state.
  const [editDescription, setEditDescription] = useState<string>(
    typeof tier.description === "string" ? tier.description : "",
  );
  // W4-C1: in-flight flag for the force-reduce confirmation. Drives the Save
  // button's disabled state so the form can't be re-submitted while the
  // bulk cleanup runs.
  const [forceReducing, setForceReducing] = useState(false);
  const visibleEventFormFields = (eventFormFields ?? []).filter((f) => !f.archived);
  const hasEventForm = visibleEventFormFields.length > 0;

  // Stage state for staged tiers
  const [managedStages, setManagedStages] = useState<ManagedStage[]>(initManagedStages);
  const [stageName, setStageName] = useState("");
  const [stagePrice, setStagePrice] = useState("");
  const [stageQuantity, setStageQuantity] = useState("");
  // W4-C2 (May 2026): description for the next stage being added inline.
  const [stageDescription, setStageDescription] = useState("");
  const [stagesExpanded, setStagesExpanded] = useState(true);

  const handleStartEdit = () => {
    setEditName(tier.name);
    setEditPrice((tier.price_cents / 100).toFixed(2));
    setEditQuantity(String(tier.quantity_total));
    setEditPerUserLimit(tier.per_user_limit != null ? String(tier.per_user_limit) : "");
    setEditSalesStart(tier.sales_start ? utcToLocal(tier.sales_start, eventTimezone) : "");
    setEditSalesEnd(tier.sales_end ? utcToLocal(tier.sales_end, eventTimezone) : defaultSalesEndLocal);
    setRequireAccessCode(!!tier.secret_code);
    setEditSecretCode(tier.secret_code ? normalizeTicketTierSecretCode(tier.secret_code) : "");
    setEditFormFields(tier.registration_form_fields ?? null);
    setEditIsManuallySoldOut(tier.is_manually_sold_out === true);
    setEditIsHidden(tier.is_hidden === true);
    setEditDescription(typeof tier.description === "string" ? tier.description : "");
    setManagedStages(initManagedStages());
    setStageName("");
    setStagePrice("");
    setStageQuantity("");
    setStageDescription("");
    setStagesExpanded(true);
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleAddStageToEdit = () => {
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
    setManagedStages(prev => [
      ...prev,
      {
        name: stageName.trim(),
        price_cents: priceCents,
        quantity: qty,
        order_index: prev.length,
        sold_quantity: 0,
        description: trimmedDescription.length === 0 ? null : trimmedDescription,
      },
    ]);
    setStageName("");
    setStagePrice("");
    setStageQuantity("");
    setStageDescription("");
  };

  const handleRemoveStageFromEdit = (idx: number) => {
    setManagedStages(prev =>
      prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order_index: i }))
    );
  };

  // W4-C2 (May 2026): edit the description of an already-added managed stage
  // (existing DB stage or one added this session). Empty string is kept as-is
  // here; handleSaveEdit normalizes "" → null before sending to the API.
  const handleUpdateStageDescription = (idx: number, text: string) => {
    const next = text.slice(0, TIER_DESCRIPTION_MAX_LENGTH);
    setManagedStages(prev =>
      prev.map((s, i) => (i === idx ? { ...s, description: next } : s)),
    );
  };

  const handleSaveEdit = async () => {
    const updates: Record<string, unknown> = { id: tier.id };
    let hasChanges = false;
    // W4-C1: set when a quantity reduction is blocked only by reserved tickets
    // (holds + pending RSVPs). We keep building the rest of `updates` so the
    // force-reduce confirmation can persist the organizer's other edits too,
    // instead of discarding them. Null when no force-reduce is needed.
    let pendingForceReduce: {
      requested_quantity: number;
      quantity_sold: number;
      quantity_reserved: number;
    } | null = null;

    if (editName.trim() !== tier.name) {
      if (!editName.trim()) {
        Alert.alert("Validation", "Tier name is required.");
        return;
      }
      updates.name = editName.trim();
      hasChanges = true;
    }

    if (hasExistingStages) {
      if (managedStages.length < 1) {
        Alert.alert("Validation", "At least one stage is required.");
        return;
      }
      const originalStages = initManagedStages();
      const stageDiffers =
        managedStages.length !== originalStages.length ||
        managedStages.some((s, i) => {
          const o = originalStages[i];
          return (
            s.id !== o.id ||
            s.name !== o.name ||
            s.price_cents !== o.price_cents ||
            s.quantity !== o.quantity ||
            // W4-C2: description diff (treat empty + null as equal).
            ((s.description ?? "") !== (o.description ?? ""))
          );
        });
      if (stageDiffers) {
        updates.useStages = true;
        updates.stages = managedStages.map((s, i) => {
          const trimmed =
            typeof s.description === "string" ? s.description.trim() : "";
          return {
            ...(s.id ? { id: s.id } : {}),
            name: s.name,
            price_cents: s.price_cents,
            quantity: s.quantity,
            order_index: i,
            description: trimmed.length === 0 ? null : trimmed,
          };
        });
        hasChanges = true;
      }
    } else {
      const priceCents = Math.round(parseFloat(editPrice || "0") * 100);
      if (isNaN(priceCents) || priceCents < 0) {
        Alert.alert("Validation", "Price must be a valid non-negative number.");
        return;
      }
      if (priceCents !== tier.price_cents) {
        updates.price_cents = priceCents;
        hasChanges = true;
      }
      const qty = parseInt(editQuantity, 10);
      if (isNaN(qty) || qty < 1) {
        Alert.alert("Validation", "Quantity must be at least 1.");
        return;
      }
      const minAllowedQty = tier.quantity_sold + (tier.quantity_reserved ?? 0);
      if (minAllowedQty > 0 && qty < minAllowedQty) {
        // W4-C1 (May 2026): when the only thing blocking the reduction is
        // active holds + pending RSVPs, defer to a force-reduce confirmation.
        // Sold tickets are still a hard floor — server enforces this too.
        // We DON'T return here; we record the intent and keep collecting the
        // organizer's other edits so they survive the force-reduce path.
        if (qty >= tier.quantity_sold) {
          pendingForceReduce = {
            requested_quantity: qty,
            quantity_sold: tier.quantity_sold,
            quantity_reserved: tier.quantity_reserved ?? 0,
          };
          // Capacity is applied by the force-reduce endpoint, not this PATCH.
        } else {
          Alert.alert(
            "Validation",
            `Cannot reduce quantity to ${qty}. ${tier.quantity_sold} ticket${tier.quantity_sold !== 1 ? "s" : ""} sold — minimum is ${tier.quantity_sold}.`,
          );
          return;
        }
      } else if (qty !== tier.quantity_total) {
        updates.quantity_total = qty;
        hasChanges = true;
      }
      let newPerUserLimit: number | null = null;
      if (editPerUserLimit.trim() !== "") {
        const perUser = parseInt(editPerUserLimit, 10);
        if (isNaN(perUser) || perUser < 1 || perUser > 50) {
          Alert.alert("Validation", "Per user limit must be between 1 and 50, or leave blank for unlimited.");
          return;
        }
        newPerUserLimit = perUser;
      }
      if (newPerUserLimit !== tier.per_user_limit) {
        updates.per_user_limit = newPerUserLimit;
        hasChanges = true;
      }
    }

    if (editSalesStart || editSalesEnd) {
      const startUtc = editSalesStart ? localToUtc(editSalesStart, eventTimezone) : tier.sales_start;
      const endUtc = editSalesEnd ? localToUtc(editSalesEnd, eventTimezone) : tier.sales_end;
      if (startUtc && endUtc && new Date(endUtc) <= new Date(startUtc)) {
        Alert.alert("Invalid Sale Window", "Sale end must be after sale start.");
        return;
      }
      if (editSalesStart && startUtc && startUtc !== tier.sales_start) {
        updates.sales_start = startUtc;
        hasChanges = true;
      }
      if (editSalesEnd && endUtc && endUtc !== tier.sales_end) {
        // W0-Q4: a null sales_end is pre-filled to the event end for display
        // only. Don't persist that prefill as a change when the organizer never
        // touched the field (still equal to the default) — otherwise saving an
        // unrelated field (e.g. name) silently writes sales_end = event end.
        const isUntouchedPrefill =
          !tier.sales_end && editSalesEnd === defaultSalesEndLocal;
        if (!isUntouchedPrefill) {
          updates.sales_end = endUtc;
          hasChanges = true;
        }
      }
    }

    if (requireAccessCode) {
      const trimmedCode = normalizeTicketTierSecretCode(editSecretCode);
      if (trimmedCode.length === 0) {
        Alert.alert("Validation", "Access code is required.");
        return;
      }
      if (trimmedCode.length < 3) {
        Alert.alert("Validation", "Access code must be at least 3 characters.");
        return;
      }
      const prevStored = normalizeOptionalTicketTierSecretCode(tier.secret_code ?? undefined);
      if (trimmedCode !== (prevStored ?? "")) {
        updates.secret_code = trimmedCode;
        hasChanges = true;
      }
    } else if ((tier.secret_code ?? null) !== null) {
      updates.secret_code = null;
      hasChanges = true;
    }

    // Per-tier registration form subset. Only diff when an event-level form exists.
    if (hasEventForm) {
      const prev = tier.registration_form_fields ?? null;
      const next = editFormFields;
      const sameArray =
        Array.isArray(prev) &&
        Array.isArray(next) &&
        prev.length === next.length &&
        prev.every((v, i) => v === next[i]);
      const changed = (prev === null) !== (next === null) || (prev !== null && next !== null && !sameArray);
      if (changed) {
        updates.registration_form_fields = next;
        hasChanges = true;
      }
    }

    // W4-C1 organizer toggles
    if (editIsManuallySoldOut !== (tier.is_manually_sold_out === true)) {
      updates.is_manually_sold_out = editIsManuallySoldOut;
      hasChanges = true;
    }
    if (editIsHidden !== (tier.is_hidden === true)) {
      updates.is_hidden = editIsHidden;
      hasChanges = true;
    }

    // W4-C2 (May 2026) tier-level description diff. Treat empty string and
    // null as equivalent so toggling focus on an already-blank field doesn't
    // count as a change. Trim trailing whitespace.
    const trimmedDescription = editDescription.trim();
    const nextDescription = trimmedDescription.length === 0 ? null : trimmedDescription;
    const prevDescription =
      typeof tier.description === "string" && tier.description.length > 0
        ? tier.description
        : null;
    if (nextDescription !== prevDescription) {
      updates.description = nextDescription;
      hasChanges = true;
    }

    if (!hasChanges && !pendingForceReduce) {
      Alert.alert("No Changes", "No changes to save.");
      return;
    }

    // W4-C1/Bug 3: quantity reduction is blocked by reserved tickets. Confirm
    // the force-reduce, then persist the organizer's OTHER edits (name, dates,
    // description, toggles, etc.) so they aren't silently discarded. `updates`
    // carries those other fields (capacity is handled by the force-reduce call).
    if (pendingForceReduce) {
      promptForceReduce(pendingForceReduce, hasChanges ? updates : null);
      return;
    }

    try {
      await updateTier.mutateAsync(updates as { id: string; [key: string]: unknown });
      Alert.alert("Success", "Tier updated successfully.");
      setEditing(false);
    } catch (err) {
      // W4-C1: server may also surface QUANTITY_BELOW_RESERVED if a hold/RSVP
      // is created between our client guard and the PATCH. The whole PATCH was
      // rejected atomically, so pass `updates` to the confirmation handler to
      // re-apply ALL edited fields after the capacity reduction succeeds.
      const errCode =
        err && typeof err === "object" && "code" in err
          ? (err as { code?: string }).code
          : undefined;
      const errDetails =
        err && typeof err === "object" && "details" in err
          ? (err as { details?: Record<string, number> }).details
          : undefined;
      if (errCode === "QUANTITY_BELOW_RESERVED" && errDetails) {
        promptForceReduce(
          {
            requested_quantity: errDetails.requested_quantity ?? 0,
            quantity_sold: errDetails.quantity_sold ?? 0,
            quantity_reserved: errDetails.quantity_reserved ?? 0,
          },
          updates,
        );
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to update tier";
      Alert.alert("Error", message);
    }
  };

  const forceReduceTier = useForceReduceTier();

  const promptForceReduce = (
    prompt: {
      requested_quantity: number;
      quantity_sold: number;
      quantity_reserved: number;
    },
    // Bug 3: other edited fields to persist AFTER the capacity reduction
    // (null when capacity was the only change). The force-reduce endpoint owns
    // the quantity change; this is everything else the organizer touched.
    otherUpdates: Record<string, unknown> | null = null,
  ) => {
    const soldClause =
      prompt.quantity_sold > 0
        ? `${prompt.quantity_sold} sold ticket${prompt.quantity_sold === 1 ? "" : "s"} can't be removed. `
        : "";
    Alert.alert(
      "Reduce capacity?",
      `${soldClause}Reducing this tier to ${prompt.requested_quantity} will cancel all ${prompt.quantity_reserved} active checkout hold${prompt.quantity_reserved === 1 ? "" : "s"} + pending RSVP${prompt.quantity_reserved === 1 ? "" : "s"} for this tier. Affected attendees will be notified by email and push, and any pending Stripe authorizations will be released. Sold tickets are unaffected.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Force reduce",
          style: "destructive",
          onPress: async () => {
            setForceReducing(true);
            try {
              await forceReduceTier.mutateAsync({
                tierId: tier.id,
                new_quantity_total: prompt.requested_quantity,
              });
              // Bug 3: persist the organizer's other edits now that the
              // blocking holds/RSVPs are cleared. Skip if capacity was the only
              // change (otherUpdates null, or just the `{ id }` marker).
              const hasOtherEdits =
                otherUpdates !== null &&
                Object.keys(otherUpdates).some((k) => k !== "id");
              if (hasOtherEdits) {
                await updateTier.mutateAsync(
                  otherUpdates as { id: string; [key: string]: unknown },
                );
              }
              Alert.alert(
                "Capacity reduced",
                "Affected attendees have been notified.",
              );
              setEditing(false);
            } catch (innerErr) {
              const message =
                innerErr instanceof Error
                  ? innerErr.message
                  : "Force reduce failed";
              Alert.alert("Error", message);
            } finally {
              setForceReducing(false);
            }
          },
        },
      ],
    );
  };

  if (editing) {
    return (
      <View className="bg-white-5 rounded-card px-4 py-3 gap-3">
        {/* Header */}
        <View className="flex-row items-start justify-between gap-3 pb-2 border-b border-white-10">
          <Text
            className="flex-1 text-white-100 text-lg font-poppins-semibold uppercase"
            numberOfLines={2}
          >
            Edit Tier {index + 1}
          </Text>
          <View className="flex-row items-center gap-3 shrink-0">
            {/* Disabled checkbox — locked after tier creation (web parity) */}
            <Pressable disabled className="flex-row items-center gap-[6px] opacity-50">
              <Ionicons
                name={hasExistingStages ? "checkbox" : "square-outline"}
                size={20}
                color={hasExistingStages ? "#F9FBFE" : "rgba(255,255,255,0.5)"}
              />
              <Text className="text-white-80 text-sm font-poppins">Use Price Stages</Text>
            </Pressable>
            <Pressable
              onPress={handleCancelEdit}
              className="border border-white-30 rounded-pill py-[6px] px-4"
            >
              <Text className="text-white-100 text-xs font-poppins-medium">Cancel</Text>
            </Pressable>
          </View>
        </View>

        {(hasSales || pending > 0) && !hasExistingStages && (
          <View className="bg-[#EAB308]/10 rounded-card p-3">
            <Text className="text-[#EAB308] text-xs font-poppins-medium">
              {hasSales && pending > 0
                ? `This tier has ${tier.quantity_sold} sold ticket${tier.quantity_sold !== 1 ? "s" : ""} and ${pending} reserved (active checkout holds + pending RSVPs). Reducing below ${tier.quantity_sold + pending} will cancel the reserved tickets after confirmation.`
                : hasSales
                  ? `This tier has ${tier.quantity_sold} sold ticket${tier.quantity_sold !== 1 ? "s" : ""}. Quantity cannot be reduced below sold count.`
                  : `This tier has ${pending} reserved (active checkout holds + pending RSVPs). Reducing below ${pending} will cancel them after confirmation.`}
            </Text>
          </View>
        )}

        <View className="gap-2">
          <FormInput
            placeholder="Tier name"
            value={editName}
            onChangeText={setEditName}
            icon={<Ionicons name="pricetag-outline" size={20} color="rgba(255,255,255,0.5)" />}
          />
          {/* W4-C2 (May 2026): tier-level organizer description. Stage
              description (when set) replaces this on attendee surfaces. */}
          <DescriptionInput
            placeholder="Description (optional) — what's included?"
            value={editDescription}
            onChangeText={setEditDescription}
          />

          {!hasExistingStages && (
            <>
              <FormInput
                placeholder="Total quantity"
                value={editQuantity}
                onChangeText={setEditQuantity}
                keyboardType="numeric"
                icon={<Ionicons name="layers-outline" size={20} color="rgba(255,255,255,0.5)" />}
              />
              <FormInput
                placeholder={`Price (${eventCurrency}, e.g. 25.00)`}
                value={editPrice}
                onChangeText={setEditPrice}
                keyboardType="numeric"
                icon={<Ionicons name="cash-outline" size={20} color="rgba(255,255,255,0.5)" />}
              />
              <FormInput
                placeholder="Per user limit (1-50, blank = unlimited)"
                value={editPerUserLimit}
                onChangeText={setEditPerUserLimit}
                keyboardType="numeric"
                icon={<Ionicons name="person-outline" size={20} color="rgba(255,255,255,0.5)" />}
              />
            </>
          )}

          <DateTimePickerField
            title="Sale start date"
            placeholder="Sale start date and time"
            value={editSalesStart}
            onChange={setEditSalesStart}
            timezone={eventTimezone}
          />
          <DateTimePickerField
            title="Sale end date"
            placeholder="Sale end date and time"
            value={editSalesEnd}
            onChange={setEditSalesEnd}
            timezone={eventTimezone}
          />

          {/* Access Code */}
          <Pressable
            onPress={() => {
              setRequireAccessCode(prev => !prev);
              if (requireAccessCode) setEditSecretCode("");
            }}
            className="flex-row items-center gap-3 bg-white-5 border border-white-10 rounded-pill px-4 py-3"
          >
            <View className={`w-5 h-5 rounded border-2 items-center justify-center ${requireAccessCode ? "bg-white-100 border-white-100" : "bg-transparent border-white-30"}`}>
              {requireAccessCode && <Ionicons name="checkmark" size={12} color="#041C2B" />}
            </View>
            <Text className="text-white-100 text-sm leading-5 font-poppins flex-1">
              Require Access Code
            </Text>
          </Pressable>
          {requireAccessCode && (
            <>
              <FormInput
                placeholder="Min. 3 characters"
                value={editSecretCode}
                onChangeText={(t) => setEditSecretCode(t.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                icon={<Ionicons name="key-outline" size={20} color="rgba(255,255,255,0.5)" />}
              />
              {!editIsHidden && (
                <Text className="text-[#FBD68D] text-xs font-poppins -mt-1">
                  Access codes only work on hidden tiers. Enable &ldquo;Hide tier&rdquo; below to require this code for unlock.
                </Text>
              )}
            </>
          )}

          {/* Per-tier registration form subset (hidden when no event form configured) */}
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
                  {editFormFields === null
                    ? `All ${visibleEventFormFields.length} event field${visibleEventFormFields.length === 1 ? "" : "s"}`
                    : `${editFormFields.length} of ${visibleEventFormFields.length} selected`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
            </Pressable>
          )}

          {/* W4-C1 (May 2026): organizer toggles. */}
          <View className="bg-white-5 border border-white-10 rounded-card">
            <Pressable
              onPress={() => setEditIsManuallySoldOut(prev => !prev)}
              className="flex-row items-start gap-3 px-4 py-3"
            >
              <View
                className={`w-5 h-5 rounded border-2 items-center justify-center mt-0.5 ${editIsManuallySoldOut ? "bg-white-100 border-white-100" : "bg-transparent border-white-30"}`}
              >
                {editIsManuallySoldOut && (
                  <Ionicons name="checkmark" size={12} color="#041C2B" />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-white-100 text-sm font-poppins-medium">
                  Mark as sold out
                </Text>
                <Text className="text-white-50 text-xs font-poppins mt-0.5">
                  Prevent new purchases. Attendees see “Sold Out”. Existing tickets and pending RSVPs are unaffected.
                </Text>
              </View>
            </Pressable>
            <View className="h-px bg-white-10" />
            <Pressable
              onPress={() => setEditIsHidden(prev => !prev)}
              className="flex-row items-start gap-3 px-4 py-3"
            >
              <View
                className={`w-5 h-5 rounded border-2 items-center justify-center mt-0.5 ${editIsHidden ? "bg-white-100 border-white-100" : "bg-transparent border-white-30"}`}
              >
                {editIsHidden && (
                  <Ionicons name="checkmark" size={12} color="#041C2B" />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-white-100 text-sm font-poppins-medium">
                  Hide tier
                </Text>
                <Text className="text-white-50 text-xs font-poppins mt-0.5">
                  Hide from attendees entirely. You’ll still see and manage this tier on your dashboard.
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* Stages section — only shown for staged tiers */}
        {hasExistingStages && (
          <View className="gap-4">
            <Text className="text-white-80 text-base font-poppins-semibold">Price Stages</Text>
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
                icon={<Ionicons name="cash-outline" size={20} color="rgba(255,255,255,0.5)" />}
              />
              <FormInput
                placeholder="Quantity"
                value={stageQuantity}
                onChangeText={setStageQuantity}
                keyboardType="numeric"
                icon={<Ionicons name="layers-outline" size={20} color="rgba(255,255,255,0.5)" />}
              />
              {/* W4-C2 (May 2026): per-stage description (optional). Replaces
                  tier description on attendee tier cards while this stage is
                  active. */}
              <DescriptionInput
                placeholder="Stage description (optional)"
                value={stageDescription}
                onChangeText={setStageDescription}
              />
              <Pressable
                onPress={handleAddStageToEdit}
                className="bg-white-100 rounded-pill py-[10px] px-6 self-start"
              >
                <Text style={{ color: "#041C2B" }} className="text-sm font-poppins-medium">Add Stage</Text>
              </Pressable>
            </View>
            {managedStages.length > 0 && (
              <View className="gap-2">
                <Pressable
                  className="flex-row items-center justify-between py-2"
                  onPress={() => setStagesExpanded(v => !v)}
                >
                  <Text className="text-white-100 font-poppins-semibold">
                    {managedStages.length} {managedStages.length === 1 ? "Stage" : "Stages"}
                  </Text>
                  <Ionicons
                    name={stagesExpanded ? "chevron-up" : "chevron-down"}
                    size={24}
                    color="#F9FBFE"
                  />
                </Pressable>
                {stagesExpanded && (
                  <View className="gap-2">
                    {managedStages.map((stage, idx) => (
                      <View key={stage.id ?? `new-${idx}`} className="gap-2">
                        <StageCard
                          stage={{
                            id: stage.id ?? `new-${idx}`,
                            stageName: stage.name,
                            tierName: editName || tier.name,
                            price: stage.price_cents / 100,
                            startDate: editSalesStart || tier.sales_start || "TBD",
                            endDate: editSalesEnd || tier.sales_end || "TBD",
                            ticketCount: stage.quantity,
                          }}
                          onDelete={
                            managedStages.length > 1 && stage.sold_quantity === 0
                              ? () => handleRemoveStageFromEdit(idx)
                              : undefined
                          }
                        />
                        {/* W4-C2 (May 2026): edit/add a per-stage description on
                            an existing stage (web TierInlineForm parity). Shown
                            on attendee tier cards while this stage is active. */}
                        <DescriptionInput
                          placeholder="Stage description (optional)"
                          value={stage.description ?? ""}
                          onChangeText={(t) => handleUpdateStageDescription(idx, t)}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        <View className="items-end">
          <Pressable
            onPress={handleSaveEdit}
            disabled={updateTier.isPending || forceReducing}
            className={`bg-white-100 rounded-pill py-[10px] px-6 flex-row items-center gap-2 ${
              updateTier.isPending || forceReducing ? "opacity-60" : ""
            }`}
          >
            {(updateTier.isPending || forceReducing) && (
              <ActivityIndicator size="small" color="#041C2B" />
            )}
            <Text style={{ color: "#041C2B" }} className="text-sm leading-[22px] font-poppins-medium">
              {forceReducing
                ? "Reducing..."
                : updateTier.isPending
                  ? "Saving..."
                  : "Save Changes"}
            </Text>
          </Pressable>
        </View>

        {hasEventForm && (
          <TierRegistrationFormSheet
            visible={showFormFieldsSheet}
            eventFormFields={visibleEventFormFields}
            value={editFormFields}
            onChange={setEditFormFields}
            onClose={() => setShowFormFieldsSheet(false)}
          />
        )}
      </View>
    );
  }

  return (
    <View
      className={`bg-white-5 rounded-card px-4 py-3 gap-3 ${tier.is_hidden ? "opacity-60" : ""}`}
    >
      <View className="flex-row items-start justify-between gap-3 pb-2 border-b border-white-10">
        <View className="flex-1">
          <Text
            className="text-white-100 text-lg font-poppins-semibold uppercase"
            numberOfLines={2}
          >
            Tier {index + 1}: {tier.name}
          </Text>
          {(tier.is_hidden || tier.is_manually_sold_out) && (
            <View className="flex-row items-center gap-2 mt-1.5">
              {tier.is_hidden && (
                <View className="px-2 py-0.5 rounded-pill bg-white-10">
                  <Text className="text-white-80 text-[10px] font-poppins-medium uppercase tracking-wider">
                    Hidden
                  </Text>
                </View>
              )}
              {tier.is_manually_sold_out && (
                <View className="px-2 py-0.5 rounded-pill bg-[#EAB308]/20">
                  <Text className="text-[#EAB308] text-[10px] font-poppins-medium uppercase tracking-wider">
                    Marked as Sold Out
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
        {!readOnly && (
          <View className="flex-row gap-2 shrink-0">
            <Pressable
              onPress={handleStartEdit}
              className="bg-white-10 rounded-full size-[36px] items-center justify-center"
            >
              <Ionicons name="pencil-outline" size={18} color="#F9FBFE" />
            </Pressable>
            <Pressable
              onPress={onDelete}
              disabled={deleting || hasSales}
              className={`bg-white-100 rounded-full size-[36px] items-center justify-center ${
                hasSales ? "opacity-30" : ""
              }`}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#292D32" />
              ) : (
                <Ionicons name="trash-outline" size={18} color="#292D32" />
              )}
            </Pressable>
          </View>
        )}
      </View>

      <View className="flex-row items-center gap-8">
        <View className="flex-row items-center gap-2">
          <View className="bg-white-10 rounded-full size-[36px] items-center justify-center">
            <Ionicons name="cash-outline" size={20} color="#F9FBFE" />
          </View>
          <Text className="text-white-100 text-base leading-[22px] font-poppins-medium">
            {formatCentsAsPrice(tier.price_cents, eventCurrency)}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <View className="bg-white-10 rounded-full size-[36px] items-center justify-center">
            <MaterialCommunityIcons name="ticket-outline" size={20} color="#F9FBFE" />
          </View>
          <Text className="text-white-100 text-xs leading-4 font-poppins-medium">
            {available}/{tier.quantity_total} available
            {pending > 0 ? ` · ${pending} reserved` : ""}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-8">
        <View className="flex-row items-center gap-2">
          <View className="bg-white-10 rounded-full size-[36px] items-center justify-center">
            <MaterialCommunityIcons name="account-outline" size={20} color="#F9FBFE" />
          </View>
          <Text className="text-white-100 text-xs leading-4 font-poppins-medium">
            {tier.per_user_limit != null ? `${tier.per_user_limit} per user` : "Unlimited"}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <View className="bg-white-10 rounded-full size-[36px] items-center justify-center">
            <MaterialCommunityIcons name="cart-outline" size={20} color="#F9FBFE" />
          </View>
          <Text className="text-white-100 text-xs leading-4 font-poppins-medium">
            {tier.quantity_sold} sold
          </Text>
        </View>
      </View>

      {tier.secret_code && (
        <View className="flex-row items-center gap-2 border-t border-white-10 pt-2">
          <Ionicons name="key-outline" size={16} color="rgba(255,255,255,0.5)" />
          <Text className="text-white-50 text-xs font-poppins">
            Access code required
          </Text>
        </View>
      )}

      {tier.ticket_stages && tier.ticket_stages.length > 0 && (
        <View className="border-t border-white-10 pt-2 gap-1">
          <Text className="text-white-50 text-xs font-poppins-medium">
            Stages ({tier.ticket_stages.length}):
          </Text>
          {tier.ticket_stages.map((stage) => {
            const stageReserved = stage.quantity_reserved ?? 0;
            // W0-Q6: remaining-led count to match web (`{remaining}/{qty} left`).
            const stageRemaining = Math.max(
              0,
              stage.quantity - stage.sold_quantity - stageReserved,
            );
            return (
              <Text
                key={stage.id}
                className="text-white-80 text-xs font-poppins"
              >
                {stage.name} —{" "}
                {formatCentsAsPrice(stage.price_cents, eventCurrency)} (
                {stageRemaining}/{stage.quantity} left
                {stageReserved > 0 ? ` · ${stageReserved} reserved` : ""})
              </Text>
            );
          })}
        </View>
      )}
    </View>
  );
}

interface EditTiersTabProps {
  event: OrgEvent | null;
  readOnly?: boolean;
}

export function EditTiersTab({ event, readOnly = false }: EditTiersTabProps) {
  const createTier = useCreateTier();
  const deleteTier = useDeleteTier();
  const [deletingTierId, setDeletingTierId] = useState<string | null>(null);

  const [tierName, setTierName] = useState("");
  const [tierQuantity, setTierQuantity] = useState("");
  const [tierPrice, setTierPrice] = useState("");
  const [tierPerUserLimit, setTierPerUserLimit] = useState("20");
  const [salesStart, setSalesStart] = useState("");
  // W0-Q4: default the new-tier sales_end to the event end (Ecuador-local),
  // mirroring the create-event auto-fill. Lazy-init from the loaded event.
  const [salesEnd, setSalesEnd] = useState(() =>
    event?.ends_at
      ? utcToLocal(event.ends_at, event?.timezone ?? "America/Guayaquil")
      : "",
  );
  const [requireNewAccessCode, setRequireNewAccessCode] = useState(false);
  const [newSecretCode, setNewSecretCode] = useState("");
  // W4-C3 (Jun 2026): visibility + manual sold-out toggles for the new-tier
  // form, matching the per-tier edit form. Lets organizers create a hidden
  // (access-code-only) tier in one step rather than create-then-edit.
  const [newIsHidden, setNewIsHidden] = useState(false);
  const [newIsManuallySoldOut, setNewIsManuallySoldOut] = useState(false);
  const [newFormFields, setNewFormFields] = useState<string[] | null>(null);
  const [showNewFormFieldsSheet, setShowNewFormFieldsSheet] = useState(false);
  // W4-C2 (May 2026): tier-level description for the new-tier form.
  const [newTierDescription, setNewTierDescription] = useState("");

  // Stage state for the new-tier form
  const [useStages, setUseStages] = useState(false);
  const [newStages, setNewStages] = useState<{
    name: string;
    price_cents: number;
    quantity: number;
    description?: string | null;
  }[]>([]);
  const [newStageName, setNewStageName] = useState("");
  const [newStagePrice, setNewStagePrice] = useState("");
  const [newStageQuantity, setNewStageQuantity] = useState("");
  // W4-C2 (May 2026): stage description for the new-tier form's inline stage adder.
  const [newStageDescription, setNewStageDescription] = useState("");
  const [newStagesExpanded, setNewStagesExpanded] = useState(true);

  const tz = event?.timezone ?? "America/Guayaquil";
  const visibleEventFormFields = (event?.registration_form_config ?? []).filter(
    (f) => !f.archived,
  );
  const hasEventForm = visibleEventFormFields.length > 0;

  // W0-Q4: event end (Ecuador-local) used as the new-tier sales_end default.
  const defaultSalesEnd = event?.ends_at ? utcToLocal(event.ends_at, tz) : "";
  // Seed the blank sales_end to the event end once, after the event loads (the
  // component renders a loading state while `event` is null, so the lazy init
  // above can miss it). The ref ensures we never re-seed after the organizer
  // edits or clears the field.
  const salesEndSeededRef = useRef(false);
  useEffect(() => {
    // Mark as handled the first time the field is already populated (lazy-init
    // from event.ends_at) OR we seed it from the default — either way, the ref
    // then prevents any future automatic re-seed after the organizer clears it.
    if (!salesEndSeededRef.current && (salesEnd || defaultSalesEnd)) {
      salesEndSeededRef.current = true;
      if (!salesEnd && defaultSalesEnd) setSalesEnd(defaultSalesEnd);
    }
  }, [defaultSalesEnd, salesEnd]);

  const resetForm = useCallback(() => {
    setTierName("");
    setTierQuantity("");
    setTierPrice("");
    setTierPerUserLimit("20");
    setSalesStart("");
    setSalesEnd(defaultSalesEnd);
    setRequireNewAccessCode(false);
    setNewSecretCode("");
    setNewIsHidden(false);
    setNewIsManuallySoldOut(false);
    setNewFormFields(null);
    setNewTierDescription("");
    setUseStages(false);
    setNewStages([]);
    setNewStageName("");
    setNewStagePrice("");
    setNewStageQuantity("");
    setNewStageDescription("");
    setNewStagesExpanded(true);
  }, [defaultSalesEnd]);

  if (!event) {
    return (
      <View className="px-4 py-12 items-center">
        <Text className="text-white-50 text-sm font-poppins">No event selected.</Text>
      </View>
    );
  }

  const handleAddNewStage = () => {
    if (!newStageName.trim()) {
      Alert.alert("Validation", "Stage name is required.");
      return;
    }
    const priceCents = Math.round(parseFloat(newStagePrice || "0") * 100);
    if (isNaN(priceCents) || priceCents < 0) {
      Alert.alert("Validation", "Stage price must be a valid non-negative number.");
      return;
    }
    const qty = parseInt(newStageQuantity, 10);
    if (isNaN(qty) || qty < 1) {
      Alert.alert("Validation", "Stage quantity must be at least 1.");
      return;
    }
    const trimmedDescription = newStageDescription.trim();
    setNewStages(prev => [
      ...prev,
      {
        name: newStageName.trim(),
        price_cents: priceCents,
        quantity: qty,
        description: trimmedDescription.length === 0 ? null : trimmedDescription,
      },
    ]);
    setNewStageName("");
    setNewStagePrice("");
    setNewStageQuantity("");
    setNewStageDescription("");
  };

  const handleRemoveNewStage = (idx: number) => {
    if (newStages.length <= 1) return;
    setNewStages(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCreateTier = async () => {
    if (!tierName.trim()) {
      Alert.alert("Validation", "Tier name is required.");
      return;
    }
    if (!salesEnd) {
      Alert.alert("Validation", "Sale end date is required.");
      return;
    }
    const startUtc = salesStart ? localToUtc(salesStart, tz) : null;
    const endUtc = localToUtc(salesEnd, tz);
    if (!endUtc) {
      Alert.alert("Validation", "Sale end date could not be converted. Please check the format.");
      return;
    }
    if (startUtc && new Date(endUtc) <= new Date(startUtc)) {
      Alert.alert("Invalid Sale Window", "Sale end must be after sale start. Please correct the dates.");
      return;
    }

    let secretCodeValue: string | null = null;
    if (requireNewAccessCode) {
      const trimmed = normalizeTicketTierSecretCode(newSecretCode);
      if (trimmed.length === 0) {
        Alert.alert("Validation", "Access code is required.");
        return;
      }
      if (trimmed.length < 3) {
        Alert.alert("Validation", "Access code must be at least 3 characters.");
        return;
      }
      secretCodeValue = trimmed;
    }

    // W4-C2 (May 2026): normalize tier-level description for both branches.
    const trimmedTierDescription = newTierDescription.trim();
    const tierDescriptionForPayload =
      trimmedTierDescription.length === 0 ? null : trimmedTierDescription;

    if (useStages) {
      if (newStages.length < 1) {
        Alert.alert("Validation", "Add at least one price stage.");
        return;
      }
      try {
        await createTier.mutateAsync({
          event_id: event.id,
          name: tierName.trim(),
          price_cents: 0,
          quantity_total: newStages.reduce((sum, s) => sum + s.quantity, 0),
          per_user_limit: 20,
          sales_start: startUtc,
          sales_end: endUtc,
          secret_code: secretCodeValue,
          description: tierDescriptionForPayload,
          is_hidden: newIsHidden,
          is_manually_sold_out: newIsManuallySoldOut,
          useStages: true,
          stages: newStages.map((s, i) => ({ ...s, order_index: i })),
          ...(hasEventForm ? { registration_form_fields: newFormFields } : {}),
        });
        Alert.alert("Success", "Tier created successfully.");
        resetForm();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create tier";
        Alert.alert("Error", message);
      }
      return;
    }

    const qty = parseInt(tierQuantity, 10);
    if (isNaN(qty) || qty < 1) {
      Alert.alert("Validation", "Quantity must be at least 1.");
      return;
    }
    const priceCents = Math.round(parseFloat(tierPrice || "0") * 100);
    if (isNaN(priceCents) || priceCents < 0) {
      Alert.alert("Validation", "Price must be a valid non-negative number.");
      return;
    }
    const perUser = parseInt(tierPerUserLimit, 10);
    if (isNaN(perUser) || perUser < 1 || perUser > 50) {
      Alert.alert("Validation", "Per user limit must be between 1 and 50.");
      return;
    }

    try {
      await createTier.mutateAsync({
        event_id: event.id,
        name: tierName.trim(),
        price_cents: priceCents,
        quantity_total: qty,
        per_user_limit: perUser,
        sales_start: startUtc,
        sales_end: endUtc,
        secret_code: secretCodeValue,
        description: tierDescriptionForPayload,
        is_hidden: newIsHidden,
        is_manually_sold_out: newIsManuallySoldOut,
        ...(hasEventForm ? { registration_form_fields: newFormFields } : {}),
      });
      Alert.alert("Success", "Tier created successfully.");
      resetForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create tier";
      Alert.alert("Error", message);
    }
  };

  const handleDeleteTier = async (tierId: string, tierNameStr: string) => {
    Alert.alert(
      "Delete Tier",
      `Are you sure you want to delete "${tierNameStr}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingTierId(tierId);
            try {
              await deleteTier.mutateAsync(tierId);
              Alert.alert("Deleted", "Tier deleted successfully.");
            } catch (err) {
              const message = err instanceof Error ? err.message : "Failed to delete tier";
              Alert.alert("Error", message);
            } finally {
              setDeletingTierId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View className="gap-6">
      <View className="px-4 pb-4 border-b border-white-30">
        <Text className="text-white-80 text-xs leading-4 font-poppins">
          Manage ticket tiers for {event.name}. Tiers with sold tickets cannot be deleted but can be edited (quantity cannot go below sold count).
        </Text>
      </View>

      {event.ticket_tiers.length > 0 && (
        <View className="gap-3 px-[10px]">
          <Text className="text-white-100 text-base leading-[22px] font-poppins-semibold px-[6px]">
            Existing Tiers ({event.ticket_tiers.length})
          </Text>
          {event.ticket_tiers.map((tier, index) => (
            <ExistingTierCard
              key={tier.id}
              tier={tier}
              index={index}
              onDelete={() => handleDeleteTier(tier.id, tier.name)}
              deleting={deletingTierId === tier.id}
              readOnly={readOnly}
              eventTimezone={tz}
              eventEndsAt={event.ends_at}
              eventCurrency={event.currency || "USD"}
              eventFormFields={visibleEventFormFields}
            />
          ))}
        </View>
      )}

      {event.ticket_tiers.length < MAX_TICKET_TIERS_PER_EVENT && !readOnly && (
        <View className="px-[10px]">
          <View className="bg-white-5 rounded-card p-4 gap-4">
            {/* Header with "Use Price Stages" checkbox top-right — matches EditableTierCard */}
            <View className="flex-row items-center justify-between">
              <Text className="text-white-80 text-base leading-[22px] font-poppins-semibold">
                Add New Tier
              </Text>
              <Pressable
                className="flex-row items-center gap-[6px]"
                onPress={() => {
                  setUseStages(prev => !prev);
                  if (useStages) setNewStages([]);
                }}
              >
                <Ionicons
                  name={useStages ? "checkbox" : "square-outline"}
                  size={20}
                  color={useStages ? "#F9FBFE" : "rgba(255,255,255,0.5)"}
                />
                <Text className="text-white-80 text-sm font-poppins">Use Price Stages</Text>
              </Pressable>
            </View>

            <View className="gap-2">
              <FormInput
                placeholder="Tier name"
                value={tierName}
                onChangeText={setTierName}
                icon={<Ionicons name="pricetag-outline" size={20} color="rgba(255,255,255,0.5)" />}
              />
              {/* W4-C2 (May 2026): tier-level description for the new-tier form. */}
              <DescriptionInput
                placeholder="Description (optional) — what's included?"
                value={newTierDescription}
                onChangeText={setNewTierDescription}
              />
              {!useStages && (
                <>
                  <FormInput
                    placeholder="Total quantity"
                    value={tierQuantity}
                    onChangeText={setTierQuantity}
                    keyboardType="numeric"
                    icon={<Ionicons name="layers-outline" size={20} color="rgba(255,255,255,0.5)" />}
                  />
                  <FormInput
                    placeholder={`Price (${event.currency || "USD"}, e.g. 25.00)`}
                    value={tierPrice}
                    onChangeText={setTierPrice}
                    keyboardType="numeric"
                    icon={<Ionicons name="cash-outline" size={20} color="rgba(255,255,255,0.5)" />}
                  />
                  <FormInput
                    placeholder="Per user limit (1-50)"
                    value={tierPerUserLimit}
                    onChangeText={setTierPerUserLimit}
                    keyboardType="numeric"
                    icon={<Ionicons name="person-outline" size={20} color="rgba(255,255,255,0.5)" />}
                  />
                </>
              )}
              <DateTimePickerField
                title="Sale start date"
                placeholder="Sale start date and time"
                value={salesStart}
                onChange={setSalesStart}
                timezone={tz}
              />
              <DateTimePickerField
                title="Sale end date"
                placeholder="Sale end date and time"
                value={salesEnd}
                onChange={setSalesEnd}
                timezone={tz}
              />

              {/* Access Code */}
              <Pressable
                onPress={() => {
                  setRequireNewAccessCode(prev => !prev);
                  if (requireNewAccessCode) setNewSecretCode("");
                }}
                className="flex-row items-center gap-3 bg-white-5 border border-white-10 rounded-pill px-4 py-3"
              >
                <View className={`w-5 h-5 rounded border-2 items-center justify-center ${requireNewAccessCode ? "bg-white-100 border-white-100" : "bg-transparent border-white-30"}`}>
                  {requireNewAccessCode && <Ionicons name="checkmark" size={12} color="#041C2B" />}
                </View>
                <Text className="text-white-100 text-sm leading-5 font-poppins flex-1">
                  Require Access Code
                </Text>
              </Pressable>
              {requireNewAccessCode && (
                <>
                  <FormInput
                    placeholder="Min. 3 characters"
                    value={newSecretCode}
                    onChangeText={(t) => setNewSecretCode(t.toUpperCase())}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    icon={<Ionicons name="key-outline" size={20} color="rgba(255,255,255,0.5)" />}
                  />
                  {!newIsHidden && (
                    <Text className="text-[#FBD68D] text-xs font-poppins -mt-1">
                      Access codes only work on hidden tiers. Enable &ldquo;Hide tier&rdquo; below to require this code for unlock.
                    </Text>
                  )}
                </>
              )}

              {/* W4-C3 (Jun 2026): visibility + manual sold-out toggles for the
                  new-tier form (mirrors the per-tier edit form at lines 720+). */}
              <View className="bg-white-5 border border-white-10 rounded-card">
                <Pressable
                  onPress={() => setNewIsManuallySoldOut(prev => !prev)}
                  className="flex-row items-start gap-3 px-4 py-3"
                >
                  <View
                    className={`w-5 h-5 rounded border-2 items-center justify-center mt-0.5 ${newIsManuallySoldOut ? "bg-white-100 border-white-100" : "bg-transparent border-white-30"}`}
                  >
                    {newIsManuallySoldOut && (
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
                  onPress={() => setNewIsHidden(prev => !prev)}
                  className="flex-row items-start gap-3 px-4 py-3"
                >
                  <View
                    className={`w-5 h-5 rounded border-2 items-center justify-center mt-0.5 ${newIsHidden ? "bg-white-100 border-white-100" : "bg-transparent border-white-30"}`}
                  >
                    {newIsHidden && (
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

              {hasEventForm && (
                <Pressable
                  onPress={() => setShowNewFormFieldsSheet(true)}
                  className="flex-row items-center justify-between bg-white-5 border border-white-10 rounded-card px-4 py-3"
                >
                  <View className="flex-1 mr-3">
                    <Text className="text-white-100 text-sm font-poppins-medium">
                      Registration form
                    </Text>
                    <Text className="text-white-50 text-xs font-poppins mt-0.5">
                      {newFormFields === null
                        ? `All ${visibleEventFormFields.length} event field${visibleEventFormFields.length === 1 ? "" : "s"}`
                        : `${newFormFields.length} of ${visibleEventFormFields.length} selected`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
                </Pressable>
              )}
            </View>

            {/* Price stages section — matches EditableTierCard pattern */}
            {useStages && (
              <View className="gap-4">
                <Text className="text-white-80 text-base font-poppins-semibold">Price Stages</Text>
                <View className="gap-2">
                  <FormInput
                    placeholder="Stage name"
                    value={newStageName}
                    onChangeText={setNewStageName}
                    icon={<Ionicons name="pricetag-outline" size={20} color="rgba(255,255,255,0.5)" />}
                  />
                  <FormInput
                    placeholder={`Price (${event.currency || "USD"}, e.g. 10.00)`}
                    value={newStagePrice}
                    onChangeText={setNewStagePrice}
                    keyboardType="numeric"
                    icon={<Ionicons name="cash-outline" size={20} color="rgba(255,255,255,0.5)" />}
                  />
                  <FormInput
                    placeholder="Quantity"
                    value={newStageQuantity}
                    onChangeText={setNewStageQuantity}
                    keyboardType="numeric"
                    icon={<Ionicons name="layers-outline" size={20} color="rgba(255,255,255,0.5)" />}
                  />
                  {/* W4-C2 (May 2026): per-stage description input for the
                      new-tier form's inline stage adder. */}
                  <DescriptionInput
                    placeholder="Stage description (optional)"
                    value={newStageDescription}
                    onChangeText={setNewStageDescription}
                  />
                  <Pressable
                    onPress={handleAddNewStage}
                    className="bg-white-100 rounded-pill py-[10px] px-6 self-start"
                  >
                    <Text style={{ color: "#041C2B" }} className="text-sm font-poppins-medium">Add Stage</Text>
                  </Pressable>
                </View>
                {newStages.length > 0 && (
                  <View className="gap-2">
                    <Pressable
                      className="flex-row items-center justify-between py-2"
                      onPress={() => setNewStagesExpanded(v => !v)}
                    >
                      <Text className="text-white-100 font-poppins-semibold">
                        {newStages.length} {newStages.length === 1 ? "Stage" : "Stages"}
                      </Text>
                      <Ionicons
                        name={newStagesExpanded ? "chevron-up" : "chevron-down"}
                        size={24}
                        color="#F9FBFE"
                      />
                    </Pressable>
                    {newStagesExpanded && (
                      <View className="gap-2">
                        {newStages.map((stage, idx) => (
                          <StageCard
                            key={`new-stage-${idx}`}
                            stage={{
                              id: `new-stage-${idx}`,
                              stageName: stage.name,
                              tierName: tierName || "New Tier",
                              price: stage.price_cents / 100,
                              startDate: salesStart || "TBD",
                              endDate: salesEnd || "TBD",
                              ticketCount: stage.quantity,
                            }}
                            onDelete={
                              newStages.length > 1
                                ? () => handleRemoveNewStage(idx)
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

            <View className="items-end">
              <Pressable
                onPress={handleCreateTier}
                disabled={createTier.isPending}
                className={`bg-white-100 rounded-pill py-[10px] px-6 flex-row items-center gap-2 ${
                  createTier.isPending ? "opacity-60" : ""
                }`}
              >
                {createTier.isPending && <ActivityIndicator size="small" color="#041C2B" />}
                <Text style={{ color: "#041C2B" }} className="text-sm leading-[22px] font-poppins-medium">
                  {createTier.isPending ? "Creating..." : "Add Tier"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {hasEventForm && (
        <TierRegistrationFormSheet
          visible={showNewFormFieldsSheet}
          eventFormFields={visibleEventFormFields}
          value={newFormFields}
          onChange={setNewFormFields}
          onClose={() => setShowNewFormFieldsSheet(false)}
        />
      )}
    </View>
  );
}
