import { describe, it, expect } from "vitest";
import {
  sendOptions,
  defaultSendOption,
  isValidSendQuantity,
  parseCustomPrice,
  normalizeEmail,
  isLikelyEmail,
  sentHistory,
  personName,
  initialsOf,
  type SendTierRow,
} from "../src/organizer/send-tickets";

const tiers: SendTierRow[] = [
  { id: "ga", name: "General", price_cents: 2000, quantity_total: 100, quantity_sold: 40, quantity_reserved: 10 },
  {
    id: "vip",
    name: "VIP",
    price_cents: 5000,
    quantity_total: 30,
    quantity_sold: 12,
    ticket_stages: [
      { id: "s2", name: "Regular", price_cents: 6000, quantity: 20, sold_quantity: 2, order_index: 1 },
      { id: "s1", name: "Early", price_cents: 4000, quantity: 10, sold_quantity: 10, order_index: 0 },
    ],
  },
  { id: "tb", name: "Table", price_cents: 30000, quantity_total: 5, quantity_sold: 1, is_manually_sold_out: true },
  { id: "hid", name: "Guest list", price_cents: 0, quantity_total: 20, quantity_sold: 20, is_hidden: true },
];

describe("sendOptions", () => {
  it("free mode: one option per tier, stages ignored (comps carry no stage)", () => {
    const o = sendOptions(tiers, "free");
    expect(o.map((x) => x.key)).toEqual(["ga", "vip", "tb", "hid"]);
    expect(o.every((x) => x.stageId === null)).toBe(true);
  });

  it("left = total − sold − reserved, never negative", () => {
    const o = sendOptions(tiers, "free");
    expect(o[0].left).toBe(50);
    expect(o[3].left).toBe(0);
  });

  it("bank mode: tiers with stages expand to stages sorted by order_index, current = waterfall", () => {
    const o = sendOptions(tiers, "bank").filter((x) => x.tierId === "vip");
    expect(o.map((x) => x.key)).toEqual(["vip:s1", "vip:s2"]);
    expect(o.map((x) => x.priceCents)).toEqual([4000, 6000]);
    expect(o[0]).toMatchObject({ soldOut: true, current: false, left: 0 });
    expect(o[1]).toMatchObject({ soldOut: false, current: true, left: 18 });
  });

  it("stage capacity is capped by the tier's remaining capacity", () => {
    const o = sendOptions(
      [{ ...tiers[1], quantity_total: 14 }],
      "bank"
    ).find((x) => x.stageId === "s2");
    expect(o?.left).toBe(2);
  });

  it("manual sold out and hidden are flagged but kept selectable", () => {
    const o = sendOptions(tiers, "bank");
    expect(o.find((x) => x.tierId === "tb")).toMatchObject({ soldOut: true, left: 4 });
    expect(o.find((x) => x.tierId === "hid")).toMatchObject({ hidden: true, soldOut: true });
  });
});

describe("defaultSendOption", () => {
  it("prefers the current, available, visible option", () => {
    expect(defaultSendOption(sendOptions(tiers, "bank"))?.key).toBe("ga");
    expect(defaultSendOption(sendOptions([tiers[1]], "bank"))?.key).toBe("vip:s2");
  });
  it("falls back to the first option when everything is sold out; null when empty", () => {
    expect(defaultSendOption(sendOptions([tiers[2]], "free"))?.key).toBe("tb");
    expect(defaultSendOption([])).toBeNull();
  });
});

describe("validation (same limits as the API)", () => {
  it("quantity 1–10 integers", () => {
    expect([0, 1, 10, 11, 2.5, NaN].map(isValidSendQuantity)).toEqual([false, true, true, false, false, false]);
  });
  it("custom price: > 0, ≤ $10,000, comma or dot, max 2 decimals", () => {
    expect(parseCustomPrice("25")).toEqual({ cents: 2500, error: null });
    expect(parseCustomPrice("25,5")).toEqual({ cents: 2550, error: null });
    expect(parseCustomPrice(" 0.99 ")).toEqual({ cents: 99, error: null });
    expect(parseCustomPrice("19.99").cents).toBe(1999);
    expect(parseCustomPrice("10000").cents).toBe(1_000_000);
    expect(parseCustomPrice("10000.01").error).toBe("tooHigh");
    expect(parseCustomPrice("0").error).toBe("invalid");
    expect(parseCustomPrice("-5").error).toBe("invalid");
    expect(parseCustomPrice("1.999").error).toBe("invalid");
    expect(parseCustomPrice("abc").error).toBe("invalid");
    expect(parseCustomPrice("").error).toBe("invalid");
  });
  it("email helpers", () => {
    expect(normalizeEmail("  Ana@Mail.COM ")).toBe("ana@mail.com");
    expect(isLikelyEmail("ana@mail.com")).toBe(true);
    expect(isLikelyEmail("ana@mail")).toBe(false);
    expect(isLikelyEmail("ana mail.com")).toBe(false);
  });
});

