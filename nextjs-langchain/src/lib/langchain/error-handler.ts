import type { AgentError, AgentType } from "@/types/agents";

/**
 * Error categories for classification
 */
export type ErrorCategory =
  | "rate_limit"
  | "token_limit"
  | "network"
  | "timeout"
  | "validation"
  | "model_error"
  | "tool_error"
  | "unknown";

/**
 * Retry strategy based on error type
 */
export interface RetryStrategy {
  shouldRetry: boolean;
  delayMs: number;
  maxRetries: number;
  fallbackAction?: "use_fallback_model" | "reduce_batch_size" | "skip_item" | "abort";
}

/**
 * Error diagnosis result
 */
export interface ErrorDiagnosis {
  category: ErrorCategory;
  isRecoverable: boolean;
  message: string;
  retryStrategy: RetryStrategy;
  suggestedAction: string;
}

/**
 * Patterns for error classification
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  category: ErrorCategory;
  isRecoverable: boolean;
  retryStrategy: RetryStrategy;
}> = [
  // Rate limiting
  {
    pattern: /rate.?limit|too.?many.?requests|429|quota.?exceeded/i,
    category: "rate_limit",
    isRecoverable: true,
    retryStrategy: {
      shouldRetry: true,
      delayMs: 60000, // 1 minute
      maxRetries: 3,
      fallbackAction: "use_fallback_model",
    },
  },
  // Token/context limits
  {
    pattern: /token.?limit|context.?length|max.?tokens|input.?too.?long/i,
    category: "token_limit",
    isRecoverable: true,
    retryStrategy: {
      shouldRetry: true,
      delayMs: 0,
      maxRetries: 2,
      fallbackAction: "reduce_batch_size",
    },
  },
  // Network errors
  {
    pattern: /network|connection|ECONNREFUSED|ETIMEDOUT|socket|DNS/i,
    category: "network",
    isRecoverable: true,
    retryStrategy: {
      shouldRetry: true,
      delayMs: 5000,
      maxRetries: 3,
    },
  },
  // Timeout
  {
    pattern: /timeout|timed.?out|deadline.?exceeded/i,
    category: "timeout",
    isRecoverable: true,
    retryStrategy: {
      shouldRetry: true,
      delayMs: 2000,
      maxRetries: 2,
    },
  },
  // Validation errors
  {
    pattern: /validation|invalid.?input|schema|parse.?error|JSON/i,
    category: "validation",
    isRecoverable: false,
    retryStrategy: {
      shouldRetry: false,
      delayMs: 0,
      maxRetries: 0,
      fallbackAction: "skip_item",
    },
  },
  // Model errors (internal model failures)
  {
    pattern: /model.?error|internal.?error|500|503|service.?unavailable/i,
    category: "model_error",
    isRecoverable: true,
    retryStrategy: {
      shouldRetry: true,
      delayMs: 10000,
      maxRetries: 2,
      fallbackAction: "use_fallback_model",
    },
  },
  // Tool execution errors
  {
    pattern: /tool.?error|tool.?failed|execution.?failed/i,
    category: "tool_error",
    isRecoverable: true,
    retryStrategy: {
      shouldRetry: true,
      delayMs: 1000,
      maxRetries: 2,
    },
  },
];

/**
 * Diagnose an error and determine recovery strategy
 */
export function diagnoseError(error: Error | string): ErrorDiagnosis {
  const errorMessage = typeof error === "string" ? error : error.message;

  // Try to match against known patterns
  for (const { pattern, category, isRecoverable, retryStrategy } of ERROR_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return {
        category,
        isRecoverable,
        message: errorMessage,
        retryStrategy,
        suggestedAction: getSuggestedAction(category, retryStrategy),
      };
    }
  }

  // Unknown error - default to cautious retry
  return {
    category: "unknown",
    isRecoverable: true,
    message: errorMessage,
    retryStrategy: {
      shouldRetry: true,
      delayMs: 5000,
      maxRetries: 1,
    },
    suggestedAction: "Retry once with exponential backoff, then escalate to HITL if failure persists",
  };
}

/**
 * Get human-readable suggested action
 */
