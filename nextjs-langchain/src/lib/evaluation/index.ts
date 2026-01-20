import type { SpendCubeStateType, Classification, QAResult } from "@/types";

/**
 * Classification Evaluation Metrics
 */
export interface ClassificationMetrics {
  totalRecords: number;
  classifiedRecords: number;
  classificationRate: number;
  averageConfidence: number;
  confidenceDistribution: {
    high: number;   // >= 90%
    medium: number; // 70-89%
    low: number;    // < 70%
  };
  byAgent: Record<string, {
    count: number;
    averageConfidence: number;
  }>;
  processingTime?: number;
}

/**
 * QA Evaluation Metrics
 */
export interface QAMetrics {
  totalEvaluated: number;
  approvedCount: number;
  flaggedCount: number;
  rejectedCount: number;
  approvalRate: number;
  averageQualityScore: number;
  qualityScoreDistribution: {
    excellent: number;  // >= 90
    good: number;       // 70-89
    fair: number;       // 50-69
    poor: number;       // < 50
  };
  issuesByType: Record<string, number>;
  hitlRate: number;
}

/**
 * HITL Evaluation Metrics
 */
export interface HITLMetrics {
  totalItems: number;
  resolvedItems: number;
  pendingItems: number;
  resolutionRate: number;
  correctionRate: number;
  averageResolutionTime?: number;
  byReason: Record<string, {
    count: number;
    correctionRate: number;
  }>;
}

/**
 * Overall Pipeline Metrics
 */
export interface PipelineMetrics {
  classification: ClassificationMetrics;
  qa: QAMetrics;
  hitl: HITLMetrics;
  endToEndAccuracy?: number;
  throughput?: number;
  timestamp: string;
}

/**
 * Evaluation result with recommendations
 */
export interface EvaluationResult {
  metrics: PipelineMetrics;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  issues: string[];
  recommendations: string[];
}

/**
 * Calculate classification metrics
 */
export function calculateClassificationMetrics(
  state: SpendCubeStateType
): ClassificationMetrics {
  const { inputRecords, classifications } = state;

  if (inputRecords.length === 0) {
    return {
      totalRecords: 0,
      classifiedRecords: 0,
      classificationRate: 0,
      averageConfidence: 0,
      confidenceDistribution: { high: 0, medium: 0, low: 0 },
      byAgent: {},
    };
  }

  const classifiedRecords = classifications.length;
  const classificationRate = (classifiedRecords / inputRecords.length) * 100;

  const avgConfidence = classifications.length > 0
    ? classifications.reduce((sum, c) => sum + c.confidence, 0) / classifications.length
    : 0;

  const confidenceDistribution = {
    high: classifications.filter(c => c.confidence >= 90).length,
    medium: classifications.filter(c => c.confidence >= 70 && c.confidence < 90).length,
    low: classifications.filter(c => c.confidence < 70).length,
  };

  const byAgent: Record<string, { count: number; totalConfidence: number }> = {};
  for (const c of classifications) {
    const agent = c.classifiedBy;
    if (!byAgent[agent]) {
      byAgent[agent] = { count: 0, totalConfidence: 0 };
    }
    byAgent[agent].count++;
    byAgent[agent].totalConfidence += c.confidence;
  }

  return {
    totalRecords: inputRecords.length,
    classifiedRecords,
    classificationRate,
    averageConfidence: avgConfidence,
    confidenceDistribution,
    byAgent: Object.fromEntries(
      Object.entries(byAgent).map(([agent, data]) => [
        agent,
        {
          count: data.count,
          averageConfidence: data.totalConfidence / data.count,
        },
      ])
    ),
  };
}

/**
 * Calculate QA metrics
 */
