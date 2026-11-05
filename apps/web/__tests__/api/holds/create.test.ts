/**
 * API Route Tests: POST /api/holds/create
 *
 * Covers the organizer manual sold-out override (`is_manually_sold_out`) on the
 * paid/hold purchase path. The route rejects closed tiers up front, and maps
 * the RPC's own rejection (the race-free check under the tier row lock) to the
 * same SOLD_OUT code.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

vi.mock("@/app/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock("@/app/lib/auth", () => ({
  resolveDbUserFromClerkId: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { POST } from "@/app/api/holds/create/route";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { resolveDbUserFromClerkId } from "@/app/lib/auth";

const EVENT_ID = "65c95ab5-8e61-486c-a267-1423602dee09";
const TIER_ID = "71100e84-515f-41f4-932a-185cc24d5476";

function createMockRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/holds/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createMockQueryBuilder(returnData: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: returnData, error }),
  };
}

function createMockHoldsLookup() {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "gt", "order"]) builder[m] = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockResolvedValue({ data: [], error: null });
  return builder;
}

function mockTables(tierOverrides: Record<string, unknown> = {}) {
  const event = { id: EVENT_ID, name: "EUR Test", slug: "eur-test", requires_rsvp: false };
  const tier = {
    id: TIER_ID,
    name: "General Admission",
    price_cents: 1500,
    quantity_total: 500,
    quantity_sold: 0,
    per_user_limit: 20,
    sales_start: null,
    sales_end: null,
    secret_code: null,
    is_hidden: false,
    is_manually_sold_out: false,
    ticket_stages: [],
    ...tierOverrides,
  };
  (supabaseAdmin!.from as ReturnType<typeof vi.fn>).mockImplementation(
    (table: string) =>
      // Flame 2.0 (fase 3, B4): the route first looks for a hold of this tier whose payment is
      // already running (`holds` … .is/.gt/.limit). None here → it goes on to the RPC.
      table === "holds"
        ? createMockHoldsLookup()
        : createMockQueryBuilder(table === "events" ? event : tier),
  );
}

const validBody = { event_id: EVENT_ID, ticket_tier_id: TIER_ID, quantity: 1 };

describe("POST /api/holds/create — manual sold-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: "user_clerk_123",
    });
    (resolveDbUserFromClerkId as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "user-db-1",
    });
  });

  it("rejects a manually sold-out tier with SOLD_OUT before creating a hold", async () => {
    mockTables({ is_manually_sold_out: true });

    const res = await POST(createMockRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.code).toBe("SOLD_OUT");
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it("maps the RPC's sold-out rejection (tier closed after the route read it) to SOLD_OUT", async () => {
    mockTables({ is_manually_sold_out: false });
    (supabaseAdmin!.rpc as ReturnType<typeof vi.fn>).mockImplementation(
      (fn: string) =>
        Promise.resolve(
          fn === "cleanup_expired_holds"
            ? { data: [], error: null }
            : {
                data: { success: false, error: "This ticket tier is sold out" },
                error: null,
              },
        ),
    );

    const res = await POST(createMockRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.code).toBe("SOLD_OUT");
  });

  it("still creates a hold on an open tier", async () => {
    mockTables({ is_manually_sold_out: false });
    (supabaseAdmin!.rpc as ReturnType<typeof vi.fn>).mockImplementation(
      (fn: string) =>
        Promise.resolve(
          fn === "cleanup_expired_holds"
            ? { data: [], error: null }
            : {
                data: {
                  success: true,
                  hold_id: "hold-1",
                  expires_at: "2026-10-16T12:30:00Z",
                  stage_name: null,
                  stage_price_cents: 1500,
                  promoter_code: null,
                },
                error: null,
              },
        ),
    );

    const res = await POST(createMockRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.hold_session_id).toBe("hold-1");
    expect(supabaseAdmin!.rpc).toHaveBeenCalledWith(
      "atomic_create_hold_with_stage_validation",
      expect.objectContaining({ p_tier_id: TIER_ID }),
    );
  });
});
