import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { createSupervisorModel } from "@/lib/langchain/models";
import type { SpendCubeStateType, AnalysisType } from "@/types";

/**
 * Analysis Types supported by the router
 */
export const ANALYSIS_TYPES: Record<AnalysisType, {
  name: string;
  description: string;
  keywords: string[];
  requiredData: ("classifications" | "qaResults" | "inputRecords")[];
}> = {
  savings: {
    name: "Savings Analysis",
    description: "Identify cost reduction opportunities, consolidation, and negotiation leverage",
    keywords: ["savings", "cost reduction", "consolidation", "negotiate", "spend less", "cut costs", "optimize", "reduce"],
    requiredData: ["classifications", "inputRecords"],
  },
  risk: {
    name: "Risk Analysis",
    description: "Identify supplier risks, concentration risks, and compliance risks",
    keywords: ["risk", "supplier risk", "concentration", "dependency", "single source", "exposure", "vulnerability"],
    requiredData: ["classifications", "inputRecords"],
  },
  compliance: {
    name: "Compliance Analysis",
    description: "Check policy compliance, preferred vendor usage, and maverick spend",
    keywords: ["compliance", "policy", "preferred", "maverick", "contract", "approved", "violation"],
    requiredData: ["classifications", "inputRecords"],
  },
  trend: {
    name: "Trend Analysis",
    description: "Analyze spending trends over time, seasonality, and growth patterns",
    keywords: ["trend", "over time", "growth", "change", "increase", "decrease", "pattern", "seasonal", "historical"],
    requiredData: ["classifications", "inputRecords"],
  },
  benchmark: {
    name: "Benchmark Analysis",
    description: "Compare spend against industry benchmarks and internal targets",
    keywords: ["benchmark", "compare", "industry", "best practice", "standard", "peer", "target"],
    requiredData: ["classifications", "inputRecords"],
  },
};

/**
 * Analysis request parsed from user query
 */
export interface AnalysisRequest {
  type: AnalysisType;
  priority: number;
  focus?: string;
  filters?: {
    category?: string;
    vendor?: string;
    department?: string;
    timeRange?: string;
  };
}

/**
 * Analysis routing decision
 */
export interface AnalysisRoutingDecision {
  requests: AnalysisRequest[];
  parallelGroups: AnalysisRequest[][];
  estimatedComplexity: "simple" | "moderate" | "complex";
  reasoning: string;
}

const ROUTER_SYSTEM_PROMPT = `You are the SpendCube Analysis Router, responsible for parsing user queries and determining which analysis types are needed.

## Your Role
Analyze the user's query about their spend data and determine:
1. What types of analysis are requested (can be multiple)
2. What filters or focus areas are specified
3. Priority order for the analyses

## Available Analysis Types
- **savings**: Cost reduction opportunities, consolidation, negotiation leverage
- **risk**: Supplier risks, concentration risks, compliance risks
- **compliance**: Policy compliance, preferred vendor usage, maverick spend
- **trend**: Spending patterns over time, seasonality, growth
- **benchmark**: Comparisons against industry standards or internal targets

## Query Decomposition Rules
1. A single query can request multiple analyses (e.g., "savings and risks" → savings + risk)
2. General queries like "analyze my spend" should include: savings, risk, compliance
3. "How am I doing" or "overview" queries should include all analysis types
4. Extract any specific filters mentioned (vendor, category, department, time range)

## Output Format
Return a JSON object with analysis requests:
{
  "requests": [
    {
      "type": "savings" | "risk" | "compliance" | "trend" | "benchmark",
      "priority": 1-5 (1=highest),
      "focus": "optional specific focus area",
      "filters": {
        "category": "optional category filter",
        "vendor": "optional vendor filter",
        "department": "optional department filter",
        "timeRange": "optional time range"
      }
    }
  ],
  "reasoning": "explanation of your routing decision"
}`;

/**
 * Parse user query and determine analysis types needed
 */
export async function routeAnalysisQuery(
  query: string,
  state: SpendCubeStateType
): Promise<AnalysisRoutingDecision> {
  // First, try rule-based routing for common patterns
  const ruleBasedDecision = tryRuleBasedRouting(query);
  if (ruleBasedDecision) {
    return ruleBasedDecision;
  }

  // Use AI for complex queries
  const model = createSupervisorModel();

  const contextInfo = `
Current data context:
- ${state.inputRecords.length} spend records
- ${state.classifications.length} classified records
- ${new Set(state.inputRecords.map(r => r.vendor)).size} unique vendors
- Total spend: $${state.inputRecords.reduce((sum, r) => sum + r.amount, 0).toLocaleString()}
`;

  const messages = [
    new SystemMessage(ROUTER_SYSTEM_PROMPT),
    new HumanMessage(`${contextInfo}\n\nUser query: "${query}"\n\nDetermine which analyses are needed and return the routing decision as JSON.`),
  ];

  const response = await model.invoke(messages);
  const content = typeof response.content === "string"
    ? response.content
    : JSON.stringify(response.content);

  // Parse the JSON response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Default to comprehensive analysis
    return createDefaultRouting(query);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const requests = validateRequests(parsed.requests || []);

    return {
      requests,
      parallelGroups: groupForParallelExecution(requests),
      estimatedComplexity: estimateComplexity(requests, state),
      reasoning: parsed.reasoning || "AI-determined routing",
    };
  } catch {
    return createDefaultRouting(query);
  }
}

