import { z } from "zod";

/**
 * Schema for a spend record from the source system
 */
export const SpendRecordSchema = z.object({
  id: z.string(),
  vendor: z.string(),
  description: z.string(),
  amount: z.number(),
  date: z.string(),
  department: z.string().optional(),
  costCenter: z.string().optional(),
  poNumber: z.string().optional(),
  invoiceNumber: z.string().optional(),
  rawText: z.string().optional(),
});

export type SpendRecord = z.infer<typeof SpendRecordSchema>;

/**
 * UNSPSC classification assigned by the classification agent
 */
export const ClassificationSchema = z.object({
  recordId: z.string(),
  unspscCode: z.string(),
  unspscTitle: z.string(),
  segment: z.string().optional(),
  family: z.string().optional(),
  classCode: z.string().optional(),
  commodity: z.string().optional(),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  alternativeCodes: z.array(z.object({
    code: z.string(),
    title: z.string(),
    confidence: z.number(),
  })).optional(),
  classifiedAt: z.string(),
  classifiedBy: z.string(),
});

export type Classification = z.infer<typeof ClassificationSchema>;

/**
 * QA Issue Types
 * Includes both legacy types and 6-dimension rubric types
 */
export const QAIssueTypeSchema = z.enum([
  // Legacy issue types
  "confidence_low",
  "code_mismatch",
  "description_unclear",
  "amount_anomaly",
  "vendor_unknown",
  // 6-dimension rubric issue types
  "codeAccuracy_low",
  "levelAppropriateness_low",
  "confidenceCalibration_low",
  "descriptionMatch_low",
  "vendorConsistency_low",
  "amountReasonableness_low",
]);

export type QAIssueType = z.infer<typeof QAIssueTypeSchema>;

/**
 * QA evaluation result from the QA Judge agent
 */
export const QAResultSchema = z.object({
  recordId: z.string(),
  classificationId: z.string().optional(),
  verdict: z.enum(["approved", "flagged", "rejected"]),
  qualityScore: z.number().min(0).max(100),
  issues: z.array(z.object({
    type: QAIssueTypeSchema,
    severity: z.enum(["low", "medium", "high"]),
    message: z.string(),
  })).optional(),
  reasoning: z.string(),
  suggestedActions: z.array(z.string()).optional(),
  evaluatedAt: z.string(),
  evaluatedBy: z.string(),
});

export type QAResult = z.infer<typeof QAResultSchema>;

/**
 * Processed record combining spend data with classification and QA
 */
export const ProcessedRecordSchema = z.object({
  record: SpendRecordSchema,
  classification: ClassificationSchema.optional(),
  qaResult: QAResultSchema.optional(),
  status: z.enum(["pending", "classified", "qa_passed", "qa_failed", "human_review", "completed"]),
  processedAt: z.string().optional(),
});

export type ProcessedRecord = z.infer<typeof ProcessedRecordSchema>;
