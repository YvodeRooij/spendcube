import { describe, it, expect, beforeEach } from "vitest";
import {
  logCorrection,
  getCorrections,
  getCorrectionsByAction,
  getCorrectionStats,
  exportTrainingData,
  exportAsJSONL,
  clearCorrections,
} from "@/lib/training/corrections";
import type { HITLDecision, Classification, SpendRecord } from "@/types";

describe("Corrections Module", () => {
  beforeEach(() => {
    clearCorrections();
  });

  const mockRecord: SpendRecord = {
    id: "rec-1",
    vendor: "Dell Technologies",
    description: "Laptop computer",
    amount: 1500,
    date: "2024-01-15",
  };

  const mockClassification: Classification = {
    recordId: "rec-1",
    unspscCode: "43211500",
    unspscTitle: "Personal computers",
    confidence: 75,
    reasoning: "Matched laptop keywords",
    classifiedAt: "2024-01-15T10:00:00Z",
    classifiedBy: "classification-agent",
  };

  describe("logCorrection", () => {
    it("should log a correction", () => {
      const decision: HITLDecision = {
        itemId: "hitl-1",
        recordId: "rec-1",
        action: "modify",
        selectedCode: "43211501",
        selectedTitle: "Notebook computers",
        notes: "More specific code",
        decidedBy: "reviewer",
        decidedAt: "2024-01-16T10:00:00Z",
      };

      const correction = logCorrection(decision, mockClassification, mockRecord, {
        qaVerdict: "flagged",
        qaScore: 65,
        hitlReason: "low_confidence",
        sessionId: "session-1",
        threadId: "thread-1",
      });

      expect(correction.id).toBeDefined();
      expect(correction.original.unspscCode).toBe("43211500");
      expect(correction.correction.action).toBe("modify");
      expect(correction.correction.newCode).toBe("43211501");
      expect(correction.context.hitlReason).toBe("low_confidence");
    });

    it("should add correction to store", () => {
      const decision: HITLDecision = {
        itemId: "hitl-1",
        recordId: "rec-1",
        action: "approve",
        decidedBy: "reviewer",
        decidedAt: "2024-01-16T10:00:00Z",
      };

      logCorrection(decision, mockClassification, mockRecord, {
        hitlReason: "qa_flagged",
        sessionId: "session-1",
        threadId: "thread-1",
      });

      const corrections = getCorrections();
      expect(corrections).toHaveLength(1);
    });
  });

  describe("getCorrectionsByAction", () => {
    it("should filter corrections by action", () => {
      // Add multiple corrections
      const actions: Array<"approve" | "modify" | "reject"> = ["approve", "modify", "reject"];

      for (const action of actions) {
        const decision: HITLDecision = {
          itemId: `hitl-${action}`,
          recordId: `rec-${action}`,
          action,
          selectedCode: action === "modify" ? "43211501" : undefined,
          notes: action === "reject" ? "Incorrect" : undefined,
          decidedBy: "reviewer",
          decidedAt: "2024-01-16T10:00:00Z",
        };

        logCorrection(decision, mockClassification, mockRecord, {
          hitlReason: "qa_flagged",
          sessionId: "session-1",
          threadId: "thread-1",
        });
      }

      expect(getCorrectionsByAction("approve")).toHaveLength(1);
      expect(getCorrectionsByAction("modify")).toHaveLength(1);
      expect(getCorrectionsByAction("reject")).toHaveLength(1);
    });
  });

  describe("getCorrectionStats", () => {
    it("should calculate statistics", () => {
      // Add various corrections
      const decisions: HITLDecision[] = [
        {
          itemId: "hitl-1",
          recordId: "rec-1",
          action: "approve",
          decidedBy: "reviewer",
          decidedAt: "2024-01-16",
        },
        {
          itemId: "hitl-2",
          recordId: "rec-2",
          action: "modify",
          selectedCode: "43211501",
          decidedBy: "reviewer",
          decidedAt: "2024-01-16",
        },
        {
          itemId: "hitl-3",
          recordId: "rec-3",
          action: "modify",
          selectedCode: "43211502",
          decidedBy: "reviewer",
          decidedAt: "2024-01-16",
        },
        {
          itemId: "hitl-4",
          recordId: "rec-4",
          action: "reject",
          notes: "Wrong",
          decidedBy: "reviewer",
          decidedAt: "2024-01-16",
        },
      ];

      for (const decision of decisions) {
        logCorrection(decision, mockClassification, mockRecord, {
          hitlReason: "qa_flagged",
          sessionId: "session-1",
          threadId: "thread-1",
        });
      }

      const stats = getCorrectionStats();

      expect(stats.total).toBe(4);
      expect(stats.approved).toBe(1);
      expect(stats.modified).toBe(2);
      expect(stats.rejected).toBe(1);
      expect(stats.modificationRate).toBe(75); // 3 modifications (modify + reject) / 4 total
    });
  });

  describe("exportTrainingData", () => {
    it("should export training data from modifications", () => {
      const decision: HITLDecision = {
        itemId: "hitl-1",
        recordId: "rec-1",
        action: "modify",
        selectedCode: "43211501",
        selectedTitle: "Notebook computers",
        notes: "More specific",
        decidedBy: "reviewer",
        decidedAt: "2024-01-16T10:00:00Z",
      };

      logCorrection(decision, mockClassification, mockRecord, {
        hitlReason: "low_confidence",
        sessionId: "session-1",
        threadId: "thread-1",
      });

      const exported = exportTrainingData();

      expect(exported.version).toBe("1.0");
      expect(exported.count).toBe(1);
      expect(exported.examples).toHaveLength(1);
      expect(exported.examples[0].input.vendor).toBe("Dell Technologies");
      expect(exported.examples[0].expectedOutput.unspscCode).toBe("43211501");
    });

    it("should not export approvals", () => {
      const decision: HITLDecision = {
        itemId: "hitl-1",
        recordId: "rec-1",
        action: "approve",
        decidedBy: "reviewer",
        decidedAt: "2024-01-16T10:00:00Z",
      };

      logCorrection(decision, mockClassification, mockRecord, {
        hitlReason: "qa_flagged",
        sessionId: "session-1",
        threadId: "thread-1",
      });

      const exported = exportTrainingData();
      expect(exported.count).toBe(0);
    });
  });

  describe("exportAsJSONL", () => {
    it("should export as JSONL format", () => {
      const decision: HITLDecision = {
        itemId: "hitl-1",
        recordId: "rec-1",
        action: "modify",
        selectedCode: "43211501",
        selectedTitle: "Notebook computers",
        decidedBy: "reviewer",
        decidedAt: "2024-01-16T10:00:00Z",
      };

      logCorrection(decision, mockClassification, mockRecord, {
        hitlReason: "low_confidence",
        sessionId: "session-1",
        threadId: "thread-1",
      });

      const jsonl = exportAsJSONL();
      const lines = jsonl.split("\n").filter(Boolean);

      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0]);
      expect(parsed.messages).toHaveLength(3);
      expect(parsed.messages[0].role).toBe("system");
      expect(parsed.messages[1].role).toBe("user");
      expect(parsed.messages[2].role).toBe("assistant");
    });
  });

  describe("clearCorrections", () => {
    it("should clear all corrections", () => {
      const decision: HITLDecision = {
        itemId: "hitl-1",
        recordId: "rec-1",
        action: "approve",
        decidedBy: "reviewer",
        decidedAt: "2024-01-16T10:00:00Z",
      };

      logCorrection(decision, mockClassification, mockRecord, {
        hitlReason: "qa_flagged",
        sessionId: "session-1",
        threadId: "thread-1",
      });

      expect(getCorrections()).toHaveLength(1);

      clearCorrections();

      expect(getCorrections()).toHaveLength(0);
    });
  });
});
