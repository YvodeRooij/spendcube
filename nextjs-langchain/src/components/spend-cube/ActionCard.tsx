"use client";

import type { MondayMorningAction } from "@/types";

interface ActionCardProps {
  action: MondayMorningAction;
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

const actionTypeConfig = {
  consolidate: {
    label: "Consolidation",
    buttonText: "Start Consolidation",
    accent: "border-l-zinc-200 dark:border-l-zinc-800",
    badge: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
    button: "border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800",
  },
  negotiate: {
    label: "Negotiation",
    buttonText: "Prepare RFP",
    accent: "border-l-zinc-200 dark:border-l-zinc-800",
    badge: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
    button: "border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800",
  },
  compliance: {
    label: "Compliance",
    buttonText: "Review Policies",
    accent: "border-l-zinc-200 dark:border-l-zinc-800",
    badge: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
    button: "border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800",
  },
  review: {
    label: "Review",
    buttonText: "Start Analysis",
    accent: "border-l-zinc-200 dark:border-l-zinc-800",
    badge: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
    button: "border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800",
  },
};

export function ActionCard({ action }: ActionCardProps) {
  const config = actionTypeConfig[action.actionType];

  return (
    <div
      className={`rounded-xl border border-l-4 border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${config.accent}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Monday Morning Action
          </span>
          <h3 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {action.title}
          </h3>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {action.description}
          </p>
          {action.targetEntity && (
            <p className="mt-1 text-xs text-zinc-500">
              Target: <span className="font-medium">{action.targetEntity}</span>
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500">Potential Impact</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(action.dollarImpact)}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${config.badge}`}
        >
          {config.label}
        </span>
        <button
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${config.button}`}
        >
          {config.buttonText} →
        </button>
      </div>
    </div>
  );
}