function getSuggestedAction(category: ErrorCategory, strategy: RetryStrategy): string {
  const actions: Record<ErrorCategory, string> = {
    rate_limit: `Wait ${strategy.delayMs / 1000}s before retrying. Consider using fallback model if limit persists.`,
    token_limit: "Reduce batch size or split input into smaller chunks.",
    network: "Check network connectivity. Retry with exponential backoff.",
    timeout: "Increase timeout or reduce workload. Retry with smaller batch.",
    validation: "Fix input data. Check schema compliance.",
    model_error: "Switch to fallback model. Report if issue persists.",
    tool_error: "Verify tool inputs. Check tool availability.",
    unknown: "Log error details. Retry with caution.",
  };

  return actions[category] || "Unknown error - manual intervention may be required.";
}

/**
 * Create an AgentError from a diagnosed error
 */
export function createAgentError(
  agentType: AgentType,
  error: Error | string,
  taskId?: string,
  existingRetryCount: number = 0
): AgentError {
  const diagnosis = diagnoseError(error);

  const errorCodeMap: Record<ErrorCategory, AgentError["code"]> = {
    rate_limit: "RATE_LIMIT",
    token_limit: "PROCESSING_ERROR",
    network: "PROCESSING_ERROR",
    timeout: "TIMEOUT",
    validation: "INVALID_INPUT",
    model_error: "MODEL_ERROR",
    tool_error: "TOOL_ERROR",
    unknown: "UNKNOWN",
  };

  return {
    taskId,
    agentType,
    code: errorCodeMap[diagnosis.category],
    message: diagnosis.message,
    recoverable: diagnosis.isRecoverable && existingRetryCount < diagnosis.retryStrategy.maxRetries,
    retryCount: existingRetryCount,
    maxRetries: diagnosis.retryStrategy.maxRetries,
    details: {
      category: diagnosis.category,
      suggestedAction: diagnosis.suggestedAction,
      delayMs: diagnosis.retryStrategy.delayMs,
      fallbackAction: diagnosis.retryStrategy.fallbackAction,
    },
    occurredAt: new Date().toISOString(),
  };
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoff(
  baseDelayMs: number,
  retryCount: number,
  maxDelayMs: number = 60000,
  jitter: boolean = true
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, retryCount);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  if (jitter) {
    // Add 10-30% random jitter to prevent thundering herd
    const jitterFactor = 0.1 + Math.random() * 0.2;
    return cappedDelay * (1 + jitterFactor);
  }

  return cappedDelay;
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with error diagnosis and backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    agentType: AgentType;
    taskId?: string;
    maxRetries?: number;
    baseDelayMs?: number;
    onError?: (error: AgentError, attempt: number) => void;
    onRetry?: (attempt: number, delayMs: number) => void;
  }
): Promise<{ result?: T; error?: AgentError }> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;

  let lastError: AgentError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { result };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = createAgentError(options.agentType, error, options.taskId, attempt);

      if (options.onError) {
        options.onError(lastError, attempt);
      }

      // Check if we should retry
      const diagnosis = diagnoseError(error);
      if (!diagnosis.isRecoverable || attempt >= maxRetries) {
        break;
      }

      // Calculate delay with backoff
      const delayMs = calculateBackoff(
        diagnosis.retryStrategy.delayMs || baseDelayMs,
        attempt
      );

      if (options.onRetry) {
        options.onRetry(attempt + 1, delayMs);
      }

      await sleep(delayMs);
    }
  }

  return { error: lastError };
}

/**
 * Wrap a batch operation with error handling and partial success
 */
export async function withBatchErrorHandling<T, R>(
  items: T[],
  processFn: (item: T) => Promise<R>,
  options: {
    agentType: AgentType;
    continueOnError?: boolean;
    maxItemRetries?: number;
  }
): Promise<{
  results: R[];
  errors: AgentError[];
  successCount: number;
  failureCount: number;
}> {
  const results: R[] = [];
  const errors: AgentError[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const item of items) {
    const { result, error } = await withRetry(
      () => processFn(item),
      {
        agentType: options.agentType,
        maxRetries: options.maxItemRetries ?? 2,
      }
    );

    if (result !== undefined) {
      results.push(result);
      successCount++;
    } else if (error) {
      errors.push(error);
      failureCount++;

      if (!options.continueOnError) {
        break;
      }
    }
  }

  return { results, errors, successCount, failureCount };
}
