import { v4 as uuidv4 } from "uuid";
import type { HITLDecision, Classification, SpendRecord } from "@/types";

/**
 * Training correction record
 * Used to collect human corrections for model fine-tuning
 */
export interface CorrectionRecord {
  id: string;
  timestamp: string;

  // Original classification
  original: {
    recordId: string;
    vendor: string;
    description: string;
    amount: number;
    unspscCode: string;
    unspscTitle: string;
    confidence: number;
    reasoning: string;
  };

  // Human correction
  correction: {
    action: "approve" | "modify" | "reject" | "escalate";
    newCode?: string;
    newTitle?: string;
    reason?: string;
    decidedBy: string;
  };

  // Context for training
  context: {
    qaVerdict?: string;
    qaScore?: number;
    hitlReason: string;
    suggestedCodes?: Array<{ code: string; title: string; confidence: number }>;
  };

  // Metadata
  sessionId: string;
  threadId: string;
}

/**
 * Correction log entry
 */
export interface CorrectionLogEntry {
  id: string;
  corrections: CorrectionRecord[];
  createdAt: string;
  exportedAt?: string;
}

/**
 * In-memory correction store (replace with database in production)
 */
let correctionStore: CorrectionRecord[] = [];

/**
 * Log a correction from HITL decision
 */
export function logCorrection(
  decision: HITLDecision,
  originalClassification: Classification,
  record: SpendRecord,
  context: {
    qaVerdict?: string;
    qaScore?: number;
    hitlReason: string;
    suggestedCodes?: Array<{ code: string; title: string; confidence: number }>;
    sessionId: string;
    threadId: string;
  }
): CorrectionRecord {
  const correctionRecord: CorrectionRecord = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    original: {
      recordId: record.id,
      vendor: record.vendor,
      description: record.description,
      amount: record.amount,
      unspscCode: originalClassification.unspscCode,
      unspscTitle: originalClassification.unspscTitle,
      confidence: originalClassification.confidence,
      reasoning: originalClassification.reasoning,
    },
    correction: {
      action: decision.action,
      newCode: decision.selectedCode,
      newTitle: decision.selectedTitle,
      reason: decision.notes,
      decidedBy: decision.decidedBy,
    },
    context: {
      qaVerdict: context.qaVerdict,
      qaScore: context.qaScore,
      hitlReason: context.hitlReason,
      suggestedCodes: context.suggestedCodes,
    },
    sessionId: context.sessionId,
    threadId: context.threadId,
  };

  correctionStore.push(correctionRecord);
  console.log(`[Corrections] Logged correction ${correctionRecord.id} for record ${record.id}`);

  return correctionRecord;
}

/**
 * Log multiple corrections from batch HITL decisions
 */
export function logCorrections(
  decisions: HITLDecision[],
  classifications: Classification[],
  records: SpendRecord[],
  hitlQueue: Array<{
    id: string;
    recordId: string;
    reason: string;
    suggestedCodes?: Array<{ code: string; title: string; confidence: number }>;
  }>,
  qaResults: Array<{ recordId: string; verdict: string; score: number }>,
  sessionId: string,
  threadId: string
): CorrectionRecord[] {
  const logged: CorrectionRecord[] = [];

  for (const decision of decisions) {
    const hitlItem = hitlQueue.find((h) => h.id === decision.itemId);
    if (!hitlItem) continue;

    const record = records.find((r) => r.id === hitlItem.recordId);
    const classification = classifications.find((c) => c.recordId === hitlItem.recordId);
    const qaResult = qaResults.find((qa) => qa.recordId === hitlItem.recordId);

    if (!record || !classification) continue;

    const correctionRecord = logCorrection(decision, classification, record, {
      qaVerdict: qaResult?.verdict,
      qaScore: qaResult?.score,
      hitlReason: hitlItem.reason,
      suggestedCodes: hitlItem.suggestedCodes,
      sessionId,
      threadId,
    });

    logged.push(correctionRecord);
  }

  return logged;
}

/**
 * Get all corrections
 */
export function getCorrections(): CorrectionRecord[] {
  return [...correctionStore];
}