export function calculateQAMetrics(state: SpendCubeStateType): QAMetrics {
  const { qaResults, hitlQueue } = state;

  if (qaResults.length === 0) {
    return {
      totalEvaluated: 0,
      approvedCount: 0,
      flaggedCount: 0,
      rejectedCount: 0,
      approvalRate: 0,
      averageQualityScore: 0,
      qualityScoreDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
      issuesByType: {},
      hitlRate: 0,
    };
  }

  const approvedCount = qaResults.filter(q => q.verdict === "approved").length;
  const flaggedCount = qaResults.filter(q => q.verdict === "flagged").length;
  const rejectedCount = qaResults.filter(q => q.verdict === "rejected").length;

  const avgQualityScore = qaResults.reduce((sum, q) => sum + q.qualityScore, 0) / qaResults.length;

  const qualityScoreDistribution = {
    excellent: qaResults.filter(q => q.qualityScore >= 90).length,
    good: qaResults.filter(q => q.qualityScore >= 70 && q.qualityScore < 90).length,
    fair: qaResults.filter(q => q.qualityScore >= 50 && q.qualityScore < 70).length,
    poor: qaResults.filter(q => q.qualityScore < 50).length,
  };

  const issuesByType: Record<string, number> = {};
  for (const qa of qaResults) {
    if (qa.issues) {
      for (const issue of qa.issues) {
        issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1;
      }
    }
  }

  return {
    totalEvaluated: qaResults.length,
    approvedCount,
    flaggedCount,
    rejectedCount,
    approvalRate: (approvedCount / qaResults.length) * 100,
    averageQualityScore: avgQualityScore,
    qualityScoreDistribution,
    issuesByType,
    hitlRate: (hitlQueue.length / qaResults.length) * 100,
  };
}

/**
 * Calculate HITL metrics
 */
export function calculateHITLMetrics(state: SpendCubeStateType): HITLMetrics {
  const { hitlQueue, hitlDecisions } = state;

  if (hitlQueue.length === 0) {
    return {
      totalItems: 0,
      resolvedItems: 0,
      pendingItems: 0,
      resolutionRate: 0,
      correctionRate: 0,
      byReason: {},
    };
  }

  const resolvedItems = hitlDecisions.length;
  const pendingItems = hitlQueue.length - resolvedItems;
  const corrections = hitlDecisions.filter(d => d.action === "modify" || d.action === "reject").length;

  const byReason: Record<string, { count: number; corrections: number }> = {};
  for (const item of hitlQueue) {
    if (!byReason[item.reason]) {
      byReason[item.reason] = { count: 0, corrections: 0 };
    }
    byReason[item.reason].count++;

    const decision = hitlDecisions.find(d => d.itemId === item.id);
    if (decision && (decision.action === "modify" || decision.action === "reject")) {
      byReason[item.reason].corrections++;
    }
  }

  return {
    totalItems: hitlQueue.length,
    resolvedItems,
    pendingItems,
    resolutionRate: (resolvedItems / hitlQueue.length) * 100,
    correctionRate: resolvedItems > 0 ? (corrections / resolvedItems) * 100 : 0,
    byReason: Object.fromEntries(
      Object.entries(byReason).map(([reason, data]) => [
        reason,
        {
          count: data.count,
          correctionRate: data.count > 0 ? (data.corrections / data.count) * 100 : 0,
        },
      ])
    ),
  };
}

/**
 * Calculate overall pipeline metrics
 */
