import { AIMessage } from "@langchain/core/messages";
import { interrupt } from "@langchain/langgraph";
import { v4 as uuidv4 } from "uuid";
import type { SpendCubeStateType, HITLItem, HITLDecision, Classification, QAResult } from "@/types";

/**
 * HITL Review Reasons
 */
export type HITLReviewReason =
  | "low_confidence"
  | "qa_flagged"
  | "qa_rejected"
  | "ambiguous_description"
  | "multiple_matches"
  | "vendor_anomaly"
  | "amount_anomaly"
  | "user_requested";

/**
 * HITL Review Request
 */
export interface HITLReviewRequest {
  itemId: string;
  recordId: string;
  classification: Classification;
  qaResult?: QAResult;
  reason: HITLReviewReason;
  context: {
    vendor: string;
    description: string;
    amount: number;
    suggestedCodes: Array<{ code: string; title: string; confidence: number }>;
  };
}

/**
 * Thresholds for HITL routing
 */
const HITL_THRESHOLDS = {
  lowConfidence: 70,
  highValue: 50000,
  qaQualityThreshold: 60,
};

/**
 * HITL Review Node
 *
 * This node handles human-in-the-loop review requests using LangGraph's
 * interrupt mechanism. When items need human review, the graph pauses
 * and waits for a decision via the resume API.
 */
export async function hitlReviewNode(
  state: SpendCubeStateType
): Promise<Partial<SpendCubeStateType>> {
  const { hitlQueue, hitlDecisions, inputRecords, classifications, qaResults } = state;

  // Get pending HITL items (not yet decided)
  const decidedItemIds = new Set(hitlDecisions.map((d) => d.itemId));
  const pendingItems = hitlQueue.filter((item) => !decidedItemIds.has(item.id));

  if (pendingItems.length === 0) {
    return {
      messages: [new AIMessage("No pending HITL items to review.")],
      stage: "complete",
    };
  }

  // Prepare review requests for the interrupt
  const reviewRequests: HITLReviewRequest[] = pendingItems.map((item) => {
    const record = inputRecords.find((r) => r.id === item.recordId);
    const classification = classifications.find((c) => c.recordId === item.recordId);
    const qaResult = qaResults.find((qa) => qa.recordId === item.recordId);

    return {
      itemId: item.id,
      recordId: item.recordId,
      classification: classification!,
      qaResult,
      reason: item.reason as HITLReviewReason,
      context: {
        vendor: record?.vendor || "Unknown",
        description: record?.description || "Unknown",
        amount: record?.amount || 0,
        suggestedCodes: item.suggestedCodes || [],
      },
    };
  });

  // INTERRUPT: Pause graph execution and wait for human decision
  // The graph will resume when POST /api/hitl/decision is called
  const interruptData = {
    type: "hitl_review" as const,
    message: `${pendingItems.length} item(s) require human review`,
    items: reviewRequests,
    timestamp: new Date().toISOString(),
  };

  // The interrupt will pause here and return the decisions when resumed
  const humanDecisions = interrupt(interruptData) as HITLDecision[] | null;

  // Process the decisions received after resume
  if (humanDecisions && humanDecisions.length > 0) {
    // Apply decisions to classifications
    const updatedClassifications: Classification[] = [];

    for (const decision of humanDecisions) {
      if (decision.action === "approve") {
        // Keep the original classification
        continue;
      }

      if (decision.action === "modify" && decision.selectedCode) {
        // Update the classification with human corrections
        const original = classifications.find(
          (c) => c.recordId === hitlQueue.find((h) => h.id === decision.itemId)?.recordId
        );

        if (original) {
          updatedClassifications.push({
            ...original,
            unspscCode: decision.selectedCode,
            unspscTitle: decision.selectedTitle || original.unspscTitle,
            confidence: 100, // Human-verified
            reasoning: decision.notes || `Human override by ${decision.decidedBy}`,
            classifiedBy: `human:${decision.decidedBy}`,
            classifiedAt: decision.decidedAt,
          });
        }
      }
    }

    return {
      hitlDecisions: humanDecisions,
      classifications: updatedClassifications,
      messages: [
        new AIMessage(
          `HITL review complete. ${humanDecisions.length} decisions processed.`
        ),
      ],
      stage: "complete",
    };
  }

  // If we get here without decisions, the graph was resumed incorrectly
  return {
    messages: [new AIMessage("Awaiting HITL decisions...")],
    stage: "hitl",
  };
}

