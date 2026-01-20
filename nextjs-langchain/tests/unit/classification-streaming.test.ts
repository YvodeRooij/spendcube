import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SpendRecord, Classification } from "@/types";

// Mock the models
vi.mock("@/lib/langchain/models", () => ({
  createClassificationModel: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        unspscCode: "43211500",
        unspscTitle: "Personal computers",
        confidence: 85,
        reasoning: "Test classification",
      }),
    }),
  })),
}));

// Mock taxonomy search tool
vi.mock("@/tools", () => ({
  taxonomySearchTool: {
    invoke: vi.fn().mockResolvedValue(
      JSON.stringify({
        results: [
          {
            code: "43211500",
            title: "Personal computers",
            segment: "Information Technology",
            family: "Computer Equipment",
            score: 0.95,
          },
        ],
      })
    ),
  },
}));

// Mock performance tracker
vi.mock("@/lib/performance", () => ({
  taxonomyCache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
  },
  getTaxonomyCacheKey: vi.fn().mockReturnValue("test-key"),
  BATCH_CONFIGS: {
    classification: { batchSize: 5, maxConcurrency: 2 },
  },
  performanceTracker: {
    start: vi.fn(),
    end: vi.fn().mockReturnValue({ duration: 1000 }),
    recordSuccess: vi.fn(),
    recordError: vi.fn(),
    recordCacheHit: vi.fn(),
    recordCacheMiss: vi.fn(),
  },
}));

/**
 * Progress callback interface for classification
 */
interface ClassificationProgressEvent {
  type: "classification_progress";
  completed: number;
  total: number;
  latestRecord: Classification;
}

/**
 * Progress callback type
 */
type OnProgressCallback = (event: ClassificationProgressEvent) => void;

/**
 * Simulates per-record classification with progress callbacks
 * This is the behavior we want to implement in the classification node
 */
async function classifyWithProgress(
  records: SpendRecord[],
  onProgress?: OnProgressCallback
): Promise<Classification[]> {
  const classifications: Classification[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    // Simulate classification (in real impl, this calls the model)
    const classification: Classification = {
      recordId: record.id,
      unspscCode: "43211500",
      unspscTitle: "Personal computers",
      confidence: 85,
      reasoning: "Test classification",
      classifiedAt: new Date().toISOString(),
      classifiedBy: "classification-agent",
    };

    classifications.push(classification);

    // Emit progress callback after each record
    if (onProgress) {
      onProgress({
        type: "classification_progress",
        completed: i + 1,
        total: records.length,
        latestRecord: classification,
      });
    }
  }

  return classifications;
}

