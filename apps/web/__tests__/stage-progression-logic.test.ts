/**
 * Stage Progression Logic Tests
 * 
 * Tests the exact logic for when stages become available:
 * - First stage is always current if it has availability
 * - Next stage becomes current only when ALL previous stages are completely full
 * - Stages must be full (sold + held >= total) before next opens
 * - Handles edge cases: partial fills, data drift, concurrent updates
 */

import { describe, it, expect } from "vitest";

/**
 * Test helper: Simulates get_tier_stage_availability logic
 * This mirrors the database function logic for testing
 */
function simulateStageAvailability(
  stages: Array<{
    id: string;
    name: string;
    quantity: number;
    order_index: number;
  }>,
  tierSold: number,
  holds: Array<{ stage_id: string; quantity: number }>
) {
  return stages.map((stage, index) => {
    // Calculate cumulative sold before this stage
    const cumulativeBefore = stages
      .filter((s, i) => i < index)
      .reduce((sum, s) => sum + s.quantity, 0);

    // Calculate sold in this stage
    const soldInStage = Math.max(
      0,
      Math.min(stage.quantity, tierSold - cumulativeBefore)
    );

    // Get held quantity for this stage
    const heldInStage =
      holds
        .filter((h) => h.stage_id === stage.id)
        .reduce((sum, h) => sum + h.quantity, 0) || 0;

    // Available quantity (clamped to zero)
    const availableInStage = Math.max(
      0,
      stage.quantity - soldInStage - heldInStage
    );

    // Is current stage?
    // 1. Must have availability
    // 2. Must be first stage OR all previous stages are full
    const isCurrent =
      availableInStage > 0 &&
      (index === 0 ||
        stages
          .slice(0, index)
          .every((prevStage, prevIndex) => {
            const prevCumulative = stages
              .filter((s, i) => i < prevIndex)
              .reduce((sum, s) => sum + s.quantity, 0);
            const prevSold = Math.max(
              0,
              Math.min(prevStage.quantity, tierSold - prevCumulative)
            );
            const prevHeld =
              holds
                .filter((h) => h.stage_id === prevStage.id)
                .reduce((sum, h) => sum + h.quantity, 0) || 0;
            return prevSold + prevHeld >= prevStage.quantity;
          }));

    return {
      ...stage,
      sold_quantity: soldInStage,
      held_quantity: heldInStage,
      available_quantity: availableInStage,
      is_current_stage: isCurrent,
    };
  });
}

