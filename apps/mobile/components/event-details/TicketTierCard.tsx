import { View, Text, Pressable } from "react-native";
import { FlameText, colors } from "@project-flame/ui";
import { Feather } from "@expo/vector-icons";
import type {
  TierStatus,
  TicketTierWithStatus,
} from "../../hooks/useEventDetails";
import { formatCentsAsPrice } from "@project-flame/lib";

// --- Status display config (colors from Figma) ---

const STATUS_CONFIG: Record<TierStatus, { label: string; color: string }> = {
  available: { label: "Available", color: "#5DDBB1" },
  sold_out: { label: "Sold Out", color: "#F99175" },
  not_available_yet: { label: "Not available yet", color: "#FBD68D" },
  sales_ended: { label: "Sales ended", color: "#F99175" },
};

interface TicketTierCardProps {
  tier: TicketTierWithStatus;
  /** Whether this tier is currently selected */
  isSelected?: boolean;
  /** Current quantity (only relevant when selected) */
  quantity?: number;
  /** Called when user taps to select this tier */
  onSelect?: () => void;
  /** Called when user changes quantity via +/- */
  onQuantityChange?: (newQty: number) => void;
  /** Max selectable quantity — min(available, per_user_limit) */
  maxQuantity?: number;
  /** Whether this is an RSVP event (changes action label) */
  isRsvp?: boolean;
  /** ISO 4217 currency code for price display */
  currency?: string;
  className?: string;
}

/**
 * Ticket tier card matching Figma node Component 1640.
 *
 * States:
 *  - available:         white-5 bg, white-20 border, bright text, action button
 *  - sold_out:          white-10 bg, muted text (#A9ABAD price)
 *  - not_available_yet: white-10 bg, muted text (#A9ABAD price)
 *  - sales_ended:       same as sold_out
 *
 * When selected and available, shows a +/- quantity selector inline.
 */
export function TicketTierCard({
  tier,
  isSelected = false,
  quantity = 0,
  onSelect,
  onQuantityChange,
  maxQuantity = 10,
  isRsvp = false,
  currency,
  className = "",
}: TicketTierCardProps) {
  const isAvailable = tier.status === "available";
  const statusConfig = STATUS_CONFIG[tier.status];

  // Container styles — selected state gets a brighter border.
  // Inter-row spacing is handled per-row via `mt-*` (see below) instead of a
  // single `gap-*` on the container, so the header pair (stage + tier name)
  // can sit tight while the price row stays visually separated.
  const containerClass = isAvailable
    ? isSelected
      ? "bg-white-5 border border-white-100 rounded-card px-4 py-3"
      : "bg-white-5 border border-white-20 rounded-card px-4 py-3"
    : "bg-white-10 rounded-card px-4 py-3";

  // Text colors based on availability
  const nameColor = isAvailable ? "text-white-100" : "text-white-70";
  const priceColor = isAvailable ? "text-white-100" : "text-[#A9ABAD]";
  const limitColor = isAvailable ? "text-white-50" : "text-white-30";

  return (
    <Pressable
      onPress={isAvailable ? onSelect : undefined}
      disabled={!isAvailable}
      className={`${containerClass} ${className}`}
    >
      {/* Row 1: Stage name (primary) + Status badge */}
      <View className="flex-row items-center justify-between">
        <Text
          className={`font-poppins-medium text-lg leading-7 ${nameColor} flex-1 mr-2`}
          numberOfLines={1}
        >
          {tier.currentStageName ?? tier.name}
        </Text>
        {/* Status badge — Figma: Poppins Medium 12px/16px */}
        <Text
          className="font-poppins-medium text-xs leading-4"
          style={{ color: statusConfig.color }}
        >
          {statusConfig.label}
        </Text>
      </View>

      {/* Tier name — shown below stage name, slightly smaller, same color */}
      {tier.currentStageName ? (
        <Text className={`font-poppins-medium text-base leading-6 ${nameColor} mt-0`}>
          {tier.name}
        </Text>
      ) : null}

      {/* W4-C2 (May 2026): always show a description when one is set. Prefer
          the active stage's description (when staged), fall back to the tier
          description otherwise. The previous `!per_user_limit` guard hid it
          on most tiers and was dropped — the price row already renders the
          per-person limit on the right, so the two no longer compete for the
          same space. */}
      {tier.currentStageDescription || tier.description ? (
        <FlameText variant="subtitle1" className="text-white-50 mt-2">
          {tier.currentStageDescription || tier.description}
        </FlameText>
      ) : null}

      {/* Price row — limit per person on the right (mirrors web), quantity selector when selected */}
      <View className="flex-row items-center justify-between mt-3">
        <Text className={`font-poppins-bold text-[20px] ${priceColor}`}>
          {formatCentsAsPrice(tier.displayPrice, currency)}
        </Text>

        {isAvailable && isSelected && onQuantityChange ? (
          <QuantitySelector
            quantity={quantity}
            minQuantity={1}
            maxQuantity={maxQuantity}
            onQuantityChange={onQuantityChange}
          />
        ) : tier.per_user_limit && tier.per_user_limit > 1 ? (
          <Text className={`font-poppins-light text-xs ${limitColor}`}>
            Limit {tier.per_user_limit} per person
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Quantity Selector — inline +/- controls
// ---------------------------------------------------------------------------

function QuantitySelector({
  quantity,
  minQuantity,
  maxQuantity,
  onQuantityChange,
}: {
  quantity: number;
  minQuantity: number;
  maxQuantity: number;
  onQuantityChange: (qty: number) => void;
}) {
  const canDecrement = quantity > minQuantity;
  const canIncrement = quantity < maxQuantity;

  return (
    <View className="flex-row items-center gap-3">
      {/* Minus button */}
      <Pressable
        onPress={() => canDecrement && onQuantityChange(quantity - 1)}
        disabled={!canDecrement}
        className={`size-[36px] rounded-full items-center justify-center ${
          canDecrement ? "bg-white-10 border border-white-20" : "bg-white-5"
        }`}
      >
        <Feather
          name="minus"
          size={18}
          color={canDecrement ? colors["white-100"] : "rgba(255,255,255,0.3)"}
        />
      </Pressable>

      {/* Quantity display */}
      <Text className="font-poppins-semibold text-lg text-white-100 min-w-[28px] text-center">
        {quantity}
      </Text>

      {/* Plus button */}
      <Pressable
        onPress={() => canIncrement && onQuantityChange(quantity + 1)}
        disabled={!canIncrement}
        className={`size-[36px] rounded-full items-center justify-center ${
          canIncrement ? "bg-white-10 border border-white-20" : "bg-white-5"
        }`}
      >
        <Feather
          name="plus"
          size={18}
          color={canIncrement ? colors["white-100"] : "rgba(255,255,255,0.3)"}
        />
      </Pressable>
    </View>
  );
}
