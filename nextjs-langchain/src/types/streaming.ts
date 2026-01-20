/**
 * Streaming Event Types for Real-time Tool Call Updates
 */

/**
 * Agent/node types in the pipeline
 */
export type AgentNodeType =
  | "supervisor"
  | "extraction"
  | "cleansing"
  | "normalization"
  | "classification"
  | "qa"
  | "enrichment"
  | "hitl"
  | "analysis"
  | "response";

/**
 * Progress event for long-running operations
 */
export interface ProgressEvent {
  type: "progress";
  id: string;
  node: AgentNodeType;
  step: number;
  totalSteps: number;
  message: string;
  progress: number; // 0-100
  detail?: string;
  timestamp: string;
}

/**
 * Status event for node start/completion
 */
export interface StatusEvent {
  type: "status";
  id: string;
  node: AgentNodeType;
  status: "started" | "running" | "completed" | "error";
  message: string;
  duration?: number; // ms
  recordsProcessed?: number;
  timestamp: string;
}

/**
 * Classification event for individual record classification
 */
export interface ClassificationEvent {
  type: "classification";
  id: string;
  recordId: string;
  vendor: string;
  description: string;
  category?: string;
  confidence?: number;
  status: "pending" | "processing" | "completed" | "error";
  timestamp: string;
}

/**
 * Insight event for analysis discoveries
 */
export interface InsightEvent {
  type: "insight";
  id: string;
  insightType: "savings" | "risk" | "compliance" | "quality";
  severity: "high" | "medium" | "low";
  title: string;
  dollarImpact?: number;
  timestamp: string;
}

/**
 * Union type for all streaming events
 */
export type StreamingEvent =
  | ProgressEvent
  | StatusEvent
  | ClassificationEvent
  | InsightEvent;

/**
 * Classification progress event (emitted by classification node)
 */
export interface ClassificationProgressEvent {
  type: "classification_progress";
  completed: number;
  total: number;
  latestRecord: {
    recordId: string;
    unspscCode: string;
    unspscTitle: string;
    confidence: number;
    reasoning?: string;
  };
  record: {
    id: string;
    vendor: string;
    description: string;
    amount: number;
  };
}

/**
 * Progress callback function type
 */
export type ProgressCallback = (event: ClassificationProgressEvent) => void;

/**
 * Type guards
 */
export function isProgressEvent(data: unknown): data is ProgressEvent {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    (data as ProgressEvent).type === "progress"
  );
}

export function isStatusEvent(data: unknown): data is StatusEvent {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    (data as StatusEvent).type === "status"
  );
}

export function isClassificationEvent(data: unknown): data is ClassificationEvent {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    (data as ClassificationEvent).type === "classification"
  );
}

export function isInsightEvent(data: unknown): data is InsightEvent {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    (data as InsightEvent).type === "insight"
  );
}

// nodeConfig moved to @/lib/node-config.ts for client-side usage
