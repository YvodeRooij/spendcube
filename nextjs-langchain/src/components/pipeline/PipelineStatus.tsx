"use client";

import type { StreamingEvents } from "@/hooks/use-spendcube-stream";
import type { AgentNodeType } from "@/types";
import { nodeConfig } from "@/lib/node-config";
import { ProgressCard } from "./ProgressCard";
import { StatusBadge } from "./StatusBadge";
import { ClassificationFeed } from "./ClassificationFeed";

interface PipelineStatusProps {
  events: StreamingEvents;
  isLoading: boolean;
}

const pipelineOrder: AgentNodeType[] = [
  "supervisor",
  "classification",
  "qa",
  "hitl",
  "enrichment",
  "analysis",
  "response",
];

export function PipelineStatus({ events, isLoading }: PipelineStatusProps) {
  const { nodeStatuses, progressEvents, classificationEvents, insightEvents } = events;

  // Get active nodes (started but not completed)
  const activeNodes = Array.from(nodeStatuses.values()).filter(
    (s) => s.status === "started" || s.status === "running"
  );

  // Get completed nodes
  const completedNodes = Array.from(nodeStatuses.values()).filter(
    (s) => s.status === "completed"
  );

  // Get current progress
  const activeProgress = Array.from(progressEvents.values());

  // If not loading and no events, don't show anything
  if (!isLoading && nodeStatuses.size === 0) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Pipeline Status
        </h3>
        {isLoading && (
          <span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            Processing
          </span>
        )}
      </div>

      {/* Pipeline visualization */}
      <div className="flex flex-wrap items-center gap-2">
        {pipelineOrder.map((node) => {
          const status = nodeStatuses.get(node);
          const config = nodeConfig[node];

          if (!status) {
            // Not yet reached
            return (
              <div
                key={node}
                className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-400 dark:bg-zinc-800"
              >
                <span>{config.icon}</span>
                <span>{config.label}</span>
              </div>
            );
          }

          return (
            <StatusBadge
              key={node}
              status={status}
              showDuration={status.status === "completed"}
            />
          );
        })}
      </div>

      {/* Active progress cards */}
      {activeProgress.length > 0 && (
        <div className="space-y-2">
          {activeProgress.map((progress) => (
            <ProgressCard key={progress.id} progress={progress} />
          ))}
        </div>
      )}

      {/* Classification feed */}
      {classificationEvents.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Recent Classifications
          </p>
          <ClassificationFeed events={classificationEvents} />
        </div>
      )}

      {/* Insights discovered */}
      {insightEvents.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Insights Discovered
          </p>
          <div className="flex flex-wrap gap-2">
            {insightEvents.map((insight) => (
              <div
                key={insight.id}
                className={`rounded-full px-2 py-1 text-xs font-medium ${
                  insight.insightType === "savings"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                    : insight.insightType === "risk"
                    ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                }`}
              >
                {insight.insightType === "savings" && "💰"}
                {insight.insightType === "risk" && "⚠️"}
                {insight.insightType === "compliance" && "📋"}
                {insight.insightType === "quality" && "🔍"}{" "}
                {insight.title.length > 30
                  ? insight.title.substring(0, 30) + "..."
                  : insight.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary when complete */}
      {!isLoading && completedNodes.length > 0 && (
        <div className="flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <p className="text-xs text-zinc-500">
            Completed {completedNodes.length} pipeline stages
          </p>
          {completedNodes.length > 0 && (
            <p className="text-xs text-zinc-500">
              Total:{" "}
              {(() => {
                const lastNode = completedNodes[completedNodes.length - 1];
                if (lastNode?.duration) {
                  return `${(lastNode.duration / 1000).toFixed(1)}s`;
                }
                return "N/A";
              })()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
