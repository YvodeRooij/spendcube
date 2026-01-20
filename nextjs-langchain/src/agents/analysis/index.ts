import { AIMessage } from "@langchain/core/messages";
import type { SpendCubeStateType, AnalysisType } from "@/types";
import {
  routeAnalysisQuery,
  getAvailableAnalysisTypes,
  hasRequiredDataForAnalysis,
  type AnalysisRequest,
  type AnalysisRoutingDecision,
} from "./router";

/**
 * Analysis result from an analyzer agent
 */
export interface AnalysisResult {
  type: AnalysisType;
  title: string;
  summary: string;
  insights: Array<{
    category: string;
    finding: string;
    impact: "high" | "medium" | "low";
    recommendation?: string;
  }>;
  metrics: Record<string, number | string>;
  charts?: Array<{
    type: "bar" | "pie" | "line" | "table";
    title: string;
    data: unknown;
  }>;
  analyzedAt: string;
  recordsAnalyzed: number;
}

/**
 * Combined analysis response
 */
export interface AnalysisResponse {
  routing: AnalysisRoutingDecision;
  results: AnalysisResult[];
  summary: string;
  completedAt: string;
}

/**
 * Analysis Router Node
 *
 * Routes analysis queries to appropriate analyzer agents and
 * coordinates parallel execution of multiple analyses.
 */
export async function analysisRouterNode(
  state: SpendCubeStateType
): Promise<Partial<SpendCubeStateType>> {
  const { userQuery, inputRecords, classifications } = state;

  // Check if we have data to analyze
  if (inputRecords.length === 0) {
    return {
      messages: [
        new AIMessage("No spend data available for analysis. Please upload or classify some records first."),
      ],
      stage: "complete",
    };
  }

  // Check if classifications are complete
  if (classifications.length === 0) {
    return {
      messages: [
        new AIMessage("Records need to be classified before analysis. Please run classification first."),
      ],
      stage: "idle",
    };
  }

  // Get available analysis types based on current data
  const availableTypes = getAvailableAnalysisTypes(state);

  if (availableTypes.length === 0) {
    return {
      messages: [
        new AIMessage("Insufficient data for analysis. Please ensure records are classified."),
      ],
      stage: "complete",
    };
  }

  // Route the query to determine which analyses to run
  const routing = await routeAnalysisQuery(userQuery || "analyze spend", state);

  // Filter to only available analysis types
  const executableRequests = routing.requests.filter(
    req => hasRequiredDataForAnalysis(req.type, state)
  );

  if (executableRequests.length === 0) {
    return {
      messages: [
        new AIMessage(
          `Cannot perform requested analysis. Available analyses: ${availableTypes.join(", ")}`
        ),
      ],
      stage: "complete",
    };
  }

  // Execute analyses in parallel groups
  const results: AnalysisResult[] = [];

  for (const group of routing.parallelGroups) {
    const groupRequests = group.filter(req =>
      executableRequests.some(er => er.type === req.type)
    );

    if (groupRequests.length === 0) continue;

    // Execute group in parallel
    const groupResults = await Promise.all(
      groupRequests.map(req => executeAnalysis(req, state))
    );

    results.push(...groupResults.filter((r): r is AnalysisResult => r !== null));
  }

  // Generate combined summary
  const summary = generateAnalysisSummary(results);

  const response: AnalysisResponse = {
    routing,
    results,
    summary,
    completedAt: new Date().toISOString(),
  };

  return {
    messages: [
      new AIMessage(formatAnalysisResponse(response)),
    ],
    stage: "complete",
  };
}

/**
 * Execute a single analysis
 */
async function executeAnalysis(
  request: AnalysisRequest,
  state: SpendCubeStateType
): Promise<AnalysisResult | null> {
  try {
    // Import and execute the appropriate analyzer
    switch (request.type) {
      case "savings":
        return await runSavingsAnalysis(state, request);
      case "risk":
        return await runRiskAnalysis(state, request);
      case "compliance":
        return await runComplianceAnalysis(state, request);
      case "trend":
        return await runTrendAnalysis(state, request);
      case "benchmark":
        return await runBenchmarkAnalysis(state, request);
      default:
        console.warn(`Unknown analysis type: ${request.type}`);
        return null;
    }
  } catch (error) {
    console.error(`Error in ${request.type} analysis:`, error);
    return null;
  }
}

/**
 * Savings Analysis - Placeholder (to be implemented in SC-020)
 */
