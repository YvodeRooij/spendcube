import { NextRequest, NextResponse } from "next/server";
import {
  getCorrections,
  getCorrectionStats,
  exportTrainingData,
  exportAsJSONL,
} from "@/lib/training";

/**
 * GET /api/training/corrections
 *
 * Get corrections data for training.
 *
 * Query params:
 * - format: "json" | "jsonl" | "stats" (default: "json")
 * - action: Filter by action ("approve" | "modify" | "reject")
 * - limit: Maximum number of corrections to return
 * - offset: Number of corrections to skip
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "json";
  const actionFilter = searchParams.get("action");
  const limit = parseInt(searchParams.get("limit") || "100", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  try {
    // Return statistics
    if (format === "stats") {
      const stats = getCorrectionStats();
      return NextResponse.json({
        success: true,
        stats,
      });
    }

    // Return JSONL format for fine-tuning
    if (format === "jsonl") {
      const jsonl = exportAsJSONL();
      return new NextResponse(jsonl, {
        headers: {
          "Content-Type": "application/jsonl",
          "Content-Disposition": "attachment; filename=training-data.jsonl",
        },
      });
    }

    // Return training data export format
    if (format === "training") {
      const trainingData = exportTrainingData();
      return NextResponse.json({
        success: true,
        data: trainingData,
      });
    }

    // Return raw corrections (default)
    let corrections = getCorrections();

    // Apply action filter
    if (actionFilter && ["approve", "modify", "reject", "escalate"].includes(actionFilter)) {
      corrections = corrections.filter(
        (c) => c.correction.action === actionFilter
      );
    }

    // Apply pagination
    const totalCount = corrections.length;
    const paginatedCorrections = corrections.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      corrections: paginatedCorrections,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    });
  } catch (error) {
    console.error("[Training Corrections] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get corrections",
      },
      { status: 500 }
    );
  }
}
