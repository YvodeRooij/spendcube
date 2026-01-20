import { describe, it, expect } from "vitest";
import {
  calculateClassificationMetrics,
  calculateQAMetrics,
  calculateHITLMetrics,
  evaluatePipeline,
} from "@/lib/evaluation";
import type { SpendCubeStateType } from "@/types";

// Helper to create a mock state
function createMockState(overrides: Partial<SpendCubeStateType> = {}): SpendCubeStateType {
  return {
    messages: [],
    userQuery: "",
    sessionId: "test-session",
    stage: "idle",
    inputRecords: [],
    classifications: [],
    qaResults: [],
    hitlQueue: [],
    hitlDecisions: [],
    errors: [],
    ...overrides,
  } as SpendCubeStateType;
}

describe("Classification Metrics", () => {
  it("should handle empty state", () => {
    const state = createMockState();
    const metrics = calculateClassificationMetrics(state);

    expect(metrics.totalRecords).toBe(0);
    expect(metrics.classifiedRecords).toBe(0);
    expect(metrics.classificationRate).toBe(0);
    expect(metrics.averageConfidence).toBe(0);
  });

  it("should calculate metrics correctly", () => {
    const state = createMockState({
      inputRecords: [
        { id: "1", vendor: "Dell", description: "Laptop", amount: 1500, date: "2024-01-01" },
        { id: "2", vendor: "Microsoft", description: "Software", amount: 500, date: "2024-01-01" },
      ],
      classifications: [
        {
          recordId: "1",
          unspscCode: "43211500",
          unspscTitle: "Personal computers",
          confidence: 90,
          reasoning: "Good match",
          classifiedAt: "2024-01-01",
          classifiedBy: "classification-agent",
        },
        {
          recordId: "2",
          unspscCode: "43231500",
          unspscTitle: "Software",
          confidence: 85,
          reasoning: "Good match",
          classifiedAt: "2024-01-01",
          classifiedBy: "classification-agent",
        },
      ],
    });

    const metrics = calculateClassificationMetrics(state);

    expect(metrics.totalRecords).toBe(2);
    expect(metrics.classifiedRecords).toBe(2);
    expect(metrics.classificationRate).toBe(100);
    expect(metrics.averageConfidence).toBe(87.5);
    expect(metrics.confidenceDistribution.high).toBe(1); // 90%
    expect(metrics.confidenceDistribution.medium).toBe(1); // 85%
  });

  it("should track by agent", () => {
    const state = createMockState({
      inputRecords: [
        { id: "1", vendor: "Dell", description: "Laptop", amount: 1500, date: "2024-01-01" },
        { id: "2", vendor: "Microsoft", description: "Software", amount: 500, date: "2024-01-01" },
      ],
      classifications: [
        {
          recordId: "1",
          unspscCode: "43211500",
          unspscTitle: "Personal computers",
          confidence: 90,
          reasoning: "Test",
          classifiedAt: "2024-01-01",
          classifiedBy: "agent-a",
        },
        {
          recordId: "2",
          unspscCode: "43231500",
          unspscTitle: "Software",
          confidence: 80,
          reasoning: "Test",
          classifiedAt: "2024-01-01",
          classifiedBy: "agent-b",
        },
      ],
    });

    const metrics = calculateClassificationMetrics(state);

    expect(Object.keys(metrics.byAgent)).toHaveLength(2);
    expect(metrics.byAgent["agent-a"].count).toBe(1);
    expect(metrics.byAgent["agent-b"].count).toBe(1);
  });
});

describe("QA Metrics", () => {
  it("should handle empty QA results", () => {
    const state = createMockState();
    const metrics = calculateQAMetrics(state);

    expect(metrics.totalEvaluated).toBe(0);
    expect(metrics.approvalRate).toBe(0);
  });

  it("should calculate QA metrics correctly", () => {
    const state = createMockState({
      qaResults: [
        {
          recordId: "1",
          verdict: "approved",
          qualityScore: 85,
          reasoning: "Good",
          evaluatedAt: "2024-01-01",
          evaluatedBy: "qa-agent",
        },
        {
          recordId: "2",
          verdict: "flagged",
          qualityScore: 60,
          reasoning: "Needs review",
          issues: [{ type: "confidence_low", severity: "medium", message: "Low confidence" }],
          evaluatedAt: "2024-01-01",
          evaluatedBy: "qa-agent",
        },
        {
          recordId: "3",
          verdict: "rejected",
          qualityScore: 30,
          reasoning: "Incorrect",
          issues: [{ type: "code_mismatch", severity: "high", message: "Wrong code" }],
          evaluatedAt: "2024-01-01",
          evaluatedBy: "qa-agent",
        },
      ],
      hitlQueue: [
        {
          id: "hitl-1",
          recordId: "2",
          reason: "low_confidence",
          priority: "medium",
          status: "pending",
          createdAt: "2024-01-01",
          context: { vendor: "Dell", description: "Laptop", amount: 1500 },
        },
      ],
    });

    const metrics = calculateQAMetrics(state);

    expect(metrics.totalEvaluated).toBe(3);
    expect(metrics.approvedCount).toBe(1);
    expect(metrics.flaggedCount).toBe(1);
    expect(metrics.rejectedCount).toBe(1);
    expect(metrics.approvalRate).toBeCloseTo(33.33, 1);
    expect(metrics.issuesByType["confidence_low"]).toBe(1);
    expect(metrics.issuesByType["code_mismatch"]).toBe(1);
  });
});

