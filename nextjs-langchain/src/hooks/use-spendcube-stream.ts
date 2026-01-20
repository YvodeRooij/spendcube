"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  SpendRecord,
  SpendCubeData,
  StatusEvent,
  ProgressEvent,
  ClassificationEvent,
  InsightEvent,
} from "@/types";

/**
 * Message type for UI display
 */
export interface ChatMessage {
  id: string;
  type: "human" | "ai" | "system";
  content: string;
  timestamp: Date;
}

/**
 * State snapshot from graph execution
 */
export interface GraphState {
  stage: string;
  messagesCount: number;
  classificationsCount: number;
  qaResultsCount: number;
  hitlQueueCount: number;
}

/**
 * Final state after graph completion
 */
export interface FinalState {
  stage: string;
  summary?: string;
  classificationsCount: number;
  qaResultsCount: number;
  hitlQueueCount: number;
  errorsCount: number;
  hasSpendCube?: boolean;
}

/**
 * Streaming events state
 */
export interface StreamingEvents {
  nodeStatuses: Map<string, StatusEvent>;
  progressEvents: Map<string, ProgressEvent>;
  classificationEvents: ClassificationEvent[];
  insightEvents: InsightEvent[];
}

/**
 * Hook options
 */
export interface UseSpendCubeStreamOptions {
  apiUrl?: string;
  onError?: (error: Error) => void;
  onComplete?: (state: FinalState) => void;
  onSpendCube?: (data: SpendCubeData) => void;
  onNodeStatus?: (event: StatusEvent) => void;
  onProgress?: (event: ProgressEvent) => void;
}

/**
 * Hook return type
 */
export interface UseSpendCubeStreamReturn {
  messages: ChatMessage[];
  state: GraphState | null;
  finalState: FinalState | null;
  spendCube: SpendCubeData | null;
  streamingEvents: StreamingEvents;
  isLoading: boolean;
  error: Error | null;
  threadId: string;
  sendMessage: (message: string, records?: SpendRecord[]) => Promise<void>;
  reset: () => void;
}

/**
 * Create initial streaming events state
 */
function createInitialStreamingEvents(): StreamingEvents {
  return {
    nodeStatuses: new Map(),
    progressEvents: new Map(),
    classificationEvents: [],
    insightEvents: [],
  };
}

/**
 * Custom hook for streaming SpendCube graph responses
 *
 * @example
 * ```tsx
 * const { messages, isLoading, sendMessage, streamingEvents } = useSpendCubeStream();
 *
 * const handleSubmit = async (message: string) => {
 *   await sendMessage(message);
 * };
 * ```
 */
export function useSpendCubeStream(
  options: UseSpendCubeStreamOptions = {}
): UseSpendCubeStreamReturn {
  const { apiUrl = "/api/graph", onError, onComplete, onSpendCube, onNodeStatus, onProgress } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<GraphState | null>(null);
  const [finalState, setFinalState] = useState<FinalState | null>(null);
  const [spendCube, setSpendCube] = useState<SpendCubeData | null>(null);
  const [streamingEvents, setStreamingEvents] = useState<StreamingEvents>(createInitialStreamingEvents);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [threadId, setThreadId] = useState(() => uuidv4());

  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Reset the conversation
   */
  const reset = useCallback(() => {
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setMessages([]);
    setState(null);
    setFinalState(null);
    setSpendCube(null);
    setStreamingEvents(createInitialStreamingEvents());
    setError(null);
    setIsLoading(false);
    setThreadId(uuidv4());
  }, []);

  /**
   * Handle SSE events from the stream
   */
  const handleSSEEvent = useCallback(
    (eventType: string, data: unknown) => {
      switch (eventType) {
        case "start":
          // Stream started - reset streaming events
          setStreamingEvents(createInitialStreamingEvents());
          break;

        case "state":
          setState(data as GraphState);
          break;

        case "node_status": {
          const statusEvent = data as StatusEvent;
          setStreamingEvents((prev) => {
            const newStatuses = new Map(prev.nodeStatuses);
            newStatuses.set(statusEvent.node, statusEvent);
            return { ...prev, nodeStatuses: newStatuses };
          });
          onNodeStatus?.(statusEvent);
          break;
        }

        case "progress": {
          const progressEvent = data as ProgressEvent;
          setStreamingEvents((prev) => {
            const newProgress = new Map(prev.progressEvents);
            newProgress.set(progressEvent.node, progressEvent);
            return { ...prev, progressEvents: newProgress };
          });
          onProgress?.(progressEvent);
          break;
        }

        case "classification": {
          const classificationEvent = data as ClassificationEvent;
          setStreamingEvents((prev) => ({
            ...prev,
            classificationEvents: [...prev.classificationEvents.slice(-9), classificationEvent], // Keep last 10
          }));
          break;
        }

        case "insight": {
          const insightEvent = data as InsightEvent;
          setStreamingEvents((prev) => ({
            ...prev,
            insightEvents: [...prev.insightEvents, insightEvent],
          }));
          break;
        }

        case "message": {
          const msg = data as { type: string; content: string };
          if (msg.type === "ai") {
            setMessages((prev) => [
              ...prev,
              {
                id: uuidv4(),
                type: "ai",
                content: msg.content,
                timestamp: new Date(),
              },
            ]);
          }
          break;
        }

        case "spendcube": {
          const cubeData = data as { data: SpendCubeData; format: string };
          setSpendCube(cubeData.data);
          onSpendCube?.(cubeData.data);
          break;
        }

        case "complete": {
          const completeData = data as { finalState: FinalState };
          setFinalState(completeData.finalState);
          onComplete?.(completeData.finalState);
          break;
        }

        case "error": {
          const errorData = data as { message: string };
          const err = new Error(errorData.message);
          setError(err);
          onError?.(err);
          break;
        }
      }
    },
    [onComplete, onError, onSpendCube, onNodeStatus, onProgress]
  );

  /**
   * Send a message to the graph
   */
  const sendMessage = useCallback(
    async (message: string, records?: SpendRecord[]) => {
      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Add user message immediately
      const userMessage: ChatMessage = {
        id: uuidv4(),
        type: "human",
        content: message,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      setIsLoading(true);
      setError(null);
      setFinalState(null);
      setStreamingEvents(createInitialStreamingEvents());

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message,
            threadId,
            records,
            stream: true,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;

            const eventMatch = line.match(/^event: (\w+)\ndata: ([\s\S]+)$/);
            if (!eventMatch) continue;

            const [, eventType, data] = eventMatch;
            try {
              const parsed = JSON.parse(data);
              handleSSEEvent(eventType, parsed);
            } catch (parseError) {
              console.warn("Failed to parse SSE data:", parseError);
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Request was cancelled, ignore
          return;
        }

        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        onError?.(errorObj);

        // Add error message
        setMessages((prev) => [
          ...prev,
          {
            id: uuidv4(),
            type: "system",
            content: `Error: ${errorObj.message}`,
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [apiUrl, threadId, onError, handleSSEEvent]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    messages,
    state,
    finalState,
    spendCube,
    streamingEvents,
    isLoading,
    error,
    threadId,
    sendMessage,
    reset,
  };
}
