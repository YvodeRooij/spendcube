"use client";

import type { ClassificationEvent } from "@/types";

interface ClassificationFeedProps {
  events: ClassificationEvent[];
}

export function ClassificationFeed({ events }: ClassificationFeedProps) {
  if (events.length === 0) return null;

  return (
    <div className="space-y-1">
      {events.map((event, index) => (
        <div
          key={event.id}
          className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs transition-all duration-300 ${
            index === events.length - 1
              ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
              : "border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50"
          }`}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-base">
              {event.status === "completed" ? "✓" : event.status === "processing" ? "⏳" : "○"}
            </span>
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate font-medium text-zinc-700 dark:text-zinc-300">
                {event.vendor}
              </p>
              <p className="truncate text-zinc-500 dark:text-zinc-500">
                {event.description}
              </p>
            </div>
          </div>
          {event.category && (
            <div className="ml-2 flex items-center gap-1 shrink-0">
              <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-700">
                {event.category.length > 20 ? event.category.substring(0, 20) + "..." : event.category}
              </span>
              {event.confidence && (
                <span
                  className={`rounded px-1 py-0.5 text-xs ${
                    event.confidence >= 80
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                      : event.confidence >= 60
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                      : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                  }`}
                >
                  {event.confidence}%
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
