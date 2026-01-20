import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  getSpendCubeGraph,
  createInitialState,
  createStateWithRecords,
} from "@/agents";
import { SpendRecordSchema, type SpendCubeInput, type AgentNodeType } from "@/types";
import { progressEmitter, createProgressCallback } from "@/lib/progress-emitter";

/**
 * SpendCube Graph API Endpoint
 *
 * Supports both regular POST and streaming SSE responses
 */

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/graph
 *
 * Request body:
 * {
 *   message: string;           // User message
 *   threadId?: string;         // Thread ID for conversation continuity
 *   records?: SpendRecord[];   // Optional records to process
 *   stream?: boolean;          // Whether to use SSE streaming (default: true)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, threadId, records, stream = true } = body;

    if (!message) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const sessionId = threadId || uuidv4();

    // Validate records if provided
    let validatedRecords = undefined;
    if (records && Array.isArray(records)) {
      try {
        validatedRecords = records.map((r) => SpendRecordSchema.parse(r));
      } catch (validationError) {
        return new Response(
          JSON.stringify({
            error: "Invalid record format",
            details: validationError,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Create initial state
    const initialState = validatedRecords
      ? createStateWithRecords(message, validatedRecords, sessionId)
      : createInitialState(message, sessionId);

    const config = {
      configurable: {
        thread_id: sessionId,
      },
    };

    if (stream) {
      return createStreamingResponse(initialState, config);
    } else {
      return createNonStreamingResponse(initialState, config);
    }
  } catch (error) {
    console.error("Graph API error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * Map stage to node type
 */
function stageToNode(stage: string): AgentNodeType {
  const stageMap: Record<string, AgentNodeType> = {
    idle: "supervisor",
    classifying: "classification",
    qa: "qa",
    hitl: "hitl",
    enriching: "enrichment",
    analyzing: "analysis",
    complete: "response",
    error: "supervisor",
  };
  return stageMap[stage] || "supervisor";
}

/**
 * Create a streaming SSE response
 */
function createStreamingResponse(
  initialState: SpendCubeInput,
  config: { configurable: { thread_id: string } }
) {
  const encoder = new TextEncoder();
  const sessionId = config.configurable.thread_id;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Subscribe to progress events from classification node
      const progressCallback = createProgressCallback(sessionId, sendEvent);
      progressEmitter.subscribe(sessionId, progressCallback);

      let previousStage = "";
      let previousClassificationsCount = 0;
      let previousQACount = 0;
      const startTime = Date.now();

      try {
        const graph = getSpendCubeGraph();

        // Send initial event
        sendEvent("start", {
          threadId: config.configurable.thread_id,
          timestamp: new Date().toISOString(),
        });

        // Send initial node status
        sendEvent("node_status", {
          type: "status",
          id: uuidv4(),
          node: "supervisor",
          status: "started",
          message: "Starting SpendCube AI pipeline",
          timestamp: new Date().toISOString(),
        });

        // Stream graph execution
        const graphStream = await graph.stream(initialState, {
          ...config,
          streamMode: "values",
        });

        for await (const state of graphStream) {
          const currentStage = state.stage || "idle";
          const currentNode = stageToNode(currentStage);
          const classificationsCount = state.classifications?.length || 0;
          const qaCount = state.qaResults?.length || 0;
          const totalRecords = state.inputRecords?.length || 0;

          // Emit node status change
          if (currentStage !== previousStage) {
            // Complete previous node
            if (previousStage) {
              sendEvent("node_status", {
                type: "status",
                id: uuidv4(),
                node: stageToNode(previousStage),
                status: "completed",
                message: `Completed ${previousStage}`,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString(),
              });
            }

            // Start new node
            sendEvent("node_status", {
              type: "status",
              id: uuidv4(),
              node: currentNode,
              status: "started",
              message: getNodeStartMessage(currentStage, totalRecords),
              timestamp: new Date().toISOString(),
            });

            previousStage = currentStage;
          }

          // Emit classification progress
          if (classificationsCount > previousClassificationsCount && totalRecords > 0) {
            const progress = Math.round((classificationsCount / totalRecords) * 100);
            sendEvent("progress", {
              type: "progress",
              id: uuidv4(),
              node: "classification",
              step: classificationsCount,
              totalSteps: totalRecords,
              message: `Classifying records`,
              progress,
              detail: `${classificationsCount} of ${totalRecords} records classified`,
              timestamp: new Date().toISOString(),
            });

            // Emit individual classification event for last classified item
            if (state.classifications && state.classifications.length > 0) {
              const lastClassification = state.classifications[state.classifications.length - 1];
              const record = state.inputRecords?.find((r: { id: string }) => r.id === lastClassification.recordId);
              if (record) {
                sendEvent("classification", {
                  type: "classification",
                  id: uuidv4(),
                  recordId: lastClassification.recordId,
                  vendor: record.vendor,
                  description: record.description,
                  category: lastClassification.unspscTitle,
                  confidence: lastClassification.confidence,
                  status: "completed",
                  timestamp: new Date().toISOString(),
                });
              }
            }

            previousClassificationsCount = classificationsCount;
          }

          // Emit QA progress
          if (qaCount > previousQACount && classificationsCount > 0) {
            const progress = Math.round((qaCount / classificationsCount) * 100);
            sendEvent("progress", {
              type: "progress",
              id: uuidv4(),
              node: "qa",
              step: qaCount,
              totalSteps: classificationsCount,
              message: `Validating classifications`,
              progress,
              detail: `${qaCount} of ${classificationsCount} classifications validated`,
              timestamp: new Date().toISOString(),
            });
            previousQACount = qaCount;
          }

          // Send state updates
          sendEvent("state", {
            stage: state.stage,
            messagesCount: state.messages?.length || 0,
            classificationsCount,
            qaResultsCount: qaCount,
            hitlQueueCount: state.hitlQueue?.length || 0,
          });

          // Send new messages
          if (state.messages && state.messages.length > 0) {
            const lastMessage = state.messages[state.messages.length - 1];
            if (lastMessage) {
              sendEvent("message", {
                type: lastMessage._getType(),
                content: lastMessage.content,
              });
            }
          }
        }

        // Get final state
        const finalState = await graph.getState(config);

        // Emit analysis node status if we have spend cube data
        if (finalState.values?.spendCube) {
          sendEvent("node_status", {
            type: "status",
            id: uuidv4(),
            node: "analysis",
            status: "started",
            message: "Building Spend Cube analysis",
            timestamp: new Date().toISOString(),
          });

          // Emit insights as they're "discovered"
          const insights = finalState.values.spendCube.insights;
          if (insights) {
            const allInsights = [
              ...insights.savings,
              ...insights.risks,
              ...insights.compliance,
            ];
            for (const insight of allInsights.slice(0, 5)) {
              sendEvent("insight", {
                type: "insight",
                id: uuidv4(),
                insightType: insight.type,
                severity: insight.severity,
                title: insight.title,
                dollarImpact: insight.impactAmount,
                timestamp: new Date().toISOString(),
              });
            }
          }

          sendEvent("node_status", {
            type: "status",
            id: uuidv4(),
            node: "analysis",
            status: "completed",
            message: "Spend Cube analysis complete",
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          });

          // Send spend cube data
          sendEvent("spendcube", {
            data: finalState.values.spendCube,
            format: "structured",
          });
        }

        // Final response node
        sendEvent("node_status", {
          type: "status",
          id: uuidv4(),
          node: "response",
          status: "completed",
          message: "Pipeline complete",
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        });

        sendEvent("complete", {
          threadId: config.configurable.thread_id,
          finalState: {
            stage: finalState.values?.stage,
            summary: finalState.values?.summary,
            classificationsCount: finalState.values?.classifications?.length || 0,
            qaResultsCount: finalState.values?.qaResults?.length || 0,
            hitlQueueCount: finalState.values?.hitlQueue?.length || 0,
            errorsCount: finalState.values?.errors?.length || 0,
            hasSpendCube: !!finalState.values?.spendCube,
          },
        });
      } catch (error) {
        sendEvent("node_status", {
          type: "status",
          id: uuidv4(),
          node: "supervisor",
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        });
        sendEvent("error", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        // Unsubscribe from progress events
        progressEmitter.unsubscribe(sessionId);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Get human-friendly message for node start
 */
function getNodeStartMessage(stage: string, totalRecords: number): string {
  switch (stage) {
    case "idle":
      return "Analyzing request...";
    case "classifying":
      return `Classifying ${totalRecords} records with UNSPSC taxonomy`;
    case "qa":
      return "Running quality assurance checks";
    case "hitl":
      return "Preparing items for human review";
    case "enriching":
      return "Enriching data with business context";
    case "analyzing":
      return "Building Spend Cube analysis";
    case "complete":
      return "Generating response";
    default:
      return `Processing (${stage})...`;
  }
}

/**
 * Create a non-streaming JSON response
 */
async function createNonStreamingResponse(
  initialState: SpendCubeInput,
  config: { configurable: { thread_id: string } }
) {
  const graph = getSpendCubeGraph();
  const result = await graph.invoke(initialState, config);

  return new Response(
    JSON.stringify({
      threadId: config.configurable.thread_id,
      stage: result.stage,
      summary: result.summary,
      messages: result.messages?.map((m) => ({
        type: m._getType(),
        content: m.content,
      })),
      classifications: result.classifications,
      qaResults: result.qaResults,
      hitlQueue: result.hitlQueue,
      errors: result.errors,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * GET /api/graph
 *
 * Health check and info endpoint
 */
export async function GET() {
  return new Response(
    JSON.stringify({
      status: "ok",
      name: "SpendCube AI Graph API",
      version: "1.0.0",
      endpoints: {
        POST: {
          description: "Execute the SpendCube AI graph",
          body: {
            message: "string (required)",
            threadId: "string (optional)",
            records: "SpendRecord[] (optional)",
            stream: "boolean (default: true)",
          },
        },
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
