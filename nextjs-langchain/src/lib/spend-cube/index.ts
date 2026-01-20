import type {
  SpendCubeStateType,
  SpendCubeData,
  SpendCubeDimension,
  VendorDimensionItem,
  SpendCubeInsight,
  ExecutiveSummary,
  MondayMorningAction,
  InsightsSummary,
  DataQualityMetrics,
} from "@/types";

/**
 * Spend Cube Cell (individual intersection)
 */
export interface SpendCubeCell {
  who: string;         // Department/Cost Center
  what: string;        // Category (UNSPSC)
  whatCode: string;    // UNSPSC Code
  fromWhom: string;    // Vendor
  amount: number;
  recordCount: number;
}

/**
 * Legacy SpendCubeResult for backwards compatibility
 */
export interface SpendCubeResult {
  cells: SpendCubeCell[];
  byDepartment: SpendCubeDimension[];
  byCategory: SpendCubeDimension[];
  byVendor: SpendCubeDimension[];
  topCategoryByDepartment: Record<string, { category: string; amount: number }>;
  topVendorByCategory: Record<string, { vendor: string; amount: number }>;
  totalSpend: number;
  totalRecords: number;
  uniqueVendors: number;
  uniqueCategories: number;
  uniqueDepartments: number;
  dataQuality: {
    classifiedRate: number;
    highConfidenceRate: number;
    withPORate: number;
    normalizedVendors: number;
  };
  insights: SpendCubeInsight[];
}

/**
 * Format currency for display
 */
function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

/**
 * Calculate data quality grade
 */
function calculateDataQualityGrade(
  classifiedRate: number,
  highConfidenceRate: number,
  withPORate: number
): "A" | "B" | "C" | "D" | "F" {
  const avgScore = (classifiedRate + highConfidenceRate + withPORate) / 3;
  if (avgScore >= 90) return "A";
  if (avgScore >= 80) return "B";
  if (avgScore >= 70) return "C";
  if (avgScore >= 60) return "D";
  return "F";
}

/**
 * Generate Monday Morning Action - the single most impactful recommendation
 */
function generateMondayMorningAction(
  insights: SpendCubeInsight[],
  totalSpend: number,
  byVendor: VendorDimensionItem[],
  maverickSpend: number
): MondayMorningAction {
  // Find highest impact savings opportunity
  const savingsInsights = insights
    .filter(i => i.type === "savings" && i.impactAmount)
    .sort((a, b) => (b.impactAmount || 0) - (a.impactAmount || 0));

  // Check for consolidation opportunities
  if (savingsInsights.length > 0 && savingsInsights[0].impactAmount) {
    const topSaving = savingsInsights[0];
    return {
      title: `Consolidate ${topSaving.category || "spend"} vendors`,
      description: topSaving.description,
      dollarImpact: topSaving.impactAmount || 0,
      actionType: "consolidate",
      targetEntity: topSaving.category,
    };
  }

  // Check for negotiation opportunity with top vendor
  if (byVendor.length > 0 && byVendor[0].percentage > 15) {
    const topVendor = byVendor[0];
    const negotiationSavings = topVendor.value * 0.1; // 10% potential
    return {
      title: `Renegotiate contract with ${topVendor.name}`,
      description: `${topVendor.name} represents ${topVendor.percentage.toFixed(0)}% of spend - leverage volume for better terms`,
      dollarImpact: negotiationSavings,
      actionType: "negotiate",
      targetEntity: topVendor.name,
    };
  }

  // Check for maverick spend compliance
  if (maverickSpend > totalSpend * 0.1) {
    return {
      title: "Enforce PO compliance policy",
      description: `${formatCurrency(maverickSpend)} in maverick spend - implement PO requirement for purchases over $500`,
      dollarImpact: maverickSpend * 0.15, // 15% recoverable through compliance
      actionType: "compliance",
    };
  }

  // Default: review largest category
  return {
    title: "Review procurement processes",
    description: "Conduct strategic sourcing analysis to identify optimization opportunities",
    dollarImpact: totalSpend * 0.05,
    actionType: "review",
  };
}

/**
 * Build Executive Summary for 10-second scan
 */
