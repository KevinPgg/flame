import { describe, it, expect } from "vitest";
import { balanceRows, payoutMinimumCents, payoutTone, connectState } from "../src";

describe("balanceRows", () => {
  it("merges available and pending per currency, default currency first", () => {
    const rows = balanceRows(
      {
        available: [{ amount: 500, currency: "eur" }, { amount: 12_345, currency: "usd" }],
        pending: [{ amount: 2_000, currency: "usd" }, { amount: 0, currency: "mxn" }],
      },
      "USD"
    );
    expect(rows).toEqual([
      { currency: "USD", available: 12_345, pending: 2_000, canPayout: true },
      { currency: "EUR", available: 500, pending: 0, canPayout: true },
    ]);
  });
  it("keeps the default currency even when empty; below the minimum you can't request", () => {
    expect(balanceRows({ available: [], pending: [] }, "usd")).toEqual([{ currency: "USD", available: 0, pending: 0, canPayout: false }]);
    expect(balanceRows({ available: [{ amount: 1_500, currency: "mxn" }] }, "MXN")[0]!.canPayout).toBe(false);
    expect(balanceRows(null)).toEqual([{ currency: "USD", available: 0, pending: 0, canPayout: false }]);
  });
  it("negative available (refunds after a payout) is shown, never payable", () => {
    expect(balanceRows({ available: [{ amount: -300, currency: "usd" }] })[0]).toMatchObject({ available: -300, canPayout: false });
  });
});

describe("payout helpers", () => {
  it("minimums and tones", () => {
    expect(payoutMinimumCents("usd")).toBe(100);
    expect(payoutMinimumCents("MXN")).toBe(2000);
    expect(payoutMinimumCents("PEN")).toBe(100);
    expect(payoutTone("paid")).toBe("good");
    expect(payoutTone("in_transit")).toBe("warn");
    expect(payoutTone("failed")).toBe("bad");
    expect(payoutTone("canceled")).toBe("muted");
  });
  it("connect state", () => {
    expect(connectState(undefined)).toBe("not_connected");
    expect(connectState({ connected: true, chargesEnabled: true, payoutsEnabled: false })).toBe("incomplete");
    expect(connectState({ connected: true, chargesEnabled: true, payoutsEnabled: true })).toBe("ready");
  });
});
