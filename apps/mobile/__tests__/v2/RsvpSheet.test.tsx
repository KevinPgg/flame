/** Fase 3.4 (app): RSVP request sheet — questions per guest, guests, promoter, when it's charged. */
import { useState } from "react";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderV2 } from "./helpers";
import { RsvpSheet, rsvpAnswersPayload } from "../../components/v2/attendee/event/RsvpSheet";

const EVENT = {
  id: "e1",
  name: "Acto",
  currency: "USD",
  organization_name: "PruebasGG",
  registration_form_config: [
    { id: "name", label: "Full name", type: "text", required: true },
    { id: "ig", label: "Instagram", type: "text", required: false },
  ],
} as never;
const TIER = { id: "t5", name: "Tier 5", displayPrice: 1200, price_cents: 1200, status: "available", registration_form_fields: null, per_user_limit: 5 } as never;

function Harness({ onSend }: { onSend: (a: Record<string, unknown> | null) => void }) {
  const [q, setQ] = useState(1);
  return (
    <RsvpSheet
      visible
      onClose={jest.fn()}
      event={EVENT}
      tier={TIER}
      quantity={q}
      maxQuantity={5}
      onQuantity={setQ}
      promoterCode="PIRILIN"
      promoterStatus="valid"
      onValidatePromoter={jest.fn()}
      onClearPromoter={jest.fn()}
      secretCode=""
      error={null}
      busy={false}
      promo={{ applied: false, code: "", busy: false, onApply: jest.fn(), onClear: jest.fn() }}
      onSend={onSend}
    />
  );
}

describe("RsvpSheet (app)", () => {
  it("payload: guest 1 at the top, the others in _guests", () => {
    expect(rsvpAnswersPayload([{ name: "A" }])).toEqual({ name: "A" });
    expect(rsvpAnswersPayload([{ name: "A" }, { name: "B" }])).toEqual({ name: "A", _guests: [{ name: "B" }] });
  });

  it("one block per guest; required answers checked; sends guest 1 + _guests; promoter shown; not charged now", async () => {
    const onSend = jest.fn();
    await renderV2(<Harness onSend={onSend} />);
    expect(screen.getByText("Promoter PIRILIN")).toBeTruthy();
    expect(screen.getByText(/You won’t be charged now/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "More tickets" }));
    expect(screen.getByText("Guest 2 of 2")).toBeTruthy();
    const names = screen.getAllByLabelText("Full name");
    await fireEvent.changeText(names[0]!, "Ana");
    await fireEvent.press(screen.getByRole("button", { name: "Send request" }));
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText("Required")).toBeTruthy();
    await fireEvent.changeText(names[1]!, "Beto");
    await fireEvent.press(screen.getByRole("button", { name: "Send request" }));
    expect(onSend).toHaveBeenCalledWith({ name: "Ana", _guests: [{ name: "Beto" }] });
  });
});
