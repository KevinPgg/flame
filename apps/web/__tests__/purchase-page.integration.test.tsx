/**
 * Integration Tests for Purchase Page Component
 *
 * These tests use React Testing Library to test the actual PurchasePage component,
 * ensuring the real implementation code is tested, not just mock functions.
 *
 * Tests verify:
 * - Free ticket detection (RSVP and Hold)
 * - Paid ticket checkout creation (RSVP and Hold)
 * - Promotion code application (15% and 100%)
 * - Price consistency across all flows
 */

import React from "react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor, type Screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSearchParams } from "next/navigation";
import PurchasePage from "../app/purchase/page";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock Stripe Elements
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="stripe-elements">{children}</div>
  ),
  useStripe: () => ({
    confirmPayment: vi.fn(),
  }),
  useElements: () => ({
    getElement: vi.fn(),
  }),
  PaymentElement: () => <div data-testid="payment-element" />,
}));

// Mock Stripe Client
const mockStripePromise = Promise.resolve({});
vi.mock("../app/lib/stripe/stripe-client", () => ({
  getStripe: () => mockStripePromise,
}));

// Mock StripePaymentForm component
vi.mock("../app/components/StripePaymentForm", () => ({
  default: () => <div data-testid="stripe-payment-form">Stripe Payment Form</div>,
}));

// Mock fetch for API calls
global.fetch = vi.fn();

/**
 * Helper function to validate fee breakdown displayed in the UI
 * Extracts values from the purchase page and compares them against expected values
 */
function validateFeeBreakdown(
  screen: Screen,
  expected: {
    expectedServiceFeeCents: number;
    expectedFinalTotal: number;
    expectedBaseTotalCents: number;
    tolerance?: number;
  },
) {
  const tolerance = expected.tolerance ?? 1;

  // Extract UI elements
  const serviceFeeElement = screen.getByText(/Service fee/i);
  const finalTotalElement = screen.getByText(/Total Amount/i);
  const subtotalElement = screen.getByText(/Subtotal/i);

  // Helper to parse currency
  const parseDollars = (text: string | null) => {
    if (!text) return 0;
    const match = text.match(/\$?(\d+)\.(\d{2})/);
    if (match) {
      return parseInt(match[1]) * 100 + parseInt(match[2]);
    }
    return 0;
  };

  // Extract values
  const serviceFeeValue = serviceFeeElement.parentElement?.querySelector(
    ".purchase-summary-value",
  )?.textContent;
  
  // Total is in a sibling div with class purchase-summary-total, inside a strong tag
  // We can find it by looking for the "Total Amount" text and getting its parent's strong child
  const finalTotalValue = finalTotalElement.parentElement?.querySelector(
    "strong",
  )?.textContent;

  const subtotalValue = subtotalElement.parentElement?.querySelector(
    ".purchase-summary-value",
  )?.textContent;

  const actualServiceFeeCents = parseDollars(serviceFeeValue || "");
  const actualFinalTotalCents = parseDollars(finalTotalValue || "");
  const actualBaseTotalCents = parseDollars(subtotalValue || "");

  // Assertions
  expect(Math.abs(actualServiceFeeCents - expected.expectedServiceFeeCents)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actualFinalTotalCents - expected.expectedFinalTotal)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actualBaseTotalCents - expected.expectedBaseTotalCents)).toBeLessThanOrEqual(tolerance);
}

