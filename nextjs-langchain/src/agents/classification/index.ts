import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { createClassificationModel } from "@/lib/langchain/models";
import { taxonomySearchTool } from "@/tools";
import {
  taxonomyCache,
  vendorCache,
  getTaxonomyCacheKey,
  getVendorCacheKey,
  getCachedClassification,
  BATCH_CONFIGS,
  performanceTracker,
} from "@/lib/performance";
import { progressEmitter } from "@/lib/progress-emitter";
import type { SpendCubeStateType, Classification, SpendRecord } from "@/types";

/**
 * Progress event emitted during classification
 */
export interface ClassificationProgressEvent {
  type: "classification_progress";
  completed: number;
  total: number;
  latestRecord: Classification;
  record: SpendRecord;
}

/**
 * Progress callback function type
 */
export type ClassificationProgressCallback = (event: ClassificationProgressEvent) => void;

/**
 * Extended config type with progress callback
 * Uses configurable property to avoid conflicts with LangChain callbacks
 */
export interface ClassificationConfig extends RunnableConfig {
  configurable?: {
    thread_id?: string;
    onProgress?: ClassificationProgressCallback;
    [key: string]: unknown;
  };
}

const CLASSIFICATION_SYSTEM_PROMPT = `You are the SpendCube Classification Agent, specialized in classifying procurement spend records to UNSPSC codes.

## Your Task
For each spend record, determine the most appropriate UNSPSC (United Nations Standard Products and Services Code) classification.

## Classification Process
1. Analyze the vendor name and item description
2. Use the taxonomy_search tool to find matching UNSPSC codes
3. Select the most appropriate code based on the description
4. Assign a confidence score (0-100%) based on match quality
5. Provide reasoning for your classification

## Confidence Scoring Guidelines
- 90-100%: Exact match, clear description, known vendor
- 70-89%: Good match, some ambiguity but confident
- 50-69%: Partial match, multiple possible codes
- Below 50%: Poor match, likely needs human review

## Output Format
For each record, provide:
- UNSPSC code (8 digits)
- Code title
- Confidence score
- Brief reasoning

## Important Rules
- Always use the taxonomy_search tool before classifying
- Be conservative with confidence scores
- Flag items that are genuinely ambiguous
- Consider vendor context when available`;

/**
 * Classification Agent Node
 *
 * Classifies spend records to UNSPSC codes using the taxonomy search tool.
 * Supports progress callbacks for real-time streaming updates.
 */
export async function classificationNode(
  state: SpendCubeStateType,
  config?: ClassificationConfig
): Promise<Partial<SpendCubeStateType>> {
  const { inputRecords, classifications: existingClassifications, sessionId } = state;
  const onProgress = config?.configurable?.onProgress;

  // Find records that haven't been classified
  const unclassifiedRecords = inputRecords.filter(
    (record) => !existingClassifications.some((c) => c.recordId === record.id)
  );

  if (unclassifiedRecords.length === 0) {
    return {
      messages: [new AIMessage("All records have already been classified.")],
      stage: "classifying",
    };
  }

  const model = createClassificationModel();
  const newClassifications: Classification[] = [];
  const errors: SpendCubeStateType["errors"] = [];
  const totalRecords = unclassifiedRecords.length;

  // Start performance tracking
  performanceTracker.start("classification", totalRecords);

  // Use optimized batch config for concurrent processing within batches
  const { batchSize } = BATCH_CONFIGS.classification;

  // Process records in small batches for better progress granularity
  for (let i = 0; i < unclassifiedRecords.length; i += batchSize) {
    const batch = unclassifiedRecords.slice(i, Math.min(i + batchSize, unclassifiedRecords.length));

    try {
      // Process all records in the batch in parallel for ~10x speedup
      const batchResults = await Promise.all(
        batch.map(async (record, batchIndex) => {
          const classification = await classifyRecord(model, record);
          performanceTracker.recordSuccess();

          // Emit progress after each completion (still works with Promise.all)
          const completed = i + batchIndex + 1;
          const progressEvent: ClassificationProgressEvent = {
            type: "classification_progress",
            completed,
            total: totalRecords,
            latestRecord: classification,
            record,
          };

          // Emit via callback if provided
          if (onProgress) {
            onProgress(progressEvent);
          }

          // Also emit via global progress emitter for SSE streaming
          if (sessionId && progressEmitter.hasListener(sessionId)) {
            progressEmitter.emit(sessionId, progressEvent);
          }

          return classification;
        })
      );
      newClassifications.push(...batchResults);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errors.push({
        agentType: "classification",
        code: "PROCESSING_ERROR",
        message: `Failed to classify batch starting at record ${i + 1}: ${errorMessage}`,
        recoverable: true,
        retryCount: 0,
        maxRetries: 3,
        occurredAt: new Date().toISOString(),
      });
      performanceTracker.recordError();
    }
  }

  // End performance tracking
  const metrics = performanceTracker.end();

  const successCount = newClassifications.length;
  const highConfidenceCount = newClassifications.filter(c => c.confidence >= 70).length;

  // Build performance summary
  const perfSummary = metrics
    ? ` (${metrics.duration}ms, ${(successCount / (metrics.duration || 1) * 1000).toFixed(1)} records/sec)`
    : "";

  return {
    classifications: newClassifications,
    messages: [
      new AIMessage(
        `Classification complete. Processed ${successCount} of ${totalRecords} records. ` +
        `${highConfidenceCount} have high confidence (≥70%), ` +
        `${successCount - highConfidenceCount} may need review.${perfSummary}`
      ),
    ],
    errors: errors.length > 0 ? errors : [],
    stage: "classifying",
  };
}

