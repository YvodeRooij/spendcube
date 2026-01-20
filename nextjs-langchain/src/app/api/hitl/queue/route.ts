import { NextRequest, NextResponse } from "next/server";
import { getGraphState } from "@/agents";
import { getHITLQueueStats } from "@/agents/hitl";
import type { SpendCubeStateType } from "@/types";

/**
 * GET /api/hitl/queue
 *
 * Get the HITL queue for a graph thread.
 *
 * Query params:
 * - threadId: Graph thread ID (required)
 * - status: Filter by status ("pending" | "decided" | "all")
 * - priority: Filter by priority ("critical" | "high" | "normal" | "low")
 * - limit: Maximum number of items to return
 * - offset: Number of items to skip (for pagination)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");
  const statusFilter = searchParams.get("status") || "all";
  const priorityFilter = searchParams.get("priority");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

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
    const hitlQueue = state?.hitlQueue || [];
    const hitlDecisions = state?.hitlDecisions || [];
    const inputRecords = state?.inputRecords || [];
    const classifications = state?.classifications || [];

    // Create a map of decisions by item ID
    const decisionMap = new Map(
      hitlDecisions.map((d) => [d.itemId, d])
    );

    // Enrich queue items with related data
    let items = hitlQueue.map((item) => {
      const decision = decisionMap.get(item.id);
      const record = inputRecords.find((r) => r.id === item.recordId);
      const classification = classifications.find((c) => c.recordId === item.recordId);

      return {
        id: item.id,
        recordId: item.recordId,
        reason: item.reason,
        priority: item.priority,
        status: decision ? "decided" : "pending",
        createdAt: item.createdAt,
        record: record
          ? {
              vendor: record.vendor,
              description: record.description,
              amount: record.amount,
              date: record.date,
              department: record.department,
            }
          : null,
        classification: classification
          ? {
              unspscCode: classification.unspscCode,
              unspscTitle: classification.unspscTitle,
              confidence: classification.confidence,
              reasoning: classification.reasoning,
            }
          : null,
        originalClassification: item.originalClassification,
        suggestedCodes: item.suggestedCodes,
        qaResult: item.qaResult,
        decision: decision
          ? {
              action: decision.action,
              selectedCode: decision.selectedCode,
              selectedTitle: decision.selectedTitle,
              notes: decision.notes,
              decidedBy: decision.decidedBy,
              decidedAt: decision.decidedAt,
            }
          : null,
      };
    });

    // Apply filters
    if (statusFilter !== "all") {
      items = items.filter((item) => item.status === statusFilter);
    }

    if (priorityFilter) {
      items = items.filter((item) => item.priority === priorityFilter);
    }

    // Sort by priority and creation date
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    items.sort((a, b) => {
      const priorityDiff =
        (priorityOrder[a.priority as keyof typeof priorityOrder] || 99) -
        (priorityOrder[b.priority as keyof typeof priorityOrder] || 99);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Apply pagination
    const totalItems = items.length;
    const paginatedItems = items.slice(offset, offset + limit);

    // Get queue statistics
    const stats = getHITLQueueStats(state);

    return NextResponse.json({
      success: true,
      threadId,
      queue: {
        items: paginatedItems,
        pagination: {
          total: totalItems,
          limit,
          offset,
          hasMore: offset + limit < totalItems,
        },
      },
      stats: {
        total: stats.total,
        pending: stats.pending,
        approved: stats.approved,
        modified: stats.modified,
        rejected: stats.rejected,
        byReason: stats.byReason,
        byPriority: stats.byPriority,
      },
      stage: state.stage,
    });
  } catch (error) {
    console.error("[HITL Queue] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get HITL queue",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/hitl/queue
 *
 * Manually add an item to the HITL queue.
 * Useful for flagging items for review that weren't automatically flagged.
 *
 * Request body:
 * {
 *   threadId: string,
 *   recordId: string,
 *   reason: string,
 *   priority?: "critical" | "high" | "normal" | "low"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.threadId || !body.recordId) {
      return NextResponse.json(
        { success: false, error: "threadId and recordId are required" },
        { status: 400 }
      );
    }

    // Note: This would need to update the graph state
    // For now, return a not implemented response
    return NextResponse.json(
      {
        success: false,
        error: "Manual queue addition not yet implemented. Use the classification flow to add items automatically.",
      },
      { status: 501 }
    );
  } catch (error) {
    console.error("[HITL Queue POST] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to add to queue",
      },
      { status: 500 }
    );
  }
}