export function calculatePipelineMetrics(state: SpendCubeStateType): PipelineMetrics {
  return {
    classification: calculateClassificationMetrics(state),
    qa: calculateQAMetrics(state),
    hitl: calculateHITLMetrics(state),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Evaluate pipeline performance and generate recommendations
 */
export function evaluatePipeline(state: SpendCubeStateType): EvaluationResult {
  const metrics = calculatePipelineMetrics(state);
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Scoring weights
  const weights = {
    classificationRate: 0.2,
    averageConfidence: 0.2,
    approvalRate: 0.3,
    qualityScore: 0.2,
    correctionRate: 0.1,
  };

  let score = 0;

  // Classification rate score
  if (metrics.classification.classificationRate >= 95) {
    score += weights.classificationRate * 100;
  } else if (metrics.classification.classificationRate >= 80) {
    score += weights.classificationRate * 80;
  } else {
    score += weights.classificationRate * 60;
    issues.push("Low classification rate - some records not classified");
    recommendations.push("Review unclassified records for data quality issues");
  }

  // Confidence score
  if (metrics.classification.averageConfidence >= 80) {
    score += weights.averageConfidence * 100;
  } else if (metrics.classification.averageConfidence >= 70) {
    score += weights.averageConfidence * 80;
  } else {
    score += weights.averageConfidence * 60;
    issues.push("Low average confidence in classifications");
    recommendations.push("Consider expanding taxonomy or improving descriptions");
  }

  // QA approval rate score
  if (metrics.qa.approvalRate >= 80) {
    score += weights.approvalRate * 100;
  } else if (metrics.qa.approvalRate >= 60) {
    score += weights.approvalRate * 75;
    issues.push("Moderate QA approval rate");
  } else {
    score += weights.approvalRate * 50;
    issues.push("Low QA approval rate - many classifications need review");
    recommendations.push("Review classification model performance");
  }

  // Quality score
  if (metrics.qa.averageQualityScore >= 80) {
    score += weights.qualityScore * 100;
  } else if (metrics.qa.averageQualityScore >= 60) {
    score += weights.qualityScore * 75;
  } else {
    score += weights.qualityScore * 50;
    issues.push("Low average quality score");
    recommendations.push("Improve classification accuracy for flagged categories");
  }

  // Correction rate (lower is better)
  if (metrics.hitl.correctionRate <= 10) {
    score += weights.correctionRate * 100;
  } else if (metrics.hitl.correctionRate <= 25) {
    score += weights.correctionRate * 75;
  } else {
    score += weights.correctionRate * 50;
    issues.push("High HITL correction rate indicates classification issues");
    recommendations.push("Use HITL corrections to improve training data");
  }

  // Determine grade
  let grade: "A" | "B" | "C" | "D" | "F";
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 70) grade = "C";
  else if (score >= 60) grade = "D";
  else grade = "F";

  // Add general recommendations if no issues
  if (issues.length === 0) {
    recommendations.push("Pipeline performing well - consider processing more data");
  }

  return {
    metrics,
    score,
    grade,
    issues,
    recommendations,
  };
}

/**
 * Format metrics as a report string
 */
export function formatMetricsReport(metrics: PipelineMetrics): string {
  const lines: string[] = [
    "# Pipeline Evaluation Report",
    `Generated: ${new Date(metrics.timestamp).toLocaleString()}`,
    "",
    "## Classification Metrics",
    `- Total Records: ${metrics.classification.totalRecords}`,
    `- Classified: ${metrics.classification.classifiedRecords} (${metrics.classification.classificationRate.toFixed(1)}%)`,
    `- Average Confidence: ${metrics.classification.averageConfidence.toFixed(1)}%`,
    `- High Confidence (≥90%): ${metrics.classification.confidenceDistribution.high}`,
    `- Medium Confidence (70-89%): ${metrics.classification.confidenceDistribution.medium}`,
    `- Low Confidence (<70%): ${metrics.classification.confidenceDistribution.low}`,
    "",
    "## QA Metrics",
    `- Total Evaluated: ${metrics.qa.totalEvaluated}`,
    `- Approved: ${metrics.qa.approvedCount} (${metrics.qa.approvalRate.toFixed(1)}%)`,
    `- Flagged: ${metrics.qa.flaggedCount}`,
    `- Rejected: ${metrics.qa.rejectedCount}`,
    `- Average Quality Score: ${metrics.qa.averageQualityScore.toFixed(1)}`,
    `- HITL Rate: ${metrics.qa.hitlRate.toFixed(1)}%`,
    "",
    "## HITL Metrics",
    `- Total Items: ${metrics.hitl.totalItems}`,
    `- Resolved: ${metrics.hitl.resolvedItems} (${metrics.hitl.resolutionRate.toFixed(1)}%)`,
    `- Pending: ${metrics.hitl.pendingItems}`,
    `- Correction Rate: ${metrics.hitl.correctionRate.toFixed(1)}%`,
    "",
  ];

  return lines.join("\n");
}

/**
 * Format evaluation result as a report string
 */
export function formatEvaluationReport(result: EvaluationResult): string {
  const metricsReport = formatMetricsReport(result.metrics);

  const lines: string[] = [
    metricsReport,
    "## Evaluation Summary",
    `**Score:** ${result.score.toFixed(1)}/100`,
    `**Grade:** ${result.grade}`,
    "",
  ];

  if (result.issues.length > 0) {
    lines.push("### Issues");
    for (const issue of result.issues) {
      lines.push(`- ⚠️ ${issue}`);
    }
    lines.push("");
  }

  if (result.recommendations.length > 0) {
    lines.push("### Recommendations");
    for (const rec of result.recommendations) {
      lines.push(`- 💡 ${rec}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

