import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { MAX_TICKET_TIERS_PER_EVENT } from "@project-flame/lib";
import { EditableTierCard, type TierEventFormFieldLike } from "./EditableTierCard";
import type { CreateEventTierInput } from "../../hooks/useCreateEvent";

interface TicketTiersTabProps {
  tiers: CreateEventTierInput[];
  onAddTier: () => void;
  onUpdateTier: (tierId: string, tier: CreateEventTierInput) => void;
  onRemoveTier: (tierId: string) => void;
  onCreateEvent: () => void;
  isCreating: boolean;
  isCreateEventDisabled: boolean;
  eventEndsAt?: string;
  eventTimezone?: string;
  /** Event currency code (e.g. "EUR"), shown in tier price placeholders. */
  eventCurrency?: string;
  /** Event-level form fields (non-archived) for the per-tier subset picker. */
  eventFormFields?: TierEventFormFieldLike[];
  submitError?: string;
}

export function TicketTiersTab({
  tiers,
  onAddTier,
  onUpdateTier,
  onRemoveTier,
  onCreateEvent,
  isCreating,
  isCreateEventDisabled,
  eventEndsAt,
  eventTimezone,
  eventCurrency,
  eventFormFields,
  submitError,
}: TicketTiersTabProps) {
  const atTierLimit = tiers.length >= MAX_TICKET_TIERS_PER_EVENT;

  return (
    <View className="gap-6">
      <View className="px-4 pb-4 border-b border-white-30">
        <View className="gap-2">
          <Text className="text-white-80 text-xs leading-4 font-poppins">
            Note:
          </Text>
          <Text className="text-white-80 text-xs leading-4 font-poppins">
            Events must start at least 2 hours in the future.
          </Text>
        </View>
      </View>

      <View className="px-4 flex-row items-center justify-between">
        <Text className="text-white-100 text-base leading-[22px] font-poppins-semibold">
          Ticket Tiers
        </Text>
        <Pressable
          onPress={onAddTier}
          disabled={atTierLimit}
          className={`bg-white-100 rounded-pill py-[10px] px-6 ${atTierLimit ? "opacity-50" : ""}`}
        >
          <Text className="text-dark text-sm leading-[22px] font-poppins-medium">
            {atTierLimit ? `Max ${MAX_TICKET_TIERS_PER_EVENT} tiers` : "Add Tier"}
          </Text>
        </Pressable>
      </View>

      <View className="px-[10px] gap-4">
        {tiers.map((tier, index) => (
          <EditableTierCard
            key={tier.id ?? `tier-${index}`}
            tier={tier}
            index={index}
            onChange={(updated) => tier.id != null && onUpdateTier(tier.id, updated)}
            onRemove={() => tier.id != null && onRemoveTier(tier.id)}
            canRemove={tiers.length > 1}
            eventEndsAt={eventEndsAt}
            eventTimezone={eventTimezone}
            eventCurrency={eventCurrency}
            eventFormFields={eventFormFields}
          />
        ))}
      </View>

      <View className="px-4 pt-4 gap-3">
        {!!submitError && (
          <Text className="text-red-400 text-sm leading-5 font-poppins text-center">
            {submitError}
          </Text>
        )}
        <Pressable
          onPress={onCreateEvent}
          disabled={isCreating || isCreateEventDisabled}
          className={`bg-white-100 rounded-pill py-[10px] px-6 items-center justify-center w-full flex-row gap-2 ${
            isCreating || isCreateEventDisabled ? "opacity-60" : ""
          }`}
        >
          {isCreating && (
            <ActivityIndicator size="small" color="#041C2B" />
          )}
          <Text className="text-dark text-sm leading-[22px] font-poppins-medium">
            {isCreating ? "Creating..." : "Create Event"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