/**
 * Get corrections by action type
 */
export function getCorrectionsByAction(
  action: "approve" | "modify" | "reject" | "escalate"
): CorrectionRecord[] {
  return correctionStore.filter((c) => c.correction.action === action);
}

/**
 * Get corrections for a specific UNSPSC code
 */
export function getCorrectionsByCode(code: string): CorrectionRecord[] {
  return correctionStore.filter(
    (c) => c.original.unspscCode === code || c.correction.newCode === code
  );
}

/**
 * Get correction statistics
 */
export function getCorrectionStats(): {
  total: number;
  approved: number;
  modified: number;
  rejected: number;
  modificationRate: number;
  topMisclassifiedCodes: Array<{ code: string; count: number }>;
  averageOriginalConfidence: number;
} {
  const total = correctionStore.length;
  const approved = correctionStore.filter((c) => c.correction.action === "approve").length;
  const modified = correctionStore.filter((c) => c.correction.action === "modify").length;
  const rejected = correctionStore.filter((c) => c.correction.action === "reject").length;

  // Calculate modification rate
  const modificationRate = total > 0 ? ((modified + rejected) / total) * 100 : 0;

  // Find most commonly misclassified codes
  const misclassifiedCodes = correctionStore
    .filter((c) => c.correction.action === "modify")
    .reduce((acc, c) => {
      const code = c.original.unspscCode;
      acc[code] = (acc[code] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const topMisclassifiedCodes = Object.entries(misclassifiedCodes)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Average confidence of original classifications
  const avgConfidence = total > 0
    ? correctionStore.reduce((sum, c) => sum + c.original.confidence, 0) / total
    : 0;

  return {
    total,
    approved,
    modified,
    rejected,
    modificationRate,
    topMisclassifiedCodes,
    averageOriginalConfidence: avgConfidence,
  };
}

/**
 * Export corrections as training data format
 */
export function exportTrainingData(): {
  version: string;
  exportedAt: string;
  count: number;
  examples: Array<{
    input: {
      vendor: string;
      description: string;
      amount: number;
    };
    expectedOutput: {
      unspscCode: string;
      unspscTitle: string;
    };
    metadata: {
      source: "human_correction";
      originalPrediction: string;
      correctionReason?: string;
    };
  }>;
} {
  const modifiedCorrections = correctionStore.filter(
    (c) => c.correction.action === "modify" && c.correction.newCode
  );

  const examples = modifiedCorrections.map((c) => ({
    input: {
      vendor: c.original.vendor,
      description: c.original.description,
      amount: c.original.amount,
    },
    expectedOutput: {
      unspscCode: c.correction.newCode!,
      unspscTitle: c.correction.newTitle || "",
    },
    metadata: {
      source: "human_correction" as const,
      originalPrediction: c.original.unspscCode,
      correctionReason: c.correction.reason,
    },
  }));

  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    count: examples.length,
    examples,
  };
}

/**
 * Export corrections as JSONL for fine-tuning
 */
export function exportAsJSONL(): string {
  const modifiedCorrections = correctionStore.filter(
    (c) => c.correction.action === "modify" && c.correction.newCode
  );

  const lines = modifiedCorrections.map((c) => {
    const example = {
      messages: [
        {
          role: "system",
          content: "You are a UNSPSC classification expert. Classify the spend record to the most appropriate UNSPSC code.",
        },
        {
          role: "user",
          content: `Classify this spend record:\nVendor: ${c.original.vendor}\nDescription: ${c.original.description}\nAmount: $${c.original.amount}`,
        },
        {
          role: "assistant",
          content: JSON.stringify({
            unspscCode: c.correction.newCode,
            unspscTitle: c.correction.newTitle,
            confidence: 100,
            reasoning: c.correction.reason || "Human-verified classification",
          }),
        },
      ],
    };
    return JSON.stringify(example);
  });

  return lines.join("\n");
}

/**
 * Clear all corrections (for testing)
 */
export function clearCorrections(): void {
  correctionStore = [];
}

/**
 * Get corrections count
 */
export function getCorrectionsCount(): number {
  return correctionStore.length;
}
