import { StateGraph, END, START } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { SpendCubeState, type SpendCubeStateType } from "@/types";
import { getCheckpointer } from "@/lib/langchain/checkpointer";
import { supervisorNode, responseNode, routeFromSupervisor } from "./supervisor";
import { classificationNode } from "./classification";
import { qaNode } from "./qa";
import { extractionNode } from "./extraction";
import { cleansingNode } from "./cleansing";
import { normalizationNode } from "./normalization";
import { enrichmentNode } from "./enrichment";
import { hitlReviewNode, hasPendingHITL } from "./hitl";
import { analysisRouterNode } from "./analysis";

/**
 * Create the SpendCube AI Graph
 *
 * This graph implements a multi-agent workflow for procurement analytics:
 *
 * START → supervisor → [extraction|cleansing|normalization|classification|qa|hitl|enrichment|respond] → ... → END
 *
 * The supervisor orchestrates the workflow, routing to specialized agents
 * based on the current state and user requests.
 *
 * HITL (Human-in-the-Loop) uses LangGraph's interrupt mechanism for
 * pausing the graph when human review is needed.
 */
export function createSpendCubeGraph() {
  const workflow = new StateGraph(SpendCubeState)
    // Add nodes
    .addNode("supervisor", supervisorNode)
    .addNode("extraction", extractionNode)
    .addNode("cleansing", cleansingNode)
    .addNode("normalization", normalizationNode)
    .addNode("classification", classificationNode)
    .addNode("qa", qaNode)
    .addNode("enrichment", enrichmentNode)
    .addNode("hitl_review", hitlReviewNode)
    .addNode("analysis_router", analysisRouterNode)
    .addNode("respond", responseNode)

    // Entry point
    .addEdge(START, "supervisor")

    // Supervisor routes to appropriate agent
    .addConditionalEdges("supervisor", (state: SpendCubeStateType) => {
      const route = routeFromSupervisor(state);
      return route;
    }, {
      extraction: "extraction",
      cleansing: "cleansing",
      normalization: "normalization",
      classification: "classification",
      qa: "qa",
      enrichment: "enrichment",
      hitl: "hitl_review",
      analysis: "analysis_router",
      respond: "respond",
      end: END,
    })

    // Processing pipeline edges - return to supervisor for next decision
    .addEdge("extraction", "supervisor")
    .addEdge("cleansing", "supervisor")
    .addEdge("normalization", "supervisor")
    .addEdge("classification", "supervisor")
    .addEdge("qa", "supervisor")
    .addEdge("enrichment", "supervisor")
    .addEdge("analysis_router", "respond")

    // HITL edges - after human decision, return to supervisor
    .addConditionalEdges("hitl_review", (state: SpendCubeStateType) => {
      // If still pending HITL items, stay paused
      if (hasPendingHITL(state)) {
        return "respond"; // Show status while waiting
      }
      return "supervisor"; // Continue processing
    }, {
      supervisor: "supervisor",
      respond: "respond",
    })

    // Response ends the current interaction
    .addEdge("respond", END);

  // Compile with checkpointer for state persistence
  // Enable interrupt at hitl_review node for human-in-the-loop
  const checkpointer = getCheckpointer();
  return workflow.compile({
    checkpointer,
    interruptBefore: ["hitl_review"], // KEY: Enable HITL interrupt
  });
}

/**
 * Compiled graph instance (lazy initialization)
 */
let graphInstance: ReturnType<typeof createSpendCubeGraph> | null = null;

/**
 * Get the compiled SpendCube graph
 */
export function getSpendCubeGraph() {
  if (!graphInstance) {
    graphInstance = createSpendCubeGraph();
  }
  return graphInstance;
}

/**
 * Reset the graph instance (useful for testing)
 */
export function resetGraph(): void {
  graphInstance = null;
}

/**
 * Invoke the graph with input
 */
export async function invokeGraph(
  input: Partial<SpendCubeStateType>,
  config?: { configurable?: { thread_id?: string } }
) {
  const graph = getSpendCubeGraph();
  return graph.invoke(input, config);
}

/**
 * Stream the graph execution
 */
export async function* streamGraph(
  input: Partial<SpendCubeStateType>,
  config?: { configurable?: { thread_id?: string } }
) {
  const graph = getSpendCubeGraph();
  const stream = await graph.stream(input, {
    ...config,
    streamMode: "values",
  });

  for await (const chunk of stream) {
    yield chunk;
  }
}

/**
 * Stream messages from graph execution
 */
export async function* streamMessages(
  input: Partial<SpendCubeStateType>,
  config?: { configurable?: { thread_id?: string } }
) {
  const graph = getSpendCubeGraph();
  const stream = await graph.stream(input, {
    ...config,
    streamMode: "messages",
  });

  for await (const [message, metadata] of stream) {
    yield { message, metadata };
  }
}

/**
 * Resume graph execution with human decision
 * This is called after a HITL interrupt
 */
export async function resumeGraphWithDecision(
  threadId: string,
  decision: SpendCubeStateType["hitlDecisions"][0]
) {
  const graph = getSpendCubeGraph();

  // Resume the graph with the human decision
  return graph.invoke(
    { hitlDecisions: [decision] } as Partial<SpendCubeStateType>,
    {
      configurable: { thread_id: threadId },
    }
  );
}

/**
 * Get current graph state for a thread
 */
export async function getGraphState(threadId: string) {
  const graph = getSpendCubeGraph();
  const checkpointer = getCheckpointer();

  // Get the latest checkpoint for this thread
  const checkpoint = await checkpointer.get({
    configurable: { thread_id: threadId },
  });

  return checkpoint;
}

/**
 * Helper to create initial state from user message
 */
export function createInitialState(
  message: string,
  sessionId: string
): Partial<SpendCubeStateType> {
  return {
    messages: [new HumanMessage(message)],
    userQuery: message,
    sessionId,
    stage: "idle",
  };
}

/**
 * Helper to add records to process
 */
export function createStateWithRecords(
  message: string,
  records: SpendCubeStateType["inputRecords"],
  sessionId: string
): Partial<SpendCubeStateType> {
  return {
    messages: [new HumanMessage(message)],
    userQuery: message,
    inputRecords: records,
    sessionId,
    stage: "idle",
  };
}

// Re-export individual agents for direct use if needed
export { supervisorNode, responseNode } from "./supervisor";
export { classificationNode } from "./classification";
export { qaNode } from "./qa";
export { extractionNode } from "./extraction";
export { cleansingNode } from "./cleansing";
export { normalizationNode } from "./normalization";
export { enrichmentNode } from "./enrichment";
export { hitlReviewNode } from "./hitl";
export { analysisRouterNode } from "./analysis";