/**
 * Classify a single record with multi-level caching support
 */
async function classifyRecord(
  model: ReturnType<typeof createClassificationModel>,
  record: SpendRecord
): Promise<Classification> {
  // Check multi-level cache first (exact match, then vendor-only)
  const cached = getCachedClassification(record.vendor, record.description);

  if (cached) {
    performanceTracker.recordCacheHit();
    return {
      recordId: record.id,
      unspscCode: cached.code,
      unspscTitle: cached.title,
      confidence: cached.confidence,
      reasoning: `Classified from ${cached.source} cache`,
      classifiedAt: new Date().toISOString(),
      classifiedBy: "classification-agent-cache",
    };
  }

  performanceTracker.recordCacheMiss();

  // Search the taxonomy
  const searchQuery = `${record.vendor} ${record.description}`;
  const searchResult = await taxonomySearchTool.invoke({ query: searchQuery, limit: 5 });
  const taxonomyResults = JSON.parse(searchResult);

  // Build classification prompt
  const prompt = `Classify this spend record:

Vendor: ${record.vendor}
Description: ${record.description}
Amount: $${record.amount}
${record.department ? `Department: ${record.department}` : ""}

Taxonomy search results:
${JSON.stringify(taxonomyResults.results, null, 2)}

Based on the taxonomy search results and the record details, provide your classification in JSON format:
{
  "unspscCode": "8-digit code",
  "unspscTitle": "code title",
  "segment": "segment name",
  "family": "family name",
  "confidence": 0-100,
  "reasoning": "brief explanation"
}`;

  const messages = [
    new SystemMessage(CLASSIFICATION_SYSTEM_PROMPT),
    new HumanMessage(prompt),
  ];

  try {
    const response = await model.invoke(messages);
    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    // Parse the JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const classification: Classification = {
      recordId: record.id,
      unspscCode: parsed.unspscCode || "00000000",
      unspscTitle: parsed.unspscTitle || "Unknown",
      segment: parsed.segment,
      family: parsed.family,
      confidence: Math.min(100, Math.max(0, parsed.confidence || 50)),
      reasoning: parsed.reasoning || "Classification based on description analysis",
      classifiedAt: new Date().toISOString(),
      classifiedBy: "classification-agent",
    };

    // Store in BOTH caches after successful classification
    const cacheEntry = {
      code: classification.unspscCode,
      title: classification.unspscTitle,
      confidence: classification.confidence,
    };
    // Level 1: Exact match cache (vendor::description)
    const cacheKey = getTaxonomyCacheKey(record.vendor, record.description);
    taxonomyCache.set(cacheKey, cacheEntry);
    // Level 2: Vendor-only cache (same vendor = same category)
    const vendorKey = getVendorCacheKey(record.vendor);
    vendorCache.set(vendorKey, cacheEntry);

    return classification;
  } catch (error) {
    // Return a low-confidence classification on error
    const bestMatch = taxonomyResults.results?.[0];
    return {
      recordId: record.id,
      unspscCode: bestMatch?.code || "00000000",
      unspscTitle: bestMatch?.title || "Unclassified",
      segment: bestMatch?.segment,
      family: bestMatch?.family,
      confidence: 30,
      reasoning: `Auto-classified with low confidence due to processing error: ${error instanceof Error ? error.message : "Unknown error"}`,
      classifiedAt: new Date().toISOString(),
      classifiedBy: "classification-agent",
    };
  }
}
