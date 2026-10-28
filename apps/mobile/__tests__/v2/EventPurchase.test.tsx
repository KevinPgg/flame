/**
 * Event screen purchase pieces (app, Kevin 2026-10-28): tier cards with the quantity right in the
 * card (no screen jump), the bottom bar, and the checkout sheet (all fields 48 px; RSVP questions
 * in their own card, apart from the payment codes).
 */
import { useState, type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { renderV2 } from "./helpers";
import { TierList } from "../../components/v2/attendee/event/TierList";
import { BuyBar } from "../../components/v2/attendee/event/EventChrome";
import { CheckoutMainSheet } from "../../components/event-details/CheckoutMainSheet";
import type { TicketTierWithStatus } from "../../hooks/useEventDetails";

// The shared v1 UI package pulls Skia (native only): the sheet just needs text, a button and colors.
jest.mock("@project-flame/ui", () => {
  const { Pressable, Text } = require("react-native");
  return {
    colors: new Proxy({}, { get: () => "#ffffff" }),
    FlameText: ({ children }: { children: ReactNode }) => <Text>{children}</Text>,
    PillButton: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <Pressable accessibilityRole="button" onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
  };
});

const tier = (id: string, name: string, cents: number, status: TicketTierWithStatus["status"], extra: Partial<TicketTierWithStatus> = {}) =>
  ({
    id,
    name,
    description: null,
    price_cents: cents,
    displayPrice: cents,
    quantity_total: 100,
    quantity_sold: 0,
    quantity_reserved: 0,
    per_user_limit: 20,
    status,
    registration_form_fields: null,
    ...extra,
  }) as unknown as TicketTierWithStatus;

const TIERS = [
  tier("t1", "Tier 1", 1500, "available"),
  tier("t2", "Tier 2", 2000, "not_available_yet"),
  tier("ff", "Friends & Family", 1000, "available", { per_user_limit: 4 }),
];

function Harness({ onSelect, onCheckout = jest.fn() }: { onSelect: (id: string) => void; onCheckout?: () => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState(1);
  return (
    <TierList
      tiers={TIERS}
      unlockedIds={new Set(["ff"])}
      selectedId={sel}
      quantity={q}
      maxQuantity={4}
      isRsvp={false}
      currency="USD"
      onSelect={(id) => {
        onSelect(id);
        setSel(id);
        setQ(1);
      }}
      onQuantity={(n) => setQ(Math.max(1, Math.min(4, n)))}
      onCheckout={onCheckout}
    />
  );
}

describe("TierList (app)", () => {
  it("prototype cards: status · max, no buttons until picked, lock on the next tier, Unlocked badge", async () => {
    await renderV2(<Harness onSelect={jest.fn()} />);
    expect(screen.getByText("Tickets")).toBeTruthy();
    expect(screen.getAllByText(/On sale · max/)).toHaveLength(2);
    expect(screen.getByText("Opens next · max 20")).toBeTruthy();
    expect(screen.queryByText("Select")).toBeNull();
    expect(screen.queryByRole("button", { name: "Checkout" })).toBeNull();
    expect(screen.getByText("Unlocked")).toBeTruthy();
  });

  it("tapping a tier shows the stepper in that card; + / − change the quantity; tapping it again keeps it", async () => {
    const onSelect = jest.fn();
    await renderV2(<Harness onSelect={onSelect} />);
    await fireEvent.press(screen.getByRole("button", { name: /^Tier 1/ }));
    expect(onSelect).toHaveBeenCalledWith("t1");
    expect(screen.getAllByRole("button", { name: "Checkout" })).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "More tickets" }));
    await fireEvent.press(screen.getByRole("button", { name: "More tickets" }));
    expect(screen.getByText("3")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Fewer tickets" }));
    expect(screen.getByText("2")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /^Tier 1/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByText("2")).toBeTruthy();
    // a tier that isn't on sale can't be picked
    await fireEvent.press(screen.getByRole("button", { name: /^Tier 2/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe("TierList checkout button (app)", () => {
  it("the selected card gets a Checkout button next to the price that opens the checkout", async () => {
    const onCheckout = jest.fn();
    await renderV2(<Harness onSelect={jest.fn()} onCheckout={onCheckout} />);
    expect(screen.queryByRole("button", { name: "Checkout" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: /^Friends & Family/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Checkout" }));
    expect(onCheckout).toHaveBeenCalledTimes(1);
  });
});

describe("attendee island on the event screen (app)", () => {
  it("hides on /event/… (its own bottom bar), stays elsewhere", () => {
    const { hidesAttendeeTabBar } = require("../../components/v2/attendee/AttendeeTabBar");
    expect(hidesAttendeeTabBar("/event/abc")).toBe(true);
    expect(hidesAttendeeTabBar("/")).toBe(false);
    expect(hidesAttendeeTabBar("/discover")).toBe(false);
    expect(hidesAttendeeTabBar("/ticket/t1")).toBe(false);
  });
});

describe("BuyBar (app)", () => {
  it("shows what it says and runs the action", async () => {
    const go = jest.fn();
    await renderV2(<BuyBar kicker="You’re going" value="2 tickets" cta={{ label: "View 2 tickets", icon: "qr", onPress: go }} />);
    expect(screen.getByText("You’re going")).toBeTruthy();
    expect(screen.getByText("2 tickets")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "View 2 tickets" }));
    expect(go).toHaveBeenCalled();
  });
  it("a disabled state doesn't fire", async () => {
    const go = jest.fn();
    await renderV2(<BuyBar kicker="Request sent" value="1 ticket" cta={{ label: "Pending", tone: "dark", disabled: true, onPress: go }} />);
    await fireEvent.press(screen.getByRole("button", { name: "Pending" }));
    expect(go).not.toHaveBeenCalled();
  });
});

const EVENT = {
  id: "e1",
  name: "White Party",
  currency: "USD",
  organization_name: "Sociedad Anónima",
  registration_form_config: [
    { id: "name", label: "Full name", type: "text", required: true },
    { id: "ced", label: "Cédula", type: "number", required: true },
  ],
};

function sheet(isRsvp: boolean) {
  return (
    <CheckoutMainSheet
      visible
      onClose={jest.fn()}
      event={EVENT as never}
      tier={tier("t1", "Tier 1", 1500, "available")}
      quantity={2}
      isRsvp={isRsvp}
      error={null}
      errorCode={null}
      isFree={false}
      displayAmounts={{ subtotal: 3000, fee: 400, total: 3400, discount: 0 }}
      promoCode=""
      onApplyPromo={jest.fn()}
      onClearPromo={jest.fn()}
      promoApplied={false}
      secretCode=""
      onSecretCodeChange={jest.fn()}
      registrationData={null}
      onRegistrationDataChange={jest.fn()}
      promoterCode=""
      promoterStatus="idle"
      onPromoterChange={jest.fn()}
      onValidatePromoter={jest.fn()}
      onClearPromoter={jest.fn()}
      onCheckout={jest.fn()}
    />
  );
}

describe("checkout sheet (app)", () => {
  it("RSVP: the organizer's questions in their own card, the payment codes apart", async () => {
    await render(sheet(true));
    expect(screen.getByText("RSVP questions")).toBeTruthy();
    expect(screen.getByText("Sociedad Anónima asks this to review your request.")).toBeTruthy();
    expect(screen.getByText("Payment codes (optional)")).toBeTruthy();
    expect(screen.getByText("They only apply to the charge if your request is approved.")).toBeTruthy();
  });

  it("every field is the same height (the promoter box isn't taller)", async () => {
    await render(sheet(true));
    const heightOf = (placeholder: string) => {
      const input = screen.getByPlaceholderText(placeholder);
      const flat = [input.props.style].flat(Infinity).reduce((a: Record<string, unknown>, s: unknown) => ({ ...a, ...(s as object) }), {});
      return flat;
    };
    expect(heightOf("Enter code")).toMatchObject({ height: 48, paddingVertical: 0 });
    expect(heightOf("Full name")).toMatchObject({ height: 48, paddingVertical: 0 });
    // the promoter input fills its 48 px box (h-12) with no padding of its own
    expect(heightOf("Promoter code")).toMatchObject({ height: "100%", paddingVertical: 0 });
  });

  it("paid ticket (no RSVP): no questions card, just the codes", async () => {
    await render(sheet(false));
    expect(screen.queryByText("RSVP questions")).toBeNull();
    expect(screen.getByText("Codes (optional)")).toBeTruthy();
  });
});
