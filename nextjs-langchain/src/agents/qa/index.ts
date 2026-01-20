import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";
import { createQAModel } from "@/lib/langchain/models";
import type { SpendCubeStateType, QAResult, Classification, SpendRecord, HITLItem, QAIssueType } from "@/types";

/**
 * 6-Dimension Weighted Scoring Rubric for UNSPSC Classification QA
 */
export interface QADimensionScore {
  dimension: string;
  score: number;  // 0-100
  weight: number; // 0-1, must sum to 1 across all dimensions
  reasoning: string;
}

export interface QARubricResult {
  dimensions: QADimensionScore[];
  weightedScore: number;
  verdict: "approved" | "flagged" | "rejected";
  issues: Array<{ type: string; severity: "low" | "medium" | "high"; message: string }>;
  reasoning: string;
}

/**
 * QA Scoring Rubric Dimensions with default weights
 */
export const QA_RUBRIC_DIMENSIONS = {
  codeAccuracy: {
    name: "Code Accuracy",
    weight: 0.30,
    description: "Does the UNSPSC code correctly identify the product/service?",
  },
  levelAppropriateness: {
    name: "Level Appropriateness",
    weight: 0.15,
    description: "Is the code at the right hierarchy level (segment/family/class/commodity)?",
  },
  confidenceCalibration: {
    name: "Confidence Calibration",
    weight: 0.15,
    description: "Is the confidence score justified by the evidence?",
  },
  descriptionMatch: {
    name: "Description Match",
    weight: 0.20,
    description: "Do keywords in the description align with the code title?",
  },
  vendorConsistency: {
    name: "Vendor Consistency",
    weight: 0.10,
    description: "Is the code consistent with what this vendor typically provides?",
  },
  amountReasonableness: {
    name: "Amount Reasonableness",
    weight: 0.10,
    description: "Is this a reasonable amount for this type of product/service?",
  },
} as const;

/**
 * Thresholds for verdict determination
 */
const VERDICT_THRESHOLDS = {
  approved: 75,   // Score >= 75 -> approved
  flagged: 50,    // Score >= 50 but < 75 -> flagged
  rejected: 0,    // Score < 50 -> rejected
};

const QA_SYSTEM_PROMPT = `You are the SpendCube QA Judge Agent, responsible for evaluating the quality of UNSPSC classifications using a 6-dimension weighted scoring rubric.

## Your Role
Independently evaluate each classification for accuracy and appropriateness. You act as a quality gate before records are finalized.

## 6-Dimension Evaluation Rubric
You MUST score each of these 6 dimensions (0-100):

### 1. Code Accuracy (Weight: 30%)
Does the UNSPSC code correctly identify the product/service?
- 90-100: Perfect match, code precisely describes the item
- 70-89: Good match, minor misalignment
- 50-69: Partial match, related but not ideal
- Below 50: Poor match, wrong category

### 2. Level Appropriateness (Weight: 15%)
Is the code at the right hierarchy level?
- 90-100: Optimal specificity (usually commodity level for clear items)
- 70-89: Acceptable level, could be more specific
- 50-69: Too generic (segment/family when commodity available)
- Below 50: Wrong hierarchy entirely

### 3. Confidence Calibration (Weight: 15%)
Is the confidence score justified by the evidence?
- 90-100: Confidence matches available evidence perfectly
- 70-89: Confidence reasonable, slightly over/underestimated
- 50-69: Confidence poorly calibrated
- Below 50: Confidence significantly wrong (high conf on bad match or vice versa)

### 4. Description Match (Weight: 20%)
Do keywords in the description align with the code title?
- 90-100: Strong keyword overlap, clear alignment
- 70-89: Partial keyword match, logical connection
- 50-69: Weak keyword match, requires inference
- Below 50: No meaningful keyword connection

### 5. Vendor Consistency (Weight: 10%)
Is the code consistent with what this vendor typically provides?
- 90-100: Known vendor, matches their product line
- 70-89: Vendor consistent, some flexibility
- 50-69: Unusual product for this vendor type
- Below 50: Vendor/product mismatch

### 6. Amount Reasonableness (Weight: 10%)
Is this a reasonable amount for this type of product/service?
- 90-100: Amount perfectly reasonable for category
- 70-89: Amount acceptable, minor variance
- 50-69: Amount somewhat unusual for category
- Below 50: Amount highly suspicious for category

## Weighted Score Calculation
Final Score = Σ(dimension_score × weight)

## Verdicts Based on Weighted Score
- **approved**: Score >= 75
- **flagged**: Score >= 50 but < 75 (needs human verification)
- **rejected**: Score < 50 (classification is incorrect)

## Output Format
Provide your evaluation in JSON format with scores for each dimension.`;

