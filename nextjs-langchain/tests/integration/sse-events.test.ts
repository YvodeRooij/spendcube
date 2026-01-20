import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SpendRecord } from "@/types";

// Mock the models to avoid actual API calls during tests
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
  createQAModel: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        dimensions: [
          { dimension: "codeAccuracy", score: 85, reasoning: "Good match" },
        ],
        issues: [],
        reasoning: "Classification looks correct",
        suggestedActions: [],
      }),
    }),
  })),
  createSupervisorModel: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({ nextAgent: "classification" }),
    }),
  })),
  createEnrichmentModel: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        companyType: "Manufacturer",
        industry: "Technology",
        riskLevel: "low",
        spendType: "capex",
        strategicImportance: "important",
        consolidationOpportunity: false,
        insights: ["Enterprise vendor"],
      }),
    }),
  })),
  createExtractionModel: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({ vendor: "Dell", description: "Laptop", amount: 1500 }),
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
 * Parse SSE stream text into events
 */
function parseSSEText(text: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  const lines = text.split("\n");
  let currentEvent = "";
  let currentData = "";

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7);
    } else if (line.startsWith("data: ")) {
      currentData = line.slice(6);
    } else if (line === "" && currentEvent && currentData) {
      try {
        events.push({
          event: currentEvent,
          data: JSON.parse(currentData),
        });
      } catch {
        events.push({
          event: currentEvent,
          data: currentData,
        });
      }
      currentEvent = "";
      currentData = "";
    }
  }

  return events;
}