/**
 * Try rule-based routing for common query patterns
 */
function tryRuleBasedRouting(query: string): AnalysisRoutingDecision | null {
  const queryLower = query.toLowerCase();
  const requests: AnalysisRequest[] = [];

  // Check for specific analysis keywords
  for (const [type, config] of Object.entries(ANALYSIS_TYPES)) {
    const matchScore = config.keywords.filter(kw => queryLower.includes(kw)).length;
    if (matchScore > 0) {
      requests.push({
        type: type as AnalysisType,
        priority: matchScore,
      });
    }
  }

  // If no specific matches, check for general patterns
  if (requests.length === 0) {
    if (/overview|summary|analyze|report|insight/i.test(query)) {
      // General analysis request - return all types
      return {
        requests: [
          { type: "savings", priority: 1 },
          { type: "risk", priority: 2 },
          { type: "compliance", priority: 3 },
          { type: "trend", priority: 4 },
        ],
        parallelGroups: [
          [{ type: "savings", priority: 1 }, { type: "risk", priority: 2 }],
          [{ type: "compliance", priority: 3 }, { type: "trend", priority: 4 }],
        ],
        estimatedComplexity: "moderate",
        reasoning: "General analysis request detected, running core analysis types",
      };
    }
    return null; // Let AI handle it
  }

  // Sort by priority
  requests.sort((a, b) => b.priority - a.priority);

  return {
    requests,
    parallelGroups: groupForParallelExecution(requests),
    estimatedComplexity: requests.length > 2 ? "complex" : "simple",
    reasoning: `Rule-based routing: matched ${requests.map(r => r.type).join(", ")}`,
  };
}

/**
 * Create default routing for unrecognized queries
 */
function createDefaultRouting(query: string): AnalysisRoutingDecision {
  return {
    requests: [
      { type: "savings", priority: 1 },
      { type: "risk", priority: 2 },
    ],
    parallelGroups: [[
      { type: "savings", priority: 1 },
      { type: "risk", priority: 2 },
    ]],
    estimatedComplexity: "simple",
    reasoning: `Default routing for query: "${query.substring(0, 50)}..."`,
  };
}

/**
 * Validate and normalize analysis requests
 */
function validateRequests(requests: unknown[]): AnalysisRequest[] {
  const validTypes = Object.keys(ANALYSIS_TYPES);
  const validated: AnalysisRequest[] = [];

  for (const req of requests) {
    if (typeof req !== "object" || req === null) continue;
    const r = req as Record<string, unknown>;

    if (typeof r.type === "string" && validTypes.includes(r.type)) {
      validated.push({
        type: r.type as AnalysisType,
        priority: typeof r.priority === "number" ? r.priority : validated.length + 1,
        focus: typeof r.focus === "string" ? r.focus : undefined,
        filters: r.filters as AnalysisRequest["filters"],
      });
    }
  }

  return validated;
}

/**
 * Group requests for parallel execution
 * Analyses that don't depend on each other can run in parallel
 */
function groupForParallelExecution(requests: AnalysisRequest[]): AnalysisRequest[][] {
  if (requests.length <= 2) {
    return [requests];
  }

  // Group by priority tiers
  const groups: AnalysisRequest[][] = [];
  const sorted = [...requests].sort((a, b) => a.priority - b.priority);

  // Run up to 3 analyses in parallel per group
  for (let i = 0; i < sorted.length; i += 3) {
    groups.push(sorted.slice(i, i + 3));
  }

  return groups;
}

/**
 * Estimate query complexity based on analysis types and data size
 */
function estimateComplexity(
  requests: AnalysisRequest[],
  state: SpendCubeStateType
): "simple" | "moderate" | "complex" {
  const dataSize = state.inputRecords.length;
  const numAnalyses = requests.length;

  if (numAnalyses === 1 && dataSize < 100) {
    return "simple";
  }

  if (numAnalyses <= 2 && dataSize < 500) {
    return "moderate";
  }

  return "complex";
}

/**
 * Check if state has required data for analysis
 */
export function hasRequiredDataForAnalysis(
  type: AnalysisType,
  state: SpendCubeStateType
): boolean {
  const config = ANALYSIS_TYPES[type];
  if (!config) return false;

  for (const required of config.requiredData) {
    if (required === "classifications" && state.classifications.length === 0) {
      return false;
    }
    if (required === "qaResults" && state.qaResults.length === 0) {
      return false;
    }
    if (required === "inputRecords" && state.inputRecords.length === 0) {
      return false;
    }
  }

  return true;
}

/**
 * Get analysis types that can be run with current data
 */
export function getAvailableAnalysisTypes(
  state: SpendCubeStateType
): AnalysisType[] {
  return (Object.keys(ANALYSIS_TYPES) as AnalysisType[]).filter(
    type => hasRequiredDataForAnalysis(type, state)
  );
}
