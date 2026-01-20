import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AgentType } from "@/types/agents";
import type { TokenUsage, TokenBudget } from "@/types/state";

/**
 * Model configuration types
 */
export type ModelProvider = "google" | "anthropic" | "openai";

export type ThinkingLevel = "none" | "low" | "medium" | "high";

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  thinking?: ThinkingLevel;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Thinking token budgets per level
 * These control how much "thinking" time the model gets before responding
 */
export const THINKING_BUDGETS: Record<ThinkingLevel, number> = {
  none: 0,
  low: 1024,      // Quick decisions
  medium: 4096,   // Moderate reasoning
  high: 16384,    // Deep analysis
};

/**
 * Get thinking budget for a given level
 */
export function getThinkingBudget(level: ThinkingLevel): number {
  return THINKING_BUDGETS[level] || 0;
}

/**
 * Predefined model configurations for SpendCube agents
 */
export const MODEL_CONFIGS = {
  supervisor: {
    provider: "google" as const,
    model: "gemini-3-flash-preview",
    thinking: "high" as const,
    temperature: 0.3,
  },
  classification: {
    provider: "google" as const,
    model: "gemini-3-flash-preview",
    thinking: "low" as const,     // Reduced from "medium" - classification is structured lookup, not complex reasoning
    temperature: 0.2,
  },
  qa: {
    provider: "anthropic" as const,
    model: "claude-sonnet-4-20250514",
    thinking: "medium" as const,
    temperature: 0.1,
  },
  analysis: {
    provider: "anthropic" as const,
    model: "claude-sonnet-4-20250514",
    thinking: "high" as const,
    temperature: 0.2,
    maxTokens: 8192,
  },
  extraction: {
    provider: "google" as const,
    model: "gemini-3-flash-preview",
    thinking: "low" as const,
    temperature: 0.1,
  },
  enrichment: {
    provider: "google" as const,
    model: "gemini-3-flash-preview",
    thinking: "medium" as const,
    temperature: 0.3,
  },
  fallback: {
    provider: "openai" as const,
    model: "gpt-4o-mini",
    temperature: 0.3,
  },
} as const;

/**
 * Create a Gemini model instance
 */
function createGeminiModel(config: ModelConfig): BaseChatModel {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY environment variable is required for Gemini models");
  }

  return new ChatGoogleGenerativeAI({
    apiKey,
    model: config.model,
    temperature: config.temperature ?? 0.3,
    maxOutputTokens: config.maxTokens ?? 8192,
  });
}

/**
 * Create a Claude model instance with optional extended thinking
 */
function createAnthropicModel(config: ModelConfig): BaseChatModel {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required for Claude models");
  }

  const thinkingBudget = config.thinking ? getThinkingBudget(config.thinking) : 0;
  const useExtendedThinking = thinkingBudget > 0;

  // Extended thinking models require specific configuration
  const anthropicConfig: ConstructorParameters<typeof ChatAnthropic>[0] = {
    apiKey,
    model: config.model,
    maxTokens: config.maxTokens ?? 4096,
  };

  // Extended thinking requires temperature to be unset or 1
  // and uses a special thinking parameter
  if (useExtendedThinking) {
    anthropicConfig.temperature = 1; // Required for extended thinking
    // Note: Extended thinking budget is set via model invocation, not constructor
    // The thinking budget will be passed via invocation options
  } else {
    anthropicConfig.temperature = config.temperature ?? 0.3;
  }

  return new ChatAnthropic(anthropicConfig);
}

/**
 * Create an OpenAI model instance
 */
function createOpenAIModel(config: ModelConfig): BaseChatModel {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required for OpenAI models");
  }

  return new ChatOpenAI({
    apiKey,
    model: config.model,
    temperature: config.temperature ?? 0.3,
    maxTokens: config.maxTokens ?? 4096,
  });
}

/**
 * Factory function to create a model based on configuration
 */
export function createModel(config: ModelConfig): BaseChatModel {
  switch (config.provider) {
    case "google":
      return createGeminiModel(config);
    case "anthropic":
      return createAnthropicModel(config);
    case "openai":
      return createOpenAIModel(config);
    default:
      throw new Error(`Unknown model provider: ${config.provider}`);
  }
}

/**
 * Create the supervisor model (Gemini with high thinking)
 */
export function createSupervisorModel(): BaseChatModel {
  return createModel(MODEL_CONFIGS.supervisor);
}

/**
 * Create the classification model (Gemini Flash)
 */
export function createClassificationModel(): BaseChatModel {
  return createModel(MODEL_CONFIGS.classification);
}

