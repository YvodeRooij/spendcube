import { z } from "zod";

/**
 * Available agent types in the SpendCube system
 */
export const AgentTypeSchema = z.enum([
  "supervisor",
  "classification",
  "qa",
  "analysis",
  "hitl",
]);

export type AgentType = z.infer<typeof AgentTypeSchema>;

/**
 * Task assigned by the supervisor to a subagent
 */
export const AgentTaskSchema = z.object({
  id: z.string(),
  type: AgentTypeSchema,
  description: z.string(),
  payload: z.record(z.string(), z.unknown()),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  createdAt: z.string(),
  deadline: z.string().optional(),
});

export type AgentTask = z.infer<typeof AgentTaskSchema>;

/**
 * Result returned by an agent after completing a task
 */
export const AgentResultSchema = z.object({
  taskId: z.string(),
  agentType: AgentTypeSchema,
  status: z.enum(["success", "partial", "failed"]),
  data: z.record(z.string(), z.unknown()).optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  metrics: z.object({
    processingTime: z.number(),
    tokensUsed: z.number().optional(),
    itemsProcessed: z.number().optional(),
  }).optional(),
  completedAt: z.string(),
});

export type AgentResult = z.infer<typeof AgentResultSchema>;

/**
 * Error from an agent during task execution
 */
export const AgentErrorSchema = z.object({
  taskId: z.string().optional(),
  agentType: AgentTypeSchema,
  code: z.enum([
    "INITIALIZATION_FAILED",
    "PROCESSING_ERROR",
    "TIMEOUT",
    "RATE_LIMIT",
    "INVALID_INPUT",
    "MODEL_ERROR",
    "TOOL_ERROR",
    "UNKNOWN",
  ]),
  message: z.string(),
  recoverable: z.boolean(),
  retryCount: z.number().default(0),
  maxRetries: z.number().default(3),
  details: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.string(),
});

export type AgentError = z.infer<typeof AgentErrorSchema>;

/**
 * Supervisor's routing decision for task distribution
 */
export const RoutingDecisionSchema = z.object({
  targetAgent: AgentTypeSchema,
  task: AgentTaskSchema,
  reason: z.string(),
  parallelWith: z.array(z.string()).optional(),
});

export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

/**
 * Analysis types supported by the analysis router
 */
export const AnalysisTypeSchema = z.enum([
  "savings",
  "risk",
  "compliance",
  "trend",
  "benchmark",
]);

export type AnalysisType = z.infer<typeof AnalysisTypeSchema>;
