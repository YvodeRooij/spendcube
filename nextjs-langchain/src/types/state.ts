import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import type { SpendRecord, Classification, QAResult, ProcessedRecord } from "./records";
import type { HITLItem, HITLDecision } from "./hitl";
import type { AgentTask, AgentResult, AgentError, RoutingDecision, AgentType } from "./agents";

/**
 * Spend Cube dimension data (WHO, WHAT, FROM WHOM aggregations)
 */
export interface SpendCubeDimension {
  name: string;
  value: number;
  percentage: number;
  recordCount: number;
}

/**
 * Enhanced vendor dimension with additional metadata
 */
export interface VendorDimensionItem extends SpendCubeDimension {
  categoryCount: number;
  isStrategic: boolean;
}

/**
 * Spend Cube insight (savings, risk, compliance, quality)
 */
export interface SpendCubeInsight {
  type: "savings" | "risk" | "compliance" | "quality";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  impactAmount?: number;
  actionable?: boolean;
  category?: string;
  vendor?: string;
}

/**
 * Monday Morning Action - single most impactful recommendation
 */
export interface MondayMorningAction {
  title: string;
  description: string;
  dollarImpact: number;
  actionType: "consolidate" | "negotiate" | "compliance" | "review";
  targetEntity?: string;
}

/**
 * Executive Summary - 10-second scan metrics
 */
export interface ExecutiveSummary {
  headline: string;
  totalSpend: number;
  addressableSavings: number;
  savingsPercent: number;
  topVendorConcentration: {
    vendor: string;
    percent: number;
  };
  maverickSpend: {
    percent: number;
    dollars: number;
  };
  dataQualityGrade: "A" | "B" | "C" | "D" | "F";
  mondayMorningAction: MondayMorningAction;
}

/**
 * Data quality metrics
 */
export interface DataQualityMetrics {
  classifiedRate: number;
  highConfidenceRate: number;
  withPORate: number;
  normalizedVendors: number;
  itemsNeedingReview: number;
}

/**
 * Insights summary with totals
 */
export interface InsightsSummary {
  savings: SpendCubeInsight[];
  risks: SpendCubeInsight[];
  compliance: SpendCubeInsight[];
  quality: SpendCubeInsight[];
  total: number;
  totalDollarImpact: number;
}

/**
 * Spend Cube data structure (WHO × WHAT × FROM WHOM)
 * McKinsey-quality structured output
 */
export interface SpendCubeData {
  // Executive Summary (10-second scan)
  executiveSummary: ExecutiveSummary;

  // Basic summary stats (legacy compatibility)
  summary: {
    totalSpend: number;
    totalRecords: number;
    uniqueVendors: number;
    uniqueCategories: number;
    uniqueDepartments: number;
  };

  // Dimensional Views (WHO × WHAT × FROM WHOM)
  dimensions: {
    byDepartment: SpendCubeDimension[];
    byCategory: SpendCubeDimension[];
    byVendor: VendorDimensionItem[];
  };

  // Cross-dimensional analysis
  crossDimensional: {
    topCategoryByDepartment: Record<string, { category: string; amount: number }>;
    topVendorByCategory: Record<string, { vendor: string; amount: number }>;
  };

  // Data quality metrics
  dataQuality: DataQualityMetrics;

  // Actionable insights with $ impact
  insights: InsightsSummary;

  // Text report (for chat display)
  textReport?: string;
}

/**
 * Token usage tracking per agent
 */
export interface TokenUsage {
  agentType: AgentType;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: string;
}

/**
 * Token budget configuration and tracking
 */
export interface TokenBudget {
  /** Maximum tokens allowed for the session */
  maxTokens: number;
  /** Tokens used so far */
  usedTokens: number;
  /** Token usage by agent type */
  byAgent: Record<AgentType, { prompt: number; completion: number; total: number }>;
  /** Warning threshold (0-1, percentage of budget) */
  warningThreshold: number;
  /** Whether budget has been exceeded */
  exceeded: boolean;
}

