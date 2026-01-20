import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createEnrichmentModel } from "@/lib/langchain/models";
import type { SpendCubeStateType, SpendRecord, Classification } from "@/types";

const ENRICHMENT_SYSTEM_PROMPT = `You are the SpendCube Enrichment Agent, specialized in enhancing spend records with additional context and insights.

## Your Task
Enrich spend records with additional information:

### Vendor Enrichment
- Company type (Manufacturer, Distributor, Service Provider, etc.)
- Industry classification
- Risk factors (if known)
- Contract status hints

### Spend Enrichment
- Spend type (Direct, Indirect, Capex, Opex)
- Payment terms typical for this category
- Seasonality indicators
- Benchmark comparisons

### Strategic Enrichment
- Strategic importance (Critical, Important, Routine, Tactical)
- Consolidation opportunities
- Alternative vendors
- Savings potential indicators

## Output Format
Return enrichment data that adds business context to the raw classification.`;

/**
 * Enrichment data for a record
 */
export interface EnrichmentData {
  recordId: string;
  vendorInfo: {
    companyType: string;
    industry: string;
    riskLevel: "low" | "medium" | "high" | "unknown";
  };
  spendInfo: {
    spendType: "direct" | "indirect" | "capex" | "opex";
    strategicImportance: "critical" | "important" | "routine" | "tactical";
    consolidationOpportunity: boolean;
  };
  insights: string[];
  enrichedAt: string;
}

/**
 * Enrichment Agent Node
 *
 * Adds business context and insights to classified records.
 */
export async function enrichmentNode(
  state: SpendCubeStateType
): Promise<Partial<SpendCubeStateType>> {
  const { inputRecords, classifications } = state;

  if (classifications.length === 0) {
    return {
      messages: [new AIMessage("No classified records to enrich.")],
    };
  }

  const model = createEnrichmentModel();
  const enrichments: EnrichmentData[] = [];

  // Get records that have been classified
  const classifiedRecords = inputRecords.filter((record) =>
    classifications.some((c) => c.recordId === record.id)
  );

  // Process in parallel batches
  const batchSize = 5;
  for (let i = 0; i < classifiedRecords.length; i += batchSize) {
    const batch = classifiedRecords.slice(i, i + batchSize);

    const batchEnrichments = await Promise.all(
      batch.map((record) => {
        const classification = classifications.find((c) => c.recordId === record.id);
        return enrichRecord(model, record, classification!);
      })
    );
    enrichments.push(...batchEnrichments);
  }

  // Calculate insights
  const criticalSpend = enrichments.filter(
    (e) => e.spendInfo.strategicImportance === "critical"
  ).length;
  const consolidationOps = enrichments.filter(
    (e) => e.spendInfo.consolidationOpportunity
  ).length;

  return {
    messages: [
      new AIMessage(
        `Enrichment complete. ${enrichments.length} records enriched. ` +
        `${criticalSpend} critical spend items identified. ` +
        `${consolidationOps} consolidation opportunities found.`
      ),
    ],
    stage: "enriching", // Correct stage for enrichment node
  };
}

/**
 * Enrich a single record
 */
async function enrichRecord(
  model: ReturnType<typeof createEnrichmentModel>,
  record: SpendRecord,
  classification: Classification
): Promise<EnrichmentData> {
  const prompt = `Enrich this classified spend record:

Vendor: ${record.vendor}
Description: ${record.description}
Amount: $${record.amount}
UNSPSC Code: ${classification.unspscCode}
Category: ${classification.unspscTitle}
Segment: ${classification.segment || "N/A"}

Return JSON:
{
  "companyType": "Manufacturer|Distributor|Service Provider|Retailer|Other",
  "industry": "industry classification",
  "riskLevel": "low|medium|high|unknown",
  "spendType": "direct|indirect|capex|opex",
  "strategicImportance": "critical|important|routine|tactical",
  "consolidationOpportunity": true|false,
  "insights": ["list of business insights"]
}`;

  const messages = [
    new SystemMessage(ENRICHMENT_SYSTEM_PROMPT),
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
      vendorInfo: {
        companyType: parsed.companyType || "Other",
        industry: parsed.industry || "Unknown",
        riskLevel: parsed.riskLevel || "unknown",
      },
      spendInfo: {
        spendType: parsed.spendType || "indirect",
        strategicImportance: parsed.strategicImportance || "routine",
        consolidationOpportunity: parsed.consolidationOpportunity || false,
      },
      insights: parsed.insights || [],
      enrichedAt: new Date().toISOString(),
    };
  } catch {
    // Default enrichment on error
    return {
      recordId: record.id,
      vendorInfo: {
        companyType: "Other",
        industry: "Unknown",
        riskLevel: "unknown",
      },
      spendInfo: {
        spendType: inferSpendType(classification.segment),
        strategicImportance: inferStrategicImportance(record.amount),
        consolidationOpportunity: false,
      },
      insights: [],
      enrichedAt: new Date().toISOString(),
    };
  }
}

/**
 * Infer spend type from segment
 */
function inferSpendType(segment: string | undefined): EnrichmentData["spendInfo"]["spendType"] {
  if (!segment) return "indirect";

  const segLower = segment.toLowerCase();
  if (/raw material|manufacturing|production/i.test(segLower)) {
    return "direct";
  }
  if (/equipment|machinery|furniture/i.test(segLower)) {
    return "capex";
  }
  return "indirect";
}

/**
 * Infer strategic importance from amount
 */
function inferStrategicImportance(
  amount: number
): EnrichmentData["spendInfo"]["strategicImportance"] {
  if (amount >= 100000) return "critical";
  if (amount >= 25000) return "important";
  if (amount >= 5000) return "routine";
  return "tactical";
}

export { ENRICHMENT_SYSTEM_PROMPT };