const QA_OUTPUT_SCHEMA = `{
  "dimensions": [
    {"dimension": "codeAccuracy", "score": 0-100, "reasoning": "explanation"},
    {"dimension": "levelAppropriateness", "score": 0-100, "reasoning": "explanation"},
    {"dimension": "confidenceCalibration", "score": 0-100, "reasoning": "explanation"},
    {"dimension": "descriptionMatch", "score": 0-100, "reasoning": "explanation"},
    {"dimension": "vendorConsistency", "score": 0-100, "reasoning": "explanation"},
    {"dimension": "amountReasonableness", "score": 0-100, "reasoning": "explanation"}
  ],
  "issues": [{"type": "issue_type", "severity": "low|medium|high", "message": "description"}],
  "reasoning": "overall evaluation reasoning",
  "suggestedActions": ["action1", "action2"]
}`;

/**
 * QA Judge Agent Node
 *
 * Evaluates classifications for quality and accuracy
 */
export async function qaNode(
  state: SpendCubeStateType
): Promise<Partial<SpendCubeStateType>> {
  const { classifications, qaResults: existingQAResults, inputRecords } = state;

  // Find classifications that haven't been QA'd
  const pendingQA = classifications.filter(
    (c) => !existingQAResults.some((qa) => qa.recordId === c.recordId)
  );

  if (pendingQA.length === 0) {
    return {
      messages: [new AIMessage("All classifications have been reviewed.")],
      stage: "qa",
    };
  }

  const model = createQAModel();
  const newQAResults: QAResult[] = [];
  const hitlItems: HITLItem[] = [];

  // Process classifications
  for (const classification of pendingQA) {
    const record = inputRecords.find((r) => r.id === classification.recordId);
    if (!record) continue;

    try {
      const qaResult = await evaluateClassification(model, classification, record);
      newQAResults.push(qaResult);

      // Create HITL item if flagged or rejected
      if (qaResult.verdict === "flagged" || qaResult.verdict === "rejected") {
        const hitlItem = createHITLItem(record, classification, qaResult);
        hitlItems.push(hitlItem);
      }
    } catch (error) {
      // On error, flag for human review
      newQAResults.push({
        recordId: classification.recordId,
        verdict: "flagged",
        qualityScore: 50,
        issues: [{
          type: "confidence_low",
          severity: "medium",
          message: `QA evaluation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        }],
        reasoning: "Flagged due to QA evaluation error",
        evaluatedAt: new Date().toISOString(),
        evaluatedBy: "qa-agent",
      });
    }
  }

  const approvedCount = newQAResults.filter((q) => q.verdict === "approved").length;
  const flaggedCount = newQAResults.filter((q) => q.verdict === "flagged").length;
  const rejectedCount = newQAResults.filter((q) => q.verdict === "rejected").length;

  return {
    qaResults: newQAResults,
    hitlQueue: hitlItems,
    messages: [
      new AIMessage(
        `QA review complete. Results: ${approvedCount} approved, ${flaggedCount} flagged, ${rejectedCount} rejected. ` +
        `${hitlItems.length} items added to human review queue.`
      ),
    ],
    stage: "qa",
  };
}

/**
 * Calculate weighted score from dimension scores
 */
function calculateWeightedScore(
  dimensions: Array<{ dimension: string; score: number }>
): number {
  const weights: Record<string, number> = {
    codeAccuracy: QA_RUBRIC_DIMENSIONS.codeAccuracy.weight,
    levelAppropriateness: QA_RUBRIC_DIMENSIONS.levelAppropriateness.weight,
    confidenceCalibration: QA_RUBRIC_DIMENSIONS.confidenceCalibration.weight,
    descriptionMatch: QA_RUBRIC_DIMENSIONS.descriptionMatch.weight,
    vendorConsistency: QA_RUBRIC_DIMENSIONS.vendorConsistency.weight,
    amountReasonableness: QA_RUBRIC_DIMENSIONS.amountReasonableness.weight,
  };

  let totalScore = 0;
  let totalWeight = 0;

  for (const dim of dimensions) {
    const weight = weights[dim.dimension] || 0;
    totalScore += dim.score * weight;
    totalWeight += weight;
  }

  // Normalize in case not all dimensions are present
  return totalWeight > 0 ? totalScore / totalWeight * (totalWeight / 1.0) : 50;
}

/**
 * Determine verdict from weighted score
 */
function determineVerdict(
  weightedScore: number,
  classification: Classification
): "approved" | "flagged" | "rejected" {
  // Override: low confidence always gets flagged at minimum
  if (classification.confidence < 50) {
    return weightedScore >= VERDICT_THRESHOLDS.flagged ? "flagged" : "rejected";
  }

  if (weightedScore >= VERDICT_THRESHOLDS.approved) {
    // Even high scores get flagged if confidence is low
    if (classification.confidence < 70) {
      return "flagged";
    }
    return "approved";
  }

  if (weightedScore >= VERDICT_THRESHOLDS.flagged) {
    return "flagged";
  }

  return "rejected";
}

/**
 * Evaluate a single classification using 6-dimension rubric
 */
async function evaluateClassification(
  model: ReturnType<typeof createQAModel>,
  classification: Classification,
  record: SpendRecord
): Promise<QAResult> {
  const prompt = `Evaluate this UNSPSC classification using the 6-dimension rubric:

## Original Record
- Vendor: ${record.vendor}
- Description: ${record.description}
- Amount: $${record.amount.toLocaleString()}
${record.department ? `- Department: ${record.department}` : ""}
${record.date ? `- Date: ${record.date}` : ""}

## Classification
- UNSPSC Code: ${classification.unspscCode}
- Title: ${classification.unspscTitle}
- Segment: ${classification.segment || "N/A"}
- Family: ${classification.family || "N/A"}
- Class: ${classification.classCode || "N/A"}
- Commodity: ${classification.commodity || "N/A"}
- Confidence: ${classification.confidence}%
- Reasoning: ${classification.reasoning}

Evaluate using the 6-dimension rubric. Provide scores for EACH dimension (0-100):

${QA_OUTPUT_SCHEMA}`;

  const messages = [
    new SystemMessage(QA_SYSTEM_PROMPT),
    new HumanMessage(prompt),
  ];

  const response = await model.invoke(messages);
  const content = typeof response.content === "string"
    ? response.content
    : JSON.stringify(response.content);

  // Parse the JSON response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in QA response");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Extract and validate dimensions
  const dimensions: Array<{ dimension: string; score: number; reasoning: string }> =
    parsed.dimensions || [];

  // Ensure all dimensions are present with valid scores
  const dimensionKeys = Object.keys(QA_RUBRIC_DIMENSIONS);
  for (const key of dimensionKeys) {
    if (!dimensions.find((d) => d.dimension === key)) {
      dimensions.push({
        dimension: key,
        score: 50, // Default middle score
        reasoning: "Score not provided, defaulting to 50",
      });
    }
  }

  // Normalize scores to 0-100
  for (const dim of dimensions) {
    dim.score = Math.min(100, Math.max(0, dim.score || 50));
  }

  // Calculate weighted score
  const weightedScore = calculateWeightedScore(dimensions);

  // Determine verdict based on weighted score
  let verdict = determineVerdict(weightedScore, classification);

  // Valid dimension issue types for the rubric
  const dimensionIssueTypes: Record<string, QAIssueType> = {
    codeAccuracy: "codeAccuracy_low",
    levelAppropriateness: "levelAppropriateness_low",
    confidenceCalibration: "confidenceCalibration_low",
    descriptionMatch: "descriptionMatch_low",
    vendorConsistency: "vendorConsistency_low",
    amountReasonableness: "amountReasonableness_low",
  };

  // Collect issues with proper typing
  const issues: Array<{ type: QAIssueType; severity: "low" | "medium" | "high"; message: string }> = [];

  // Add any issues from parsed response (validate type)
  const validLegacyTypes: QAIssueType[] = ["confidence_low", "code_mismatch", "description_unclear", "amount_anomaly", "vendor_unknown"];
  for (const issue of (parsed.issues || [])) {
    if (validLegacyTypes.includes(issue.type as QAIssueType)) {
      issues.push({
        type: issue.type as QAIssueType,
        severity: issue.severity,
        message: issue.message,
      });
    }
  }

  // Add dimension-specific issues
  for (const dim of dimensions) {
    if (dim.score < 50) {
      const issueType = dimensionIssueTypes[dim.dimension];
      if (issueType) {
        issues.push({
          type: issueType,
          severity: dim.score < 30 ? "high" : "medium",
          message: `${QA_RUBRIC_DIMENSIONS[dim.dimension as keyof typeof QA_RUBRIC_DIMENSIONS]?.name || dim.dimension}: ${dim.reasoning}`,
        });
      }
    }
  }

  // Auto-flag low confidence
  if (classification.confidence < 70 && verdict === "approved") {
    verdict = "flagged";
    issues.push({
      type: "confidence_low",
      severity: "medium",
      message: `Confidence ${classification.confidence}% is below 70% threshold`,
    });
  }

  return {
    recordId: classification.recordId,
    classificationId: classification.recordId,
    verdict,
    qualityScore: Math.round(weightedScore),
    issues: issues.length > 0 ? issues : undefined,
    reasoning: parsed.reasoning || `Weighted score: ${weightedScore.toFixed(1)}. ${dimensions.map((d) => `${d.dimension}: ${d.score}`).join(", ")}`,
    suggestedActions: parsed.suggestedActions,
    evaluatedAt: new Date().toISOString(),
    evaluatedBy: "qa-agent",
  };
}

/**
 * Create a HITL item for flagged/rejected classifications
 */
function createHITLItem(
  record: SpendRecord,
  classification: Classification,
  qaResult: QAResult
): HITLItem {
  // Determine reason and priority
  let reason: HITLItem["reason"] = "qa_flagged";
  let priority: HITLItem["priority"] = "medium";

  if (qaResult.verdict === "rejected") {
    reason = "qa_rejected";
    priority = "high";
  } else if (classification.confidence < 50) {
    reason = "low_confidence";
    priority = "high";
  } else if (classification.confidence < 70) {
    reason = "low_confidence";
    priority = "medium";
  }

  // Check for specific issues
  const issues = qaResult.issues || [];
  if (issues.some((i) => i.type === "amount_anomaly")) {
    reason = "amount_anomaly";
    priority = "high";
  }
  if (issues.some((i) => i.type === "vendor_unknown")) {
    reason = "vendor_anomaly";
  }

  return {
    id: uuidv4(),
    recordId: record.id,
    reason,
    priority,
    originalClassification: classification,
    qaResult,
    suggestedCodes: classification.alternativeCodes,
    context: {
      vendor: record.vendor,
      description: record.description,
      amount: record.amount,
    },
    createdAt: new Date().toISOString(),
    status: "pending",
  };
}
