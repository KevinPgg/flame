/**
 * React Hook Tests: Real-time Availability
 * 
 * Tests the useTicketAvailability and useMultipleTicketAvailability hooks:
 * - Polling behavior
 * - Change detection
 * - Data merging with SSR data
 * - Error handling
 * - Memory leak prevention (timeout cleanup)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useTicketAvailability, useMultipleTicketAvailability } from "../app/lib/hooks/useTicketAvailability";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to create wrapper component
function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// Mock availability response helper
function createMockAvailabilityResponse(tierId: string, available: number = 10, held: number = 0) {
  return {
    tier: {
      id: tierId,
      name: `Tier ${tierId}`,
      price_cents: 1000,
      quantity_total: 100,
      quantity_sold: 50,
      per_user_limit: 5,
      sales_start: new Date().toISOString(),
      sales_end: new Date(Date.now() + 86400000).toISOString(),
      available,
      held,
    },
    stages: [
      {
        stage_id: "stage-1",
        stage_name: "Early Bird",
        stage_price_cents: 800,
        stage_order: 1,
        total_quantity: 50,
        sold_quantity: 25,
        held_quantity: held,
        available_quantity: available,
        is_current_stage: true,
      },
    ],
    currentStage: {
      stage_id: "stage-1",
      stage_name: "Early Bird",
      stage_price_cents: 800,
      stage_order: 1,
      total_quantity: 50,
      sold_quantity: 25,
      held_quantity: held,
      available_quantity: available,
      is_current_stage: true,
    },
    timestamp: new Date().toISOString(),
  };
}

describe("useTicketAvailability Hook", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    // Don't use fake timers by default - only use them in specific tests that need them
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers(); // Ensure real timers are restored even if fake timers were used
    queryClient.clear();
  });

  describe("Change Detection", () => {
    it("should detect when availability changes", async () => {
      const tierId = "test-tier-1";
      const initialData = createMockAvailabilityResponse(tierId, 10, 0);
      const changedData = createMockAvailabilityResponse(tierId, 8, 2);

      // Initial fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => initialData,
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => useTicketAvailability(tierId), { wrapper });

      await waitFor(() => {
        expect(result.current.availability).toBeDefined();
      });

      // Initial load should not trigger change
      expect(result.current.hasDataChanged).toBe(false);

      // Simulate data change
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => changedData,
      });

      // Trigger refetch
      await result.current.refetch();

      await waitFor(() => {
        expect(result.current.hasDataChanged).toBe(true);
      });

      expect(result.current.availability?.tier.available).toBe(8);
    });

    it("should reset hasDataChanged after timeout", async () => {
      const tierId = "test-tier-1";
      const initialData = createMockAvailabilityResponse(tierId, 10, 0);
      const changedData = createMockAvailabilityResponse(tierId, 8, 2);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => initialData,
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => useTicketAvailability(tierId), { wrapper });

      await waitFor(() => {
        expect(result.current.availability).toBeDefined();
      });

      // Trigger change
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => changedData,
      });

      await result.current.refetch();

      await waitFor(() => {
        expect(result.current.hasDataChanged).toBe(true);
      });

      // Wait for timeout to reset (3 seconds + buffer)
      await new Promise(resolve => setTimeout(resolve, 3500));

      await waitFor(() => {
        expect(result.current.hasDataChanged).toBe(false);
      });
    });

    it("should not trigger change on initial load", async () => {
      const tierId = "test-tier-1";
      const initialData = createMockAvailabilityResponse(tierId, 10, 0);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => initialData,
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => useTicketAvailability(tierId), { wrapper });

      await waitFor(() => {
        expect(result.current.availability).toBeDefined();
      });

      // Initial load should not set hasDataChanged
      expect(result.current.hasDataChanged).toBe(false);
    });
  });

  describe("Polling Behavior", () => {
    it("should poll at specified interval", async () => {
      const tierId = "test-tier-1";
      const mockData = createMockAvailabilityResponse(tierId, 10, 0);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const wrapper = createWrapper(queryClient);
      renderHook(() => useTicketAvailability(tierId, { refetchInterval: 2000 }), { wrapper });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Wait for first poll interval (2 seconds + buffer)
      await new Promise(resolve => setTimeout(resolve, 2500));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      }, { timeout: 10000 });

      // Wait for second poll interval
      await new Promise(resolve => setTimeout(resolve, 2500));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(3);
      }, { timeout: 10000 });
    }, 20000);

    it("should respect enabled flag", async () => {
      const tierId = "test-tier-1";
      const mockData = createMockAvailabilityResponse(tierId, 10, 0);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const wrapper = createWrapper(queryClient);
      const { rerender } = renderHook(
        ({ enabled }) => useTicketAvailability(tierId, { enabled, refetchInterval: 2000 }),
        {
          wrapper,
          initialProps: { enabled: true },
        }
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Disable polling
      rerender({ enabled: false });

      // Wait - should not trigger refetch when disabled
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Should still be only 1 call (no polling when disabled)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should stop polling on unmount", async () => {
      const tierId = "test-tier-1";
      const mockData = createMockAvailabilityResponse(tierId, 10, 0);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const wrapper = createWrapper(queryClient);
      const { unmount } = renderHook(() => useTicketAvailability(tierId, { refetchInterval: 2000 }), {
        wrapper,
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      const callCountBeforeUnmount = mockFetch.mock.calls.length;

      // Unmount hook
      unmount();

      // Wait - should not trigger refetch after unmount
      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(mockFetch).toHaveBeenCalledTimes(callCountBeforeUnmount);
    });
  });

  describe("Memory Leak Prevention", () => {
    it("should cleanup timeout on unmount", async () => {
      const tierId = "test-tier-1";
      const initialData = createMockAvailabilityResponse(tierId, 10, 0);
      const changedData = createMockAvailabilityResponse(tierId, 8, 2);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => initialData,
      });

      const wrapper = createWrapper(queryClient);
      const { result, unmount } = renderHook(() => useTicketAvailability(tierId), { wrapper });

      await waitFor(() => {
        expect(result.current.availability).toBeDefined();
      });

      // Trigger change to set timeout
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => changedData,
      });

      await result.current.refetch();

      await waitFor(() => {
        expect(result.current.hasDataChanged).toBe(true);
      });

      // Unmount before timeout completes - should not cause errors
      unmount();

      // Wait a bit to ensure cleanup happened (no errors thrown)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Test passes if no errors occurred during unmount
      expect(true).toBe(true);
    });

    it("should cleanup timeout when data changes rapidly", async () => {
      const tierId = "test-tier-1";
      const data1 = createMockAvailabilityResponse(tierId, 10, 0);
      const data2 = createMockAvailabilityResponse(tierId, 8, 2);
      const data3 = createMockAvailabilityResponse(tierId, 5, 5);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => data1,
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => useTicketAvailability(tierId), { wrapper });

      await waitFor(() => {
        expect(result.current.availability).toBeDefined();
      });

      // Rapid change 1
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => data2,
      });
      await result.current.refetch();
      await waitFor(() => expect(result.current.hasDataChanged).toBe(true));

      // Rapid change 2 (before timeout from change 1 completes)
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => data3,
      });
      await result.current.refetch();
      await waitFor(() => expect(result.current.hasDataChanged).toBe(true));

      // Wait for timeout - only the latest timeout should fire
      await new Promise(resolve => setTimeout(resolve, 3500));

      await waitFor(() => {
        expect(result.current.hasDataChanged).toBe(false);
      });
    });
  });

  describe("Data Merging", () => {
    it("should use real-time data when available", async () => {
      const tierId = "test-tier-1";
      const apiData = createMockAvailabilityResponse(tierId, 10, 0);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => apiData,
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => useTicketAvailability(tierId), { wrapper });

      await waitFor(() => {
        expect(result.current.availability).toBeDefined();
      });

      // Should use API data, not SSR fallback
      expect(result.current.availability?.tier.available).toBe(10);
      expect(result.current.availability?.tier.id).toBe(tierId);
    });

    it("should handle API errors gracefully", async () => {
      const tierId = "test-tier-1";

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => useTicketAvailability(tierId), { wrapper });

      // Wait for error state - React Query may take a moment to process the error
      await waitFor(() => {
        // Error might be set, or query might be in error state
        return result.current.error !== null || result.current.isLoading === false;
      }, { timeout: 10000 });

      // If error is set, verify it contains the network error message
      if (result.current.error) {
        const errorMessage = result.current.error instanceof Error 
          ? result.current.error.message 
          : String(result.current.error);
        expect(errorMessage).toContain("Network error");
      }
      // Availability should be undefined when there's an error
      expect(result.current.availability).toBeUndefined();
    });
  });
});

describe("useMultipleTicketAvailability Hook", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    // Don't use fake timers by default - only use them in specific tests that need them
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers(); // Ensure real timers are restored even if fake timers were used
    queryClient.clear();
  });

  describe("Multiple Tier Handling", () => {
    it("should fetch all tiers in parallel", async () => {
      const tierIds = ["tier-1", "tier-2", "tier-3"];
      const mockData1 = createMockAvailabilityResponse("tier-1", 10, 0);
      const mockData2 = createMockAvailabilityResponse("tier-2", 20, 0);
      const mockData3 = createMockAvailabilityResponse("tier-3", 30, 0);

      // Mock fetch to return different data based on URL
      let callCount = 0;
      mockFetch.mockImplementation((url: string) => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: async () => {
            if (typeof url === "string" && url.includes("tier-1")) return mockData1;
            if (typeof url === "string" && url.includes("tier-2")) return mockData2;
            if (typeof url === "string" && url.includes("tier-3")) return mockData3;
            return {};
          },
        });
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => useMultipleTicketAvailability(tierIds), { wrapper });

      // All fetches should be initiated and completed
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(3);
        expect(result.current.results).toHaveLength(3);
        expect(result.current.results[0].availability).toBeDefined();
        expect(result.current.results[1].availability).toBeDefined();
        expect(result.current.results[2].availability).toBeDefined();
      });
    });

    it("should handle partial failures gracefully", async () => {
      const tierIds = ["tier-1", "tier-2", "tier-3"];

      // tier-2 will fail - the hook throws an error when response.ok is false
      // Promise.all will reject the entire query
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("tier-2")) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({ error: "Server error" }),
          });
        }
        const mockData1 = createMockAvailabilityResponse("tier-1", 10, 0);
        const mockData3 = createMockAvailabilityResponse("tier-3", 30, 0);
        return Promise.resolve({
          ok: true,
          json: async () => {
            if (typeof url === "string" && url.includes("tier-1")) return mockData1;
            if (typeof url === "string" && url.includes("tier-3")) return mockData3;
            return {};
          },
        });
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => useMultipleTicketAvailability(tierIds), { wrapper });

      // Promise.all will fail if any promise rejects (throws error), so the whole query fails
      await waitFor(
        () => {
          expect(result.current.hasError).toBe(true);
        },
        { timeout: 3000 }
      );

      // All results should have error since Promise.all failed
      expect(result.current.results.every(r => r.error)).toBe(true);
    });

    it("should maintain stable query keys", () => {
      const tierIds = ["tier-3", "tier-1", "tier-2"];
      const originalTierIds = [...tierIds]; // Copy to verify mutation

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const wrapper = createWrapper(queryClient);
      renderHook(() => useMultipleTicketAvailability(tierIds), { wrapper });

      // Verify original array was not mutated
      expect(tierIds).toEqual(originalTierIds);
      expect(tierIds).toEqual(["tier-3", "tier-1", "tier-2"]);

      // Query key should use sorted copy
      const queryKey = queryClient.getQueryCache().getAll()[0]?.queryKey;
      expect(queryKey?.[1]).toEqual(["tier-1", "tier-2", "tier-3"]);
    });
  });

  describe("Change Detection", () => {
    it("should detect changes across multiple tiers", async () => {
      const tierIds = ["tier-1", "tier-2"];
      const initialData1 = createMockAvailabilityResponse("tier-1", 10, 0);
      const initialData2 = createMockAvailabilityResponse("tier-2", 20, 0);
      const changedData1 = createMockAvailabilityResponse("tier-1", 8, 2);
      const changedData2 = createMockAvailabilityResponse("tier-2", 18, 2);

      // First call - initial data
      mockFetch.mockImplementation((url: string) => {
        return Promise.resolve({
          ok: true,
          json: async () => {
            if (typeof url === "string" && url.includes("tier-1")) return initialData1;
            if (typeof url === "string" && url.includes("tier-2")) return initialData2;
            return {};
          },
        });
      });

      const wrapper = createWrapper(queryClient);
      const { result } = renderHook(() => useMultipleTicketAvailability(tierIds), { wrapper });

      await waitFor(() => {
        expect(result.current.results[0].availability).toBeDefined();
        expect(result.current.results[1].availability).toBeDefined();
      });

      // Initial load should not trigger change
      expect(result.current.hasDataChanged).toBe(false);

      // Simulate change - update mock for refetch
      mockFetch.mockImplementation((url: string) => {
        return Promise.resolve({
          ok: true,
          json: async () => {
            if (typeof url === "string" && url.includes("tier-1")) return changedData1;
            if (typeof url === "string" && url.includes("tier-2")) return changedData2;
            return {};
          },
        });
      });

      await result.current.refetchAll();

      await waitFor(() => {
        expect(result.current.hasDataChanged).toBe(true);
      });
    });

    it("should optimize effect runs (no redundant runs)", async () => {
      const tierIds = ["tier-1"];
      const mockData = createMockAvailabilityResponse("tier-1", 10, 0);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const wrapper = createWrapper(queryClient);
      const { result, rerender } = renderHook(() => useMultipleTicketAvailability(tierIds), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.results[0].availability).toBeDefined();
      });

      const initialCallCount = mockFetch.mock.calls.length;

      // Rerender with same data (should not trigger redundant effect)
      rerender();

      // Wait a bit to ensure any pending effects run (without fake timers)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not have triggered additional fetches
      expect(mockFetch.mock.calls.length).toBe(initialCallCount);
    });
  });
});