describe("HITL Metrics", () => {
  it("should handle empty HITL queue", () => {
    const state = createMockState();
    const metrics = calculateHITLMetrics(state);

    expect(metrics.totalItems).toBe(0);
    expect(metrics.resolutionRate).toBe(0);
  });

  it("should calculate HITL metrics correctly", () => {
    const state = createMockState({
      hitlQueue: [
        {
          id: "hitl-1",
          recordId: "1",
          reason: "low_confidence",
          priority: "medium",
          status: "pending",
          createdAt: "2024-01-01",
          context: { vendor: "Dell", description: "Laptop", amount: 1500 },
        },
        {
          id: "hitl-2",
          recordId: "2",
          reason: "qa_rejected",
          priority: "high",
          status: "pending",
          createdAt: "2024-01-01",
          context: { vendor: "Microsoft", description: "Software", amount: 500 },
        },
      ],
      hitlDecisions: [
        {
          itemId: "hitl-1",
          recordId: "1",
          action: "approve",
          decidedBy: "user",
          decidedAt: "2024-01-02",
        },
      ],
    });

    const metrics = calculateHITLMetrics(state);

    expect(metrics.totalItems).toBe(2);
    expect(metrics.resolvedItems).toBe(1);
    expect(metrics.pendingItems).toBe(1);
    expect(metrics.resolutionRate).toBe(50);
    expect(metrics.correctionRate).toBe(0); // approve is not a correction
  });

  it("should calculate correction rate", () => {
    const state = createMockState({
      hitlQueue: [
        {
          id: "hitl-1",
          recordId: "1",
          reason: "low_confidence",
          priority: "medium",
          status: "pending",
          createdAt: "2024-01-01",
          context: { vendor: "Dell", description: "Laptop", amount: 1500 },
        },
        {
          id: "hitl-2",
          recordId: "2",
          reason: "qa_rejected",
          priority: "high",
          status: "pending",
          createdAt: "2024-01-01",
          context: { vendor: "Microsoft", description: "Software", amount: 500 },
        },
      ],
      hitlDecisions: [
        {
          itemId: "hitl-1",
          recordId: "1",
          action: "modify",
          selectedCode: "43211500",
          decidedBy: "user",
          decidedAt: "2024-01-02",
        },
        {
          itemId: "hitl-2",
          recordId: "2",
          action: "approve",
          decidedBy: "user",
          decidedAt: "2024-01-02",
        },
      ],
    });

    const metrics = calculateHITLMetrics(state);

    expect(metrics.correctionRate).toBe(50); // 1 modify out of 2 decisions
  });
});

describe("Pipeline Evaluation", () => {
  it("should evaluate pipeline and return grade", () => {
    const state = createMockState({
      inputRecords: [
        { id: "1", vendor: "Dell", description: "Laptop", amount: 1500, date: "2024-01-01" },
      ],
      classifications: [
        {
          recordId: "1",
          unspscCode: "43211500",
          unspscTitle: "Personal computers",
          confidence: 90,
          reasoning: "Good",
          classifiedAt: "2024-01-01",
          classifiedBy: "agent",
        },
      ],
      qaResults: [
        {
          recordId: "1",
          verdict: "approved",
          qualityScore: 90,
          reasoning: "Good",
          evaluatedAt: "2024-01-01",
          evaluatedBy: "qa-agent",
        },
      ],
    });

    const result = evaluatePipeline(state);

    expect(result.score).toBeGreaterThan(0);
    expect(["A", "B", "C", "D", "F"]).toContain(result.grade);
    expect(result.metrics).toBeDefined();
    expect(result.recommendations).toBeDefined();
  });

  it("should identify issues in poor performing pipeline", () => {
    const state = createMockState({
      inputRecords: [
        { id: "1", vendor: "Dell", description: "Laptop", amount: 1500, date: "2024-01-01" },
        { id: "2", vendor: "HP", description: "Monitor", amount: 500, date: "2024-01-01" },
      ],
      classifications: [
        {
          recordId: "1",
          unspscCode: "43211500",
          unspscTitle: "Personal computers",
          confidence: 40, // Low confidence
          reasoning: "Uncertain",
          classifiedAt: "2024-01-01",
          classifiedBy: "agent",
        },
      ], // Only 1 of 2 classified
      qaResults: [
        {
          recordId: "1",
          verdict: "rejected",
          qualityScore: 30,
          reasoning: "Bad classification",
          evaluatedAt: "2024-01-01",
          evaluatedBy: "qa-agent",
        },
      ],
    });

    const result = evaluatePipeline(state);

    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.grade).not.toBe("A");
  });
});
