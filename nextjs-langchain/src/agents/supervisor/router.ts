import type { SpendCubeStateType } from "@/types";

/**
 * Routing targets for the supervisor
 */
export type RouteTarget =
  | "extraction"
  | "cleansing"
  | "normalization"
  | "classification"
  | "qa"
  | "enrichment"
  | "hitl"
  | "analysis"
  | "respond"
  | "end";

/**
 * Routing decision result
 */
export interface RoutingResult {
  target: RouteTarget;
  reason: string;
}

/**
 * Pipeline stages and their completion criteria
 */
interface PipelineStatus {
  hasRecords: boolean;
  needsClassification: boolean;
  needsQA: boolean;
  needsHITL: boolean;
  needsEnrichment: boolean;
  isComplete: boolean;
}

/**
 * Analyze pipeline status
 */
function getPipelineStatus(state: SpendCubeStateType): PipelineStatus {
  const { inputRecords, classifications, qaResults, hitlQueue, hitlDecisions } = state;

  const hasRecords = inputRecords.length > 0;

  const unclassifiedCount = inputRecords.filter(
    (r) => !classifications.some((c) => c.recordId === r.id)
  ).length;

  const unvalidatedCount = classifications.filter(
    (c) => !qaResults.some((qa) => qa.recordId === c.recordId)
  ).length;

  const flaggedWithoutHITL = qaResults.filter(
    (qa) =>
      (qa.verdict === "flagged" || qa.verdict === "rejected") &&
      !hitlQueue.some((h) => h.recordId === qa.recordId)
  ).length;

  const pendingHITL = hitlQueue.filter(
    (h) => !hitlDecisions.some((d) => d.itemId === h.id)
  ).length;

  // Check if enrichment is needed (classifications done but not enriched)
  const needsEnrichment = classifications.length > 0 &&
    qaResults.length >= classifications.length &&
    pendingHITL === 0;

  return {
    hasRecords,
    needsClassification: unclassifiedCount > 0,
    needsQA: unvalidatedCount > 0 && unclassifiedCount === 0,
    needsHITL: flaggedWithoutHITL > 0 || pendingHITL > 0,
    needsEnrichment,
    isComplete: hasRecords &&
      unclassifiedCount === 0 &&
      unvalidatedCount === 0 &&
      flaggedWithoutHITL === 0 &&
      pendingHITL === 0,
  };
}

/**
 * Determine the next node based on current state
 */
export function routeFromSupervisor(state: SpendCubeStateType): RouteTarget {
  const { stage, errors, userQuery } = state;

  // Check for errors that need handling
  if (errors.length > 0 && stage === "error") {
    return "respond";
  }

  // Get pipeline status
  const status = getPipelineStatus(state);

  // Check if this is an analysis request
  const isAnalysisRequest = /analyz|savings|risk|trend|insight|benchmark/i.test(userQuery || "");

  // Stage-based routing with pipeline awareness
  switch (stage) {
    case "idle": {
      if (!status.hasRecords) {
        return "respond";
      }
      if (status.needsClassification) {
        return "classification";
      }
      if (status.needsQA) {
        return "qa";
      }
      if (status.needsHITL) {
        return "hitl";
      }
      if (isAnalysisRequest && status.isComplete) {
        return "analysis"; // Route to analysis router for analysis queries
      }
      return "respond";
    }

    case "classifying": {
      // If there are still unclassified records, stay in classification
      if (status.needsClassification) {
        return "classification";
      }
      if (status.needsQA) {
        return "qa";
      }
      return "respond";
    }

    case "qa": {
      if (status.needsHITL) {
        return "hitl";
      }
      if (status.needsEnrichment) {
        return "enrichment";
      }
      return "respond";
    }

    case "hitl": {
      // After HITL, check if we need enrichment or respond
      if (status.needsEnrichment) {
        return "enrichment";
      }
      return "respond";
    }

    case "analyzing": {
      return "respond";
    }

    case "complete":
    case "error":
    default:
      return "end";
  }
}

