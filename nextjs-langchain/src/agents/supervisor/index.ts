import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { createSupervisorModel } from "@/lib/langchain/models";
import { SUPERVISOR_SYSTEM_PROMPT } from "./prompts";
import { getRoutingDecision } from "./router";
import { buildSpendCube } from "@/lib/spend-cube";
import type { SpendCubeStateType } from "@/types";

/**
 * Supervisor Node
 *
 * The supervisor orchestrates the multi-agent workflow by:
 * 1. Analyzing user requests and current state
 * 2. Making routing decisions
 * 3. Providing user-facing responses ONLY when needed
 *
 * IMPORTANT: The supervisor should NOT generate verbose AI messages when
 * simply routing between agents. Only generate responses when the target
 * is "respond" or "end".
 */
export async function supervisorNode(
  state: SpendCubeStateType
): Promise<Partial<SpendCubeStateType>> {
  const routingDecision = getRoutingDecision(state);
  const nextStage = determineNextStage(state, routingDecision.target);

  // For internal routing (not user-facing), just update stage without generating verbose messages
  // This prevents confusing intermediate messages like "response needed" when pipeline is still running
  const isInternalRouting = !["respond", "end"].includes(routingDecision.target);

  if (isInternalRouting) {
    // Silent routing - no AI message generated, just state transition
    return {
      stage: nextStage,
    };
  }

  // Only generate AI response for user-facing outputs
  const model = createSupervisorModel();
  const contextMessage = buildContextMessage(state);

  const messages = [
    new SystemMessage(SUPERVISOR_SYSTEM_PROMPT),
    ...state.messages,
    new HumanMessage(contextMessage),
  ];

  try {
    const response = await model.invoke(messages);
    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    return {
      messages: [new AIMessage(content)],
      stage: nextStage,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      messages: [new AIMessage(`I encountered an error: ${errorMessage}. Let me try a different approach.`)],
      errors: [{
        agentType: "supervisor",
        code: "MODEL_ERROR",
        message: errorMessage,
        recoverable: true,
        retryCount: 0,
        maxRetries: 3,
        occurredAt: new Date().toISOString(),
      }],
      stage: "error",
    };
  }
}

/**
 * Build a context message summarizing current state
 */
function buildContextMessage(state: SpendCubeStateType): string {
  const {
    inputRecords,
    classifications,
    qaResults,
    hitlQueue,
    stage,
    userQuery,
  } = state;

  const parts: string[] = [];

  if (userQuery) {
    parts.push(`User Request: ${userQuery}`);
  }

  parts.push(`\nCurrent Stage: ${stage}`);
  parts.push(`\nState Summary:`);
  parts.push(`- Input Records: ${inputRecords.length}`);
  parts.push(`- Classifications: ${classifications.length}`);
  parts.push(`- QA Results: ${qaResults.length}`);
  parts.push(`- HITL Queue: ${hitlQueue.length}`);

  if (inputRecords.length > 0 && classifications.length === 0) {
    parts.push(`\nRecords awaiting classification:`);
    inputRecords.slice(0, 5).forEach((r) => {
      parts.push(`  - ${r.vendor}: ${r.description} ($${r.amount})`);
    });
    if (inputRecords.length > 5) {
      parts.push(`  ... and ${inputRecords.length - 5} more`);
    }
  }

  if (classifications.length > 0) {
    const avgConfidence = classifications.reduce((sum, c) => sum + c.confidence, 0) / classifications.length;
    parts.push(`\nClassification Summary:`);
    parts.push(`- Average Confidence: ${avgConfidence.toFixed(1)}%`);
    parts.push(`- High Confidence (≥70%): ${classifications.filter(c => c.confidence >= 70).length}`);
    parts.push(`- Low Confidence (<70%): ${classifications.filter(c => c.confidence < 70).length}`);
  }

  if (qaResults.length > 0) {
    parts.push(`\nQA Results:`);
    parts.push(`- Approved: ${qaResults.filter(q => q.verdict === "approved").length}`);
    parts.push(`- Flagged: ${qaResults.filter(q => q.verdict === "flagged").length}`);
    parts.push(`- Rejected: ${qaResults.filter(q => q.verdict === "rejected").length}`);
  }

  if (hitlQueue.length > 0) {
    parts.push(`\nHITL Queue:`);
    parts.push(`- Pending: ${hitlQueue.filter(h => h.status === "pending").length}`);
    parts.push(`- In Review: ${hitlQueue.filter(h => h.status === "in_review").length}`);
  }

  parts.push(`\nProvide an appropriate response or action plan for the user.`);

  return parts.join("\n");
}

/**
 * Determine the next stage based on routing
 */
function determineNextStage(
  state: SpendCubeStateType,
  target: string
): SpendCubeStateType["stage"] {
  switch (target) {
    case "classification":
      return "classifying";
    case "qa":
      return "qa";
    case "hitl":
      return "hitl";
    case "respond":
    case "end":
      if (state.errors.length > 0) {
        return "error";
      }
      if (state.qaResults.length > 0 && state.hitlQueue.length === 0) {
        return "complete";
      }
      return state.stage;
    default:
      return state.stage;
  }
}

