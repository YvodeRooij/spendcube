"use client";

interface MetricCardProps {
  label: string;
  value: string;
  subtext?: string;
  variant?: "default" | "success" | "warning" | "danger";
  size?: "default" | "large";
}

const variantStyles = {
  default: "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800",
  success: "bg-white dark:bg-zinc-900 border-emerald-200/60 dark:border-emerald-900/60",
  warning: "bg-white dark:bg-zinc-900 border-amber-200/60 dark:border-amber-900/60",
  danger: "bg-white dark:bg-zinc-900 border-red-200/60 dark:border-red-900/60",
};

const accentStyles = {
  default: "border-l-zinc-200 dark:border-l-zinc-800",
  success: "border-l-zinc-200 dark:border-l-zinc-800",
  warning: "border-l-zinc-200 dark:border-l-zinc-800",
  danger: "border-l-zinc-200 dark:border-l-zinc-800",
};

const valueStyles = {
  default: "text-zinc-900 dark:text-zinc-50",
  success: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-700 dark:text-amber-300",
  danger: "text-red-700 dark:text-red-300",
};

export function MetricCard({
  label,
  value,
  subtext,
  variant = "default",
  size = "default",
}: MetricCardProps) {
  return (
    <div
      className={`rounded-xl border border-l-4 p-4 shadow-sm transition hover:shadow-md ${variantStyles[variant]} ${accentStyles[variant]} ${
        size === "large" ? "col-span-1" : ""
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p
        className={`mt-1 font-bold ${valueStyles[variant]} ${
          size === "large" ? "text-2xl" : "text-xl"
        }`}
      >
        {value}
      </p>
      {subtext && (
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {subtext}
        </p>
      )}
    </div>
  );
}
