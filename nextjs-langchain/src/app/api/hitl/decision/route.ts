import { NextRequest, NextResponse } from "next/server";
import { resumeGraphWithDecision, getGraphState } from "@/agents";
import { validateHITLDecision } from "@/agents/hitl";
import { logCorrection } from "@/lib/training";
import type { HITLDecision, SpendCubeStateType } from "@/types";

/**
 * POST /api/hitl/decision
 *
 * Submit a human decision for a HITL review item.
 * This resumes the graph execution with the human's decision.
 *
 * Request body:
 * {
 *   threadId: string,      // Graph thread ID
 *   itemId: string,        // HITL item ID
 *   action: "approve" | "modify" | "reject",
 *   modifiedData?: {       // Required if action is "modify"
 *     unspscCode: string,
 *     unspscTitle?: string,
 *     reasoning?: string
 *   },
 *   reason?: string,       // Required if action is "reject"
 *   reviewedBy?: string    // Optional reviewer identifier
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.threadId) {
      return NextResponse.json(
        { success: false, error: "threadId is required" },
        { status: 400 }
      );
    }

    if (!body.itemId) {
      return NextResponse.json(
        { success: false, error: "itemId is required" },
        { status: 400 }
      );
    }

    // Build the decision object
    const decision: HITLDecision = {
      itemId: body.itemId,
      recordId: body.recordId || "",
      action: body.action,
      selectedCode: body.selectedCode,
      selectedTitle: body.selectedTitle,
      notes: body.notes || body.reason,
      decidedBy: body.reviewedBy || body.decidedBy || "human",
      decidedAt: new Date().toISOString(),
    };

    // Validate the decision
    const validation = validateHITLDecision(decision);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, errors: validation.errors },
        { status: 400 }
      );
    }

    // Get current state for correction logging
    const checkpoint = await getGraphState(body.threadId);
    const state = checkpoint?.channel_values as SpendCubeStateType | undefined;

    // Log the correction for training data collection
    if (state) {
      const hitlItem = state.hitlQueue?.find((h) => h.id === body.itemId);
      const record = state.inputRecords?.find((r) => r.id === hitlItem?.recordId);
      const classification = state.classifications?.find((c) => c.recordId === hitlItem?.recordId);
      const qaResult = state.qaResults?.find((qa) => qa.recordId === hitlItem?.recordId);

      if (hitlItem && record && classification) {
        logCorrection(decision, classification, record, {
          qaVerdict: qaResult?.verdict,
          qaScore: qaResult?.qualityScore,
          hitlReason: hitlItem.reason,
          suggestedCodes: hitlItem.suggestedCodes,
          sessionId: state.sessionId || "unknown",
          threadId: body.threadId,
        });
        console.log(`[HITL Decision] Logged correction for record ${record.id}`);
      }
    }

    // Resume the graph with the decision
    const result = await resumeGraphWithDecision(body.threadId, decision);

    return NextResponse.json({
      success: true,
      message: `Decision processed: ${decision.action}`,
      threadId: body.threadId,
      itemId: body.itemId,
      action: decision.action,
      stage: result.stage,
      correctionLogged: true,
      pendingHITLCount: result.hitlQueue?.filter(
        (item: { id: string }) => !result.hitlDecisions?.some((d: { itemId: string }) => d.itemId === item.id)
      ).length || 0,
    });
  } catch (error) {
    console.error("[HITL Decision] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to process decision",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/hitl/decision
 *
 * Get information about a specific HITL item
 *
 * Query params:
 * - threadId: Graph thread ID
 * - itemId: HITL item ID
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");
  const itemId = searchParams.get("itemId");

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

    const state = checkpoint.channel_values as Record<string, unknown>;
    const hitlQueue = (state?.hitlQueue || []) as Array<{ id: string; [key: string]: unknown }>;
    const hitlDecisions = (state?.hitlDecisions || []) as Array<{ itemId: string; [key: string]: unknown }>;

    if (itemId) {
      // Return specific item
      const item = hitlQueue.find((i) => i.id === itemId);
      const decision = hitlDecisions.find((d) => d.itemId === itemId);

      if (!item) {
        return NextResponse.json(
          { success: false, error: "Item not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        item,
        decision: decision || null,
        status: decision ? "decided" : "pending",
      });
    }

    // Return all items with their decision status
    const items = hitlQueue.map((item) => {
      const decision = hitlDecisions.find((d) => d.itemId === item.id);
      return {
        ...item,
        decision: decision || null,
        status: decision ? "decided" : "pending",
      };
    });

    return NextResponse.json({
      success: true,
      threadId,
      items,
      totalItems: items.length,
      pendingCount: items.filter((i) => i.status === "pending").length,
      decidedCount: items.filter((i) => i.status === "decided").length,
    });
  } catch (error) {
    console.error("[HITL Decision GET] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get decision info",
      },
      { status: 500 }
    );
  }
}