describe("Stage Progression Logic", () => {
  const testStages = [
    { id: "stage-1", name: "Early Bird", quantity: 5, order_index: 0 },
    { id: "stage-2", name: "Regular", quantity: 10, order_index: 1 },
    { id: "stage-3", name: "Last Chance", quantity: 5, order_index: 2 },
  ];

  describe("Basic Progression", () => {
    it("should mark first stage as current when no tickets sold", () => {
      const result = simulateStageAvailability(testStages, 0, []);

      expect(result[0].is_current_stage).toBe(true);
      expect(result[1].is_current_stage).toBe(false);
      expect(result[2].is_current_stage).toBe(false);
      expect(result[0].available_quantity).toBe(5);
    });

    it("should keep first stage current when partially filled", () => {
      const result = simulateStageAvailability(testStages, 3, []);

      expect(result[0].is_current_stage).toBe(true);
      expect(result[1].is_current_stage).toBe(false);
      expect(result[0].sold_quantity).toBe(3);
      expect(result[0].available_quantity).toBe(2);
    });

    it("should transition to second stage when first is completely full", () => {
      const result = simulateStageAvailability(testStages, 5, []);

      expect(result[0].is_current_stage).toBe(false);
      expect(result[1].is_current_stage).toBe(true);
      expect(result[0].available_quantity).toBe(0);
      expect(result[1].available_quantity).toBe(10);
    });

    it("should transition to third stage when first two are full", () => {
      const result = simulateStageAvailability(testStages, 15, []);

      expect(result[0].is_current_stage).toBe(false);
      expect(result[1].is_current_stage).toBe(false);
      expect(result[2].is_current_stage).toBe(true);
      expect(result[2].available_quantity).toBe(5);
    });
  });

  describe("Hold-Based Progression", () => {
    it("should account for holds when determining if stage is full", () => {
      const holds = [{ stage_id: "stage-1", quantity: 3 }];
      const result = simulateStageAvailability(testStages, 2, holds);

      // Stage 1: 2 sold + 3 held = 5 total (full)
      expect(result[0].held_quantity).toBe(3);
      expect(result[0].sold_quantity).toBe(2);
      expect(result[0].available_quantity).toBe(0);
      expect(result[0].is_current_stage).toBe(false);
      expect(result[1].is_current_stage).toBe(true); // Next stage opens
    });

    it("should not open next stage if previous stage has holds but isn't full", () => {
      const holds = [{ stage_id: "stage-1", quantity: 2 }];
      const result = simulateStageAvailability(testStages, 2, holds);

      // Stage 1: 2 sold + 2 held = 4 total (not full, 1 remaining)
      expect(result[0].available_quantity).toBe(1);
      expect(result[0].is_current_stage).toBe(true); // Still current
      expect(result[1].is_current_stage).toBe(false); // Next stage not open
    });

    it("should open next stage when holds expire and previous stage becomes full", () => {
      // Initially: 3 sold + 2 held = 5 (full)
      const initialHolds = [{ stage_id: "stage-1", quantity: 2 }];
      const initialResult = simulateStageAvailability(testStages, 3, initialHolds);

      expect(initialResult[0].is_current_stage).toBe(false);
      expect(initialResult[1].is_current_stage).toBe(true);

      // After hold expires: 3 sold + 0 held = 3 (not full)
      const afterExpiry = simulateStageAvailability(testStages, 3, []);

      expect(afterExpiry[0].is_current_stage).toBe(true); // Back to first stage
      expect(afterExpiry[1].is_current_stage).toBe(false);
    });
  });

  describe("Negative Availability Clamping", () => {
    it("should clamp to zero when sold + held exceeds quantity", () => {
      const holds = [{ stage_id: "stage-1", quantity: 10 }]; // More than stage capacity
      const result = simulateStageAvailability(testStages, 5, holds);

      expect(result[0].available_quantity).toBeGreaterThanOrEqual(0);
      expect(result[0].available_quantity).toBe(0); // Clamped: 5 - 5 - 10 = -10 → 0
    });

    it("should handle data drift gracefully", () => {
      // Simulate sold_quantity > stage.quantity (data drift)
      const result = simulateStageAvailability(testStages, 10, []); // More than stage 1 capacity

      expect(result[0].available_quantity).toBeGreaterThanOrEqual(0);
      expect(result[0].sold_quantity).toBeLessThanOrEqual(result[0].quantity);
    });
  });

  describe("Edge Cases", () => {
    it("should handle single stage correctly", () => {
      const singleStage = [
        { id: "stage-1", name: "Only Stage", quantity: 10, order_index: 0 },
      ];
      const result = simulateStageAvailability(singleStage, 3, []);

      expect(result[0].is_current_stage).toBe(true);
      expect(result[0].available_quantity).toBe(7);
    });

    it("should handle all stages sold out", () => {
      const result = simulateStageAvailability(testStages, 20, []); // All sold

      expect(result.every((s) => s.is_current_stage === false)).toBe(true);
      expect(result.every((s) => s.available_quantity === 0)).toBe(true);
    });

    it("should handle stages with zero quantity gracefully", () => {
      const stagesWithZero = [
        { id: "stage-1", name: "Stage 1", quantity: 0, order_index: 0 },
        { id: "stage-2", name: "Stage 2", quantity: 10, order_index: 1 },
      ];

      const result = simulateStageAvailability(stagesWithZero, 0, []);

      expect(result[0].is_current_stage).toBe(false); // No availability
      expect(result[1].is_current_stage).toBe(true); // Next stage opens
    });
  });

  describe("Concurrent Update Scenarios", () => {
    it("should handle rapid hold creation and expiration", () => {
      // Scenario: Multiple users create holds simultaneously
      const holds = [
        { stage_id: "stage-1", quantity: 2 },
        { stage_id: "stage-1", quantity: 2 }, // Another user
      ];

      const result = simulateStageAvailability(testStages, 1, holds);

      // Total held: 4, sold: 1, available: 0 (clamped)
      expect(result[0].held_quantity).toBe(4);
      expect(result[0].available_quantity).toBe(0);
      expect(result[0].is_current_stage).toBe(false);
    });

    it("should maintain consistency during stage transition", () => {
      // Exactly at boundary: 5 sold (stage 1 full)
      const result = simulateStageAvailability(testStages, 5, []);

      expect(result[0].is_current_stage).toBe(false);
      expect(result[1].is_current_stage).toBe(true);
      expect(result[0].available_quantity).toBe(0);
      expect(result[1].available_quantity).toBe(10);
    });
  });
});


