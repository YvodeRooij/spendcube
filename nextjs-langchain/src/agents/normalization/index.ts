import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createExtractionModel } from "@/lib/langchain/models";
import type { SpendCubeStateType, SpendRecord } from "@/types";

const NORMALIZATION_SYSTEM_PROMPT = `You are the SpendCube Normalization Agent, specialized in standardizing spend data across the organization.

## Your Task
Normalize spend records by applying consistent standards:

### Vendor Normalization
- Map vendor names to canonical/parent company names
- Example: "MSFT", "Microsoft Corp", "Microsoft Inc" → "Microsoft"
- Maintain a consistent naming convention

### Category Normalization
- Identify preliminary category based on description
- Map to high-level spend categories:
  - IT & Technology
  - Professional Services
  - Office & Supplies
  - Facilities & Maintenance
  - Travel & Entertainment
  - HR & Staffing
  - Marketing & Advertising
  - Raw Materials & MRO
  - Utilities
  - Other

### Currency Normalization
- Ensure all amounts are in base currency (USD)
- Flag if currency conversion needed

### Unit Normalization
- Standardize units of measure
- Calculate unit costs where applicable

## Output Format
Return normalized data with standardizations applied.`;

/**
 * Normalization result
 */
export interface NormalizationResult {
  recordId: string;
  normalizedVendor: string;
  vendorParent: string | null;
  preliminaryCategory: string;
  normalizedAmount: number;
  currency: string;
  normalizedAt: string;
}

/**
 * Vendor mapping for common variations
 */
const VENDOR_MAPPINGS: Record<string, string> = {
  "msft": "Microsoft",
  "microsoft corp": "Microsoft",
  "microsoft corporation": "Microsoft",
  "microsoft inc": "Microsoft",
  "aws": "Amazon Web Services",
  "amazon aws": "Amazon Web Services",
  "amazon.com": "Amazon",
  "amzn": "Amazon",
  "goog": "Google",
  "google llc": "Google",
  "alphabet": "Google",
  "ibm corp": "IBM",
  "international business machines": "IBM",
  "dell technologies": "Dell",
  "dell inc": "Dell",
  "hp inc": "HP",
  "hewlett packard": "HP",
  "hewlett-packard": "HP",
  "cisco systems": "Cisco",
  "salesforce.com": "Salesforce",
  "salesforce inc": "Salesforce",
};

/**
 * Normalization Agent Node
 */
export async function normalizationNode(
  state: SpendCubeStateType
): Promise<Partial<SpendCubeStateType>> {
  const { inputRecords } = state;

  if (inputRecords.length === 0) {
    return {
      messages: [new AIMessage("No records to normalize.")],
    };
  }

  const model = createExtractionModel();
  const results: NormalizationResult[] = [];

  // Process in parallel batches
  const batchSize = 10;
  for (let i = 0; i < inputRecords.length; i += batchSize) {
    const batch = inputRecords.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map((record) => normalizeRecord(model, record))
    );
    results.push(...batchResults);
  }

  // Apply normalization
  const normalizedRecords: SpendRecord[] = inputRecords.map((record) => {
    const result = results.find((r) => r.recordId === record.id);
    if (result) {
      return {
        ...record,
        vendor: result.normalizedVendor,
      };
    }
    return record;
  });

  // Count unique normalized vendors
  const uniqueVendors = new Set(results.map((r) => r.normalizedVendor)).size;
  const originalVendors = new Set(inputRecords.map((r) => r.vendor)).size;
  const vendorsConsolidated = originalVendors - uniqueVendors;

  return {
    inputRecords: normalizedRecords,
    messages: [
      new AIMessage(
        `Normalization complete. ${vendorsConsolidated} vendor variations consolidated. ${uniqueVendors} unique vendors.`
      ),
    ],
  };
}

/**
 * Normalize a single record
 */
async function normalizeRecord(
  model: ReturnType<typeof createExtractionModel>,
  record: SpendRecord
): Promise<NormalizationResult> {
  // First try rule-based normalization
  const vendorLower = record.vendor.toLowerCase().trim();
  const mappedVendor = VENDOR_MAPPINGS[vendorLower];

  if (mappedVendor) {
    return {
      recordId: record.id,
      normalizedVendor: mappedVendor,
      vendorParent: mappedVendor,
      preliminaryCategory: inferCategory(record.description),
      normalizedAmount: record.amount,
      currency: "USD",
      normalizedAt: new Date().toISOString(),
    };
  }

  // Use AI for complex normalization
  const prompt = `Normalize this spend record:

Vendor: ${record.vendor}
Description: ${record.description}
Amount: ${record.amount}

Return JSON:
{
  "normalizedVendor": "standardized vendor name",
  "vendorParent": "parent company if different, or null",
  "preliminaryCategory": "one of: IT & Technology, Professional Services, Office & Supplies, Facilities & Maintenance, Travel & Entertainment, HR & Staffing, Marketing & Advertising, Raw Materials & MRO, Utilities, Other"
}`;

  const messages = [
    new SystemMessage(NORMALIZATION_SYSTEM_PROMPT),
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
      normalizedVendor: parsed.normalizedVendor || record.vendor,
      vendorParent: parsed.vendorParent || null,
      preliminaryCategory: parsed.preliminaryCategory || "Other",
      normalizedAmount: record.amount,
      currency: "USD",
      normalizedAt: new Date().toISOString(),
    };
  } catch {
    return {
      recordId: record.id,
      normalizedVendor: record.vendor,
      vendorParent: null,
      preliminaryCategory: inferCategory(record.description),
      normalizedAmount: record.amount,
      currency: "USD",
      normalizedAt: new Date().toISOString(),
    };
  }
}

/**
 * Simple rule-based category inference
 */
function inferCategory(description: string): string {
  const desc = description.toLowerCase();

  if (/software|license|saas|computer|laptop|server|it\s+/i.test(desc)) {
    return "IT & Technology";
  }
  if (/consult|legal|audit|professional|advisory/i.test(desc)) {
    return "Professional Services";
  }
  if (/office|paper|supplies|stationery/i.test(desc)) {
    return "Office & Supplies";
  }
  if (/travel|hotel|flight|airline|rental/i.test(desc)) {
    return "Travel & Entertainment";
  }
  if (/recruit|staffing|hr|training|payroll/i.test(desc)) {
    return "HR & Staffing";
  }
  if (/marketing|advertising|media|pr/i.test(desc)) {
    return "Marketing & Advertising";
  }
  if (/facility|maintenance|repair|janitor|cleaning/i.test(desc)) {
    return "Facilities & Maintenance";
  }
  if (/utility|electric|water|gas|energy/i.test(desc)) {
    return "Utilities";
  }

  return "Other";
}

export { NORMALIZATION_SYSTEM_PROMPT, VENDOR_MAPPINGS };
