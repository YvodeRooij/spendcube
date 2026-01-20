# SpendCube AI - Architecture

## Overview

SpendCube AI is a multi-agent procurement analytics system built with LangGraph and Next.js. It classifies spend records to UNSPSC codes using a sophisticated pipeline with quality assurance and human-in-the-loop review.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SpendCube AI                                │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │  Next.js    │  │  LangGraph  │  │  LangChain  │  │  LangSmith │ │
│  │  Frontend   │──│  Workflow   │──│   Models    │──│  Tracing   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
│         │               │                │                         │
│         ▼               ▼                ▼                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │   Upload    │  │  Postgres   │  │   OpenAI    │                │
│  │  (Gemini)   │  │ Checkpoints │  │  Anthropic  │                │
│  └─────────────┘  └─────────────┘  │   Gemini    │                │
│                                     └─────────────┘                │
└─────────────────────────────────────────────────────────────────────┘
```

## Multi-Agent Patterns

SpendCube AI implements four LangGraph patterns:

### 1. Subagents Pattern

Centralized orchestration with parallel execution for classification pipeline.

```
                    ┌──────────────┐
                    │  Supervisor  │
                    └──────┬───────┘
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ Extraction  │   │  Cleansing  │   │Normalization│
└─────────────┘   └─────────────┘   └─────────────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           ▼
                  ┌─────────────┐
                  │Classification│
                  └─────────────┘
                           │
                           ▼
                  ┌─────────────┐
                  │  Enrichment │
                  └─────────────┘
```

### 2. Handoffs Pattern

State-driven HITL workflow transitions using `__interrupt__`.

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│     QA     │────▶│   HITL     │────▶│  Decision  │
│   Agent    │     │ Interrupt  │     │   Resume   │
└────────────┘     └────────────┘     └────────────┘
       │                 │                   │
       ▼                 ▼                   ▼
  [approved]        [pending]           [resolved]
       │                 │                   │
       └─────────────────┴───────────────────┘
                         │
                         ▼
                  ┌────────────┐
                  │  Response  │
                  └────────────┘
```

### 3. Router Pattern

Parallel dispatch for multi-domain analysis queries.

```
                  ┌─────────────┐
                  │   Router    │
                  └──────┬──────┘
    ┌──────────┬────────┼────────┬──────────┐
    ▼          ▼        ▼        ▼          ▼
┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐
│Savings│ │ Risk  │ │Comply │ │ Trend │ │Bench  │
└───────┘ └───────┘ └───────┘ └───────┘ └───────┘
    │          │        │        │          │
    └──────────┴────────┼────────┴──────────┘
                        ▼
                 ┌────────────┐
                 │  Aggregator│
                 └────────────┘
```

### 4. Skills Pattern

Progressive taxonomy disclosure based on record content.

```
┌─────────────────────────────────────────────┐
│               Skills Registry               │
├─────────────────────────────────────────────┤
│  unspsc_it      : /software|computer/       │
│  unspsc_services: /consulting|legal/        │
│  unspsc_office  : /supplies|furniture/      │
│  unspsc_travel  : /hotel|flight|travel/     │
└─────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│         Classification Agent                │
│  + Loaded Skills: [it, office]              │
│  + Context: 50 relevant UNSPSC codes        │
└─────────────────────────────────────────────┘
```

## LangGraph Workflow

```typescript
const workflow = new StateGraph(SpendCubeState)
  .addNode("supervisor", supervisorNode)
  .addNode("extraction", extractionNode)
  .addNode("cleansing", cleansingNode)
  .addNode("normalization", normalizationNode)
  .addNode("classification", classificationNode)
  .addNode("qa", qaNode)
  .addNode("hitl_review", hitlNode)
  .addNode("enrichment", enrichmentNode)
  .addNode("analysis_router", analysisRouterNode)
  .addNode("respond", responseNode)

  .addEdge(START, "supervisor")
  .addConditionalEdges("supervisor", routeFromSupervisor)
  .addEdge("extraction", "cleansing")
  .addEdge("cleansing", "normalization")
  .addEdge("normalization", "classification")
  .addEdge("classification", "qa")
  .addConditionalEdges("qa", routeFromQA)
  .addEdge("hitl_review", "respond")
  .addEdge("analysis_router", "respond")
  .addEdge("respond", END);

const app = workflow.compile({
  checkpointer,
  interruptBefore: ["hitl_review"]
});
```

## State Management

### Core State Fields

```typescript
interface SpendCubeState {
  // Conversation
  messages: BaseMessage[];
  userQuery: string;
  sessionId: string;

  // Input/Output
  inputRecords: SpendRecord[];
  classifications: Classification[];
  qaResults: QAResult[];
  processedRecords: ProcessedRecord[];

  // HITL
  hitlQueue: HITLItem[];
  hitlDecisions: HITLDecision[];

  // Workflow
  stage: "idle" | "classifying" | "qa" | "hitl" | "analyzing" | "complete" | "error";
  errors: AgentError[];

  // Output
  summary: string;
  spendCube: SpendCubeData | null;

  // Performance
  tokenUsage: TokenUsage[];
  tokenBudget: TokenBudget;
}
```

### State Reducers