function buildExecutiveSummary(
  totalSpend: number,
  insights: SpendCubeInsight[],
  byVendor: VendorDimensionItem[],
  dataQuality: DataQualityMetrics,
  withPORate: number
): ExecutiveSummary {
  // Calculate total addressable savings
  const totalSavings = insights
    .filter(i => i.type === "savings")
    .reduce((sum, i) => sum + (i.impactAmount || 0), 0);

  const savingsPercent = totalSpend > 0 ? (totalSavings / totalSpend) * 100 : 0;

  // Get top vendor concentration
  const topVendor = byVendor[0] || { name: "N/A", percentage: 0, value: 0, recordCount: 0, categoryCount: 0, isStrategic: false };

  // Calculate maverick spend (no PO)
  const maverickPercent = 100 - withPORate;
  const maverickDollars = totalSpend * (maverickPercent / 100);

  // Calculate data quality grade
  const grade = calculateDataQualityGrade(
    dataQuality.classifiedRate,
    dataQuality.highConfidenceRate,
    withPORate
  );

  // Generate Monday morning action
  const mondayAction = generateMondayMorningAction(
    insights,
    totalSpend,
    byVendor,
    maverickDollars
  );

  // Build headline
  const headline = totalSavings > 0
    ? `Your ${formatCurrency(totalSpend)} spend has ${formatCurrency(totalSavings)} in savings opportunities`
    : `${formatCurrency(totalSpend)} analyzed across ${byVendor.length} vendors`;

  return {
    headline,
    totalSpend,
    addressableSavings: totalSavings,
    savingsPercent,
    topVendorConcentration: {
      vendor: topVendor.name,
      percent: topVendor.percentage,
    },
    maverickSpend: {
      percent: maverickPercent,
      dollars: maverickDollars,
    },
    dataQualityGrade: grade,
    mondayMorningAction: mondayAction,
  };
}

/**
 * Generate enhanced insights with dollar quantification
 */
