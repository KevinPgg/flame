/**
 * API Endpoint Tests: Real-time Availability
 *
 * Tests the /api/ticket-tiers/[tierId]/availability endpoint:
 * - Returns correct availability data
 * - Cleans up expired holds before returning data
 * - Handles errors gracefully
 * - Returns consistent tier and stage availability
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../app/api/ticket-tiers/[tierId]/availability/route";
import type { MockedFunction } from "vitest";

// Type definitions for Supabase query builder chain
interface SupabaseQueryBuilder<T> {
  select: MockedFunction<(columns?: string) => SupabaseFilterBuilder<T>>;
}

interface SupabaseFilterBuilder<T> {
  eq: MockedFunction<
    (column: string, value: unknown) => SupabaseSingleBuilder<T>
  >;
  gt: MockedFunction<
    (column: string, value: unknown) => SupabaseFilterBuilder<T>
  >;
  is: MockedFunction<
    (
      column: string,
      value: unknown,
    ) => Promise<{ data: T[] | null; error: unknown }>
  >;
}

interface SupabaseSingleBuilder<T> {
  single: MockedFunction<() => Promise<{ data: T | null; error: unknown }>>;
}

interface SupabaseTable<T> {
  select: MockedFunction<(columns?: string) => SupabaseFilterBuilder<T>>;
  delete: MockedFunction<() => SupabaseDeleteBuilder<T>>;
}

interface SupabaseDeleteBuilder<T> {
  eq: MockedFunction<
    (
      column: string,
      value: unknown,
    ) => Promise<{ data: T[] | null; error: unknown }>
  >;
}

interface MockSupabaseAdmin {
  rpc: MockedFunction<
    (
      fnName: string,
      params?: unknown,
    ) => Promise<{ data: unknown; error: unknown }>
  >;
  from: MockedFunction<<T = unknown>(table: string) => SupabaseTable<T>>;
}

// Helper to create a typed mock query builder chain
function createMockQueryBuilder<T>(): {
  select: MockedFunction<(columns?: string) => SupabaseFilterBuilder<T>>;
  eq: MockedFunction<
    (column: string, value: unknown) => SupabaseSingleBuilder<T>
  >;
  single: MockedFunction<() => Promise<{ data: T | null; error: unknown }>>;
} {
  const single = vi.fn<() => Promise<{ data: T | null; error: unknown }>>();
  const eq = vi.fn<
    (column: string, value: unknown) => SupabaseSingleBuilder<T>
  >(() => ({ single }) as SupabaseSingleBuilder<T>);
  const select = vi.fn<(columns?: string) => SupabaseFilterBuilder<T>>(
    () => ({ eq }) as SupabaseFilterBuilder<T>,
  );

  return { select, eq, single };
}

// Helper to create a typed mock table
function createMockTable<T>(): SupabaseTable<T> & {
  _getSingleMock: () => MockedFunction<
    () => Promise<{ data: T | null; error: unknown }>
  >;
  _getEqMock: () => MockedFunction<
    (column: string, value: unknown) => SupabaseSingleBuilder<T>
  >;
} {
  const deleteBuilder: SupabaseDeleteBuilder<T> = {
    eq: vi.fn<
      (
        column: string,
        value: unknown,
      ) => Promise<{ data: T[] | null; error: unknown }>
    >(),
  };

  // Create shared mocks that will be reused across the chain
  const single = vi.fn<() => Promise<{ data: T | null; error: unknown }>>();
  const eq = vi.fn<
    (column: string, value: unknown) => SupabaseSingleBuilder<T>
  >(() => ({ single }) as SupabaseSingleBuilder<T>);
  const select = vi.fn<(columns?: string) => SupabaseFilterBuilder<T>>(
    () => ({ eq }) as SupabaseFilterBuilder<T>,
  );

  return {
    select,
    delete: vi.fn(() => deleteBuilder),
    _getSingleMock: () => single,
    _getEqMock: () => eq,
  };
}

// Mock supabaseAdmin - must be defined inline for vi.mock hoisting
vi.mock("../app/lib/supabase/server", () => {
  const mockSupabaseAdmin: MockSupabaseAdmin = {
    rpc: vi.fn(),
    from: vi.fn(),
  };
  return {
    supabaseAdmin: mockSupabaseAdmin,
  };
});

// Import the mocked module to get reference to mock functions
import { supabaseAdmin } from "../app/lib/supabase/server";

// Use vi.mocked for type-safe access to the mock
const mockSupabaseAdmin = vi.mocked(supabaseAdmin)!;

// Mock console methods for testing logging
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

// Helper to create a mock NextRequest
function createMockRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" });
}

// Helper to create mock params
function createMockParams(tierId: string) {
  return Promise.resolve({ tierId });
}

describe("API: /api/ticket-tiers/[tierId]/availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockClear();
    consoleLogSpy.mockClear();
    consoleWarnSpy.mockClear();
  });

  describe("Response Structure", () => {
    it("should return tier-level availability", async () => {
      const mockTier = {
        id: "test-tier-id",
        name: "Test Tier",
        price_cents: 1000,
        quantity_total: 100,
        quantity_sold: 10,
        per_user_limit: 5,
        sales_start: new Date().toISOString(),
        sales_end: new Date(Date.now() + 86400000).toISOString(),
      };

      const mockStages = [
        {
          stage_id: "stage-1",
          stage_name: "Early Bird",
          stage_price_cents: 800,
          total_quantity: 50,
          sold_quantity: 5,
          held_quantity: 2,
          available_quantity: 43,
          is_current_stage: true,
        },
      ];

      // Mock cleanup - no expired holds
      mockSupabaseAdmin.rpc.mockImplementation(((fnName: string) => {
        if (fnName === "cleanup_expired_holds") {
          return Promise.resolve({
            data: [{ deleted_count: 0, affected_tier_ids: [] }],
            error: null,
          });
        }
        if (fnName === "get_tier_stage_availability") {
          return Promise.resolve({ data: mockStages, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }) as any);

      const mockTable = createMockTable<typeof mockTier>();
      mockTable
        ._getSingleMock()
        .mockResolvedValue({ data: mockTier, error: null });
      mockSupabaseAdmin.from.mockReturnValue(mockTable as any);

      const req = createMockRequest(
        "http://localhost:3000/api/ticket-tiers/test-tier-id/availability",
      );
      const params = createMockParams("test-tier-id");
      const response = await GET(req, { params });
      const data = await response.json();

      expect(data.tier).toBeDefined();
      expect(data.tier.available).toBeGreaterThanOrEqual(0);
      expect(data.tier.held).toBeGreaterThanOrEqual(0);
    });

    it("should return stage-level availability array", async () => {
      const mockTier = {
        id: "test-tier-id",
        name: "Test Tier",
        price_cents: 1000,
        quantity_total: 100,
        quantity_sold: 10,
        per_user_limit: 5,
        sales_start: new Date().toISOString(),
        sales_end: new Date(Date.now() + 86400000).toISOString(),
      };

      const mockStages = [
        {
          stage_id: "stage-1",
          stage_name: "Early Bird",
          available_quantity: 43,
          held_quantity: 2,
          is_current_stage: true,
        },
      ];

      mockSupabaseAdmin.rpc.mockImplementation(((fnName: string) => {
        if (fnName === "cleanup_expired_holds") {
          return Promise.resolve({
            data: [{ deleted_count: 0, affected_tier_ids: [] }],
            error: null,
          });
        }
        if (fnName === "get_tier_stage_availability") {
          return Promise.resolve({ data: mockStages, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }) as any);

      const mockTable = createMockTable<typeof mockTier>();
      mockTable
        ._getSingleMock()
        .mockResolvedValue({ data: mockTier, error: null });
      mockSupabaseAdmin.from.mockReturnValue(mockTable as any);

      const req = createMockRequest(
        "http://localhost:3000/api/ticket-tiers/test-tier-id/availability",
      );
      const params = createMockParams("test-tier-id");
      const response = await GET(req, { params });
      const data = await response.json();

      expect(data.stages).toBeDefined();
      expect(Array.isArray(data.stages)).toBe(true);
      expect(data.stages.length).toBeGreaterThan(0);
    });

    it("should return current stage information", async () => {
      const mockTier = {
        id: "test-tier-id",
        name: "Test Tier",
        price_cents: 1000,
        quantity_total: 100,
        quantity_sold: 10,
        per_user_limit: 5,
        sales_start: new Date().toISOString(),
        sales_end: new Date(Date.now() + 86400000).toISOString(),
      };

      const mockStages = [
        {
          stage_id: "stage-1",
          stage_name: "Early Bird",
          available_quantity: 43,
          held_quantity: 2,
          is_current_stage: true,
        },
      ];

      mockSupabaseAdmin.rpc.mockImplementation(((fnName: string) => {
        if (fnName === "cleanup_expired_holds") {
          return Promise.resolve({
            data: [{ deleted_count: 0, affected_tier_ids: [] }],
            error: null,
          });
        }
        if (fnName === "get_tier_stage_availability") {
          return Promise.resolve({ data: mockStages, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }) as any);

      const mockTable = createMockTable<typeof mockTier>();
      mockTable
        ._getSingleMock()
        .mockResolvedValue({ data: mockTier, error: null });
      mockSupabaseAdmin.from.mockReturnValue(mockTable as any);

      const req = createMockRequest(
        "http://localhost:3000/api/ticket-tiers/test-tier-id/availability",
      );
      const params = createMockParams("test-tier-id");
      const response = await GET(req, { params });
      const data = await response.json();

      expect(data.currentStage).toBeDefined();
      expect(data.currentStage?.stage_id).toBeDefined();
    });

    it("should include timestamp", async () => {
      const mockTier = {
        id: "test-tier-id",
        name: "Test Tier",
        price_cents: 1000,
        quantity_total: 100,
        quantity_sold: 10,
        per_user_limit: 5,
        sales_start: new Date().toISOString(),
        sales_end: new Date(Date.now() + 86400000).toISOString(),
      };

      const mockStages = [
        {
          stage_id: "stage-1",
          stage_name: "Early Bird",
          available_quantity: 43,
          held_quantity: 2,
          is_current_stage: true,
        },
      ];

      mockSupabaseAdmin.rpc.mockImplementation(((fnName: string) => {
        if (fnName === "cleanup_expired_holds") {
          return Promise.resolve({
            data: [{ deleted_count: 0, affected_tier_ids: [] }],
            error: null,
          });
        }
        if (fnName === "get_tier_stage_availability") {
          return Promise.resolve({ data: mockStages, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }) as any);

      const mockTable = createMockTable<typeof mockTier>();
      mockTable
        ._getSingleMock()
        .mockResolvedValue({ data: mockTier, error: null });
      mockSupabaseAdmin.from.mockReturnValue(mockTable as any);

      const req = createMockRequest(
        "http://localhost:3000/api/ticket-tiers/test-tier-id/availability",
      );
      const params = createMockParams("test-tier-id");
      const response = await GET(req, { params });
      const data = await response.json();

      expect(data.timestamp).toBeDefined();
      expect(new Date(data.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe("Availability Consistency", () => {
    it("should ensure tier.available matches sum of stage availabilities", async () => {
      const mockTier = {
        id: "test-tier-id",
        name: "Test Tier",
        price_cents: 1000,
        quantity_total: 100,
        quantity_sold: 10,
        per_user_limit: 5,
        sales_start: new Date().toISOString(),
        sales_end: new Date(Date.now() + 86400000).toISOString(),
      };

      const mockStages = [
        {
          stage_id: "stage-1",
          stage_name: "Early Bird",
          available_quantity: 30,
          held_quantity: 2,
          is_current_stage: true,
        },
        {
          stage_id: "stage-2",
          stage_name: "Regular",
          available_quantity: 20,
          held_quantity: 1,
          is_current_stage: false,
        },
      ];

      mockSupabaseAdmin.rpc.mockImplementation(((fnName: string) => {
        if (fnName === "cleanup_expired_holds") {
          return Promise.resolve({
            data: [{ deleted_count: 0, affected_tier_ids: [] }],
            error: null,
          });
        }
        if (fnName === "get_tier_stage_availability") {
          return Promise.resolve({ data: mockStages, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }) as any);

      const mockTable = createMockTable<typeof mockTier>();
      mockTable
        ._getSingleMock()
        .mockResolvedValue({ data: mockTier, error: null });
      mockSupabaseAdmin.from.mockReturnValue(mockTable as any);

      const req = createMockRequest(
        "http://localhost:3000/api/ticket-tiers/test-tier-id/availability",
      );
      const params = createMockParams("test-tier-id");
      const response = await GET(req, { params });
      const data = await response.json();

      const totalStageAvailable = data.stages.reduce(
        (sum: number, stage: any) => sum + stage.available_quantity,
        0,
      );

      if (data.stages.length > 0) {
        expect(data.tier.available).toBe(totalStageAvailable);
      }
    });

    it("should ensure tier.held matches sum of stage held quantities", async () => {
      const mockTier = {
        id: "test-tier-id",
        name: "Test Tier",
        price_cents: 1000,
        quantity_total: 100,
        quantity_sold: 10,
        per_user_limit: 5,
        sales_start: new Date().toISOString(),
        sales_end: new Date(Date.now() + 86400000).toISOString(),
      };

      const mockStages = [
        {
          stage_id: "stage-1",
          stage_name: "Early Bird",
          available_quantity: 30,
          held_quantity: 2,
          is_current_stage: true,
        },
        {
          stage_id: "stage-2",
          stage_name: "Regular",
          available_quantity: 20,
          held_quantity: 1,
          is_current_stage: false,
        },
      ];

      mockSupabaseAdmin.rpc.mockImplementation(((fnName: string) => {
        if (fnName === "cleanup_expired_holds") {
          return Promise.resolve({
            data: [{ deleted_count: 0, affected_tier_ids: [] }],
            error: null,
          });
        }
        if (fnName === "get_tier_stage_availability") {
          return Promise.resolve({ data: mockStages, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }) as any);

      const mockTable = createMockTable<typeof mockTier>();
      mockTable
        ._getSingleMock()
        .mockResolvedValue({ data: mockTier, error: null });
      mockSupabaseAdmin.from.mockReturnValue(mockTable as any);

      const req = createMockRequest(
        "http://localhost:3000/api/ticket-tiers/test-tier-id/availability",
      );
      const params = createMockParams("test-tier-id");
      const response = await GET(req, { params });
      const data = await response.json();

      const totalStageHeld = data.stages.reduce(
        (sum: number, stage: any) => sum + (stage.held_quantity || 0),
        0,
      );

      if (data.stages.length > 0) {
        expect(data.tier.held).toBe(totalStageHeld);
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle missing tierId gracefully", async () => {
      const req = createMockRequest(
        "http://localhost:3000/api/ticket-tiers//availability",
      );
      const params = createMockParams("");

      const response = await GET(req, { params });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Tier ID is required");
    });

    it("should handle invalid tierId gracefully", async () => {
      const invalidTierId = "non-existent-tier-id";

      // Mock cleanup - no expired holds
      mockSupabaseAdmin.rpc.mockImplementation(((fnName: string) => {
        if (fnName === "cleanup_expired_holds") {
          return Promise.resolve({
            data: [{ deleted_count: 0, affected_tier_ids: [] }],
            error: null,
          });
        }
        if (fnName === "get_tier_stage_availability") {
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }) as any);

      // Mock tier query to return not found
      const mockTable = createMockTable<unknown>();
      mockTable._getSingleMock().mockResolvedValue({
        data: null,
        error: { code: "PGRST116", message: "No rows found" },
      });
      mockSupabaseAdmin.from.mockReturnValue(mockTable as any);

      const req = createMockRequest(
        `http://localhost:3000/api/ticket-tiers/${invalidTierId}/availability`,
      );
      const params = createMockParams(invalidTierId);

      const response = await GET(req, { params });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Tier not found");
    });

    it("should handle database errors gracefully", async () => {
      const tierId = "test-tier-id";
      const dbError = {
        message: "Database connection failed",
        code: "ECONNREFUSED",
      };

      // Mock cleanup to succeed
      mockSupabaseAdmin.rpc.mockImplementation(((fnName: string) => {
        if (fnName === "cleanup_expired_holds") {
          return Promise.resolve({
            data: [{ deleted_count: 0, affected_tier_ids: [] }],
            error: null,
          });
        }
        if (fnName === "get_tier_stage_availability") {
          // Simulate database error
          return Promise.resolve({ data: null, error: dbError });
        }
        return Promise.resolve({ data: null, error: null });
      }) as any);

      const req = createMockRequest(
        `http://localhost:3000/api/ticket-tiers/${tierId}/availability`,
      );
      const params = createMockParams(tierId);

      const response = await GET(req, { params });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to fetch stage availability");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching stage availability:",
        dbError,
      );
    });
  });

  describe("Hold Cleanup", () => {
    it("should cleanup expired holds before returning availability", async () => {
      const tierId = "test-tier-id";

      const mockTier = {
        id: tierId,
        name: "Test Tier",
        price_cents: 1000,
        quantity_total: 100,
        quantity_sold: 10,
        per_user_limit: 5,
        sales_start: new Date().toISOString(),
        sales_end: new Date(Date.now() + 86400000).toISOString(),
      };

      // Mock stages after cleanup (expired hold removed)
      // Before cleanup: 40 available, 2 held
      // After cleanup: 42 available, 0 held (expired hold freed up 2 tickets)
      const mockStagesAfterCleanup = [
        {
          stage_id: "stage-1",
          stage_name: "Early Bird",
          available_quantity: 42, // Expired hold freed up 2 tickets
          held_quantity: 0,
          is_current_stage: true,
        },
      ];

      let cleanupCallCount = 0;
      let availabilityCallCount = 0;

      mockSupabaseAdmin.rpc.mockImplementation(((fnName: string) => {
        if (fnName === "cleanup_expired_holds") {
          cleanupCallCount++;
          // First call: cleanup removes expired hold
          if (cleanupCallCount === 1) {
            return Promise.resolve({
              data: [{ deleted_count: 1, affected_tier_ids: [tierId] }],
              error: null,
            });
          }
          return Promise.resolve({
            data: [{ deleted_count: 0, affected_tier_ids: [] }],
            error: null,
          });
        }
        if (fnName === "get_tier_stage_availability") {
          availabilityCallCount++;
          // After cleanup, availability should reflect the change
          return Promise.resolve({ data: mockStagesAfterCleanup, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }) as any);

      const mockTable = createMockTable<typeof mockTier>();
      mockTable
        ._getSingleMock()
        .mockResolvedValue({ data: mockTier, error: null });
      mockSupabaseAdmin.from.mockReturnValue(mockTable as any);

      const req = createMockRequest(
        `http://localhost:3000/api/ticket-tiers/${tierId}/availability`,
      );
      const params = createMockParams(tierId);

      const response = await GET(req, { params });
      const data = await response.json();

      // Verify cleanup was called
      expect(mockSupabaseAdmin.rpc).toHaveBeenCalledWith(
        "cleanup_expired_holds",
      );

      // Verify availability reflects cleanup (expired hold removed)
      expect(data.tier.available).toBe(42);
      expect(data.tier.held).toBe(0);
      expect(data.stages[0].available_quantity).toBe(42);
      expect(data.stages[0].held_quantity).toBe(0);

      // Verify cleanup was logged
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Cleaned up 1 expired holds"),
      );
    });

    it("should log cleanup errors but continue", async () => {
      const tierId = "test-tier-id";

      const mockTier = {
        id: tierId,
        name: "Test Tier",
        price_cents: 1000,
        quantity_total: 100,
        quantity_sold: 10,
        per_user_limit: 5,
        sales_start: new Date().toISOString(),
        sales_end: new Date(Date.now() + 86400000).toISOString(),
      };

      const mockStages = [
        {
          stage_id: "stage-1",
          stage_name: "Early Bird",
          available_quantity: 40,
          held_quantity: 2,
          is_current_stage: true,
        },
      ];

      const cleanupError = {
        message: "Cleanup function failed",
        code: "FUNCTION_ERROR",
      };

      // Mock cleanup to fail
      mockSupabaseAdmin.rpc.mockImplementation(((fnName: string) => {
        if (fnName === "cleanup_expired_holds") {
          return Promise.resolve({ data: null, error: cleanupError });
        }
        if (fnName === "get_tier_stage_availability") {
          return Promise.resolve({ data: mockStages, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }) as any);

      const mockTable = createMockTable<typeof mockTier>();
      mockTable
        ._getSingleMock()
        .mockResolvedValue({ data: mockTier, error: null });
      mockSupabaseAdmin.from.mockReturnValue(mockTable as any);

      const req = createMockRequest(
        `http://localhost:3000/api/ticket-tiers/${tierId}/availability`,
      );
      const params = createMockParams(tierId);

      const response = await GET(req, { params });
      const data = await response.json();

      // Verify endpoint still returns success despite cleanup error
      expect(response.status).toBe(200);
      expect(data.tier).toBeDefined();
      expect(data.stages).toBeDefined();

      // Verify cleanup error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[AVAILABILITY] Failed to cleanup expired holds:",
        cleanupError,
      );
    });
  });
});