/**
 * Create HITL items from QA results
 */
export function createHITLItems(
  classifications: Classification[],
  qaResults: QAResult[],
  inputRecords: SpendCubeStateType["inputRecords"]
): HITLItem[] {
  const items: HITLItem[] = [];

  for (const qaResult of qaResults) {
    // Skip approved items
    if (qaResult.verdict === "approved") {
      continue;
    }

    const classification = classifications.find((c) => c.recordId === qaResult.recordId);
    const record = inputRecords.find((r) => r.id === qaResult.recordId);

    if (!classification || !record) {
      continue;
    }

    // Determine the reason for HITL review
    let reason: HITLReviewReason;
    if (qaResult.verdict === "rejected") {
      reason = "qa_rejected";
    } else if (classification.confidence < HITL_THRESHOLDS.lowConfidence) {
      reason = "low_confidence";
    } else if (record.amount >= HITL_THRESHOLDS.highValue) {
      reason = "amount_anomaly";
    } else {
      reason = "qa_flagged";
    }

    const item: HITLItem = {
      id: uuidv4(),
      recordId: qaResult.recordId,
      reason,
      priority: determinePriority(reason, record.amount),
      status: "pending",
      createdAt: new Date().toISOString(),
      context: {
        vendor: record.vendor,
        description: record.description,
        amount: record.amount,
      },
      suggestedCodes: [],
    };

    items.push(item);
  }

  return items;
}

/**
 * Determine HITL item priority
 */
function determinePriority(
  reason: HITLReviewReason,
  amount: number
): "low" | "medium" | "high" | "critical" {
  // High value items are critical
  if (amount >= 100000) return "critical";
  if (amount >= HITL_THRESHOLDS.highValue) return "high";

  // Rejected items are high priority
  if (reason === "qa_rejected") return "high";

  // Amount anomalies need attention
  if (reason === "amount_anomaly") return "high";

  // Low confidence and flagged items are medium
  if (reason === "low_confidence" || reason === "qa_flagged") return "medium";

  return "low";
}

/**
 * Check if state has pending HITL items
 */
export function hasPendingHITL(state: SpendCubeStateType): boolean {
  const decidedItemIds = new Set(state.hitlDecisions.map((d) => d.itemId));
  return state.hitlQueue.some((item) => !decidedItemIds.has(item.id));
}

/**
 * Get HITL queue statistics
 */
export function getHITLQueueStats(state: SpendCubeStateType): {
  total: number;
  pending: number;
  approved: number;
  modified: number;
  rejected: number;
  byReason: Record<string, number>;
  byPriority: Record<string, number>;
} {
  const decidedItemIds = new Map(
    state.hitlDecisions.map((d) => [d.itemId, d.action])
  );

  const stats = {
    total: state.hitlQueue.length,
    pending: 0,
    approved: 0,
    modified: 0,
    rejected: 0,
    byReason: {} as Record<string, number>,
    byPriority: {} as Record<string, number>,
  };

  for (const item of state.hitlQueue) {
    const decision = decidedItemIds.get(item.id);

    if (!decision) {
      stats.pending++;
    } else if (decision === "approve") {
      stats.approved++;
    } else if (decision === "modify") {
      stats.modified++;
    } else if (decision === "reject") {
      stats.rejected++;
    }

    stats.byReason[item.reason] = (stats.byReason[item.reason] || 0) + 1;
    stats.byPriority[item.priority] = (stats.byPriority[item.priority] || 0) + 1;
  }

  return stats;
}

/**
 * Validate HITL decision
 */
export function validateHITLDecision(decision: Partial<HITLDecision>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!decision.itemId) {
    errors.push("itemId is required");
  }

  if (!decision.action || !["approve", "modify", "reject", "escalate"].includes(decision.action)) {
    errors.push("action must be one of: approve, modify, reject, escalate");
  }

  if (decision.action === "modify" && !decision.selectedCode) {
    errors.push("selectedCode is required for modify action");
  }

  if (decision.action === "reject" && !decision.notes) {
    errors.push("notes (reason) is required for reject action");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export { HITL_THRESHOLDS };