function generateEnhancedInsights(
  state: SpendCubeStateType,
  byDepartment: SpendCubeDimension[],
  byCategory: SpendCubeDimension[],
  byVendor: VendorDimensionItem[],
  withPORate: number
): InsightsSummary {
  const savingsInsights: SpendCubeInsight[] = [];
  const riskInsights: SpendCubeInsight[] = [];
  const complianceInsights: SpendCubeInsight[] = [];
  const qualityInsights: SpendCubeInsight[] = [];

  const totalSpend = state.inputRecords.reduce((sum, r) => sum + r.amount, 0);

  // === SAVINGS OPPORTUNITIES ===

  // 1. Vendor consolidation per category (8% savings potential)
  for (const category of byCategory) {
    const vendorsInCategory = new Set(
      state.inputRecords
        .filter(r => {
          const c = state.classifications.find(cl => cl.recordId === r.id);
          return c?.unspscTitle === category.name;
        })
        .map(r => r.vendor)
    ).size;

    if (vendorsInCategory > 3 && category.value > 1000) {
      const savingsAmount = category.value * 0.08;
      savingsInsights.push({
        type: "savings",
        severity: vendorsInCategory > 5 ? "high" : "medium",
        title: "Vendor Consolidation Opportunity",
        description: `Consolidate ${vendorsInCategory} vendors in "${category.name}" to 2-3 strategic suppliers for volume discounts`,
        impactAmount: savingsAmount,
        actionable: true,
        category: category.name,
      });
    }
  }

  // 2. Contract negotiation for top vendors (10% savings potential)
  for (const vendor of byVendor.slice(0, 5)) {
    if (vendor.percentage > 10 && vendor.value > 5000) {
      const savingsAmount = vendor.value * 0.10;
      savingsInsights.push({
        type: "savings",
        severity: vendor.percentage > 20 ? "high" : "medium",
        title: "Contract Negotiation Opportunity",
        description: `Renegotiate terms with ${vendor.name} (${vendor.percentage.toFixed(0)}% of spend) - benchmark pricing against market`,
        impactAmount: savingsAmount,
        actionable: true,
        vendor: vendor.name,
      });
    }
  }

  // === RISK IDENTIFICATION ===

  // 1. Vendor concentration risk
  if (byVendor.length > 0 && byVendor[0].percentage > 30) {
    riskInsights.push({
      type: "risk",
      severity: byVendor[0].percentage > 50 ? "high" : "medium",
      title: "Vendor Concentration Risk",
      description: `${byVendor[0].name} accounts for ${byVendor[0].percentage.toFixed(0)}% of total spend - consider supplier diversification`,
      impactAmount: byVendor[0].value,
      actionable: true,
      vendor: byVendor[0].name,
    });
  }

  // 2. Single-source categories
  for (const category of byCategory) {
    const vendorsInCategory = new Set(
      state.inputRecords
        .filter(r => {
          const c = state.classifications.find(cl => cl.recordId === r.id);
          return c?.unspscTitle === category.name;
        })
        .map(r => r.vendor)
    ).size;

    if (vendorsInCategory === 1 && category.value > 5000) {
      riskInsights.push({
        type: "risk",
        severity: category.value > 50000 ? "high" : "medium",
        title: "Single-Source Risk",
        description: `"${category.name}" has only one vendor - consider qualifying backup suppliers`,
        impactAmount: category.value,
        actionable: true,
        category: category.name,
      });
    }
  }

  // === COMPLIANCE ISSUES ===

  // 1. Maverick spend (no PO)
  if (withPORate < 80) {
    const maverickAmount = totalSpend * (1 - withPORate / 100);
    const recoverableAmount = maverickAmount * 0.15; // 15% recoverable
    complianceInsights.push({
      type: "compliance",
      severity: withPORate < 50 ? "high" : "medium",
      title: "Maverick Spend Detected",
      description: `${(100 - withPORate).toFixed(0)}% of spend (${formatCurrency(maverickAmount)}) lacks purchase orders - enforce PO compliance`,
      impactAmount: recoverableAmount,
      actionable: true,
    });
  }

  // 2. Department-level policy violations
  for (const dept of byDepartment) {
    const deptRecords = state.inputRecords.filter(r => (r.department || "Unassigned") === dept.name);
    const deptPORate = deptRecords.length > 0
      ? (deptRecords.filter(r => r.poNumber).length / deptRecords.length) * 100
      : 100;

    if (deptPORate < 60 && dept.value > 5000) {
      complianceInsights.push({
        type: "compliance",
        severity: deptPORate < 40 ? "high" : "medium",
        title: "Department Compliance Issue",
        description: `${dept.name} has ${deptPORate.toFixed(0)}% PO compliance - implement department-level controls`,
        impactAmount: dept.value * 0.1,
        actionable: true,
        category: dept.name,
      });
    }
  }

  // === DATA QUALITY ===

  // 1. Low classification confidence
  const lowConfidence = state.classifications.filter(c => c.confidence < 70);
  if (lowConfidence.length > state.classifications.length * 0.2) {
    qualityInsights.push({
      type: "quality",
      severity: lowConfidence.length > state.classifications.length * 0.4 ? "high" : "medium",
      title: "Classification Quality Issue",
      description: `${lowConfidence.length} records (${((lowConfidence.length / state.classifications.length) * 100).toFixed(0)}%) have low confidence - review for accuracy`,
      actionable: true,
    });
  }

  // 2. Missing vendor data
  const missingVendor = state.inputRecords.filter(r => !r.vendor || r.vendor.trim() === "");
  if (missingVendor.length > 0) {
    qualityInsights.push({
      type: "quality",
      severity: missingVendor.length > 10 ? "high" : "low",
      title: "Missing Vendor Data",
      description: `${missingVendor.length} records have missing vendor information - update for accurate analysis`,
      actionable: true,
    });
  }

  // Calculate totals
  const allInsights = [...savingsInsights, ...riskInsights, ...complianceInsights, ...qualityInsights];
  const totalDollarImpact = allInsights.reduce((sum, i) => sum + (i.impactAmount || 0), 0);

  return {
    savings: savingsInsights.sort((a, b) => (b.impactAmount || 0) - (a.impactAmount || 0)),
    risks: riskInsights.sort((a, b) => (b.impactAmount || 0) - (a.impactAmount || 0)),
    compliance: complianceInsights.sort((a, b) => (b.impactAmount || 0) - (a.impactAmount || 0)),
    quality: qualityInsights,
    total: allInsights.length,
    totalDollarImpact,
  };
}

/**
 * Aggregate cells by a dimension
 */
