"use client";

import type { ProgressEvent, AgentNodeType } from "@/types";
import { nodeConfig } from "@/lib/node-config";

interface ProgressCardProps {
  progress: ProgressEvent;
}

export function ProgressCard({ progress }: ProgressCardProps) {
  const config = nodeConfig[progress.node as AgentNodeType];
  const barWidth = Math.min(100, Math.max(0, progress.progress));

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{config?.icon || "⚙️"}</span>
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {config?.label || progress.node}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {progress.message}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {progress.progress}%
          </p>
          <p className="text-xs text-zinc-500">
            {progress.step}/{progress.totalSteps}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-700">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300 ease-out"
          style={{ width: `${barWidth}%` }}
        />
      </div>

      {progress.detail && (
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          {progress.detail}
        </p>
      )}
    </div>
  );
}