/**
 * Response node - generates final user response with Spend Cube analysis
 */
export async function responseNode(
  state: SpendCubeStateType
): Promise<Partial<SpendCubeStateType>> {
  const model = createSupervisorModel();
  const { inputRecords, classifications, qaResults, hitlQueue } = state;

  // Determine if processing is actually complete
  const hasRecords = inputRecords.length > 0;
  const hasClassifications = classifications.length > 0;
  const allClassified = hasRecords && classifications.length >= inputRecords.length;
  const allQAd = hasClassifications && qaResults.length >= classifications.length;
  const noHITLPending = hitlQueue.filter(h => h.status === "pending").length === 0;

  // Only mark as complete if actual work was done
  const isActuallyComplete = hasRecords && allClassified && allQAd && noHITLPending;

  // Build Spend Cube if we have classifications (always build after classification)
  let spendCubeData = null;
  let spendCubeReport = "";

  if (classifications.length > 0 && inputRecords.length > 0) {
    spendCubeData = buildSpendCube(state);
    spendCubeReport = spendCubeData.textReport || "";
  }

  const summaryPrompt = buildSummaryPrompt(state, spendCubeReport);

  const messages = [
    new SystemMessage(SUPERVISOR_SYSTEM_PROMPT),
    ...state.messages,
    new HumanMessage(summaryPrompt),
  ];

  try {
    const response = await model.invoke(messages);
    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    // AI summary only - the SpendCubeOutput component handles visual display
    // The text report is still available in spendCubeData.textReport for fallback
    return {
      messages: [new AIMessage(content)],
      summary: content,
      spendCube: spendCubeData,
      stage: isActuallyComplete ? "complete" : state.stage,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    // Fallback: show the text report if AI summary fails
    const fallbackContent = spendCubeReport
      ? `Processing complete.\n\n${spendCubeReport}`
      : `Processing complete with some issues. ${errorMessage}`;

    return {
      messages: [new AIMessage(fallbackContent)],
      spendCube: spendCubeData,
      stage: isActuallyComplete ? "complete" : "error",
    };
  }
}

/**
 * Build summary prompt for final response
 * Includes Spend Cube data for multi-dimensional analysis
 */
function buildSummaryPrompt(state: SpendCubeStateType, spendCubeReport: string = ""): string {
  const {
    inputRecords,
    classifications,
    qaResults,
    hitlQueue,
    errors,
  } = state;

  const parts: string[] = [];

  parts.push("You are presenting Spend Cube analysis results to a procurement professional.");
  parts.push("The Spend Cube shows WHO (departments) × WHAT (categories) × FROM WHOM (vendors).");
  parts.push("");
  parts.push("Provide a brief executive summary highlighting:");
  parts.push("1. Key findings from the dimensional analysis");
  parts.push("2. Top savings opportunities");
  parts.push("3. Risk areas requiring attention");
  parts.push("4. Recommended next steps");
  parts.push("");

  parts.push(`## Processing Statistics`);
  parts.push(`- Total Records Processed: ${inputRecords.length}`);
  parts.push(`- Successfully Classified: ${classifications.length}`);
  parts.push(`- QA Reviewed: ${qaResults.length}`);
  parts.push(`- Queued for Human Review: ${hitlQueue.length}`);
  if (errors.length > 0) {
    parts.push(`- Errors: ${errors.length}`);
  }

  if (qaResults.length > 0) {
    const approved = qaResults.filter(q => q.verdict === "approved").length;
    const flagged = qaResults.filter(q => q.verdict === "flagged").length;
    const rejected = qaResults.filter(q => q.verdict === "rejected").length;
    parts.push(`\n## Quality Assurance Results`);
    parts.push(`- Approved: ${approved} (${((approved / qaResults.length) * 100).toFixed(0)}%)`);
    parts.push(`- Flagged for Review: ${flagged}`);
    parts.push(`- Rejected: ${rejected}`);
  }

  if (hitlQueue.length > 0) {
    parts.push(`\n## Items Requiring Human Review`);
    const pendingItems = hitlQueue.filter(h => h.status === "pending");
    pendingItems.slice(0, 5).forEach((item) => {
      parts.push(`- ${item.context.vendor}: ${item.context.description} (Reason: ${item.reason})`);
    });
    if (pendingItems.length > 5) {
      parts.push(`- ... and ${pendingItems.length - 5} more items`);
    }
  }

  if (spendCubeReport) {
    parts.push(`\n## Spend Cube Analysis (included below)`);
    parts.push("The detailed Spend Cube report follows. Summarize the key insights for the executive summary.");
  }

  parts.push(`\nProvide a concise executive summary (3-5 paragraphs) with actionable insights.`);
  parts.push(`The full Spend Cube report will be appended after your summary.`);

  return parts.join("\n");
}

export { routeFromSupervisor, getRoutingDecision } from "./router";