function aggregateDimension(
  cells: SpendCubeCell[],
  dimension: "who" | "what" | "fromWhom"
): SpendCubeDimension[] {
  const totals = new Map<string, { amount: number; count: number }>();

  for (const cell of cells) {
    const key = cell[dimension];
    const existing = totals.get(key) || { amount: 0, count: 0 };
    existing.amount += cell.amount;
    existing.count += cell.recordCount;
    totals.set(key, existing);
  }

  const totalAmount = Array.from(totals.values()).reduce((sum, v) => sum + v.amount, 0);

  return Array.from(totals.entries())
    .map(([name, data]) => ({
      name,
      value: data.amount,
      percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
      recordCount: data.count,
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Aggregate vendors with enhanced metadata
 */
function aggregateVendorsEnhanced(
  cells: SpendCubeCell[],
  totalSpend: number
): VendorDimensionItem[] {
  const vendorData = new Map<string, { amount: number; count: number; categories: Set<string> }>();

  for (const cell of cells) {
    const existing = vendorData.get(cell.fromWhom) || { amount: 0, count: 0, categories: new Set() };
    existing.amount += cell.amount;
    existing.count += cell.recordCount;
    existing.categories.add(cell.what);
    vendorData.set(cell.fromWhom, existing);
  }

  return Array.from(vendorData.entries())
    .map(([name, data]) => ({
      name,
      value: data.amount,
      percentage: totalSpend > 0 ? (data.amount / totalSpend) * 100 : 0,
      recordCount: data.count,
      categoryCount: data.categories.size,
      isStrategic: data.amount > totalSpend * 0.05, // >5% of spend = strategic
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Get top category for each department
 */
function getTopCategoryByDepartment(cells: SpendCubeCell[]): Record<string, { category: string; amount: number }> {
  const deptCategories = new Map<string, Map<string, number>>();

  for (const cell of cells) {
    if (!deptCategories.has(cell.who)) {
      deptCategories.set(cell.who, new Map());
    }
    const categories = deptCategories.get(cell.who)!;
    categories.set(cell.what, (categories.get(cell.what) || 0) + cell.amount);
  }

  const result: Record<string, { category: string; amount: number }> = {};

  for (const [dept, categories] of deptCategories) {
    let topCategory = "";
    let topAmount = 0;
    for (const [cat, amount] of categories) {
      if (amount > topAmount) {
        topAmount = amount;
        topCategory = cat;
      }
    }
    result[dept] = { category: topCategory, amount: topAmount };
  }

  return result;
}

/**
 * Get top vendor for each category
 */
function getTopVendorByCategory(cells: SpendCubeCell[]): Record<string, { vendor: string; amount: number }> {
  const categoryVendors = new Map<string, Map<string, number>>();

  for (const cell of cells) {
    if (!categoryVendors.has(cell.what)) {
      categoryVendors.set(cell.what, new Map());
    }
    const vendors = categoryVendors.get(cell.what)!;
    vendors.set(cell.fromWhom, (vendors.get(cell.fromWhom) || 0) + cell.amount);
  }

  const result: Record<string, { vendor: string; amount: number }> = {};

  for (const [category, vendors] of categoryVendors) {
    let topVendor = "";
    let topAmount = 0;
    for (const [vendor, amount] of vendors) {
      if (amount > topAmount) {
        topAmount = amount;
        topVendor = vendor;
      }
    }
    result[category] = { vendor: topVendor, amount: topAmount };
  }

  return result;
}

/**
 * Build a McKinsey-quality Spend Cube from classified records
 */
export function buildSpendCube(state: SpendCubeStateType): SpendCubeData {
  const { inputRecords, classifications } = state;

  // Create lookup for classifications
  const classificationMap = new Map(
    classifications.map(c => [c.recordId, c])
  );

  // Build cube cells
  const cells: SpendCubeCell[] = [];

  for (const record of inputRecords) {
    const classification = classificationMap.get(record.id);

    cells.push({
      who: record.department || "Unassigned",
      what: classification?.unspscTitle || "Uncategorized",
      whatCode: classification?.unspscCode || "00000000",
      fromWhom: record.vendor,
      amount: record.amount,
      recordCount: 1,
    });
  }

  // Calculate totals
  const totalSpend = inputRecords.reduce((sum, r) => sum + r.amount, 0);
  const totalRecords = inputRecords.length;
  const uniqueVendors = new Set(inputRecords.map(r => r.vendor)).size;
  const uniqueCategories = new Set(classifications.map(c => c.unspscCode)).size;
  const uniqueDepartments = new Set(inputRecords.map(r => r.department || "Unassigned")).size;

  // Aggregate by dimensions
  const byDepartment = aggregateDimension(cells, "who");
  const byCategory = aggregateDimension(cells, "what");
  const byVendor = aggregateVendorsEnhanced(cells, totalSpend);

  // Cross-dimensional analysis
  const topCategoryByDepartment = getTopCategoryByDepartment(cells);
  const topVendorByCategory = getTopVendorByCategory(cells);

  // Data quality metrics
  const classifiedRate = inputRecords.length > 0
    ? (classifications.length / inputRecords.length) * 100
    : 0;
  const highConfidenceRate = classifications.length > 0
    ? (classifications.filter(c => c.confidence >= 70).length / classifications.length) * 100
    : 0;
  const withPORate = inputRecords.length > 0
    ? (inputRecords.filter(r => r.poNumber).length / inputRecords.length) * 100
    : 0;
  const lowConfidenceCount = classifications.filter(c => c.confidence < 70).length;

  const dataQuality: DataQualityMetrics = {
    classifiedRate,
    highConfidenceRate,
    withPORate,
    normalizedVendors: uniqueVendors,
    itemsNeedingReview: lowConfidenceCount,
  };

  // Generate enhanced insights
  const insights = generateEnhancedInsights(state, byDepartment, byCategory, byVendor, withPORate);

  // Build executive summary
  const executiveSummary = buildExecutiveSummary(
    totalSpend,
    [...insights.savings, ...insights.risks, ...insights.compliance, ...insights.quality],
    byVendor,
    dataQuality,
    withPORate
  );

  // Generate text report
  const textReport = formatSpendCubeReport({
    executiveSummary,
    summary: {
      totalSpend,
      totalRecords,
      uniqueVendors,
      uniqueCategories,
      uniqueDepartments,
    },
    dimensions: {
      byDepartment,
      byCategory,
      byVendor,
    },
    dataQuality,
    insights,
  });

  return {
    executiveSummary,
    summary: {
      totalSpend,
      totalRecords,
      uniqueVendors,
      uniqueCategories,
      uniqueDepartments,
    },
    dimensions: {
      byDepartment,
      byCategory,
      byVendor,
    },
    crossDimensional: {
      topCategoryByDepartment,
      topVendorByCategory,
    },
    dataQuality,
    insights,
    textReport,
  };
}

/**
 * Format Spend Cube as a readable report (for text display)
 */
export function formatSpendCubeReport(cube: Omit<SpendCubeData, "crossDimensional" | "textReport">): string {
  const lines: string[] = [];
  const { executiveSummary, summary, dimensions, dataQuality, insights } = cube;

  lines.push("═══════════════════════════════════════════════════════════════════");
  lines.push("                     SPEND CUBE EXECUTIVE SUMMARY                  ");
  lines.push("═══════════════════════════════════════════════════════════════════");
  lines.push("");

  // Executive Summary
  lines.push(`📊 ${executiveSummary.headline}`);
  lines.push("");
  lines.push("KEY METRICS");
  lines.push("───────────────────────────────────────────────────────────────────");
  lines.push(`Total Spend:           ${formatCurrency(executiveSummary.totalSpend)}`);
  lines.push(`Savings Opportunity:   ${formatCurrency(executiveSummary.addressableSavings)} (${executiveSummary.savingsPercent.toFixed(1)}%)`);
  lines.push(`Top Vendor:            ${executiveSummary.topVendorConcentration.vendor} (${executiveSummary.topVendorConcentration.percent.toFixed(0)}%)`);
  lines.push(`Maverick Spend:        ${formatCurrency(executiveSummary.maverickSpend.dollars)} (${executiveSummary.maverickSpend.percent.toFixed(0)}%)`);
  lines.push(`Data Quality:          Grade ${executiveSummary.dataQualityGrade}`);
  lines.push("");

  // Monday Morning Action
  lines.push("🎯 MONDAY MORNING ACTION");
  lines.push("───────────────────────────────────────────────────────────────────");
  lines.push(`${executiveSummary.mondayMorningAction.title}`);
  lines.push(`${executiveSummary.mondayMorningAction.description}`);
  lines.push(`Potential Impact: ${formatCurrency(executiveSummary.mondayMorningAction.dollarImpact)}`);
  lines.push("");

  // By Category (WHAT)
  lines.push("📁 BY CATEGORY (WHAT)");
  lines.push("───────────────────────────────────────────────────────────────────");
  for (const cat of dimensions.byCategory.slice(0, 8)) {
    const bar = "█".repeat(Math.min(20, Math.round(cat.percentage / 5)));
    lines.push(`${cat.name.substring(0, 28).padEnd(28)} ${formatCurrency(cat.value).padStart(10)} ${cat.percentage.toFixed(1).padStart(5)}% ${bar}`);
  }
  if (dimensions.byCategory.length > 8) {
    lines.push(`... and ${dimensions.byCategory.length - 8} more categories`);
  }
  lines.push("");

  // By Vendor (FROM WHOM)
  lines.push("🏢 BY VENDOR (FROM WHOM)");
  lines.push("───────────────────────────────────────────────────────────────────");
  for (const vendor of dimensions.byVendor.slice(0, 8)) {
    const bar = "█".repeat(Math.min(20, Math.round(vendor.percentage / 5)));
    const strategic = vendor.isStrategic ? "★" : " ";
    lines.push(`${strategic}${vendor.name.substring(0, 27).padEnd(27)} ${formatCurrency(vendor.value).padStart(10)} ${vendor.percentage.toFixed(1).padStart(5)}% ${bar}`);
  }
  if (dimensions.byVendor.length > 8) {
    lines.push(`... and ${dimensions.byVendor.length - 8} more vendors`);
  }
  lines.push("");

  // By Department (WHO)
  lines.push("👥 BY DEPARTMENT (WHO)");
  lines.push("───────────────────────────────────────────────────────────────────");
  for (const dept of dimensions.byDepartment.slice(0, 8)) {
    const bar = "█".repeat(Math.min(20, Math.round(dept.percentage / 5)));
    lines.push(`${dept.name.substring(0, 28).padEnd(28)} ${formatCurrency(dept.value).padStart(10)} ${dept.percentage.toFixed(1).padStart(5)}% ${bar}`);
  }
  lines.push("");

  // Insights Summary
  lines.push("💡 INSIGHTS & OPPORTUNITIES");
  lines.push("───────────────────────────────────────────────────────────────────");
  lines.push(`💰 Savings: ${insights.savings.length} opportunities | ${formatCurrency(insights.savings.reduce((s, i) => s + (i.impactAmount || 0), 0))}`);
  lines.push(`⚠️  Risks: ${insights.risks.length} identified | ${formatCurrency(insights.risks.reduce((s, i) => s + (i.impactAmount || 0), 0))} at risk`);
  lines.push(`📋 Compliance: ${insights.compliance.length} issues | ${formatCurrency(insights.compliance.reduce((s, i) => s + (i.impactAmount || 0), 0))} recoverable`);
  lines.push(`🔍 Quality: ${insights.quality.length} items to review`);
  lines.push("");

  // Top Savings Opportunities
  if (insights.savings.length > 0) {
    lines.push("TOP SAVINGS OPPORTUNITIES");
    lines.push("───────────────────────────────────────────────────────────────────");
    for (const insight of insights.savings.slice(0, 3)) {
      const icon = insight.severity === "high" ? "🔴" : insight.severity === "medium" ? "🟡" : "🟢";
      lines.push(`${icon} ${insight.title}`);
      lines.push(`   ${insight.description}`);
      if (insight.impactAmount) {
        lines.push(`   Potential Savings: ${formatCurrency(insight.impactAmount)}`);
      }
      lines.push("");
    }
  }

  // Data Quality
  lines.push("✅ DATA QUALITY");
  lines.push("───────────────────────────────────────────────────────────────────");
  lines.push(`Classification Rate:    ${dataQuality.classifiedRate.toFixed(0)}%`);
  lines.push(`High Confidence Rate:   ${dataQuality.highConfidenceRate.toFixed(0)}%`);
  lines.push(`PO Compliance Rate:     ${dataQuality.withPORate.toFixed(0)}%`);
  lines.push(`Items Needing Review:   ${dataQuality.itemsNeedingReview}`);
  lines.push("");

  lines.push("═══════════════════════════════════════════════════════════════════");

  return lines.join("\n");
}

/**
 * Get Spend Cube as structured JSON for API/frontend
 */
export function getSpendCubeJSON(cube: SpendCubeData) {
  return {
    executiveSummary: cube.executiveSummary,
    summary: cube.summary,
    dimensions: cube.dimensions,
    crossDimensional: cube.crossDimensional,
    dataQuality: cube.dataQuality,
    insights: cube.insights,
  };
}