/**
 * SpendCube AI Graph State Definition
 *
 * Uses Annotation.Root with reducers for proper state management
 * in the LangGraph multi-agent system.
 */
export const SpendCubeState = Annotation.Root({
  // Conversation messages (append-only with reducer)
  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Input records to process
  inputRecords: Annotation<SpendRecord[]>({
    reducer: (_, update) => update, // Replace on update
    default: () => [],
  }),

  // Classification results (append-only)
  classifications: Annotation<Classification[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // QA results (append-only)
  qaResults: Annotation<QAResult[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Processed records with combined data
  processedRecords: Annotation<ProcessedRecord[]>({
    reducer: (current, update) => {
      // Merge by record ID, updating existing records
      const recordMap = new Map(current.map(r => [r.record.id, r]));
      for (const record of update) {
        recordMap.set(record.record.id, record);
      }
      return Array.from(recordMap.values());
    },
    default: () => [],
  }),

  // HITL queue items
  hitlQueue: Annotation<HITLItem[]>({
    reducer: (current, update) => {
      // Merge by item ID
      const itemMap = new Map(current.map(i => [i.id, i]));
      for (const item of update) {
        itemMap.set(item.id, item);
      }
      return Array.from(itemMap.values());
    },
    default: () => [],
  }),

  // HITL decisions made
  hitlDecisions: Annotation<HITLDecision[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Pending tasks for agents
  pendingTasks: Annotation<AgentTask[]>({
    reducer: (current, update) => {
      // Replace tasks with same ID, add new ones
      const taskMap = new Map(current.map(t => [t.id, t]));
      for (const task of update) {
        taskMap.set(task.id, task);
      }
      return Array.from(taskMap.values());
    },
    default: () => [],
  }),

  // Completed task results
  taskResults: Annotation<AgentResult[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Errors encountered
  errors: Annotation<AgentError[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Current routing decision
  currentRoute: Annotation<RoutingDecision | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Workflow stage tracking
  stage: Annotation<"idle" | "classifying" | "qa" | "hitl" | "enriching" | "analyzing" | "complete" | "error">({
    reducer: (_, update) => update,
    default: () => "idle",
  }),

  // Session metadata
  sessionId: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  // User query or command
  userQuery: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  // Summary of processing results
  summary: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  // Spend Cube analysis results (WHO × WHAT × FROM WHOM)
  spendCube: Annotation<SpendCubeData | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Token usage tracking (append-only for audit trail)
  tokenUsage: Annotation<TokenUsage[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Token budget tracking
  tokenBudget: Annotation<TokenBudget>({
    reducer: (current, update) => ({
      ...current,
      ...update,
      usedTokens: current.usedTokens + (update.usedTokens || 0),
      byAgent: {
        ...current.byAgent,
        ...update.byAgent,
      },
      exceeded: (current.usedTokens + (update.usedTokens || 0)) >= current.maxTokens,
    }),
    default: () => ({
      maxTokens: 1000000, // 1M token default budget
      usedTokens: 0,
      byAgent: {
        supervisor: { prompt: 0, completion: 0, total: 0 },
        classification: { prompt: 0, completion: 0, total: 0 },
        qa: { prompt: 0, completion: 0, total: 0 },
        analysis: { prompt: 0, completion: 0, total: 0 },
        hitl: { prompt: 0, completion: 0, total: 0 },
      },
      warningThreshold: 0.8,
      exceeded: false,
    }),
  }),
});

/**
 * Type inference from the state annotation
 */
export type SpendCubeStateType = typeof SpendCubeState.State;

/**
 * Input type for invoking the graph
 */
export type SpendCubeInput = Partial<SpendCubeStateType>;

/**
 * Output type from graph execution
 */
export type SpendCubeOutput = SpendCubeStateType;
