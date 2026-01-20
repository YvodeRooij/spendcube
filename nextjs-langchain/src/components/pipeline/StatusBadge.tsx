"use client";

import type { StatusEvent, AgentNodeType } from "@/types";
import { nodeConfig } from "@/lib/node-config";

interface StatusBadgeProps {
  status: StatusEvent;
  showDuration?: boolean;
}

const statusStyles = {
  started: {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500 animate-pulse",
  },
  running: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500 animate-pulse",
  },
  completed: {
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  error: {
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-300",
    dot: "bg-red-500",
  },
};

export function StatusBadge({ status, showDuration = false }: StatusBadgeProps) {
  const config = nodeConfig[status.node as AgentNodeType];
  const styles = statusStyles[status.status];

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${styles.bg}`}
    >
      {/* Animated dot */}
      <span className={`h-2 w-2 rounded-full ${styles.dot}`} />

      {/* Icon */}
      <span className="text-sm">{config?.icon || "⚙️"}</span>

      {/* Label */}
      <span className={`text-xs font-medium ${styles.text}`}>
        {config?.label || status.node}
      </span>

      {/* Duration */}
      {showDuration && status.duration && (
        <span className="text-xs text-zinc-500">
          {formatDuration(status.duration)}
        </span>
      )}
    </div>
  );
}
