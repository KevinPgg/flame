import { describe, it, expect } from "vitest";
import {
  buildPendingRsvpExportAoa,
  buildPurchaseExportAoa,
  formatRegistrationValueForExport,
  normalizeRegistrationExportColumns,
  purchaseExportColumnWidths,
  registrationValuesForExportColumns,
} from "../src/utils/pending-rsvp-export";

describe("normalizeRegistrationExportColumns", () => {
  it("skips empty ids and uses label or id as header", () => {
    expect(
      normalizeRegistrationExportColumns([
        { id: "  ", label: "X" },
        { id: "a1", label: "  Full name  " },
        { id: "b2", label: "" },
      ]),
    ).toEqual([
      { id: "a1", label: "Full name" },
      { id: "b2", label: "b2" },
    ]);
  });
});

describe("formatRegistrationValueForExport", () => {
  it("formats booleans and arrays", () => {
    expect(formatRegistrationValueForExport(true)).toBe("Yes");
    expect(formatRegistrationValueForExport(false)).toBe("No");
    expect(formatRegistrationValueForExport(["a", "b"])).toBe("a, b");
    expect(formatRegistrationValueForExport(null)).toBe("");
  });
});

describe("buildPendingRsvpExportAoa", () => {
  it("builds 5-column sheet without registration columns", () => {
    const aoa = buildPendingRsvpExportAoa("My Event", "Apr 1", [
      {
        name: "Jane",
        tier: "GA",
        email: "j@example.com",
        price: "$10.00",
        requestedAt: "Jan 1",
      },
    ]);
    expect(aoa[3]).toEqual([
      "Name",
      "Tier",
      "Email",
      "Base Ticket Price",
      "Request Date",
    ]);
    expect(aoa[4]).toEqual(["Jane", "GA", "j@example.com", "$10.00", "Jan 1"]);
  });

  it("appends registration columns and values", () => {
    const cols = normalizeRegistrationExportColumns([
      { id: "f1", label: "Company" },
      { id: "f2", label: "Newsletter" },
    ]);
    const aoa = buildPendingRsvpExportAoa(
      "E",
      "Apr 1",
      [
        {
          name: "Bob",
          tier: "VIP",
          email: "b@x.com",
          price: "$0.00",
          requestedAt: "Jan 2",
          registrationValues: registrationValuesForExportColumns(cols, {
            f1: "Acme",
            f2: true,
          }),
        },
      ],
      cols,
    );
    expect(aoa[3]).toEqual([
      "Name",
      "Tier",
      "Email",
      "Base Ticket Price",
      "Request Date",
      "Company",
      "Newsletter",
    ]);
    expect(aoa[4]).toEqual(["Bob", "VIP", "b@x.com", "$0.00", "Jan 2", "Acme", "Yes"]);
  });
});

describe("buildPurchaseExportAoa", () => {
  it("builds 6-column sheet without registration columns", () => {
    const aoa = buildPurchaseExportAoa("My Event", [
      {
        customer: "Jane",
        email: "j@example.com",
        tier: "GA - Early",
        quantity: 2,
        purchasedAt: "Jan 5 10:00",
        totalCost: "$20.00",
      },
    ]);
    expect(aoa[0]).toEqual(["Event: My Event"]);
    expect(aoa[2]).toEqual([
      "Customer",
      "Email",
      "Ticket Tier",
      "Quantity",
      "Purchased At",
      "Base Ticket Price",
    ]);
    expect(aoa[3]).toEqual([
      "Jane",
      "j@example.com",
      "GA - Early",
      2,
      "Jan 5 10:00",
      "$20.00",
    ]);
  });

  it("inserts registration columns between Email and Ticket Tier", () => {
    const cols = normalizeRegistrationExportColumns([
      { id: "f1", label: "Company" },
      { id: "f2", label: "Newsletter" },
    ]);
    const aoa = buildPurchaseExportAoa(
      "E",
      [
        {
          customer: "Bob",
          email: "b@x.com",
          tier: "VIP",
          quantity: 1,
          purchasedAt: "Jan 2",
          totalCost: "$0.00",
          registrationValues: registrationValuesForExportColumns(cols, {
            f1: "Acme",
            f2: true,
          }),
        },
      ],
      cols,
    );
    expect(aoa[2]).toEqual([
      "Customer",
      "Email",
      "Company",
      "Newsletter",
      "Ticket Tier",
      "Quantity",
      "Purchased At",
      "Base Ticket Price",
    ]);
    expect(aoa[3]).toEqual([
      "Bob",
      "b@x.com",
      "Acme",
      "Yes",
      "VIP",
      1,
      "Jan 2",
      "$0.00",
    ]);
  });

  it("pads missing registration values with empty strings", () => {
    const cols = normalizeRegistrationExportColumns([
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ]);
    const aoa = buildPurchaseExportAoa(
      "E",
      [
        {
          customer: "X",
          email: "x@x.com",
          tier: "T",
          quantity: 1,
          purchasedAt: "now",
          totalCost: "$1",
          registrationValues: ["only-one"],
        },
      ],
      cols,
    );
    expect(aoa[3]).toEqual(["X", "x@x.com", "only-one", "", "T", 1, "now", "$1"]);
  });
});

describe("purchaseExportColumnWidths", () => {
  it("returns 6 widths without registration columns", () => {
    expect(purchaseExportColumnWidths()).toHaveLength(6);
  });
  it("inserts one extra width per registration column", () => {
    const cols = normalizeRegistrationExportColumns([
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ]);
    expect(purchaseExportColumnWidths(cols)).toHaveLength(8);
  });
});
