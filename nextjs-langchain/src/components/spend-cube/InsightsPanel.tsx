"use client";

import { useState } from "react";
import type { InsightsSummary, SpendCubeInsight } from "@/types";

interface InsightsPanelProps {
  insights: InsightsSummary;
}

type InsightTab = "savings" | "risks" | "compliance" | "quality";

function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

const tabConfig: Record<InsightTab, { label: string }> = {
  savings: { label: "Savings" },
  risks: { label: "Risks" },
  compliance: { label: "Compliance" },
  quality: { label: "Quality" },
};

function InsightItem({ insight }: { insight: SpendCubeInsight }) {
  const severityColors = {
    high: "border-l-zinc-200 dark:border-l-zinc-800",
    medium: "border-l-zinc-200 dark:border-l-zinc-800",
    low: "border-l-zinc-200 dark:border-l-zinc-800",
  };

  const severityBadge = {
    high: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  };

  return (
    <div
      className={`rounded-xl border border-l-4 border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${severityColors[insight.severity]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {insight.title}
            </h4>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${severityBadge[insight.severity]}`}
            >
              {insight.severity}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            {insight.description}
          </p>
        </div>
        {insight.impactAmount && (
          <div className="text-right">
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {formatCurrency(insight.impactAmount)}
            </p>
            <p className="text-xs text-zinc-500">impact</p>
          </div>
        )}
      </div>
      {insight.actionable && (
        <div className="mt-2">
          <button className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
            View details →
          </button>
        </div>
      )}
    </div>
  );
}

export function InsightsPanel({ insights }: InsightsPanelProps) {
  const [activeTab, setActiveTab] = useState<InsightTab>("savings");

  const tabs: InsightTab[] = ["savings", "risks", "compliance", "quality"];
  const currentInsights = insights[activeTab];
  const currentTabImpact = currentInsights.reduce((sum, i) => sum + (i.impactAmount || 0), 0);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header with totals */}
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Insights & Opportunities
          </h3>
          <div className="text-right">
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {formatCurrency(insights.totalDollarImpact)}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">total impact</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800">
        {tabs.map((tab) => {
          const config = tabConfig[tab];
          const count = insights[tab].length;
          const isActive = activeTab === tab;

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-3 py-2 text-center text-xs font-medium transition-colors ${
                isActive
                  ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-50"
                  : "text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {config.label}
              {count > 0 && (
                <span
                  className={`ml-1 rounded-full px-1.5 py-0.5 text-xs ${
                    isActive
                      ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="max-h-80 overflow-y-auto p-4">
        {currentInsights.length > 0 ? (
          <div className="space-y-3">
            {currentTabImpact > 0 && (
              <div className="mb-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {tabConfig[activeTab].label} Impact:{" "}
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">
                    {formatCurrency(currentTabImpact)}
                  </span>
                </p>
              </div>
            )}
            {currentInsights.map((insight, index) => (
              <InsightItem key={index} insight={insight} />
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-zinc-500">
            No {tabConfig[activeTab].label.toLowerCase()} identified
          </div>
        )}
      </div>
    </div>
  );
}