async function runSavingsAnalysis(
  state: SpendCubeStateType,
  request: AnalysisRequest
): Promise<AnalysisResult> {
  const { inputRecords, classifications } = state;
  const totalSpend = inputRecords.reduce((sum, r) => sum + r.amount, 0);

  // Group by vendor for consolidation opportunities
  const vendorSpend = new Map<string, number>();
  for (const record of inputRecords) {
    vendorSpend.set(record.vendor, (vendorSpend.get(record.vendor) || 0) + record.amount);
  }

  // Find top vendors
  const topVendors = Array.from(vendorSpend.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Estimate savings potential (simplified)
  const estimatedSavings = totalSpend * 0.12; // 12% industry average

  return {
    type: "savings",
    title: "Savings Opportunity Analysis",
    summary: `Identified potential savings of $${estimatedSavings.toLocaleString()} (12% of total spend)`,
    insights: [
      {
        category: "Vendor Consolidation",
        finding: `${vendorSpend.size} vendors identified. Top 5 account for ${((topVendors.reduce((s, [, v]) => s + v, 0) / totalSpend) * 100).toFixed(1)}% of spend.`,
        impact: "high",
        recommendation: "Consider consolidating vendors in high-spend categories",
      },
      {
        category: "Category Optimization",
        finding: `${classifications.length} records classified across ${new Set(classifications.map(c => c.segment)).size} segments`,
        impact: "medium",
        recommendation: "Review high-spend categories for renegotiation opportunities",
      },
    ],
    metrics: {
      totalSpend: `$${totalSpend.toLocaleString()}`,
      estimatedSavings: `$${estimatedSavings.toLocaleString()}`,
      savingsPercent: "12%",
      vendorCount: vendorSpend.size,
      topVendor: topVendors[0]?.[0] || "N/A",
    },
    analyzedAt: new Date().toISOString(),
    recordsAnalyzed: inputRecords.length,
  };
}

/**
 * Risk Analysis - Placeholder (to be implemented in SC-021)
 */
async function runRiskAnalysis(
  state: SpendCubeStateType,
  request: AnalysisRequest
): Promise<AnalysisResult> {
  const { inputRecords } = state;
  const totalSpend = inputRecords.reduce((sum, r) => sum + r.amount, 0);

  // Calculate vendor concentration
  const vendorSpend = new Map<string, number>();
  for (const record of inputRecords) {
    vendorSpend.set(record.vendor, (vendorSpend.get(record.vendor) || 0) + record.amount);
  }

  // Find single-source risks (vendors with >20% of total)
  const singleSourceVendors = Array.from(vendorSpend.entries())
    .filter(([, spend]) => spend / totalSpend > 0.2);

  return {
    type: "risk",
    title: "Supplier Risk Analysis",
    summary: `${singleSourceVendors.length} high-concentration vendor(s) identified`,
    insights: singleSourceVendors.length > 0
      ? singleSourceVendors.map(([vendor, spend]) => ({
          category: "Single Source Risk",
          finding: `${vendor} accounts for ${((spend / totalSpend) * 100).toFixed(1)}% of total spend`,
          impact: "high" as const,
          recommendation: "Develop alternative supplier strategy",
        }))
      : [{
          category: "Concentration Risk",
          finding: "No vendors exceed 20% concentration threshold",
          impact: "low" as const,
        }],
    metrics: {
      totalVendors: vendorSpend.size,
      highConcentrationVendors: singleSourceVendors.length,
      largestVendorShare: `${((Math.max(...vendorSpend.values()) / totalSpend) * 100).toFixed(1)}%`,
    },
    analyzedAt: new Date().toISOString(),
    recordsAnalyzed: inputRecords.length,
  };
}

/**
 * Compliance Analysis - Placeholder (to be implemented in SC-022)
 */
async function runComplianceAnalysis(
  state: SpendCubeStateType,
  request: AnalysisRequest
): Promise<AnalysisResult> {
  const { inputRecords, classifications } = state;

  // Simple compliance check - records without PO
  const withoutPO = inputRecords.filter(r => !r.poNumber).length;
  const complianceRate = ((inputRecords.length - withoutPO) / inputRecords.length) * 100;

  return {
    type: "compliance",
    title: "Compliance Analysis",
    summary: `${complianceRate.toFixed(1)}% of spend is PO-compliant`,
    insights: [
      {
        category: "PO Compliance",
        finding: `${withoutPO} records (${((withoutPO / inputRecords.length) * 100).toFixed(1)}%) lack purchase orders`,
        impact: withoutPO > inputRecords.length * 0.1 ? "high" : "medium",
        recommendation: "Implement PO requirements for non-compliant categories",
      },
    ],
    metrics: {
      totalRecords: inputRecords.length,
      compliantRecords: inputRecords.length - withoutPO,
      nonCompliantRecords: withoutPO,
      complianceRate: `${complianceRate.toFixed(1)}%`,
    },
    analyzedAt: new Date().toISOString(),
    recordsAnalyzed: inputRecords.length,
  };
}

/**
 * Trend Analysis - Placeholder (to be implemented in SC-023)
 */
async function runTrendAnalysis(
  state: SpendCubeStateType,
  request: AnalysisRequest
): Promise<AnalysisResult> {
  const { inputRecords } = state;

  // Group by month (simplified)
  const monthlySpend = new Map<string, number>();
  for (const record of inputRecords) {
    if (record.date) {
      const month = record.date.substring(0, 7); // YYYY-MM
      monthlySpend.set(month, (monthlySpend.get(month) || 0) + record.amount);
    }
  }

  const months = Array.from(monthlySpend.keys()).sort();
  const avgMonthlySpend = monthlySpend.size > 0
    ? Array.from(monthlySpend.values()).reduce((a, b) => a + b, 0) / monthlySpend.size
    : 0;

  return {
    type: "trend",
    title: "Spend Trend Analysis",
    summary: `Analyzed ${months.length} months of spend data`,
    insights: [
      {
        category: "Monthly Average",
        finding: `Average monthly spend: $${avgMonthlySpend.toLocaleString()}`,
        impact: "medium",
      },
    ],
    metrics: {
      monthsAnalyzed: months.length,
      averageMonthlySpend: `$${avgMonthlySpend.toLocaleString()}`,
      earliestMonth: months[0] || "N/A",
      latestMonth: months[months.length - 1] || "N/A",
    },
    analyzedAt: new Date().toISOString(),
    recordsAnalyzed: inputRecords.length,
  };
}

/**
 * Benchmark Analysis - Placeholder (to be implemented in SC-024)
 */
async function runBenchmarkAnalysis(
  state: SpendCubeStateType,
  request: AnalysisRequest
): Promise<AnalysisResult> {
  const { inputRecords, classifications } = state;
  const totalSpend = inputRecords.reduce((sum, r) => sum + r.amount, 0);

  // Simplified benchmark against industry averages
  const avgSpendPerRecord = totalSpend / inputRecords.length;

  return {
    type: "benchmark",
    title: "Benchmark Analysis",
    summary: "Compared spend patterns against industry benchmarks",
    insights: [
      {
        category: "Spend per Transaction",
        finding: `Average spend per transaction: $${avgSpendPerRecord.toLocaleString()}`,
        impact: "low",
        recommendation: "Review transactions above $10,000 for optimization",
      },
    ],
    metrics: {
      totalSpend: `$${totalSpend.toLocaleString()}`,
      transactionCount: inputRecords.length,
      averageTransaction: `$${avgSpendPerRecord.toLocaleString()}`,
      classifiedRecords: classifications.length,
    },
    analyzedAt: new Date().toISOString(),
    recordsAnalyzed: inputRecords.length,
  };
}

/**
 * Generate combined summary from all analysis results
 */
function generateAnalysisSummary(results: AnalysisResult[]): string {
  if (results.length === 0) {
    return "No analysis results available.";
  }

  const summaries = results.map(r => `**${r.title}**: ${r.summary}`);
  return summaries.join("\n\n");
}

/**
 * Format analysis response for display
 */
function formatAnalysisResponse(response: AnalysisResponse): string {
  const parts: string[] = [
    `# Spend Analysis Report`,
    `*Generated at ${new Date(response.completedAt).toLocaleString()}*`,
    "",
    `## Summary`,
    response.summary,
    "",
  ];

  for (const result of response.results) {
    parts.push(`## ${result.title}`);
    parts.push("");

    if (result.insights.length > 0) {
      parts.push("### Key Insights");
      for (const insight of result.insights) {
        const impactBadge = insight.impact === "high" ? "🔴" : insight.impact === "medium" ? "🟡" : "🟢";
        parts.push(`- ${impactBadge} **${insight.category}**: ${insight.finding}`);
        if (insight.recommendation) {
          parts.push(`  - *Recommendation*: ${insight.recommendation}`);
        }
      }
      parts.push("");
    }

    parts.push("### Metrics");
    for (const [key, value] of Object.entries(result.metrics)) {
      parts.push(`- ${key}: ${value}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

// Export router functions
export {
  routeAnalysisQuery,
  getAvailableAnalysisTypes,
  hasRequiredDataForAnalysis,
  type AnalysisRequest,
  type AnalysisRoutingDecision,
} from "./router";