describe("Classification Agent Streaming", () => {
  const testRecords: SpendRecord[] = Array.from({ length: 10 }, (_, i) => ({
    id: `rec-${i + 1}`,
    vendor: `Vendor ${i + 1}`,
    description: `Test item ${i + 1}`,
    amount: 1000 * (i + 1),
    date: "2024-01-15",
    department: "IT",
  }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Per-Record Progress", () => {
    it("should yield after each record classification", async () => {
      const progressEvents: number[] = [];

      await classifyWithProgress(testRecords, (event) => {
        progressEvents.push(event.completed);
      });

      // Should see incremental progress, not one big batch
      expect(progressEvents).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it("should include latest classification in progress event", async () => {
      const latestRecords: Classification[] = [];

      await classifyWithProgress(testRecords, (event) => {
        latestRecords.push(event.latestRecord);
      });

      // Each progress event should have the latest classification
      expect(latestRecords).toHaveLength(10);
      expect(latestRecords[0].recordId).toBe("rec-1");
      expect(latestRecords[9].recordId).toBe("rec-10");
    });

    it("should report correct total in all progress events", async () => {
      const totals: number[] = [];

      await classifyWithProgress(testRecords, (event) => {
        totals.push(event.total);
      });

      // All events should report same total
      expect(totals.every((t) => t === 10)).toBe(true);
    });

    it("should have monotonically increasing completed count", async () => {
      const completedCounts: number[] = [];

      await classifyWithProgress(testRecords, (event) => {
        completedCounts.push(event.completed);
      });

      // Should be strictly increasing
      for (let i = 1; i < completedCounts.length; i++) {
        expect(completedCounts[i]).toBeGreaterThan(completedCounts[i - 1]);
      }
    });
  });

  describe("Progress Percentage Calculation", () => {
    it("should calculate correct percentages", async () => {
      const percentages: number[] = [];

      await classifyWithProgress(testRecords, (event) => {
        const percent = Math.round((event.completed / event.total) * 100);
        percentages.push(percent);
      });

      expect(percentages).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    });

    it("should never exceed 100%", async () => {
      const percentages: number[] = [];

      await classifyWithProgress(testRecords, (event) => {
        const percent = Math.round((event.completed / event.total) * 100);
        percentages.push(percent);
      });

      expect(percentages.every((p) => p <= 100)).toBe(true);
    });

    it("should have intermediate values between 0% and 100%", async () => {
      const percentages: number[] = [];

      await classifyWithProgress(testRecords, (event) => {
        const percent = Math.round((event.completed / event.total) * 100);
        percentages.push(percent);
      });

      // Should have values other than 0 and 100
      const intermediateValues = percentages.filter((p) => p > 0 && p < 100);
      expect(intermediateValues.length).toBeGreaterThan(0);
    });
  });

  describe("Empty Records Handling", () => {
    it("should handle empty records array", async () => {
      const progressEvents: ClassificationProgressEvent[] = [];

      const result = await classifyWithProgress([], (event) => {
        progressEvents.push(event);
      });

      expect(result).toHaveLength(0);
      expect(progressEvents).toHaveLength(0);
    });
  });

  describe("Single Record Handling", () => {
    it("should handle single record correctly", async () => {
      const singleRecord: SpendRecord[] = [testRecords[0]];
      const progressEvents: ClassificationProgressEvent[] = [];

      await classifyWithProgress(singleRecord, (event) => {
        progressEvents.push(event);
      });

      expect(progressEvents).toHaveLength(1);
      expect(progressEvents[0].completed).toBe(1);
      expect(progressEvents[0].total).toBe(1);
    });
  });

  describe("Classification Result Quality", () => {
    it("should return valid classification objects", async () => {
      const classifications = await classifyWithProgress(testRecords);

      expect(classifications).toHaveLength(10);

      for (const classification of classifications) {
        expect(classification.recordId).toBeDefined();
        expect(classification.unspscCode).toBeDefined();
        expect(classification.unspscTitle).toBeDefined();
        expect(classification.confidence).toBeGreaterThanOrEqual(0);
        expect(classification.confidence).toBeLessThanOrEqual(100);
        expect(classification.classifiedAt).toBeDefined();
        expect(classification.classifiedBy).toBeDefined();
      }
    });

    it("should preserve record ID association", async () => {
      const classifications = await classifyWithProgress(testRecords);

      const recordIds = testRecords.map((r) => r.id);
      const classificationIds = classifications.map((c) => c.recordId);

      expect(classificationIds).toEqual(recordIds);
    });
  });
});

describe("Classification Progress Callback Contract", () => {
  it("should define the correct progress event interface", () => {
    // This tests the contract that the classification node should follow
    interface ExpectedProgressEvent {
      type: "classification_progress";
      completed: number;
      total: number;
      latestRecord: {
        recordId: string;
        unspscCode: string;
        unspscTitle: string;
        confidence: number;
      };
    }

    const event: ExpectedProgressEvent = {
      type: "classification_progress",
      completed: 5,
      total: 10,
      latestRecord: {
        recordId: "rec-5",
        unspscCode: "43211500",
        unspscTitle: "Personal computers",
        confidence: 85,
      },
    };

    expect(event.type).toBe("classification_progress");
    expect(event.completed).toBeLessThanOrEqual(event.total);
  });
});
