import { NextRequest, NextResponse } from "next/server";
import { getGraphState } from "@/agents";
import {
  calculatePipelineMetrics,
  evaluatePipeline,
  formatEvaluationReport,
} from "@/lib/evaluation";
import type { SpendCubeStateType } from "@/types";

/**
 * GET /api/evaluation
 *
 * Get pipeline evaluation metrics and recommendations.
 *
 * Query params:
 * - threadId: Graph thread ID (required)
 * - format: "json" | "report" (default: "json")
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");
  const format = searchParams.get("format") || "json";

  if (!threadId) {
    return NextResponse.json(
      { success: false, error: "threadId is required" },
      { status: 400 }
    );
  }

  try {
    const checkpoint = await getGraphState(threadId);

    if (!checkpoint) {
      return NextResponse.json(
        { success: false, error: "Thread not found" },
        { status: 404 }
      );
    }

    const state = checkpoint.channel_values as SpendCubeStateType;

    // Calculate metrics and evaluation
    const evaluation = evaluatePipeline(state);

    // Return based on format
    if (format === "report") {
      const report = formatEvaluationReport(evaluation);
      return new NextResponse(report, {
        headers: {
          "Content-Type": "text/markdown",
        },
      });
    }

    return NextResponse.json({
      success: true,
      threadId,
      evaluation: {
        score: evaluation.score,
        grade: evaluation.grade,
        issues: evaluation.issues,
        recommendations: evaluation.recommendations,
      },
      metrics: {
        classification: {
          totalRecords: evaluation.metrics.classification.totalRecords,
          classifiedRecords: evaluation.metrics.classification.classifiedRecords,
          classificationRate: evaluation.metrics.classification.classificationRate,
          averageConfidence: evaluation.metrics.classification.averageConfidence,
          confidenceDistribution: evaluation.metrics.classification.confidenceDistribution,
        },
        qa: {
          totalEvaluated: evaluation.metrics.qa.totalEvaluated,
          approvedCount: evaluation.metrics.qa.approvedCount,
          flaggedCount: evaluation.metrics.qa.flaggedCount,
          rejectedCount: evaluation.metrics.qa.rejectedCount,
          approvalRate: evaluation.metrics.qa.approvalRate,
          averageQualityScore: evaluation.metrics.qa.averageQualityScore,
          hitlRate: evaluation.metrics.qa.hitlRate,
        },
        hitl: {
          totalItems: evaluation.metrics.hitl.totalItems,
          resolvedItems: evaluation.metrics.hitl.resolvedItems,
          pendingItems: evaluation.metrics.hitl.pendingItems,
          resolutionRate: evaluation.metrics.hitl.resolutionRate,
          correctionRate: evaluation.metrics.hitl.correctionRate,
        },
      },
      timestamp: evaluation.metrics.timestamp,
    });
  } catch (error) {
    console.error("[Evaluation] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get evaluation",
      },
      { status: 500 }
    );
  }
}