/**
 * Create the QA judge model (Claude Sonnet)
 */
export function createQAModel(): BaseChatModel {
  return createModel(MODEL_CONFIGS.qa);
}

/**
 * Create the fallback model (GPT-4o-mini)
 */
export function createFallbackModel(): BaseChatModel {
  return createModel(MODEL_CONFIGS.fallback);
}

/**
 * Create the analysis model (Claude with high thinking)
 */
export function createAnalysisModel(): BaseChatModel {
  return createModel(MODEL_CONFIGS.analysis);
}

/**
 * Create the extraction model (Gemini Flash with low thinking)
 */
export function createExtractionModel(): BaseChatModel {
  return createModel(MODEL_CONFIGS.extraction);
}

/**
 * Create the enrichment model (Gemini Flash with medium thinking)
 */
export function createEnrichmentModel(): BaseChatModel {
  return createModel(MODEL_CONFIGS.enrichment);
}

/**
 * Get model configuration for an agent type
 */
export function getModelConfigForAgent(agentType: AgentType): ModelConfig {
  switch (agentType) {
    case "supervisor":
      return MODEL_CONFIGS.supervisor;
    case "classification":
      return MODEL_CONFIGS.classification;
    case "qa":
      return MODEL_CONFIGS.qa;
    case "analysis":
      return MODEL_CONFIGS.analysis;
    default:
      return MODEL_CONFIGS.fallback;
  }
}

/**
 * Create model for a specific agent type
 */
export function createModelForAgent(agentType: AgentType): BaseChatModel {
  const config = getModelConfigForAgent(agentType);
  return createModel(config);
}

/**
 * Create a model with automatic fallback on failure
 */
export async function createModelWithFallback(
  primaryConfig: ModelConfig,
  fallbackConfig: ModelConfig = MODEL_CONFIGS.fallback
): Promise<BaseChatModel> {
  try {
    return createModel(primaryConfig);
  } catch {
    console.warn(`Failed to create ${primaryConfig.provider} model, falling back to ${fallbackConfig.provider}`);
    return createModel(fallbackConfig);
  }
}

// ============================================================================
// Token Budget Tracking
// ============================================================================

/**
 * Create a token usage entry for tracking
 */
export function createTokenUsage(
  agentType: AgentType,
  promptTokens: number,
  completionTokens: number
): TokenUsage {
  return {
    agentType,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Update token budget with new usage
 */
export function updateTokenBudget(
  current: TokenBudget,
  agentType: AgentType,
  promptTokens: number,
  completionTokens: number
): Partial<TokenBudget> {
  const totalTokens = promptTokens + completionTokens;
  const newUsedTokens = current.usedTokens + totalTokens;

  const agentUsage = current.byAgent[agentType] || { prompt: 0, completion: 0, total: 0 };

  return {
    usedTokens: totalTokens, // The reducer will add this to the existing total
    byAgent: {
      [agentType]: {
        prompt: agentUsage.prompt + promptTokens,
        completion: agentUsage.completion + completionTokens,
        total: agentUsage.total + totalTokens,
      },
    } as TokenBudget["byAgent"],
    exceeded: newUsedTokens >= current.maxTokens,
  };
}

/**
 * Check if token budget is near the warning threshold
 */
export function isNearBudgetLimit(budget: TokenBudget): boolean {
  return budget.usedTokens >= budget.maxTokens * budget.warningThreshold;
}

/**
 * Check if token budget has been exceeded
 */
export function isBudgetExceeded(budget: TokenBudget): boolean {
  return budget.exceeded || budget.usedTokens >= budget.maxTokens;
}

/**
 * Get remaining tokens in budget
 */
export function getRemainingTokens(budget: TokenBudget): number {
  return Math.max(0, budget.maxTokens - budget.usedTokens);
}

/**
 * Get token usage percentage
 */
export function getTokenUsagePercentage(budget: TokenBudget): number {
  return (budget.usedTokens / budget.maxTokens) * 100;
}

/**
 * Create initial token budget with custom settings
 */
export function createTokenBudget(
  maxTokens: number = 1000000,
  warningThreshold: number = 0.8
): TokenBudget {
  return {
    maxTokens,
    usedTokens: 0,
    byAgent: {
      supervisor: { prompt: 0, completion: 0, total: 0 },
      classification: { prompt: 0, completion: 0, total: 0 },
      qa: { prompt: 0, completion: 0, total: 0 },
      analysis: { prompt: 0, completion: 0, total: 0 },
      hitl: { prompt: 0, completion: 0, total: 0 },
    },
    warningThreshold,
    exceeded: false,
  };
}
