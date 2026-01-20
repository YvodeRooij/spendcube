import { z } from "zod";
import { ClassificationSchema, QAResultSchema } from "./records";

/**
 * Reasons why an item requires human review
 */
export const HITLReasonSchema = z.enum([
  "low_confidence",
  "qa_flagged",
  "qa_rejected",
  "ambiguous_description",
  "multiple_matches",
  "vendor_anomaly",
  "amount_anomaly",
  "user_requested",
]);

export type HITLReason = z.infer<typeof HITLReasonSchema>;

/**
 * Item queued for human-in-the-loop review
 */
export const HITLItemSchema = z.object({
  id: z.string(),
  recordId: z.string(),
  reason: HITLReasonSchema,
  priority: z.enum(["low", "medium", "high", "critical"]),
  originalClassification: ClassificationSchema.optional(),
  qaResult: QAResultSchema.optional(),
  suggestedCodes: z.array(z.object({
    code: z.string(),
    title: z.string(),
    confidence: z.number(),
  })).optional(),
  context: z.object({
    vendor: z.string(),
    description: z.string(),
    amount: z.number(),
  }),
  createdAt: z.string(),
  assignedTo: z.string().optional(),
  status: z.enum(["pending", "in_review", "resolved", "escalated"]),
});

export type HITLItem = z.infer<typeof HITLItemSchema>;

/**
 * Human decision on a HITL item
 */
export const HITLDecisionSchema = z.object({
  itemId: z.string(),
  recordId: z.string(),
  action: z.enum(["approve", "modify", "reject", "escalate"]),
  selectedCode: z.string().optional(),
  selectedTitle: z.string().optional(),
  notes: z.string().optional(),
  decidedBy: z.string(),
  decidedAt: z.string(),
});

export type HITLDecision = z.infer<typeof HITLDecisionSchema>;

/**
 * HITL queue status and metrics
 */
export const HITLQueueStatusSchema = z.object({
  totalItems: z.number(),
  pendingItems: z.number(),
  inReviewItems: z.number(),
  resolvedItems: z.number(),
  averageResolutionTime: z.number().optional(),
  oldestItemAge: z.number().optional(),
});

export type HITLQueueStatus = z.infer<typeof HITLQueueStatusSchema>;
