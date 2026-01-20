import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createExtractionModel } from "@/lib/langchain/models";
import type { SpendCubeStateType, SpendRecord } from "@/types";

const EXTRACTION_SYSTEM_PROMPT = `You are the SpendCube Extraction Agent, specialized in extracting and structuring spend data from raw records.

## Your Task
Analyze raw spend records and extract structured information including:
- Vendor name (normalized)
- Item/service description (cleaned and standardized)
- Amount (numeric, without currency symbols)
- Date (ISO format)
- Department (if available)
- Cost center (if available)
- Invoice/PO reference (if available)

## Extraction Guidelines
1. Clean vendor names: Remove suffixes like "Inc", "LLC", "Corp" inconsistencies
2. Standardize descriptions: Remove unnecessary punctuation, normalize case
3. Parse amounts: Extract numeric values, handle different formats (1,000.00, $1000, etc.)
4. Normalize dates: Convert to ISO 8601 format (YYYY-MM-DD)
5. Identify missing fields: Mark as null if not present

## Quality Indicators
For each record, assess:
- completeness: Are all expected fields present?
- confidence: How reliable is the extraction?
- issues: Any data quality concerns?

## Output Format
Return structured JSON for each record with extracted fields and quality assessment.`;

/**
 * Extraction result for a single record
 */
export interface ExtractionResult {
  recordId: string;
  extracted: {
    vendor: string;
    description: string;
    amount: number;
    date: string | null;
    department: string | null;
    costCenter: string | null;
    invoiceRef: string | null;
  };
  quality: {
    completeness: number; // 0-100
    confidence: number;   // 0-100
    issues: string[];
  };
  extractedAt: string;
}

/**
 * Extraction Agent Node
 *
 * Extracts and structures data from raw spend records.
 * This is typically the first step in the processing pipeline.
 */
export async function extractionNode(
  state: SpendCubeStateType
): Promise<Partial<SpendCubeStateType>> {
  const { inputRecords } = state;

  if (inputRecords.length === 0) {
    return {
      messages: [new AIMessage("No records to extract.")],
      stage: "idle",
    };
  }

  const model = createExtractionModel();
  const results: ExtractionResult[] = [];
  const errors: SpendCubeStateType["errors"] = [];

  // Process in parallel batches
  const batchSize = 10;
  for (let i = 0; i < inputRecords.length; i += batchSize) {
    const batch = inputRecords.slice(i, i + batchSize);

    try {
      const batchResults = await Promise.all(
        batch.map((record) => extractRecord(model, record))
      );
      results.push(...batchResults);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errors.push({
        agentType: "classification", // Using existing type
        code: "PROCESSING_ERROR",
        message: `Extraction batch ${i / batchSize + 1} failed: ${errorMessage}`,
        recoverable: true,
        retryCount: 0,
        maxRetries: 3,
        occurredAt: new Date().toISOString(),
      });
    }
  }

  // Create enhanced records with extraction results
  const enhancedRecords: SpendRecord[] = inputRecords.map((record) => {
    const result = results.find((r) => r.recordId === record.id);
    if (result) {
      return {
        ...record,
        vendor: result.extracted.vendor,
        description: result.extracted.description,
        amount: result.extracted.amount,
        date: result.extracted.date || record.date,
        department: result.extracted.department || record.department,
      };
    }
    return record;
  });

  const avgConfidence = results.length > 0
    ? results.reduce((sum, r) => sum + r.quality.confidence, 0) / results.length
    : 0;

  return {
    inputRecords: enhancedRecords,
    messages: [
      new AIMessage(
        `Extraction complete. Processed ${results.length} records with average confidence ${avgConfidence.toFixed(1)}%.`
      ),
    ],
    errors: errors.length > 0 ? errors : [],
    stage: "classifying", // Move to next stage
  };
}

/**
 * Extract data from a single record
 */
async function extractRecord(
  model: ReturnType<typeof createExtractionModel>,
  record: SpendRecord
): Promise<ExtractionResult> {
  const prompt = `Extract structured data from this spend record:

Raw Data:
- ID: ${record.id}
- Vendor: ${record.vendor}
- Description: ${record.description}
- Amount: ${record.amount}
- Date: ${record.date || "Not provided"}
- Department: ${record.department || "Not provided"}

Return JSON:
{
  "vendor": "normalized vendor name",
  "description": "cleaned description",
  "amount": numeric_value,
  "date": "YYYY-MM-DD or null",
  "department": "department or null",
  "costCenter": "cost center or null",
  "invoiceRef": "invoice reference or null",
  "completeness": 0-100,
  "confidence": 0-100,
  "issues": ["any data quality issues"]
}`;

  const messages = [
    new SystemMessage(EXTRACTION_SYSTEM_PROMPT),
    new HumanMessage(prompt),
  ];

  try {
    const response = await model.invoke(messages);
    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      recordId: record.id,
      extracted: {
        vendor: parsed.vendor || record.vendor,
        description: parsed.description || record.description,
        amount: typeof parsed.amount === "number" ? parsed.amount : record.amount,
        date: parsed.date || record.date || null,
        department: parsed.department || record.department || null,
        costCenter: parsed.costCenter || null,
        invoiceRef: parsed.invoiceRef || null,
      },
      quality: {
        completeness: parsed.completeness || 70,
        confidence: parsed.confidence || 80,
        issues: parsed.issues || [],
      },
      extractedAt: new Date().toISOString(),
    };
  } catch (error) {
    // Return original data on error
    return {
      recordId: record.id,
      extracted: {
        vendor: record.vendor,
        description: record.description,
        amount: record.amount,
        date: record.date || null,
        department: record.department || null,
        costCenter: null,
        invoiceRef: null,
      },
      quality: {
        completeness: 50,
        confidence: 30,
        issues: [`Extraction error: ${error instanceof Error ? error.message : "Unknown"}`],
      },
      extractedAt: new Date().toISOString(),
    };
  }
}

export { EXTRACTION_SYSTEM_PROMPT };
