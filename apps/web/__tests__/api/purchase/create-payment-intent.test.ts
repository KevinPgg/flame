/**
 * API Route Tests: POST /api/purchase/create-payment-intent
 *
 * Tests the PaymentIntent creation endpoint for both hold and RSVP flows.
 * Uses mocked Clerk auth, Supabase, and Stripe clients.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

// Mock Supabase admin client
vi.mock("@/app/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

// Mock Stripe client
vi.mock("@/app/lib/stripe/stripe", () => ({
  stripe: {
    paymentIntents: {
      create: vi.fn(),
      retrieve: vi.fn(),
      cancel: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock fee calculation utilities
vi.mock("@/app/lib/stripe/fees", () => ({
  calculateFee: vi.fn((base, percent, fixed) => ({
    totalAmountCents: base + Math.round((base * percent) / 100) + fixed,
    platformFeeCents: Math.round((base * percent) / 100) + fixed,
  })),
  getEventMarkup: vi.fn().mockResolvedValue({
    percent: 10,
    fixedCents: 0,
  }),
  DEFAULT_PLATFORM_FEE_PERCENT: 10,
}));

// Import after mocks are set up
import { POST } from "@/app/api/purchase/create-payment-intent/route";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { stripe } from "@/app/lib/stripe/stripe";

// Helper to create mock NextRequest
function createMockRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/purchase/create-payment-intent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

// Helper to create mock Supabase query builder
function createMockQueryBuilder(returnData: unknown, error: unknown = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: returnData, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data: returnData, error }),
    update: vi.fn().mockReturnThis(),
  };
  return builder;
}

// Import the mocked function to re-setup after clearAllMocks
import { getEventMarkup } from "@/app/lib/stripe/fees";

describe("POST /api/purchase/create-payment-intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup the getEventMarkup mock after clearing
    (getEventMarkup as ReturnType<typeof vi.fn>).mockResolvedValue({
      percent: 10,
      fixedCents: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Authentication", () => {
    it("should return 401 if user is not authenticated", async () => {
      (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        userId: null,
      });

      const request = createMockRequest({ holdId: "test-hold-id" });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });
  });

  describe("Input Validation", () => {
    beforeEach(() => {
      (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        userId: "clerk_user_123",
      });
    });

    it("should return 400 for invalid JSON body", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/purchase/create-payment-intent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "invalid json",
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid JSON body");
    });

    it("should return 400 for invalid flow parameter", async () => {
      const userQuery = createMockQueryBuilder({
        id: "user-uuid",
        email: "test@example.com",
      });
      (supabaseAdmin!.from as ReturnType<typeof vi.fn>).mockReturnValue(
        userQuery,
      );

      const request = createMockRequest({
        eventId: "event-123",
        ticketTierId: "tier-123",
        quantity: 1,
        flow: "invalid",
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid flow parameter");
    });

    it("should return 400 for invalid holdId type", async () => {
      const userQuery = createMockQueryBuilder({
        id: "user-uuid",
        email: "test@example.com",
      });
      (supabaseAdmin!.from as ReturnType<typeof vi.fn>).mockReturnValue(
        userQuery,
      );

      const request = createMockRequest({
        holdId: 12345, // Should be string
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid holdId format");
    });

    it("should return 400 for quantity over 100", async () => {
      const userQuery = createMockQueryBuilder({
        id: "user-uuid",
        email: "test@example.com",
      });
      (supabaseAdmin!.from as ReturnType<typeof vi.fn>).mockReturnValue(
        userQuery,
      );

      const request = createMockRequest({
        eventId: "event-123",
        ticketTierId: "tier-123",
        quantity: 101,
        flow: "rsvp",
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("cannot exceed 100 tickets");
    });

    it("should return 400 for missing required RSVP parameters", async () => {
      const userQuery = createMockQueryBuilder({
        id: "user-uuid",
        email: "test@example.com",
      });
      (supabaseAdmin!.from as ReturnType<typeof vi.fn>).mockReturnValue(
        userQuery,
      );

      const request = createMockRequest({
        flow: "rsvp",
        // Missing eventId, ticketTierId, quantity
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
    });
  });

  describe("Hold Flow", () => {
    const mockUser = { id: "user-uuid", email: "test@example.com" };
    const mockHold = {
      id: "hold-123",
      user_id: "user-uuid",
      event_id: "event-123",
      quantity: 2,
      stage_price_cents: 1000,
      stage_id: "stage-1",
      promoter_code: null,
      expires_at: new Date(Date.now() + 600000).toISOString(), // 10 min from now
      events: {
        id: "event-123",
        organization_id: "org-123",
        name: "Test Event",
      },
      ticket_tiers: {
        id: "tier-123",
        name: "General",
        price_cents: 1500,
      },
    };
    const mockOrg = {
      id: "org-123",
      stripe_account_id: "acct_test123",
    };

    beforeEach(() => {
      (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        userId: "clerk_user_123",
      });
    });

    it("should create PaymentIntent for valid hold", async () => {
      // Setup mock responses
      (supabaseAdmin!.from as ReturnType<typeof vi.fn>).mockImplementation(
        (table: string) => {
          if (table === "users") {
            return createMockQueryBuilder(mockUser);
          }
          if (table === "holds") {
            return createMockQueryBuilder(mockHold);
          }
          if (table === "organizations") {
            return createMockQueryBuilder(mockOrg);
          }
          // Default - return empty for unknown tables
          return createMockQueryBuilder(null);
        },
      );

      (
        stripe.paymentIntents.create as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "pi_test123",
        client_secret: "pi_test123_secret_abc",
        status: "requires_payment_method",
      });

      const request = createMockRequest({ holdId: "hold-123" });
      const response = await POST(request);
      const data = await response.json();

      // Debug: Log error if not 200
      if (response.status !== 200) {
        console.log("API Error:", data);
      }

      expect(response.status).toBe(200);
      expect(data.paymentIntentId).toBe("pi_test123");
      expect(data.clientSecret).toBe("pi_test123_secret_abc");
      expect(data.amounts).toBeDefined();
      expect(data.amounts.base).toBe(2000); // 1000 cents × 2 quantity
    });

    it("should return 404 if hold not found", async () => {
      (supabaseAdmin!.from as ReturnType<typeof vi.fn>).mockImplementation(
        (table: string) => {
          if (table === "users") {
            return createMockQueryBuilder(mockUser);
          }
          if (table === "holds") {
            return createMockQueryBuilder(null); // Hold not found
          }
          return createMockQueryBuilder(null);
        },
      );

      const request = createMockRequest({ holdId: "nonexistent-hold" });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Hold not found");
    });

    it("should return 403 if hold belongs to different user", async () => {
      const holdWithDifferentUser = { ...mockHold, user_id: "different-user" };

      (supabaseAdmin!.from as ReturnType<typeof vi.fn>).mockImplementation(
        (table: string) => {
          if (table === "users") {
            return createMockQueryBuilder(mockUser);
          }
          if (table === "holds") {
            return createMockQueryBuilder(holdWithDifferentUser);
          }
          return createMockQueryBuilder(null);
        },
      );

      const request = createMockRequest({ holdId: "hold-123" });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("Unauthorized access to hold");
    });

    it("should return 400 if hold has expired", async () => {
      const expiredHold = {
        ...mockHold,
        expires_at: new Date(Date.now() - 60000).toISOString(), // 1 min ago
      };

      (supabaseAdmin!.from as ReturnType<typeof vi.fn>).mockImplementation(
        (table: string) => {
          if (table === "users") {
            return createMockQueryBuilder(mockUser);
          }
          if (table === "holds") {
            return createMockQueryBuilder(expiredHold);
          }
          return createMockQueryBuilder(null);
        },
      );

      const request = createMockRequest({ holdId: "hold-123" });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Hold has expired");
    });
  });

  describe("Free Ticket Flow (100% Discount)", () => {
    const mockUser = { id: "user-uuid", email: "test@example.com" };

    beforeEach(() => {
      (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        userId: "clerk_user_123",
      });
    });

    it("should return free purchase response when total is 0", async () => {
      const mockHold = {
        id: "hold-123",
        user_id: "user-uuid",
        event_id: "event-123",
        quantity: 1,
        stage_price_cents: 1000,
        stage_id: "stage-1",
        promoter_code: null,
        expires_at: new Date(Date.now() + 600000).toISOString(),
        events: {
          id: "event-123",
          organization_id: "org-123",
          name: "Test Event",
        },
        ticket_tiers: {
          id: "tier-123",
          name: "General",
          price_cents: 1500,
        },
      };

      const mockPromoCode = {
        id: "promo-123",
        code: "FREE100",
        discount_percentage: 100,
        usage_limit: null,
        usage_count: 0,
        event_id: "event-123",
        events: { id: "event-123", status: "published" },
      };

      (supabaseAdmin!.from as ReturnType<typeof vi.fn>).mockImplementation(
        (table: string) => {
          if (table === "users") {
            return createMockQueryBuilder(mockUser);
          }
          if (table === "holds") {
            return createMockQueryBuilder(mockHold);
          }
          if (table === "organizations") {
            return createMockQueryBuilder({
              id: "org-123",
              stripe_account_id: "acct_test123",
            });
          }
          if (table === "promotional_codes") {
            return createMockQueryBuilder(mockPromoCode);
          }
          return createMockQueryBuilder(null);
        },
      );

      const request = createMockRequest({
        holdId: "hold-123",
        promoCode: "FREE100",
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.clientSecret).toBeNull();
      expect(data.paymentIntentId).toContain("free_promo_");
      expect(data.amounts.total).toBe(0);
      expect(data.amounts.discount).toBe(1000);
    });
  });

  describe("Promo Code Validation", () => {
    const mockUser = { id: "user-uuid", email: "test@example.com" };
    const mockHold = {
      id: "hold-123",
      user_id: "user-uuid",
      event_id: "event-123",
      quantity: 1,
      stage_price_cents: 1000,
      stage_id: "stage-1",
      promoter_code: null,
      expires_at: new Date(Date.now() + 600000).toISOString(),
      events: {
        id: "event-123",
        organization_id: "org-123",
        name: "Test Event",
      },
      ticket_tiers: {
        id: "tier-123",
        name: "General",
        price_cents: 1500,
      },
    };

    beforeEach(() => {
      (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        userId: "clerk_user_123",
      });
    });

    it("should return 404 for invalid promo code", async () => {
      (supabaseAdmin!.from as ReturnType<typeof vi.fn>).mockImplementation(
        (table: string) => {
          if (table === "users") {
            return createMockQueryBuilder(mockUser);
          }
          if (table === "holds") {
            return createMockQueryBuilder(mockHold);
          }
          if (table === "organizations") {
            return createMockQueryBuilder({
              id: "org-123",
              stripe_account_id: "acct_test123",
            });
          }
          if (table === "promotional_codes") {
            return createMockQueryBuilder(null); // Promo code not found
          }
          return createMockQueryBuilder(null);
        },
      );

      const request = createMockRequest({
        holdId: "hold-123",
        promoCode: "INVALID",
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Invalid promotional code");
    });

    it("should return 400 for promo code that reached usage limit", async () => {
      const exhaustedPromoCode = {
        id: "promo-123",
        code: "LIMITED",
        discount_percentage: 15,
        usage_limit: 10,
        usage_count: 10, // Reached limit
        event_id: "event-123",
        events: { id: "event-123", status: "published" },
      };

      (supabaseAdmin!.from as ReturnType<typeof vi.fn>).mockImplementation(
        (table: string) => {
          if (table === "users") {
            return createMockQueryBuilder(mockUser);
          }
          if (table === "holds") {
            return createMockQueryBuilder(mockHold);
          }
          if (table === "organizations") {
            return createMockQueryBuilder({
              id: "org-123",
              stripe_account_id: "acct_test123",
            });
          }
          if (table === "promotional_codes") {
            return createMockQueryBuilder(exhaustedPromoCode);
          }
          return createMockQueryBuilder(null);
        },
      );

      const request = createMockRequest({
        holdId: "hold-123",
        promoCode: "LIMITED",
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("reached its usage limit");
    });

    it("should apply discount correctly with valid promo code", async () => {
      const validPromoCode = {
        id: "promo-123",
        code: "DISCOUNT15",
        discount_percentage: 15,
        usage_limit: null,
        usage_count: 0,
        event_id: "event-123",
        events: { id: "event-123", status: "published" },
      };

      (supabaseAdmin!.from as ReturnType<typeof vi.fn>).mockImplementation(
        (table: string) => {
          if (table === "users") {
            return createMockQueryBuilder(mockUser);
          }
          if (table === "holds") {
            return createMockQueryBuilder(mockHold);
          }
          if (table === "organizations") {
            return createMockQueryBuilder({
              id: "org-123",
              stripe_account_id: "acct_test123",
            });
          }
          if (table === "promotional_codes") {
            return createMockQueryBuilder(validPromoCode);
          }
          return createMockQueryBuilder(null);
        },
      );

      (
        stripe.paymentIntents.create as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: "pi_test123",
        client_secret: "pi_test123_secret_abc",
        status: "requires_payment_method",
      });

      const request = createMockRequest({
        holdId: "hold-123",
        promoCode: "DISCOUNT15",
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.amounts.discount).toBe(150); // 15% of 1000 cents
      expect(data.amounts.base).toBe(1000); // Original base price
    });
  });

  describe("Organization Validation", () => {
    const mockUser = { id: "user-uuid", email: "test@example.com" };
    const mockHold = {
      id: "hold-123",
      user_id: "user-uuid",
      event_id: "event-123",
      quantity: 1,
      stage_price_cents: 1000,
      stage_id: "stage-1",
      promoter_code: null,
      expires_at: new Date(Date.now() + 600000).toISOString(),
      events: {
        id: "event-123",
        organization_id: "org-123",
        name: "Test Event",
      },
      ticket_tiers: {
        id: "tier-123",
        name: "General",
        price_cents: 1500,
      },
    };

    beforeEach(() => {
      (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        userId: "clerk_user_123",
      });
    });

    it("should return 400 if organization is not connected to Stripe", async () => {
      (supabaseAdmin!.from as ReturnType<typeof vi.fn>).mockImplementation(
        (table: string) => {
          if (table === "users") {
            return createMockQueryBuilder(mockUser);
          }
          if (table === "holds") {
            return createMockQueryBuilder(mockHold);
          }
          if (table === "organizations") {
            return createMockQueryBuilder({
              id: "org-123",
              stripe_account_id: null,
            });
          }
          return createMockQueryBuilder(null);
        },
      );

      const request = createMockRequest({ holdId: "hold-123" });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Organization is not connected to Stripe");
    });
  });
});