describe("sentHistory", () => {
  const comps = [
    { id: "c1", email: "ana@x.com", customer_name: "Ana Loor", created_at: "2026-10-10T10:00:00.123Z", ticket_tiers: { name: "General" } },
    { id: "c2", email: "ana@x.com", customer_name: "Ana Loor", created_at: "2026-10-10T10:00:00.123Z", ticket_tiers: { name: "General" } },
    { id: "c3", email: "ana@x.com", customer_name: "Ana Loor", created_at: "2026-10-12T09:00:00Z", ticket_tiers: { name: "General" } },
    { id: "c4", email: "luis@x.com", customer_name: null, created_at: "2026-10-11T09:00:00Z", ticket_tiers: { name: "VIP" } },
  ];
  const bankOrders = [
    { id: "b1", email: "eva@x.com", customer_name: "Eva", created_at: "2026-09-01T00:00:00Z", order_quantity: 2, order_total_cents: 8000, ticket_tiers: { name: "VIP" }, metadata: { stage_name: "Early" } },
    { id: "b2", email: "leo@x.com", customer_name: "", created_at: "2026-10-01T00:00:00Z", order_quantity: null, order_total_cents: null, ticket_tiers: null },
  ];

  it("free: groups tickets of one send, newest first, no amount", () => {
    const h = sentHistory({ comps, bankOrders }, "free");
    expect(h.map((x) => [x.id, x.quantity])).toEqual([["c3", 1], ["c4", 1], ["c1", 2]]);
    expect(h.every((x) => x.amountCents === null)).toBe(true);
    expect(h[1].name).toBe("luis@x.com");
  });

  it("bank: one row per order with stage and organizer amount, newest first", () => {
    const h = sentHistory({ comps, bankOrders }, "bank");
    expect(h.map((x) => x.id)).toEqual(["b2", "b1"]);
    expect(h[1]).toMatchObject({ quantity: 2, amountCents: 8000, stageName: "Early", tierName: "VIP" });
    expect(h[0]).toMatchObject({ quantity: 1, amountCents: 0, name: "leo@x.com", tierName: "" });
  });
});

describe("edge cases", () => {
  it("null counters read as 0 and stages without order_index go last", () => {
    const o = sendOptions(
      [
        {
          id: "t",
          name: "T",
          price_cents: 100,
          quantity_total: 10,
          quantity_sold: null as unknown as number,
          ticket_stages: [
            { id: "b", name: "B", price_cents: 200, quantity: 5, sold_quantity: 0 },
            { id: "a", name: "A", price_cents: 100, quantity: 5, sold_quantity: 0, order_index: 0 },
          ],
        },
      ],
      "bank"
    );
    expect(o.map((x) => x.stageId)).toEqual(["a", "b"]);
    expect(o[0]).toMatchObject({ left: 5, current: true });
  });
  it("an empty stage list behaves like a tier without stages", () => {
    const [o] = sendOptions([{ ...tiers[0], ticket_stages: [] }], "bank");
    expect(o).toMatchObject({ key: "ga", stageId: null, current: true });
  });
  it("defaults to a hidden-but-available option only when nothing visible is available", () => {
    const opts = sendOptions([{ id: "h", name: "H", price_cents: 0, quantity_total: 5, quantity_sold: 0, is_hidden: true }], "free");
    expect(defaultSendOption(opts)?.key).toBe("h");
  });
  it("bank history: blank customer name falls back to the email; legacy totals lose the fee", () => {
    const [h] = sentHistory(
      {
        comps: [],
        bankOrders: [
          { id: "b", email: "x@y.com", customer_name: "   ", created_at: "2025-10-01T00:00:00Z", order_quantity: 1, order_total_cents: 2563 },
        ],
      },
      "bank"
    );
    expect(h).toMatchObject({ name: "x@y.com", amountCents: 2300 });
  });
  it("free history: rows with an explicit quantity add up; email match is case-insensitive", () => {
    const at = "2026-10-10T10:00:00Z";
    const h = sentHistory(
      {
        comps: [
          { id: "a", email: "Ana@x.com", customer_name: "Ana", created_at: at, quantity: 2, ticket_tiers: { name: "G" } },
          { id: "b", email: "ana@x.com", customer_name: "Ana", created_at: at, ticket_tiers: { name: "G" } },
          { id: "c", email: "ana@x.com", customer_name: "Ana", created_at: at, ticket_tiers: null },
        ],
        bankOrders: [],
      },
      "free"
    );
    expect(h.map((x) => [x.tierName, x.quantity])).toEqual([["G", 3], ["", 1]]);
  });
  it("person name and initials", () => {
    expect(personName({ first_name: "Ana", last_name: "Pinto", email: "a@x.com" })).toBe("Ana Pinto");
    expect(personName({ first_name: " Ana ", last_name: null, email: "a@x.com" })).toBe("Ana");
    expect(personName({ first_name: "", last_name: "  ", email: "a@x.com" })).toBe("a@x.com");
    expect(initialsOf("Ana Pinto")).toBe("AP");
    expect(initialsOf("dj.guest@mail.com")).toBe("DG");
    expect(initialsOf("ana")).toBe("A");
    expect(initialsOf("")).toBe("");
  });
  it("custom price accepts the exact limits and rejects thousand separators", () => {
    expect(parseCustomPrice("0.01")).toEqual({ cents: 1, error: null });
    expect(parseCustomPrice("0.00").error).toBe("invalid");
    // "10.000" would read as 10 in en but 10,000 in es → refused instead of guessed.
    expect(parseCustomPrice("10.000").error).toBe("invalid");
    expect(parseCustomPrice("1,000.50").error).toBe("invalid");
  });
});
