"use client";

import type { SpendCubeDimension, VendorDimensionItem } from "@/types";

interface DimensionCardProps {
  title: string;
  icon: string;
  data: SpendCubeDimension[] | VendorDimensionItem[];
  maxItems?: number;
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

function isVendorItem(item: SpendCubeDimension | VendorDimensionItem): item is VendorDimensionItem {
  return "isStrategic" in item;
}

export function DimensionCard({
  title,
  icon,
  data,
  maxItems = 6,
}: DimensionCardProps) {
  const displayData = data.slice(0, maxItems);
  const remainingCount = data.length - maxItems;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h3>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">{icon}</span>
      </div>
      <div className="mt-3 space-y-2">
        {displayData.map((item, index) => {
          const barWidth = Math.min(100, Math.max(5, item.percentage));
          const isVendor = isVendorItem(item);

          return (
            <div key={item.name} className="group">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 truncate text-zinc-700 dark:text-zinc-300">
                  {isVendor && item.isStrategic && (
                    <span className="text-amber-500" title="Strategic Vendor">
                      ★
                    </span>
                  )}
                  <span className="truncate" title={item.name}>
                    {item.name.length > 20 ? `${item.name.substring(0, 20)}...` : item.name}
                  </span>
                </span>
                <span className="ml-2 font-medium text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(item.value)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      index === 0
                        ? "bg-zinc-900 dark:bg-zinc-100"
                        : index === 1
                        ? "bg-zinc-700 dark:bg-zinc-300"
                        : "bg-zinc-500 dark:bg-zinc-500"
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className="w-10 text-right text-xs text-zinc-500">
                  {item.percentage.toFixed(0)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {remainingCount > 0 && (
        <p className="mt-3 text-center text-xs text-zinc-400">
          +{remainingCount} more
        </p>
      )}
    </div>
  );
}