/**
 * Get detailed routing decision with reason
 */
export function getRoutingDecision(state: SpendCubeStateType): RoutingResult {
  const { inputRecords, classifications, qaResults, hitlQueue, hitlDecisions, stage, errors, userQuery } = state;

  // Error handling
  if (errors.length > 0 && stage === "error") {
    return {
      target: "respond",
      reason: `Handling ${errors.length} error(s) - will provide user feedback`,
    };
  }

  const status = getPipelineStatus(state);
  const isAnalysisRequest = /analyz|savings|risk|trend|insight|benchmark/i.test(userQuery || "");

  // Stage-based routing with detailed reasons
  switch (stage) {
    case "idle": {
      if (!status.hasRecords) {
        return {
          target: "respond",
          reason: "No records to process - ready to respond to user",
        };
      }

      const unclassifiedCount = inputRecords.filter(
        (r) => !classifications.some((c) => c.recordId === r.id)
      ).length;

      if (unclassifiedCount > 0) {
        return {
          target: "classification",
          reason: `${unclassifiedCount} record(s) need UNSPSC classification`,
        };
      }

      if (status.needsQA) {
        return {
          target: "qa",
          reason: `${classifications.length - qaResults.length} classification(s) need QA validation`,
        };
      }

      if (status.needsHITL) {
        return {
          target: "hitl",
          reason: "Items flagged for human review",
        };
      }

      if (isAnalysisRequest && status.isComplete) {
        return {
          target: "analysis",
          reason: "Routing to analysis engine for spend insights",
        };
      }

      return {
        target: "respond",
        reason: "Processing complete - providing summary",
      };
    }

    case "classifying": {
      // If there are still unclassified records, stay in classification
      const unclassifiedCount = inputRecords.filter(
        (r) => !classifications.some((c) => c.recordId === r.id)
      ).length;
      if (unclassifiedCount > 0) {
        return {
          target: "classification",
          reason: `${unclassifiedCount} record(s) still need classification`,
        };
      }

      const needsQACount = classifications.filter(
        (c) => !qaResults.some((qa) => qa.recordId === c.recordId)
      ).length;
      if (needsQACount > 0) {
        return {
          target: "qa",
          reason: `${needsQACount} classification(s) need QA validation`,
        };
      }
      return {
        target: "respond",
        reason: "All classifications have been validated",
      };
    }

    case "qa": {
      const flaggedCount = qaResults.filter(
        (qa) =>
          (qa.verdict === "flagged" || qa.verdict === "rejected") &&
          !hitlQueue.some((h) => h.recordId === qa.recordId)
      ).length;
      if (flaggedCount > 0) {
        return {
          target: "hitl",
          reason: `${flaggedCount} item(s) flagged for human review`,
        };
      }

      if (status.needsEnrichment) {
        return {
          target: "enrichment",
          reason: "Adding business context to classifications",
        };
      }

      return {
        target: "respond",
        reason: "QA complete - all items passed or queued for review",
      };
    }

    case "hitl": {
      const pendingCount = hitlQueue.filter(
        (h) => !hitlDecisions.some((d) => d.itemId === h.id)
      ).length;

      if (pendingCount > 0) {
        return {
          target: "respond",
          reason: `${pendingCount} item(s) awaiting human review`,
        };
      }

      if (status.needsEnrichment) {
        return {
          target: "enrichment",
          reason: "HITL complete - proceeding to enrichment",
        };
      }

      return {
        target: "respond",
        reason: "HITL decisions processed - summarizing results",
      };
    }

    case "analyzing":
      return {
        target: "respond",
        reason: "Analysis complete - presenting results",
      };

    case "complete":
      return {
        target: "end",
        reason: "Processing complete",
      };

    case "error":
      return {
        target: "end",
        reason: "Ending due to unrecoverable error",
      };

    default:
      return {
        target: "respond",
        reason: "Unknown state - providing user response",
      };
  }
}