describe("Purchase Page Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch mock
    (global.fetch as any).mockReset();
    // Clear sessionStorage
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Free Ticket Flows", () => {
    it("should detect free RSVP ticket and show confirm button", async () => {
      // Mock RSVP token with free stage pricing
      (useSearchParams as any).mockReturnValue({
        get: (key: string) => {
          if (key === "token") return "test-rsvp-token";
          return null;
        },
      });

      // Mock /api/rsvp/details API response with free ticket
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mode: "rsvp",
          id: "test-rsvp-id",
          event: {
            id: "event-id",
            name: "Test Event",
            slug: "test-event",
            starts_at: "2025-12-31T20:00:00Z",
            venue: "Test Venue",
            city: "Test City",
            organization_name: "Test Org",
            image_url: null,
          },
          ticket_tier: {
            id: "tier-id",
            name: "Early Bird",
            price_cents: 335, // Base tier price
          },
          quantity: 1,
          stage_id: null,
          stage_name: null,
          stage_price_cents: 0, // Free stage price
          promoter_code: null,
          user: {
            email: "test@example.com",
            first_name: "Test",
            last_name: "User",
          },
        }),
      });

      render(<PurchasePage />);

      // Wait for data to load
      await waitFor(
        () => {
          expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Should show "Claim Free Ticket" button, not "Proceed to Payment"
      const confirmButton = screen.queryByText(/Claim Free Ticket/i);
      expect(confirmButton).toBeInTheDocument();
    });

    it("should detect free Hold ticket and show confirm button", async () => {
      // Mock Hold session with free stage pricing
      (useSearchParams as any).mockReturnValue({
        get: (key: string) => {
          if (key === "session") return "test-hold-session";
          return null;
        },
      });

      // Mock /api/holds/details API response with free ticket
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mode: "hold",
          id: "test-hold-id",
          event: {
            id: "event-id",
            slug: "test-event",
            name: "Test Event",
            starts_at: "2025-12-31T20:00:00Z",
            venue: "Test Venue",
            city: "Test City",
            organization_name: "Test Org",
            image_url: null,
          },
          ticket_tier: {
            id: "tier-id",
            name: "Early Bird",
            price_cents: 335, // Base tier price
          },
          quantity: 1,
          stage_id: null,
          stage_name: null,
          stage_price_cents: 0, // Free stage price
          promoter_code: null,
          user: {
            email: "test@example.com",
            first_name: "Test",
            last_name: "User",
          },
        }),
      });

      render(<PurchasePage />);

      // Wait for data to load
      await waitFor(
        () => {
          expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Should show "Claim Free Ticket" button
      const confirmButton = screen.queryByText(/Claim Free Ticket/i);
      expect(confirmButton).toBeInTheDocument();
    });
  });

  describe("Paid Ticket Flows", () => {
    it("should show payment button for paid RSVP ticket", async () => {
      (useSearchParams as any).mockReturnValue({
        get: (key: string) => {
          if (key === "token") return "test-rsvp-token";
          return null;
        },
      });

      // Mock /api/rsvp/details API response with paid ticket
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mode: "rsvp",
          id: "test-rsvp-id",
          event: {
            id: "event-id",
            name: "Test Event",
            slug: "test-event",
            starts_at: "2025-12-31T20:00:00Z",
            venue: "Test Venue",
            city: "Test City",
            organization_name: "Test Org",
            image_url: null,
          },
          ticket_tier: {
            id: "tier-id",
            name: "Regular",
            price_cents: 0,
          },
          quantity: 1,
          stage_id: "stage-1",
          stage_name: "Early Bird",
          stage_price_cents: 335, // Paid stage price: $3.35
          promoter_code: null,
          user: {
            email: "test@example.com",
            first_name: "Test",
            last_name: "User",
          },
        }),
      });

      // Mock create-payment-intent API response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          clientSecret: "test_client_secret",
          paymentIntentId: "pi_test123",
          amounts: {
            base: 335,
            fee: 50,
            total: 385,
            currency: "USD",
          },
        }),
      });

      render(<PurchasePage />);

      await waitFor(
        () => {
          expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Should show Payment Information section (not free ticket button)
      const paymentSection = screen.queryByText(/Payment Information/i);
      expect(paymentSection).toBeInTheDocument();

      // Should show Stripe Payment Form
      expect(screen.getByTestId("stripe-payment-form")).toBeInTheDocument();

      // Should NOT show free ticket button
      const freeButton = screen.queryByText(/Claim Free Ticket/i);
      expect(freeButton).not.toBeInTheDocument();
    });

    it("should show payment button for paid Hold ticket", async () => {
      (useSearchParams as any).mockReturnValue({
        get: (key: string) => {
          if (key === "session") return "test-hold-session";
          return null;
        },
      });

      // Mock /api/holds/details API response with paid ticket
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mode: "hold",
          id: "test-hold-id",
          event: {
            id: "event-id",
            slug: "test-event",
            name: "Test Event",
            starts_at: "2025-12-31T20:00:00Z",
            venue: "Test Venue",
            city: "Test City",
            organization_name: "Test Org",
            image_url: null,
          },
          ticket_tier: {
            id: "tier-id",
            name: "Regular",
            price_cents: 0,
          },
          quantity: 1,
          stage_id: "stage-1",
          stage_name: "Early Bird",
          stage_price_cents: 335, // Paid stage price: $3.35
          promoter_code: null,
          user: {
            email: "test@example.com",
            first_name: "Test",
            last_name: "User",
          },
        }),
      });

      // Mock create-payment-intent API response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          clientSecret: "test_client_secret",
          paymentIntentId: "pi_test123",
          amounts: {
            base: 335,
            fee: 50,
            total: 385,
            currency: "USD",
          },
        }),
      });

      render(<PurchasePage />);

      await waitFor(
        () => {
          expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Should show Payment Information section for paid tickets
      const paymentSection = screen.queryByText(/Payment Information/i);
      expect(paymentSection).toBeInTheDocument();
    });
  });

  describe("Promotion Code Flows", () => {
    it("should detect free ticket after 100% promo code is applied (RSVP)", async () => {
      const user = userEvent.setup();
      (useSearchParams as any).mockReturnValue({
        get: (key: string) => {
          if (key === "token") return "test-rsvp-token";
          return null;
        },
      });

      // Mock /api/rsvp/details API response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mode: "rsvp",
          id: "test-rsvp-id",
          event: {
            id: "event-id",
            name: "Test Event",
            slug: "test-event",
            starts_at: "2025-12-31T20:00:00Z",
            venue: "Test Venue",
            city: "Test City",
            organization_name: "Test Org",
            image_url: null,
          },
          ticket_tier: {
            id: "tier-id",
            name: "Regular",
            price_cents: 0,
          },
          quantity: 1,
          stage_id: "stage-1",
          stage_name: "Early Bird",
          stage_price_cents: 335, // Paid stage price
          promoter_code: null,
          user: {
            email: "test@example.com",
            first_name: "Test",
            last_name: "User",
          },
        }),
      });

      // Mock create-payment-intent API response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          clientSecret: "test_client_secret",
          paymentIntentId: "pi_test123",
          amounts: {
            base: 335,
            fee: 50,
            total: 385,
            currency: "USD",
          },
        }),
      });

      render(<PurchasePage />);

      await waitFor(
        () => {
          expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Mock 100% promo code - returns total: 0 to trigger free ticket flow
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          clientSecret: null,
          paymentIntentId: null,
          amounts: {
            base: 0,
            fee: 0,
            total: 0,
            discount: 335,
            currency: "USD",
          },
          promotionalCodeId: "promo-id",
        }),
      });

      // Find and apply promo code
      const promoInput = screen.getByPlaceholderText(/enter code/i);
      await user.type(promoInput, "FREE100");
      const applyButton = screen.getByText(/apply/i);
      await user.click(applyButton);

      // After 100% promo, should show "Claim Free Ticket" button
      await waitFor(
        () => {
          const freeButton = screen.queryByText(/Claim Free Ticket/i);
          expect(freeButton).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it("should detect free ticket after 100% promo code is applied (Hold)", async () => {
      const user = userEvent.setup();
      (useSearchParams as any).mockReturnValue({
        get: (key: string) => {
          if (key === "session") return "test-hold-session";
          return null;
        },
      });

      // Mock /api/holds/details API response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mode: "hold",
          id: "test-hold-id",
          event: {
            id: "event-id",
            slug: "test-event",
            name: "Test Event",
            starts_at: "2025-12-31T20:00:00Z",
            venue: "Test Venue",
            city: "Test City",
            organization_name: "Test Org",
            image_url: null,
          },
          ticket_tier: {
            id: "tier-id",
            name: "Regular",
            price_cents: 0,
          },
          quantity: 1,
          stage_id: "stage-1",
          stage_name: "Early Bird",
          stage_price_cents: 335, // Paid stage price
          promoter_code: null,
          user: {
            email: "test@example.com",
            first_name: "Test",
            last_name: "User",
          },
        }),
      });

      // Mock create-payment-intent API response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          clientSecret: "test_client_secret",
          paymentIntentId: "pi_test123",
          amounts: {
            base: 335,
            fee: 50,
            total: 385,
            currency: "USD",
          },
        }),
      });

      render(<PurchasePage />);

      await waitFor(
        () => {
          expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Mock 100% promo code - returns total: 0 to trigger free ticket flow
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          clientSecret: null,
          paymentIntentId: null,
          amounts: {
            base: 0,
            fee: 0,
            total: 0,
            discount: 335,
            currency: "USD",
          },
          promotionalCodeId: "promo-id",
        }),
      });

      // Find and apply promo code
      const promoInput = screen.getByPlaceholderText(/enter code/i);
      await user.type(promoInput, "FREE100");
      const applyButton = screen.getByText(/apply/i);
      await user.click(applyButton);

      // After 100% promo, should show "Claim Free Ticket" button
      await waitFor(
        () => {
          const freeButton = screen.queryByText(/Claim Free Ticket/i);
          expect(freeButton).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });
  });

  describe("Price Display Consistency", () => {
    it("should display consistent prices in order summary and payment button", async () => {
      (useSearchParams as any).mockReturnValue({
        get: (key: string) => {
          if (key === "token") return "test-rsvp-token";
          return null;
        },
      });

      // Mock /api/rsvp/details API response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mode: "rsvp",
          id: "test-rsvp-id",
          event: {
            id: "event-id",
            name: "Test Event",
            slug: "test-event",
            starts_at: "2025-12-31T20:00:00Z",
            venue: "Test Venue",
            city: "Test City",
            organization_name: "Test Org",
            image_url: null,
          },
          ticket_tier: {
            id: "tier-id",
            name: "Regular",
            price_cents: 0,
          },
          quantity: 2, // 2 tickets
          stage_id: "stage-1",
          stage_name: "Early Bird",
          stage_price_cents: 335, // $3.35
          promoter_code: null,
          user: {
            email: "test@example.com",
            first_name: "Test",
            last_name: "User",
          },
        }),
      });

      // Mock create-payment-intent API response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          clientSecret: "test_client_secret",
          paymentIntentId: "pi_test123",
          amounts: {
            base: 670, // 2 * 335
            fee: 67,
            total: 737,
            currency: "USD",
          },
        }),
      });

      render(<PurchasePage />);

      await waitFor(
        () => {
          expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Assert displayed total matches mocked response
      const expectedTotal = (737 / 100).toFixed(2);
      expect(screen.getByText(/Payment Information/i)).toBeInTheDocument();
      // Use getAllByText because the total might appear in the summary and in the payment form
      const totalElements = screen.getAllByText(new RegExp(`\\$${expectedTotal}`));
      expect(totalElements.length).toBeGreaterThan(0);
    });
  });

  describe("Promo Code Application Flow", () => {
    it("should apply 15% promo code and update total", async () => {
      const user = userEvent.setup();
      (useSearchParams as any).mockReturnValue({
        get: (key: string) => {
          if (key === "token") return "test-rsvp-token";
          return null;
        },
      });

      // Mock validate-token API response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mode: "rsvp",
          id: "test-rsvp-id",
          event: {
            id: "event-id",
            name: "Test Event",
            starts_at: "2025-12-31T20:00:00Z",
            venue: "Test Venue",
            organization_name: "Test Org",
            image_url: null,
          },
          ticket_tier: {
            id: "tier-id",
            name: "Regular",
            price_cents: 0,
          },
          stage_price_cents: 335, // $3.35
          quantity: 1,
          user: {
            email: "test@example.com",
            first_name: "Test",
            last_name: "User",
          },
        }),
      });

      // Mock create-payment-intent API response (initial)
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          clientSecret: "test_client_secret",
          paymentIntentId: "pi_test123",
          amounts: {
            base: 335,
            fee: 50,
            total: 385,
            currency: "USD",
          },
        }),
      });

      render(<PurchasePage />);

      await waitFor(
        () => {
          expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Find promo code input and apply button
      const promoInput = screen.getByPlaceholderText(/enter code/i);
      // Type promo code
      await user.type(promoInput, "SAVE15");

      // Mock create-payment-intent with promo code - returns discounted amounts
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          clientSecret: "test_client_secret_promo",
          paymentIntentId: "pi_test_promo",
          amounts: {
            base: 285, // $3.35 - $0.50 = $2.85
            fee: 0,
            total: 285,
            discount: 50,
            currency: "USD",
          },
          promotionalCodeId: "promo-id",
        }),
      });

      // Find and click apply button
      const applyButton = screen.getByText(/apply/i);
      await user.click(applyButton);

      // Wait for promo code to be applied
      await waitFor(() => {
        // Verify API was called with promo code
        const fetchCalls = (global.fetch as any).mock.calls;
        const promoCall = fetchCalls.find(
          (call: any[]) => call[0] === "/api/purchase/create-payment-intent" && call[1]?.body?.includes("SAVE15")
        );
        expect(promoCall).toBeDefined();
      });

      // Verify discount is displayed
      await waitFor(() => {
        expect(screen.getByText(/Discount/i)).toBeInTheDocument();
      });
    });

    it("should apply 100% promo code and show free ticket button", async () => {
      const user = userEvent.setup();
      (useSearchParams as any).mockReturnValue({
        get: (key: string) => {
          if (key === "token") return "test-rsvp-token";
          return null;
        },
      });

      // Mock /api/rsvp/details API response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mode: "rsvp",
          id: "test-rsvp-id",
          event: {
            id: "event-id",
            name: "Test Event",
            slug: "test-event",
            starts_at: "2025-12-31T20:00:00Z",
            venue: "Test Venue",
            city: "Test City",
            organization_name: "Test Org",
            image_url: null,
          },
          ticket_tier: {
            id: "tier-id",
            name: "Regular",
            price_cents: 0,
          },
          quantity: 1,
          stage_id: "stage-1",
          stage_name: "Early Bird",
          stage_price_cents: 335,
          promoter_code: null,
          user: {
            email: "test@example.com",
            first_name: "Test",
            last_name: "User",
          },
        }),
      });

      // Mock create-payment-intent API response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          clientSecret: "test_client_secret",
          paymentIntentId: "pi_test123",
          amounts: {
            base: 335,
            fee: 50,
            total: 385,
            currency: "USD",
          },
        }),
      });

      render(<PurchasePage />);

      await waitFor(
        () => {
          expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Initially should show Payment Information section
      expect(screen.queryByText(/Payment Information/i)).toBeInTheDocument();

      // Mock 100% promo code - returns total: 0 to trigger free ticket flow
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          clientSecret: null,
          paymentIntentId: null,
          amounts: {
            base: 0,
            fee: 0,
            total: 0,
            discount: 335,
            currency: "USD",
          },
          promotionalCodeId: "promo-id",
        }),
      });

      // Find and apply promo code
      const promoInput = screen.getByPlaceholderText(/enter code/i);
      await user.type(promoInput, "FREE100");
      const applyButton = screen.getByText(/apply/i);
      await user.click(applyButton);

      // After 100% promo, should show "Claim Free Ticket" button
      await waitFor(
        () => {
          const freeButton = screen.queryByText(/Claim Free Ticket/i);
          expect(freeButton).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });
  });

  describe("Fee Breakdown Display", () => {
    it("should display correct fee breakdown without promo code", async () => {
      const user = userEvent.setup();
      // Mock Hold session with paid ticket
      (useSearchParams as any).mockReturnValue({
        get: (key: string) => {
          if (key === "session") return "test-hold-session";
          return null;
        },
      });

      // Mock /api/holds/details API response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mode: "hold",
          id: "test-hold-id",
          event: {
            id: "event-id",
            slug: "test-event",
            name: "Test Event",
            starts_at: "2025-12-31T20:00:00Z",
            venue: "Test Venue",
            city: "Test City",
            organization_name: "Test Org",
            image_url: null,
          },
          ticket_tier: {
            id: "tier-id",
            name: "Regular",
            price_cents: 10000, // $100 base price
          },
          quantity: 1,
          stage_id: null,
          stage_name: null,
          stage_price_cents: null,
          promoter_code: null,
          user: {
            email: "test@example.com",
            first_name: "Test",
            last_name: "User",
          },
        }),
      });

      // Mock create-payment-intent API response with fee breakdown
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          clientSecret: "test_client_secret",
          paymentIntentId: "pi_test123",
          amounts: {
            base: 10000, // $100.00
            fee: 1000, // $10.00 platform fee
            total: 11000, // $110.00
            currency: "USD",
          },
        }),
      });

      render(<PurchasePage />);

      await waitFor(
        () => {
          expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      const expectedFinalTotal = 11000;
      const expectedBaseTotal = 10000;
      const expectedServiceFee = 1000;

      validateFeeBreakdown(screen, {
        expectedServiceFeeCents: expectedServiceFee,
        expectedFinalTotal: expectedFinalTotal,
        expectedBaseTotalCents: expectedBaseTotal,
        tolerance: 1,
      });
    });

    it("should display correct fee breakdown with 15% promo code", async () => {
      const user = userEvent.setup();
      // Mock Hold session with paid ticket
      (useSearchParams as any).mockReturnValue({
        get: (key: string) => {
          if (key === "session") return "test-hold-session";
          return null;
        },
      });

      // Mock validate API response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mode: "hold",
          id: "test-hold-id",
          expires_at: new Date(Date.now() + 600000).toISOString(),
          remaining_seconds: 600,
          event: {
            id: "event-id",
            slug: "test-event",
            name: "Test Event",
            starts_at: "2025-12-31T20:00:00Z",
            venue: "Test Venue",
            city: "Test City",
            organization_name: "Test Org",
            image_url: null,
          },
          ticket_tier: {
            id: "tier-id",
            name: "Regular",
            price_cents: 10000, // $100.00 base
          },
          stage_price_cents: null,
          stage_id: null,
          stage_name: null,
          promoter_code: null,
          quantity: 1,
          user: {
            email: "test@example.com",
            first_name: "Test",
            last_name: "User",
          },
        }),
      });

      // Mock create-payment-intent API response (needed for paid tickets)
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          clientSecret: "test_client_secret",
          paymentIntentId: "pi_test123",
          amounts: {
            base: 10000,
            fee: 1000,
            total: 11000,
            currency: "USD",
          },
        }),
      });

      render(<PurchasePage />);

      await waitFor(
        () => {
          expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      // Apply 15% promo code - calls create-payment-intent with promoCode
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          clientSecret: "test_client_secret_promo",
          paymentIntentId: "pi_test_promo",
          amounts: {
            base: 8500, // $100 - $15 = $85
            fee: 850, // 10% of $85 = $8.50
            total: 9350, // $85 + $8.50 = $93.50
            discount: 1500, // 15% discount
            currency: "USD",
          },
          promotionalCodeId: "promo-id",
        }),
      });

      const promoInput = screen.getByPlaceholderText(/enter code/i);
      await user.type(promoInput, "SAVE15");
      const applyButton = screen.getByText(/apply/i);
      await user.click(applyButton);

      await waitFor(
        () => {
          // Verify discount is displayed
          const discountElement = screen.queryByText(/Discount/i);
          expect(discountElement).toBeInTheDocument();

          // Verify fee breakdown is still displayed
          const serviceFeeElement = screen.getByText(/Service fee/i);
          expect(serviceFeeElement).toBeInTheDocument();

          // Verify final total
          const finalTotalElements = screen.getAllByText(/\$93\.50/i);
          expect(finalTotalElements.length).toBeGreaterThan(0);

          validateFeeBreakdown(screen, {
            expectedServiceFeeCents: 850,
            expectedFinalTotal: 9350,
            expectedBaseTotalCents: 8500,
            tolerance: 1,
          });
        },
        { timeout: 3000 },
      );
    });
  });
});