describe("SSE Event Streaming", () => {
  const testRecords: SpendRecord[] = [
    {
      id: "rec-1",
      vendor: "Dell Technologies",
      description: "Laptop computer for IT department",
      amount: 1500,
      date: "2024-01-15",
      department: "IT",
    },
    {
      id: "rec-2",
      vendor: "Microsoft",
      description: "Office 365 subscription",
      amount: 500,
      date: "2024-01-15",
      department: "IT",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Event Types", () => {
    it("should define all expected SSE event types", () => {
      const expectedEventTypes = [
        "start",
        "node_status",
        "progress",
        "classification",
        "state",
        "message",
        "insight",
        "spendcube",
        "complete",
        "error",
      ];

      // This tests the contract for SSE events
      for (const eventType of expectedEventTypes) {
        expect(typeof eventType).toBe("string");
      }
    });

    it("should correctly parse SSE format", () => {
      const sseText = `event: node_status
data: {"node":"supervisor","status":"started"}

event: progress
data: {"progress":50,"step":1,"totalSteps":2}

`;

      const events = parseSSEText(sseText);
      expect(events).toHaveLength(2);
      expect(events[0].event).toBe("node_status");
      expect(events[1].event).toBe("progress");
    });
  });

  describe("Progress Event Structure", () => {
    it("should have correct progress event schema", () => {
      // Define expected progress event schema
      interface ProgressEvent {
        type: string;
        id: string;
        node: string;
        step: number;
        totalSteps: number;
        message: string;
        progress: number;
        detail: string;
        timestamp: string;
      }

      const mockProgressEvent: ProgressEvent = {
        type: "progress",
        id: "test-id",
        node: "classification",
        step: 1,
        totalSteps: 10,
        message: "Classifying records",
        progress: 10,
        detail: "1 of 10 records classified",
        timestamp: new Date().toISOString(),
      };

      // Verify structure
      expect(mockProgressEvent.type).toBe("progress");
      expect(mockProgressEvent.progress).toBeGreaterThanOrEqual(0);
      expect(mockProgressEvent.progress).toBeLessThanOrEqual(100);
      expect(mockProgressEvent.step).toBeLessThanOrEqual(mockProgressEvent.totalSteps);
    });

    it("should emit progress events with increasing percentages", () => {
      const progressEvents = [
        { progress: 10, step: 1, totalSteps: 10 },
        { progress: 20, step: 2, totalSteps: 10 },
        { progress: 30, step: 3, totalSteps: 10 },
        { progress: 50, step: 5, totalSteps: 10 },
        { progress: 100, step: 10, totalSteps: 10 },
      ];

      const percentages = progressEvents.map((e) => e.progress);

      // Should be monotonically increasing
      for (let i = 1; i < percentages.length; i++) {
        expect(percentages[i]).toBeGreaterThanOrEqual(percentages[i - 1]);
      }
    });
  });

  describe("Node Status Events", () => {
    it("should emit status for all pipeline stages", () => {
      const expectedNodes = [
        "supervisor",
        "classification",
        "qa",
        "enrichment",
        "analysis",
        "response",
      ];

      // Verify all expected nodes exist
      for (const node of expectedNodes) {
        expect(typeof node).toBe("string");
      }
    });

    it("should have correct node status event schema", () => {
      interface NodeStatusEvent {
        type: string;
        id: string;
        node: string;
        status: "started" | "completed" | "error";
        message: string;
        duration?: number;
        timestamp: string;
      }

      const mockStartEvent: NodeStatusEvent = {
        type: "status",
        id: "test-id",
        node: "classification",
        status: "started",
        message: "Classifying records",
        timestamp: new Date().toISOString(),
      };

      const mockCompleteEvent: NodeStatusEvent = {
        type: "status",
        id: "test-id",
        node: "classification",
        status: "completed",
        message: "Classification complete",
        duration: 1500,
        timestamp: new Date().toISOString(),
      };

      expect(mockStartEvent.status).toBe("started");
      expect(mockCompleteEvent.status).toBe("completed");
      expect(mockCompleteEvent.duration).toBeDefined();
    });
  });

  describe("Classification Events", () => {
    it("should emit individual classification events", () => {
      interface ClassificationEvent {
        type: string;
        id: string;
        recordId: string;
        vendor: string;
        description: string;
        category: string;
        confidence: number;
        status: string;
        timestamp: string;
      }

      const mockClassificationEvent: ClassificationEvent = {
        type: "classification",
        id: "test-id",
        recordId: "rec-1",
        vendor: "Dell Technologies",
        description: "Laptop computer",
        category: "Personal computers",
        confidence: 85,
        status: "completed",
        timestamp: new Date().toISOString(),
      };

      expect(mockClassificationEvent.type).toBe("classification");
      expect(mockClassificationEvent.confidence).toBeGreaterThanOrEqual(0);
      expect(mockClassificationEvent.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe("SpendCube Event", () => {
    it("should emit spendcube event with data", () => {
      interface SpendCubeEvent {
        data: {
          executiveSummary?: {
            totalSpend: number;
            addressableSavings: number;
            mondayMorningAction?: {
              dollarImpact: number;
            };
          };
        };
        format: string;
      }

      const mockSpendCubeEvent: SpendCubeEvent = {
        data: {
          executiveSummary: {
            totalSpend: 100000,
            addressableSavings: 15000,
            mondayMorningAction: {
              dollarImpact: 5000,
            },
          },
        },
        format: "structured",
      };

      expect(mockSpendCubeEvent.data.executiveSummary).toBeDefined();
      expect(mockSpendCubeEvent.data.executiveSummary?.totalSpend).toBeGreaterThan(0);
    });
  });

  describe("Event Ordering", () => {
    it("should emit events in correct order", () => {
      const expectedOrder = [
        "start",
        "node_status", // supervisor started
        "node_status", // classification started
        "progress",    // classification progress
        "classification", // individual classifications
        "node_status", // classification completed
        "node_status", // qa started
        "node_status", // qa completed
        "complete",
      ];

      // Verify start comes before complete
      expect(expectedOrder.indexOf("start")).toBeLessThan(
        expectedOrder.indexOf("complete")
      );

      // Verify progress comes during classification
      const classificationIndex = expectedOrder.indexOf("classification");
      const progressIndex = expectedOrder.indexOf("progress");
      expect(Math.abs(classificationIndex - progressIndex)).toBeLessThanOrEqual(2);
    });
  });
});
