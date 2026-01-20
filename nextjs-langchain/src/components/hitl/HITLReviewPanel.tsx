"use client";

import { useState, useEffect, useCallback } from "react";

interface HITLItem {
  id: string;
  recordId: string;
  reason: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "pending" | "decided";
  record: {
    vendor: string;
    description: string;
    amount: number;
    date?: string;
    department?: string;
  } | null;
  classification: {
    unspscCode: string;
    unspscTitle: string;
    confidence: number;
    reasoning?: string;
  } | null;
  suggestedCodes?: Array<{
    code: string;
    title: string;
    confidence: number;
  }>;
}

interface HITLReviewPanelProps {
  threadId: string;
  itemCount: number;
  onDecisionMade?: () => void;
}

const REASON_LABELS: Record<string, string> = {
  low_confidence: "Low confidence score",
  qa_flagged: "Flagged by QA",
  qa_rejected: "Rejected by QA",
  ambiguous_description: "Ambiguous description",
  multiple_matches: "Multiple category matches",
  vendor_anomaly: "Unusual vendor pattern",
  amount_anomaly: "Unusual amount",
  user_requested: "User requested review",
};

const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  low: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export function HITLReviewPanel({ threadId, itemCount, onDecisionMade }: HITLReviewPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<HITLItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<HITLItem | null>(null);
  const [selectedCode, setSelectedCode] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchQueue = useCallback(async () => {
    if (!threadId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hitl/queue?threadId=${threadId}&status=pending`);
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
        if (data.items?.length > 0 && !activeItem) {
          setActiveItem(data.items[0]);
        }
      } else {
        setError(data.error || "Failed to load queue");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue");
    } finally {
      setIsLoading(false);
    }
  }, [threadId, activeItem]);

  useEffect(() => {
    if (isOpen && itemCount > 0) {
      fetchQueue();
    }
  }, [isOpen, itemCount, fetchQueue]);

  const handleDecision = async (action: "approve" | "modify" | "reject") => {
    if (!activeItem) return;
    setIsSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        threadId,
        itemId: activeItem.id,
        recordId: activeItem.recordId,
        action,
        notes,
      };
      if (action === "modify" && selectedCode) {
        const suggested = activeItem.suggestedCodes?.find((s) => s.code === selectedCode);
        body.selectedCode = selectedCode;
        body.selectedTitle = suggested?.title || "";
      }
      const res = await fetch("/api/hitl/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        // Move to next item
        const remaining = items.filter((i) => i.id !== activeItem.id);
        setItems(remaining);
        setActiveItem(remaining[0] || null);
        setSelectedCode("");
        setNotes("");
        onDecisionMade?.();
      } else {
        setError(data.error || "Decision failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decision failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (itemCount === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-200 text-amber-700 dark:bg-amber-800 dark:text-amber-200">
            <AlertIcon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              {itemCount} item{itemCount !== 1 ? "s" : ""} need your review
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              The AI could not classify these with enough confidence. Your input will improve future accuracy.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-600 px-3 py-1 text-xs font-medium text-white">
            Action Required
          </span>
          <ChevronIcon className={`h-5 w-5 text-amber-600 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>

      {isOpen && (
        <div className="mt-4 space-y-4">
          {isLoading && (
            <div className="py-8 text-center text-sm text-amber-700 dark:text-amber-300">
              Loading items for review...
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {error}
            </div>
          )}

          {!isLoading && items.length === 0 && (
            <div className="py-6 text-center text-sm text-amber-700 dark:text-amber-300">
              All items have been reviewed. Great job!
            </div>
          )}

          {!isLoading && activeItem && (
            <div className="rounded-xl border border-amber-200 bg-white p-4 dark:border-amber-800 dark:bg-zinc-900">
              {/* Progress */}
              <div className="mb-4 flex items-center justify-between text-xs text-zinc-500">
                <span>
                  Reviewing {items.findIndex((i) => i.id === activeItem.id) + 1} of {items.length}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[activeItem.priority]}`}>
                  {activeItem.priority} priority
                </span>
              </div>

              {/* Record details */}
              <div className="mb-4 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Vendor</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {activeItem.record?.vendor || "Unknown"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Description</span>
                    <span className="max-w-[60%] truncate text-right font-medium text-zinc-900 dark:text-zinc-100">
                      {activeItem.record?.description || "No description"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Amount</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      ${activeItem.record?.amount?.toLocaleString() || 0}
                    </span>
                  </div>
                  {activeItem.record?.department && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Department</span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {activeItem.record.department}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Why flagged */}
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200">Why this needs review:</p>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                  {REASON_LABELS[activeItem.reason] || activeItem.reason}
                </p>
              </div>

              {/* AI suggestion */}
              {activeItem.classification && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">AI suggested category:</p>
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {activeItem.classification.unspscTitle}
                        </p>
                        <p className="text-xs text-zinc-500">{activeItem.classification.unspscCode}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          activeItem.classification.confidence >= 70
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                        }`}
                      >
                        {activeItem.classification.confidence}% confidence
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Alternative suggestions */}
              {activeItem.suggestedCodes && activeItem.suggestedCodes.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Select a different category:
                  </p>
                  <div className="space-y-2">
                    {activeItem.suggestedCodes.map((s) => (
                      <label
                        key={s.code}
                        className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
                          selectedCode === s.code
                            ? "border-teal-500 bg-teal-50 dark:border-teal-600 dark:bg-teal-900/20"
                            : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="suggestedCode"
                            value={s.code}
                            checked={selectedCode === s.code}
                            onChange={(e) => setSelectedCode(e.target.value)}
                            className="h-4 w-4 text-teal-600"
                          />
                          <div>
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{s.title}</p>
                            <p className="text-xs text-zinc-500">{s.code}</p>
                          </div>
                        </div>
                        <span className="text-xs text-zinc-500">{s.confidence}%</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add context for future reference..."
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-teal-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleDecision("approve")}
                  disabled={isSubmitting}
                  className="flex-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Approve AI suggestion"}
                </button>
                {selectedCode && (
                  <button
                    onClick={() => handleDecision("modify")}
                    disabled={isSubmitting}
                    className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                  >
                    Use selected category
                  </button>
                )}
                <button
                  onClick={() => handleDecision("reject")}
                  disabled={isSubmitting}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  Skip for now
                </button>
              </div>

              {/* Quick navigation */}
              {items.length > 1 && (
                <div className="mt-3 flex justify-center gap-1">
                  {items.map((item, idx) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveItem(item)}
                      className={`h-2 w-2 rounded-full transition-colors ${
                        item.id === activeItem.id
                          ? "bg-teal-600"
                          : "bg-zinc-300 hover:bg-zinc-400 dark:bg-zinc-600"
                      }`}
                      title={`Item ${idx + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AlertIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function ChevronIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
