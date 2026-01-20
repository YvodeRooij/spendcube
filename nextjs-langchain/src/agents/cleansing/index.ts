import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createExtractionModel } from "@/lib/langchain/models";
import type { SpendCubeStateType, SpendRecord } from "@/types";

const CLEANSING_SYSTEM_PROMPT = `You are the SpendCube Cleansing Agent, specialized in cleaning and validating spend data.

## Your Task
Clean and validate spend records by:
1. Removing duplicates
2. Fixing data inconsistencies
3. Standardizing formats
4. Validating data integrity
5. Flagging suspicious entries

## Cleansing Rules

### Vendor Cleansing
- Normalize vendor names (consistent casing, remove duplicates like "DELL" vs "Dell Inc")
- Map common vendor aliases to canonical names
- Flag unknown or suspicious vendors

### Description Cleansing
- Remove special characters and excessive whitespace
- Expand common abbreviations
- Standardize terminology

### Amount Cleansing
- Remove currency symbols
- Convert to standard decimal format
- Flag negative amounts or outliers
- Flag amounts that seem unusually high or low

### Date Cleansing
- Convert to ISO 8601 format
- Flag future dates
- Flag dates more than 2 years old

## Output Format
Return cleansed data with changes made and any flags raised.`;

/**
 * Cleansing result for a record
 */
export interface CleansingResult {
  recordId: string;
  original: {
    vendor: string;
    description: string;
    amount: number;
  };
  cleansed: {
    vendor: string;
    description: string;
    amount: number;
  };
  changes: string[];
  flags: string[];
  isDuplicate: boolean;
  cleansedAt: string;
}

/**
 * Cleansing Agent Node
 *
 * Cleans and validates spend records for data quality.
 */
export async function cleansingNode(
  state: SpendCubeStateType
): Promise<Partial<SpendCubeStateType>> {
  const { inputRecords } = state;

  if (inputRecords.length === 0) {
    return {
      messages: [new AIMessage("No records to cleanse.")],
    };
  }

  const model = createExtractionModel();
  const results: CleansingResult[] = [];

  // Process in parallel batches
  const batchSize = 10;
  for (let i = 0; i < inputRecords.length; i += batchSize) {
    const batch = inputRecords.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map((record) => cleanseRecord(model, record, inputRecords))
    );
    results.push(...batchResults);
  }

  // Apply cleansing to records
  const cleansedRecords: SpendRecord[] = inputRecords.map((record) => {
    const result = results.find((r) => r.recordId === record.id);
    if (result && !result.isDuplicate) {
      return {
        ...record,
        vendor: result.cleansed.vendor,
        description: result.cleansed.description,
        amount: result.cleansed.amount,
      };
    }
    return record;
  });

  // Remove duplicates
  const uniqueRecords = cleansedRecords.filter((record) => {
    const result = results.find((r) => r.recordId === record.id);
    return !result?.isDuplicate;
  });

  const duplicateCount = inputRecords.length - uniqueRecords.length;
  const changesCount = results.filter((r) => r.changes.length > 0).length;
  const flagsCount = results.filter((r) => r.flags.length > 0).length;

  return {
    inputRecords: uniqueRecords,
    messages: [
      new AIMessage(
        `Cleansing complete. ${changesCount} records modified, ${duplicateCount} duplicates removed, ${flagsCount} records flagged.`
      ),
    ],
  };
}

/**
 * Cleanse a single record
 */
async function cleanseRecord(
  model: ReturnType<typeof createExtractionModel>,
  record: SpendRecord,
  allRecords: SpendRecord[]
): Promise<CleansingResult> {
  // Simple duplicate check (same vendor + amount + date)
  const isDuplicate = allRecords.some(
    (other) =>
      other.id !== record.id &&
      other.vendor.toLowerCase() === record.vendor.toLowerCase() &&
      other.amount === record.amount &&
      other.date === record.date
  );

  const prompt = `Cleanse this spend record:

Vendor: ${record.vendor}
Description: ${record.description}
Amount: ${record.amount}
Date: ${record.date || "N/A"}

Return JSON:
{
  "vendor": "cleansed vendor name",
  "description": "cleansed description",
  "amount": cleansed_amount,
  "changes": ["list of changes made"],
  "flags": ["any data quality flags"]
}`;

  const messages = [
    new SystemMessage(CLEANSING_SYSTEM_PROMPT),
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
      original: {
        vendor: record.vendor,
        description: record.description,
        amount: record.amount,
      },
      cleansed: {
        vendor: parsed.vendor || record.vendor,
        description: parsed.description || record.description,
        amount: typeof parsed.amount === "number" ? parsed.amount : record.amount,
      },
      changes: parsed.changes || [],
      flags: parsed.flags || [],
      isDuplicate,
      cleansedAt: new Date().toISOString(),
    };
  } catch {
    // Return original on error
    return {
      recordId: record.id,
      original: {
        vendor: record.vendor,
        description: record.description,
        amount: record.amount,
      },
      cleansed: {
        vendor: record.vendor,
        description: record.description,
        amount: record.amount,
      },
      changes: [],
      flags: ["Cleansing skipped due to error"],
      isDuplicate,
      cleansedAt: new Date().toISOString(),
    };
  }
}

export { CLEANSING_SYSTEM_PROMPT };