```typescript
// Append-only for messages (conversation history)
messages: Annotation<BaseMessage[]>({
  reducer: (current, update) => [...current, ...update],
  default: () => [],
})

// Merge by ID for HITL items (updates existing)
hitlQueue: Annotation<HITLItem[]>({
  reducer: (current, update) => {
    const itemMap = new Map(current.map(i => [i.id, i]));
    for (const item of update) {
      itemMap.set(item.id, item);
    }
    return Array.from(itemMap.values());
  },
  default: () => [],
})
```

## Model Configuration

### Model Assignment

| Agent | Model | Thinking Level | Purpose |
|-------|-------|---------------|---------|
| Supervisor | Gemini Pro | High | Planning, orchestration |
| Classification | Gemini Flash | Medium | Fast classification |
| QA | Claude Sonnet | Medium | Independent evaluation |
| Analysis | GPT-4o | Low | Analytical insights |

### Extended Thinking

```typescript
const thinkingLevels = {
  high: { budget_tokens: 10000 },   // Complex planning
  medium: { budget_tokens: 5000 },  // Standard tasks
  low: { budget_tokens: 2000 },     // Simple responses
};
```

## Spend Cube Output

The system produces a multi-dimensional Spend Cube:

```
WHO (Department) × WHAT (Category) × FROM WHOM (Vendor)
```

### Output Structure

```typescript
interface SpendCubeResult {
  // Dimensional analysis
  byDepartment: SpendCubeDimension[];  // WHO
  byCategory: SpendCubeDimension[];    // WHAT
  byVendor: SpendCubeDimension[];      // FROM WHOM

  // Cross-dimensional
  topCategoryByDepartment: Record<string, { category: string; amount: number }>;
  topVendorByCategory: Record<string, { vendor: string; amount: number }>;

  // Metrics
  totalSpend: number;
  uniqueVendors: number;
  uniqueCategories: number;

  // Insights
  insights: SpendInsight[];
}
```

## Performance Optimizations

### Batch Processing

```typescript
// Configuration
const BATCH_CONFIGS = {
  classification: { batchSize: 10, maxConcurrency: 3 },
  qa: { batchSize: 5, maxConcurrency: 2 },
};

// Parallel execution within batches
const results = await Promise.all(
  batch.map(record => classifyRecord(model, record))
);
```

### Caching

```typescript
// Taxonomy cache (10 minute TTL)
const taxonomyCache = new SimpleCache<ClassificationResult>(600);

// Cache key normalization
const key = `${vendor.toLowerCase()}::${description.slice(0,100)}`;
```

### Rate Limiting

```typescript
// Token bucket rate limiter
const llmRateLimiter = new RateLimiter(
  maxTokens: 10,     // Burst
  refillRate: 5      // Per second
);

await llmRateLimiter.acquire();
```

## QA Evaluation

### 6-Dimension Rubric

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Code Accuracy | 30% | UNSPSC code correctness |
| Description Match | 20% | Code matches description |
| Vendor Consistency | 15% | Historical vendor patterns |
| Confidence Calibration | 15% | Score reliability |
| Level Appropriateness | 10% | Correct taxonomy level |
| Amount Reasonableness | 10% | Amount fits category |

### Verdict Thresholds

- **Approved**: Score >= 75
- **Flagged**: Score >= 50 but < 75
- **Rejected**: Score < 50

## Checkpointing

### PostgreSQL Persistence

```typescript
const checkpointer = new PostgresSaver({
  connectionString: process.env.DATABASE_URL,
  schema: "spendcube",
});

// Checkpoint before risky operations
await app.updateState(config, currentState);
```

### Recovery

```typescript
// Resume from checkpoint
const state = await checkpointer.get(config);
await app.invoke(null, { ...config, resumeFrom: state });
```

## Directory Structure

```
src/
├── agents/
│   ├── supervisor/         # Lead orchestrator
│   │   ├── index.ts        # Supervisor node
│   │   ├── router.ts       # Routing logic
│   │   └── prompts.ts      # System prompts
│   ├── classification/     # UNSPSC classification
│   ├── qa/                 # Quality assurance
│   ├── analysis/           # Analysis router + analyzers
│   │   ├── router.ts
│   │   ├── savings.ts
│   │   ├── risk.ts
│   │   ├── compliance.ts
│   │   ├── trend.ts
│   │   └── benchmark.ts
│   └── hitl/               # Human-in-the-loop
├── lib/
│   ├── langchain/          # LangChain config
│   │   ├── models.ts       # Model creation
│   │   ├── checkpointer.ts # Persistence
│   │   └── tracing.ts      # LangSmith
│   ├── spend-cube/         # Cube generation
│   ├── evaluation/         # Metrics
│   ├── performance/        # Caching, batching
│   └── training/           # Correction logging
├── tools/
│   └── taxonomy-search.ts  # UNSPSC lookup
└── types/
    ├── state.ts            # LangGraph state
    ├── records.ts          # Data types
    ├── hitl.ts             # HITL types
    └── agents.ts           # Agent types
```

## Security Considerations

1. **Input Validation**: Zod schemas validate all inputs
2. **File Upload**: Size limits, type validation
3. **Rate Limiting**: Per-session request limits
4. **Data Privacy**: No PII in LangSmith traces
5. **API Keys**: Environment variables only
