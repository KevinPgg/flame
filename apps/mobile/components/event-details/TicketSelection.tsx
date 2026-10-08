import type { ReactNode } from "react";
import { View } from "react-native";
import { FlameText } from "@project-flame/ui";
import { TicketTierCard } from "./TicketTierCard";
import type { TicketTierWithStatus } from "../../hooks/useEventDetails";

interface TicketSelectionProps {
  tiers: TicketTierWithStatus[];
  selectedTierId: string | null;
  quantity: number;
  maxQuantity: number;
  isRsvp: boolean;
  currency?: string;
  onSelectTier: (tierId: string) => void;
  onQuantityChange: (newQty: number) => void;
  // W4-C3 (Jun 2026): optional slot rendered between the title and the tier
  // list. Used for the promoter + access-code inputs so they sit under the
  // "Select Your Ticket" header on the event detail screen.
  belowTitle?: ReactNode;
}

export function TicketSelection({
  tiers,
  selectedTierId,
  quantity,
  maxQuantity,
  isRsvp,
  currency,
  onSelectTier,
  onQuantityChange,
  belowTitle,
}: TicketSelectionProps) {
  return (
    <View className="gap-4 w-full">
      <FlameText variant="h4" className="text-white-100 uppercase px-4">
        Select Your Ticket
      </FlameText>
      {belowTitle}
      <View className="gap-2 px-4">
        {tiers.map((tier) => (
          <TicketTierCard
            key={tier.id}
            tier={tier}
            isSelected={selectedTierId === tier.id}
            quantity={selectedTierId === tier.id ? quantity : 0}
            onSelect={() => onSelectTier(tier.id)}
            onQuantityChange={onQuantityChange}
            maxQuantity={maxQuantity}
            isRsvp={isRsvp}
            currency={currency}
          />
        ))}
      </View>
    </View>
  );
}
