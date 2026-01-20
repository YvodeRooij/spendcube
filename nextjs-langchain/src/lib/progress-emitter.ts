/**
 * Progress Emitter
 *
 * A simple event emitter pattern for real-time progress updates
 * during classification. This bridges the gap between the classification
 * node's sequential processing and the API's SSE streaming.
 */

import type { ClassificationProgressEvent, ProgressCallback } from "@/types/streaming";

/**
 * Global progress emitter for classification events
 * Uses a Map to support multiple concurrent sessions
 */
class ProgressEmitter {
  private listeners: Map<string, ProgressCallback> = new Map();

  /**
   * Subscribe to progress events for a session
   */
  subscribe(sessionId: string, callback: ProgressCallback): void {
    this.listeners.set(sessionId, callback);
  }

  /**
   * Unsubscribe from progress events
   */
  unsubscribe(sessionId: string): void {
    this.listeners.delete(sessionId);
  }

  /**
   * Emit a progress event to the session's listener
   */
  emit(sessionId: string, event: ClassificationProgressEvent): void {
    const listener = this.listeners.get(sessionId);
    if (listener) {
      listener(event);
    }
  }

  /**
   * Check if a session has a listener
   */
  hasListener(sessionId: string): boolean {
    return this.listeners.has(sessionId);
  }
}

// Singleton instance
export const progressEmitter = new ProgressEmitter();

/**
 * Create a progress callback for a session
 * This is used by the API route to receive progress updates
 */
export function createProgressCallback(
  sessionId: string,
  sendEvent: (event: string, data: unknown) => void
): ProgressCallback {
  return (event: ClassificationProgressEvent) => {
    const progress = Math.round((event.completed / event.total) * 100);

    // Emit progress event
    sendEvent("progress", {
      type: "progress",
      id: crypto.randomUUID(),
      node: "classification",
      step: event.completed,
      totalSteps: event.total,
      message: "Classifying records",
      progress,
      detail: `${event.completed} of ${event.total} records classified`,
      timestamp: new Date().toISOString(),
    });

    // Emit individual classification event
    sendEvent("classification", {
      type: "classification",
      id: crypto.randomUUID(),
      recordId: event.latestRecord.recordId,
      vendor: event.record.vendor,
      description: event.record.description,
      category: event.latestRecord.unspscTitle,
      confidence: event.latestRecord.confidence,
      status: "completed",
      timestamp: new Date().toISOString(),
    });
  };
}
