"use client";

import type { SpendCubeData } from "@/types";
import { MetricCard } from "./MetricCard";
import { DimensionCard } from "./DimensionCard";
import { InsightsPanel } from "./InsightsPanel";
import { ActionCard } from "./ActionCard";

interface SpendCubeOutputProps {
  data: SpendCubeData;
}

function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

function getConcentrationVariant(percent: number): "default" | "success" | "warning" | "danger" {
  if (percent > 50) return "danger";
  if (percent > 30) return "warning";
  return "default";
}

function getMaverickVariant(percent: number): "default" | "success" | "warning" | "danger" {
  if (percent > 30) return "danger";
  if (percent > 15) return "warning";
  return "success";
}

function getGradeVariant(grade: string): "default" | "success" | "warning" | "danger" {
  if (grade === "A" || grade === "B") return "success";
  if (grade === "C") return "warning";
  return "danger";
}

export function SpendCubeOutput({ data }: SpendCubeOutputProps) {
  const { executiveSummary, dimensions, insights } = data;

  return (
    <div className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex flex-col gap-2 text-left">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Spend Cube Analysis
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {executiveSummary.headline}
        </p>
      </div>

      {/* Hero Metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          label="Total Spend"
          value={formatCurrency(executiveSummary.totalSpend)}
          subtext={`${data.summary.totalRecords} records`}
          size="large"
        />
        <MetricCard
          label="Savings Opportunity"
          value={formatCurrency(executiveSummary.addressableSavings)}
          subtext={`${executiveSummary.savingsPercent.toFixed(1)}% of spend`}
          variant="success"
          size="large"
        />
        <MetricCard
          label="Top Vendor"
          value={`${executiveSummary.topVendorConcentration.percent.toFixed(0)}%`}
          subtext={executiveSummary.topVendorConcentration.vendor}
          variant={getConcentrationVariant(executiveSummary.topVendorConcentration.percent)}
        />
        <MetricCard
          label="Maverick Spend"
          value={`${executiveSummary.maverickSpend.percent.toFixed(0)}%`}
          subtext={formatCurrency(executiveSummary.maverickSpend.dollars)}
          variant={getMaverickVariant(executiveSummary.maverickSpend.percent)}
        />
      </div>

      {/* Data Quality Badge */}
      <div className="flex">
        <div
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
            executiveSummary.dataQualityGrade === "A" || executiveSummary.dataQualityGrade === "B"
              ? "border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300"
              : executiveSummary.dataQualityGrade === "C"
              ? "border-amber-200 text-amber-700 dark:border-amber-900 dark:text-amber-300"
              : "border-red-200 text-red-700 dark:border-red-900 dark:text-red-300"
          }`}
        >
          <span>Data Quality</span>
          <span className="font-semibold">Grade {executiveSummary.dataQualityGrade}</span>
        </div>
      </div>

      {/* Monday Morning Action */}
      <ActionCard action={executiveSummary.mondayMorningAction} />

      {/* Dimensional Views */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Spend Dimensions
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          <DimensionCard
            title="By Department (WHO)"
            icon="👥"
            data={dimensions.byDepartment}
          />
          <DimensionCard
            title="By Category (WHAT)"
            icon="📁"
            data={dimensions.byCategory}
          />
          <DimensionCard
            title="By Vendor (FROM WHOM)"
            icon="🏢"
            data={dimensions.byVendor}
          />
        </div>
      </div>

      {/* Insights Panel */}
      <InsightsPanel insights={insights} />

      {/* Footer Summary */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Analysis complete:{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {data.summary.totalRecords} records
          </span>{" "}
          across{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {data.summary.uniqueVendors} vendors
          </span>{" "}
          and{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {data.summary.uniqueCategories} categories
          </span>
        </p>
        <div className="mt-2 flex justify-center gap-4">
          <button className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
            Export Report
          </button>
          <button className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}
