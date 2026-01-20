# SpendCube AI: World-Class Multi-Agent Architecture
## Leveraging LangGraph's Full Capabilities

**Version:** 2.0  
**Date:** January 2026  
**Status:** Architecture Design

---

## Executive Summary

Based on cutting-edge research from LangChain's multi-agent patterns and Anthropic's production multi-agent research system (which outperformed single-agent Claude Opus 4 by **90.2%**), this document defines a **hybrid multi-pattern architecture** for SpendCube AI that combines:

1. **Subagents Pattern** - Centralized orchestration with parallel execution
2. **Handoffs Pattern** - State-driven HITL workflow transitions
3. **Router Pattern** - Parallel dispatch for multi-domain analysis queries
4. **Skills Pattern** - Progressive disclosure of UNSPSC taxonomy context

---

## 1. Why Multi-Agent for SpendCube AI?

### The Case for Multi-Agent (From Anthropic's Research)

> *"Multi-agent systems work mainly because they help spend enough tokens to solve the problem. Token usage by itself explains 80% of the performance variance."*

**SpendCube AI Requirements That Demand Multi-Agent:**

| Requirement | Why Single Agent Fails | Multi-Agent Solution |
|-------------|----------------------|---------------------|
| Process 100K+ records | Context window overflow | Batch processing across subagents |
| Multiple knowledge domains | Prompt bloat, confusion | Domain-specialized agents with isolated context |
| Quality assurance | Self-evaluation bias | Separate QA agent (LLM-as-Judge) |
| Human-in-the-loop | Blocking workflow | Handoff pattern with state persistence |
| Parallel processing | Sequential bottleneck | Subagents with parallel tool calls |
| Complex analysis queries | Single reasoning path | Router pattern for breadth-first exploration |

### When NOT to Use Multi-Agent

From the research: *"Multi-agent systems use ~15× more tokens than chat interactions."*

**For SpendCube, we use multi-agent strategically:**
- ✅ Batch classification (100+ records) → Multi-agent
- ✅ Complex QA evaluation → Multi-agent  
- ✅ Multi-domain analysis queries → Multi-agent
- ❌ Single record classification → Single agent with tools
- ❌ Simple lookups → Direct tool call

---

## 2. Architecture Overview

### Hybrid Multi-Pattern Design

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        SPENDCUBE AI ARCHITECTURE                                 │
│                     Hybrid: Subagents + Handoffs + Router + Skills              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│    ┌────────────────────────────────────────────────────────────────────────┐  │
│    │                         SUPERVISOR AGENT                                │  │
│    │                     (Gemini 3 Pro / Claude Opus)                        │  │
│    │  ┌─────────────────────────────────────────────────────────────────┐   │  │
│    │  │ • Plans research/classification strategy                         │   │  │
│    │  │ • Decomposes complex tasks into subtasks                        │   │  │
│    │  │ • Spawns subagents with detailed task descriptions              │   │  │
│    │  │ • Aggregates results from parallel subagents                    │   │  │
│    │  │ • Manages checkpoints for resume on failure                     │   │  │
│    │  │ • Uses Extended Thinking for planning                           │   │  │
│    │  └─────────────────────────────────────────────────────────────────┘   │  │
│    └────────────────────────────────────────────────────────────────────────┘  │
│                                        │                                        │
│         ┌──────────────────────────────┼──────────────────────────────┐        │
│         │                              │                              │        │
│         ▼                              ▼                              ▼        │
│  ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐│
│  │  PIPELINE FLOW  │          │   HITL FLOW     │          │  ANALYSIS FLOW  ││
│  │   (Subagents)   │          │   (Handoffs)    │          │    (Router)     ││
│  │                 │          │                 │          │                 ││
│  │ Extract→Cleanse │          │ QA → Human →    │          │ Query → Route → ││
│  │ →Normalize→     │          │ Review → Back   │          │ Parallel Search ││
│  │ Classify→QA     │          │ to Pipeline     │          │ → Synthesize    ││
│  └─────────────────┘          └─────────────────┘          └─────────────────┘│
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Pattern Mapping to SpendCube Workflows

| Workflow | Pattern | Why This Pattern |
|----------|---------|-----------------|
| **Data Pipeline** (Extract→Classify) | Subagents | Multiple domains, parallel batch processing, centralized control |
| **HITL Review** | Handoffs | State-driven transitions, user converses directly |
| **Analysis Queries** | Router | Breadth-first exploration, parallel multi-source queries |
| **Classification Context** | Skills | Progressive disclosure of UNSPSC taxonomy |

---

## 3. Detailed Agent Specifications

### 3.1 Supervisor Agent (Lead Researcher Pattern)

Based on Anthropic's architecture: *"The lead agent analyzes the query, develops a strategy, and spawns subagents to explore different aspects simultaneously."*

```typescript
// supervisor_agent.ts
import { StateGraph, Annotation } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

const SupervisorState = Annotation.Root({
  // Task planning
  taskPlan: Annotation<TaskPlan>(),
  
  // Subagent management  
  activeSubagents: Annotation<SubagentTask[]>({ reducer: (a, b) => [...a, ...b] }),
  completedSubagents: Annotation<SubagentResult[]>({ reducer: (a, b) => [...a, ...b] }),
  
  // Pipeline state
  pipelinePhase: Annotation<PipelinePhase>(),
  batchProgress: Annotation<BatchProgress>(),
  
  // Quality tracking
  qaResults: Annotation<QAResult[]>({ reducer: (a, b) => [...a, ...b] }),
  hitlQueue: Annotation<HITLItem[]>({ reducer: (a, b) => [...a, ...b] }),
  
  // Checkpointing
  checkpoint: Annotation<Checkpoint>(),
  
  // Memory (for long-running tasks)
  memory: Annotation<Memory>(),
});

const SUPERVISOR_PROMPT = `You are the Supervisor Agent for SpendCube AI, a procurement analytics system.

## Your Role
1. PLAN: Analyze the task and create a detailed execution strategy
2. DELEGATE: Spawn specialized subagents with clear task descriptions
3. COORDINATE: Manage parallel execution and aggregate results
4. CHECKPOINT: Save progress regularly for resume on failure

## Scaling Rules (CRITICAL)
Match effort to task complexity:
- Simple (1-10 records): 1 Classification subagent, 3-5 tool calls
- Medium (10-100 records): 2-3 parallel Classification subagents, 10-15 calls each
- Complex (100+ records): 5+ subagents with clearly divided record ranges
- Analysis queries: Match subagent count to query breadth

## Subagent Task Descriptions (CRITICAL)
Each subagent MUST receive:
1. Clear objective (what to accomplish)
2. Output format (expected structure)
3. Tool guidance (which tools to use and how)
4. Task boundaries (exactly which records/scope)
5. Success criteria (how to know when done)

BAD: "Classify the spend data"
GOOD: "Classify records 1-500 using UNSPSC taxonomy. For each record:
       1. Use taxonomy_search to find matching codes
       2. Score confidence 0-100 based on description clarity
       3. Return structured JSON with code, confidence, reasoning
       4. Flag records with confidence <70 for HITL review"

## Memory Management
- Save plan to memory before spawning subagents
- Update memory after each subagent completes
- If context exceeds 150K tokens, summarize and checkpoint

## Error Handling
- If subagent fails, retry once with refined instructions
- If persistent failure, checkpoint and escalate
- Never lose completed work - checkpoint before risky operations
`;

async function supervisorNode(state: typeof SupervisorState.State) {
  const model = new ChatGoogleGenerativeAI({ 
    model: "gemini-3-pro",
    thinking: { thinkingLevel: "high" } // Extended thinking for planning
  });
  
  // Use extended thinking for strategic planning
  const planningResult = await model.invoke([
    { role: "system", content: SUPERVISOR_PROMPT },
    { role: "user", content: formatTaskForPlanning(state) }
  ]);
  
  // Extract plan and subagent assignments
  const { plan, subagentTasks } = parsePlanningResult(planningResult);
  
  // Save plan to memory for long-running resilience
  await saveToMemory(state.checkpoint.id, plan);
  
  return {
    taskPlan: plan,
    activeSubagents: subagentTasks,
    memory: { ...state.memory, currentPlan: plan }
  };
}
```

### 3.2 Classification Subagent (with Skills Pattern)

Uses **Skills pattern** for progressive disclosure of UNSPSC taxonomy:

```typescript
// classification_subagent.ts

const ClassificationState = Annotation.Root({
  recordBatch: Annotation<SpendRecord[]>(),
  classifications: Annotation<Classification[]>({ reducer: (a, b) => [...a, ...b] }),
  loadedSkills: Annotation<string[]>({ reducer: (a, b) => [...new Set([...a, ...b])] }),
  taxonomyContext: Annotation<TaxonomyContext>(),
});

// SKILLS: Progressive disclosure of taxonomy knowledge
const SKILLS = {
  "unspsc_it": {
    name: "IT & Telecommunications",
    segment: "43",
    description: "Computer equipment, software, telecommunications",
    loadCondition: (record: SpendRecord) => 
      /software|computer|laptop|server|network|telecom/i.test(record.description)
  },
  "unspsc_services": {
    name: "Professional Services", 
    segment: "80-81",
    description: "Consulting, legal, financial, HR services",
    loadCondition: (record: SpendRecord) =>
      /consulting|legal|audit|recruiting|training/i.test(record.description)
  },
  "unspsc_facilities": {
    name: "Facilities & Construction",
    segment: "72-73",
    description: "Building, maintenance, utilities",
    loadCondition: (record: SpendRecord) =>
      /maintenance|repair|construction|janitorial|hvac/i.test(record.description)
  },
  // ... more skills for other UNSPSC segments
};

const CLASSIFICATION_PROMPT = `You are a Classification Subagent specializing in UNSPSC spend categorization.

## Your Task
Classify spend records to 8-digit UNSPSC codes with high accuracy.

## Process for Each Record
1. ANALYZE: Extract key terms from description
2. CONTEXT: Consider supplier's typical categories
3. SEARCH: Use taxonomy_search for candidate codes
4. EVALUATE: Score each candidate on:
   - Description match (40%)
   - Supplier alignment (30%)
   - Amount reasonableness (15%)
   - Historical patterns (15%)
5. SELECT: Choose best code with confidence score
6. EXPLAIN: Document reasoning for auditability

## Confidence Scoring
- 90-100: Clear match, high certainty
- 70-89: Good match, minor ambiguity
- 50-69: Uncertain, needs HITL review
- 0-49: Very uncertain, flag for manual

## Tool Usage
- taxonomy_search: Start BROAD ("office supplies"), then narrow
- supplier_lookup: Check supplier's historical categories
- similar_items: Find how similar descriptions were classified

## Output Format
{
  "record_id": "...",
  "unspsc_code": "43211501",
  "unspsc_name": "Notebook computers",
  "confidence": 87,
  "reasoning": "Description contains 'laptop' and 'Dell'. Supplier Dell Inc. 
                primarily provides IT hardware (89% historical). Amount $1,200 
                is typical for laptop purchases.",
  "alternatives": [
    { "code": "43211503", "name": "Desktop computers", "confidence": 45 }
  ],
  "flags": []
}
`;

async function classificationSubagent(state: typeof ClassificationState.State) {
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-3-flash",
    thinking: { thinkingLevel: "medium" } // Balanced for classification
  });
  
  // SKILLS: Load relevant taxonomy context based on record content
  const relevantSkills = detectRelevantSkills(state.recordBatch);
  const taxonomyContext = await loadSkillContexts(relevantSkills);
  
  const classifications: Classification[] = [];
  
  // Process records with interleaved thinking
  for (const record of state.recordBatch) {
    const result = await model.invoke([
      { role: "system", content: CLASSIFICATION_PROMPT },
      { role: "user", content: formatRecordForClassification(record, taxonomyContext) }
    ]);
    
    // Interleaved thinking: evaluate result quality
    const classification = parseClassificationResult(result, record.id);
    classifications.push(classification);
  }
  
  return {
    classifications,
    loadedSkills: relevantSkills,
    taxonomyContext
  };
}

// Parallel tool calling (from Anthropic: "cut research time by up to 90%")
async function parallelClassification(records: SpendRecord[]): Promise<Classification[]> {
  const BATCH_SIZE = 50;
  const batches = chunk(records, BATCH_SIZE);
  
  // Spawn parallel subagents for each batch
  const results = await Promise.all(
    batches.map((batch, idx) => 
      classificationSubagent({
        recordBatch: batch,
        classifications: [],
        loadedSkills: [],
        taxonomyContext: {}
      })
    )
  );
  
  return results.flatMap(r => r.classifications);
}
```

### 3.3 QA Agent (LLM-as-Judge Pattern)

From Anthropic: *"LLM-as-judge evaluation scales when done well... A single LLM call with a single prompt outputting scores from 0.0-1.0 and a pass-fail grade was the most consistent."*

```typescript
// qa_agent.ts

const QA_JUDGE_PROMPT = `You are a QA Judge Agent evaluating spend classifications.

## Your Role
Independently evaluate classifications for quality and accuracy.
You are NOT the same model that produced the classifications - maintain objectivity.

## Evaluation Rubric (Score 0.0 - 1.0 for each)

### 1. Accuracy (Weight: 30%)
Does the UNSPSC code correctly match the item description?
- 1.0: Perfect match, no ambiguity
- 0.7-0.9: Good match with minor interpretation
- 0.4-0.6: Partial match, some misalignment
- 0.0-0.3: Incorrect classification

### 2. Groundedness (Weight: 20%)
Is the classification supported by the taxonomy context?
- 1.0: Directly supported by UNSPSC definitions
- 0.5-0.9: Reasonably inferred from context
- 0.0-0.4: Unsupported or contradicted

### 3. Specificity (Weight: 15%)
Is the classification at the right granularity level?
- 1.0: Most specific applicable code
- 0.7-0.9: Could be more specific but acceptable
- 0.4-0.6: Too broad or too specific
- 0.0-0.3: Wrong level entirely

### 4. Supplier Alignment (Weight: 15%)
Does the code match the supplier's typical offerings?
- 1.0: Perfect fit with supplier profile
- 0.5-0.9: Reasonable for this supplier
- 0.0-0.4: Unusual for this supplier

### 5. Amount Reasonableness (Weight: 10%)
Is the amount typical for this category?
- 1.0: Within expected range
- 0.5-0.9: Slightly unusual but possible
- 0.0-0.4: Highly anomalous

### 6. Reasoning Quality (Weight: 10%)
Is the reasoning trace clear and logical?
- 1.0: Comprehensive, traceable reasoning
- 0.5-0.9: Adequate explanation
- 0.0-0.4: Missing or illogical reasoning

## Output Format
{
  "record_id": "...",
  "overall_score": 0.85,
  "pass": true,
  "dimension_scores": {
    "accuracy": 0.9,
    "groundedness": 0.85,
    "specificity": 0.8,
    "supplier_alignment": 0.9,
    "amount_reasonableness": 0.75,
    "reasoning_quality": 0.85
  },
  "issues": [],
  "recommendation": "approve" | "review" | "reclassify",
  "feedback": "Classification is accurate. Consider more specific code 43211501 
               instead of 43211500 for laptop purchases."
}
`;

async function qaJudgeAgent(
  classification: Classification,
  originalRecord: SpendRecord,
  taxonomyContext: TaxonomyContext
): Promise<QAResult> {
  // Use different model than classification for independence
  const judgeModel = new ChatAnthropic({
    model: "claude-sonnet-4-20250514",
    // Or use Gemini 3 Pro for strongest reasoning
  });
  
  const result = await judgeModel.invoke([
    { role: "system", content: QA_JUDGE_PROMPT },
    { role: "user", content: formatForQAEvaluation(classification, originalRecord, taxonomyContext) }
  ]);
  
  return parseQAResult(result);
}

// Confidence-based routing (from LangChain patterns)
function routeByQAResult(qaResult: QAResult): RoutingDecision {
  if (qaResult.overall_score >= 0.9 && qaResult.pass) {
    return { action: "auto_approve", nextNode: "enrichment" };
  } else if (qaResult.overall_score >= 0.7) {
    // Spot-check 10% of these
    if (Math.random() < 0.1) {
      return { action: "spot_check", nextNode: "hitl_review" };
    }
    return { action: "approve", nextNode: "enrichment" };
  } else if (qaResult.overall_score >= 0.5) {
    return { action: "hitl_review", nextNode: "hitl_review" };
  } else {
    return { action: "reclassify", nextNode: "classification" };
  }
}
```

### 3.4 HITL Workflow (Handoffs Pattern)

From LangChain: *"In the handoffs pattern, the active agent changes dynamically based on conversation context... enabling sequential constraints where capabilities unlock only after preconditions are met."*

```typescript
// hitl_workflow.ts

const HITLState = Annotation.Root({
  currentItem: Annotation<HITLItem>(),
  reviewerDecision: Annotation<ReviewerDecision | null>(),
  conversationHistory: Annotation<Message[]>({ reducer: (a, b) => [...a, ...b] }),
  handoffState: Annotation<"ai_presenting" | "awaiting_human" | "human_reviewing" | "ai_processing">(),
});

// Handoff: AI → Human
async function presentForReview(state: typeof HITLState.State) {
  const item = state.currentItem;
  
  // AI presents the item with context
  const presentation = await generateReviewPresentation(item);
  
  return {
    conversationHistory: [...state.conversationHistory, {
      role: "assistant",
      content: presentation
    }],
    handoffState: "awaiting_human"
  };
}

// Handoff: Human → AI
async function processHumanDecision(state: typeof HITLState.State) {
  const decision = state.reviewerDecision;
  
  if (decision.action === "accept") {
    // Human accepted AI suggestion
    return {
      handoffState: "ai_processing",
      // Route back to pipeline
      nextNode: "apply_classification"
    };
  } else if (decision.action === "modify") {
    // Human provided correction - use for model improvement
    await logCorrectionForTraining(state.currentItem, decision.correction);
    return {
      handoffState: "ai_processing",
      nextNode: "apply_correction"
    };
  } else if (decision.action === "skip") {
    return {
      handoffState: "ai_processing",
      nextNode: "next_item"
    };
  }
}

// Conditional edge: route based on handoff state
function hitlRouter(state: typeof HITLState.State): string {
  switch (state.handoffState) {
    case "ai_presenting":
      return "present_for_review";
    case "awaiting_human":
      return "__interrupt__"; // Wait for human input
    case "human_reviewing":
      return "process_human_decision";
    case "ai_processing":
      return state.nextNode;
  }
}

// Build HITL subgraph
const hitlWorkflow = new StateGraph(HITLState)
  .addNode("present_for_review", presentForReview)
  .addNode("process_human_decision", processHumanDecision)
  .addNode("apply_classification", applyClassification)
  .addNode("apply_correction", applyCorrection)
  .addNode("next_item", loadNextItem)
  .addConditionalEdges("__start__", hitlRouter)
  .addEdge("present_for_review", "__interrupt__") // Handoff to human
  .addConditionalEdges("process_human_decision", (s) => s.nextNode);
```

### 3.5 Analysis Agent (Router Pattern)

From LangChain: *"The router decomposes the query, invokes zero or more specialized agents in parallel, and synthesizes results into a coherent response."*

```typescript
// analysis_agent.ts

const AnalysisState = Annotation.Root({
  userQuery: Annotation<string>(),
  queryDecomposition: Annotation<SubQuery[]>(),
  parallelResults: Annotation<AnalysisResult[]>({ reducer: (a, b) => [...a, ...b] }),
  synthesizedAnswer: Annotation<string>(),
});

// Specialized analysis subagents
const ANALYSIS_SUBAGENTS = {
  savings_analyzer: {
    description: "Identifies cost savings opportunities: consolidation, negotiation, compliance",
    tools: ["spend_aggregation", "price_variance", "contract_lookup"]
  },
  risk_analyzer: {
    description: "Analyzes supplier risks: concentration, geography, financial health",
    tools: ["supplier_concentration", "geo_analysis", "credit_lookup"]
  },
  compliance_analyzer: {
    description: "Detects compliance issues: maverick spend, policy violations, approval gaps",
    tools: ["contract_compliance", "policy_check", "approval_audit"]
  },
  trend_analyzer: {
    description: "Identifies spending trends: category growth, seasonality, forecasting",
    tools: ["time_series", "category_trends", "forecast_model"]
  },
  benchmark_analyzer: {
    description: "Compares against market benchmarks: pricing, supplier performance",
    tools: ["market_benchmark", "supplier_scorecard", "category_benchmark"]
  }
};

const ROUTER_PROMPT = `You are an Analysis Router for SpendCube AI.

## Your Role
1. DECOMPOSE user queries into parallel sub-queries
2. ROUTE each sub-query to the appropriate specialized analyzer
3. EXECUTE analyzers in parallel
4. SYNTHESIZE results into a coherent answer

## Available Analyzers
${Object.entries(ANALYSIS_SUBAGENTS).map(([k, v]) => `- ${k}: ${v.description}`).join('\n')}

## Decomposition Strategy
For breadth-first queries, identify ALL relevant aspects:
- "How can we reduce costs?" → savings_analyzer + compliance_analyzer + benchmark_analyzer
- "What are our supplier risks?" → risk_analyzer + compliance_analyzer
- "Give me a full spend analysis" → ALL analyzers in parallel

## Output Format for Decomposition
{
  "sub_queries": [
    {
      "analyzer": "savings_analyzer",
      "focus": "Identify top consolidation opportunities",
      "filters": { "min_spend": 100000 }
    },
    {
      "analyzer": "risk_analyzer", 
      "focus": "Find single-source dependencies",
      "filters": { "supplier_count": 1 }
    }
  ]
}
`;

async function analysisRouter(state: typeof AnalysisState.State) {
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-3-pro",
    thinking: { thinkingLevel: "high" }
  });
  
  // Decompose query
  const decomposition = await model.invoke([
    { role: "system", content: ROUTER_PROMPT },
    { role: "user", content: state.userQuery }
  ]);
  
  const subQueries = parseDecomposition(decomposition);
  
  // Execute in parallel (key insight from Anthropic)
  const results = await Promise.all(
    subQueries.map(sq => executeAnalyzer(sq.analyzer, sq.focus, sq.filters))
  );
  
  // Synthesize results
  const synthesis = await synthesizeResults(state.userQuery, results);
  
  return {
    queryDecomposition: subQueries,
    parallelResults: results,
    synthesizedAnswer: synthesis
  };
}
```

---

## 4. Complete LangGraph Implementation

### 4.1 Main Graph Structure

```typescript
// main_graph.ts
import { StateGraph, MemorySaver, Annotation } from "@langchain/langgraph";

// Unified state that flows through entire system
const SpendCubeState = Annotation.Root({
  // Input
  projectId: Annotation<string>(),
  rawRecords: Annotation<SpendRecord[]>(),
  userQuery: Annotation<string | null>(),
  
  // Pipeline state
  cleanedRecords: Annotation<SpendRecord[]>({ reducer: (a, b) => [...a, ...b] }),
  normalizedSuppliers: Annotation<Supplier[]>({ reducer: (a, b) => [...a, ...b] }),
  classifications: Annotation<Classification[]>({ reducer: (a, b) => [...a, ...b] }),
  qaResults: Annotation<QAResult[]>({ reducer: (a, b) => [...a, ...b] }),
  enrichedRecords: Annotation<EnrichedRecord[]>({ reducer: (a, b) => [...a, ...b] }),
  
  // HITL state
  hitlQueue: Annotation<HITLItem[]>({ reducer: (a, b) => [...a, ...b] }),
  hitlCompleted: Annotation<HITLItem[]>({ reducer: (a, b) => [...a, ...b] }),
  
  // Analysis state  
  analysisResults: Annotation<AnalysisResult[]>({ reducer: (a, b) => [...a, ...b] }),
  
  // Workflow control
  currentPhase: Annotation<Phase>(),
  errors: Annotation<Error[]>({ reducer: (a, b) => [...a, ...b] }),
  
  // Checkpointing
  checkpoint: Annotation<Checkpoint>(),
});

// Build the main graph
const workflow = new StateGraph(SpendCubeState)
  // Entry point: Supervisor plans the work
  .addNode("supervisor", supervisorAgent)
  
  // Data Pipeline (Subagents pattern)
  .addNode("extraction", extractionSubagent)
  .addNode("cleansing", cleansingSubagent)
  .addNode("normalization", normalizationSubagent)
  .addNode("classification", classificationSubagent)
  .addNode("qa", qaJudgeAgent)
  .addNode("enrichment", enrichmentSubagent)
  
  // HITL Workflow (Handoffs pattern)
  .addNode("hitl_review", hitlWorkflow)
  
  // Analysis (Router pattern)
  .addNode("analysis_router", analysisRouter)
  
  // Edges: Pipeline flow
  .addEdge("__start__", "supervisor")
  .addConditionalEdges("supervisor", supervisorRouter)
  .addEdge("extraction", "cleansing")
  .addEdge("cleansing", "normalization")
  .addEdge("normalization", "classification")
  .addEdge("classification", "qa")
  
  // Conditional: QA routes to enrichment, HITL, or reclassification
  .addConditionalEdges("qa", qaRouter, {
    enrichment: "enrichment",
    hitl_review: "hitl_review",
    reclassify: "classification"
  })
  
  // HITL returns to pipeline
  .addEdge("hitl_review", "enrichment")
  
  // Analysis available after enrichment
  .addConditionalEdges("enrichment", (state) => 
    state.userQuery ? "analysis_router" : "__end__"
  )
  .addEdge("analysis_router", "__end__");

// Compile with checkpointing for resume
const checkpointer = new MemorySaver();
const app = workflow.compile({ 
  checkpointer,
  interruptBefore: ["hitl_review"] // Pause for human input
});
```

### 4.2 Supervisor Router Logic

```typescript
function supervisorRouter(state: SpendCubeState): string {
  const { currentPhase, userQuery, rawRecords } = state;
  
  // Determine workflow based on input type
  if (rawRecords && rawRecords.length > 0) {
    // Data processing workflow
    const complexity = assessComplexity(rawRecords);
    
    if (complexity === "simple" && rawRecords.length < 10) {
      // Skip supervisor overhead for simple tasks
      return "extraction";
    } else {
      // Complex task: supervisor plans and delegates
      return "plan_batch_processing";
    }
  } else if (userQuery) {
    // Analysis query
    return "analysis_router";
  }
  
  return "__end__";
}

function assessComplexity(records: SpendRecord[]): "simple" | "medium" | "complex" {
  const count = records.length;
  if (count < 10) return "simple";
  if (count < 100) return "medium";
  return "complex";
}
```

---

## 5. Production Engineering

### 5.1 Checkpointing & Recovery

From Anthropic: *"Without effective mitigations, minor system failures can be catastrophic for agents... We built systems that can resume from where the agent was when errors occurred."*

```typescript
// checkpointing.ts

interface Checkpoint {
  id: string;
  timestamp: Date;
  phase: Phase;
  processedRecordIds: string[];
  pendingRecordIds: string[];
  classifications: Map<string, Classification>;
  hitlQueue: HITLItem[];
  memory: Memory;
}

async function createCheckpoint(state: SpendCubeState): Promise<Checkpoint> {
  return {
    id: generateCheckpointId(),
    timestamp: new Date(),
    phase: state.currentPhase,
    processedRecordIds: state.classifications.map(c => c.recordId),
    pendingRecordIds: state.rawRecords
      .filter(r => !state.classifications.find(c => c.recordId === r.id))
      .map(r => r.id),
    classifications: new Map(state.classifications.map(c => [c.recordId, c])),
    hitlQueue: state.hitlQueue,
    memory: state.memory
  };
}

async function resumeFromCheckpoint(checkpointId: string): Promise<SpendCubeState> {
  const checkpoint = await loadCheckpoint(checkpointId);
  
  // Restore state
  return {
    currentPhase: checkpoint.phase,
    classifications: Array.from(checkpoint.classifications.values()),
    hitlQueue: checkpoint.hitlQueue,
    // Only process remaining records
    rawRecords: await loadRecords(checkpoint.pendingRecordIds),
    memory: checkpoint.memory
  };
}
```

### 5.2 Observability & Tracing

```typescript
// tracing.ts
import { LangSmithTracer } from "@langchain/langsmith";

const tracer = new LangSmithTracer({
  projectName: "spendcube-ai",
  client: langsmithClient
});

// Wrap all agents with tracing
async function tracedAgent<T>(
  agentName: string,
  agentFn: (state: T) => Promise<T>,
  state: T
): Promise<T> {
  const span = tracer.startSpan(agentName, {
    metadata: {
      recordCount: state.rawRecords?.length,
      phase: state.currentPhase
    }
  });
  
  try {
    const result = await agentFn(state);
    span.end({ status: "success" });
    return result;
  } catch (error) {
    span.end({ status: "error", error: error.message });
    throw error;
  }
}
```

### 5.3 Error Handling

```typescript
// error_handling.ts

async function resilientSubagentCall<T>(
  subagent: (state: T) => Promise<T>,
  state: T,
  maxRetries: number = 2
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await subagent(state);
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        // Let the model know about the failure and adapt
        const adaptedState = await handleSubagentFailure(state, error, attempt);
        state = adaptedState;
      }
    }
  }
  
  // Checkpoint before giving up
  await createCheckpoint(state);
  throw new SubagentFailureError(lastError, state);
}

async function handleSubagentFailure(
  state: any, 
  error: Error,
  attempt: number
): Promise<any> {
  // Use model to diagnose and adapt
  const model = new ChatGoogleGenerativeAI({ model: "gemini-3-flash" });
  
  const diagnosis = await model.invoke([
    { role: "system", content: "Diagnose this agent failure and suggest how to retry:" },
    { role: "user", content: `Error: ${error.message}\nAttempt: ${attempt + 1}` }
  ]);
  
  return applyDiagnosisToState(state, diagnosis);
}
```

---

## 6. Model Selection Strategy

### Tiered Model Approach

| Agent Role | Primary Model | Fallback | Rationale |
|-----------|--------------|----------|-----------|
| **Supervisor** | Gemini 3 Pro | Claude Opus 4 | Best reasoning for planning, 1M context |
| **Classification Subagents** | Gemini 3 Flash | - | 78% SWE-bench, cost-effective batching |
| **QA Judge** | Claude Sonnet 4 | Gemini 3 Pro | Independence from classification model |
| **Analysis Router** | Gemini 3 Pro | - | Complex query decomposition |
| **HITL Presentation** | Gemini 3 Flash | - | Fast, conversational |

### Thinking Level Configuration

```typescript
const THINKING_CONFIG = {
  supervisor: { thinkingLevel: "high" },      // Strategic planning
  classification_simple: { thinkingLevel: "minimal" },  // Clear-cut items
  classification_complex: { thinkingLevel: "medium" },  // Ambiguous items
  qa_judge: { thinkingLevel: "high" },        // Thorough evaluation
  analysis: { thinkingLevel: "high" },        // Complex synthesis
  hitl: { thinkingLevel: "low" },             // Fast interaction
};
```

---

## 7. Evaluation Framework

### End-State Evaluation (From Anthropic)

> *"Instead of judging whether the agent followed a specific process, evaluate whether it achieved the correct final state."*

```typescript
// evaluation.ts

interface SpendCubeEvaluation {
  // Classification quality
  classificationAccuracy: number;      // % correct UNSPSC codes
  confidenceCalibration: number;       // Correlation of confidence to accuracy
  
  // Supplier normalization
  supplierMatchRate: number;           // % successfully normalized
  
  // QA effectiveness
  qaPassRate: number;                  // % passing QA
  hitlRate: number;                    // % requiring human review
  falsePositiveRate: number;           // % incorrectly flagged
  
  // Efficiency
  avgTokensPerRecord: number;          // Token efficiency
  avgTimePerRecord: number;            // Processing speed
  checkpointRecoveryRate: number;      // % successful resumes
  
  // Analysis quality (LLM-as-Judge)
  analysisRelevance: number;           // 0-1 score
  analysisCoverage: number;            // 0-1 score
  citationAccuracy: number;            // 0-1 score
}

async function evaluateSpendCube(
  results: SpendCubeResults,
  groundTruth: GroundTruth
): Promise<SpendCubeEvaluation> {
  // Classification accuracy (programmatic)
  const classificationAccuracy = calculateAccuracy(
    results.classifications,
    groundTruth.expectedCodes
  );
  
  // Analysis quality (LLM-as-Judge)
  const analysisEval = await llmJudgeAnalysis(
    results.analysisResults,
    groundTruth.expectedInsights
  );
  
  return {
    classificationAccuracy,
    confidenceCalibration: calculateCalibration(results.classifications),
    supplierMatchRate: results.normalizedSuppliers.length / results.rawSuppliers.length,
    qaPassRate: results.qaResults.filter(r => r.pass).length / results.qaResults.length,
    hitlRate: results.hitlQueue.length / results.classifications.length,
    falsePositiveRate: calculateFalsePositives(results.qaResults, groundTruth),
    avgTokensPerRecord: results.metrics.totalTokens / results.classifications.length,
    avgTimePerRecord: results.metrics.totalTime / results.classifications.length,
    checkpointRecoveryRate: results.metrics.successfulRecoveries / results.metrics.totalCheckpoints,
    ...analysisEval
  };
}
```

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)
- [ ] Set up LangGraph project with TypeScript
- [ ] Implement Supervisor Agent with planning logic
- [ ] Build Extraction and Cleansing subagents
- [ ] Add basic checkpointing

### Phase 2: Classification Pipeline (Weeks 5-8)
- [ ] Implement Classification Subagent with Skills pattern
- [ ] Build QA Judge Agent with LLM-as-Judge
- [ ] Add confidence-based routing
- [ ] Integrate LangSmith tracing

### Phase 3: HITL & Quality (Weeks 9-12)
- [ ] Implement Handoffs pattern for HITL
- [ ] Build HITL review interface
- [ ] Add anomaly detection
- [ ] Implement continuous improvement loop

### Phase 4: Analysis & Production (Weeks 13-16)
- [ ] Build Analysis Router with parallel subagents
- [ ] Implement all analysis subagents
- [ ] Production hardening (error handling, recovery)
- [ ] Performance optimization

---

## 9. Key Takeaways

### From LangChain's Multi-Agent Patterns

1. **Start with single agent** - Only add agents when you hit clear limits
2. **Match pattern to requirements** - Subagents for domains, Handoffs for state, Router for parallel
3. **Consider performance tradeoffs** - Subagents add latency but provide isolation

### From Anthropic's Production System

1. **Token usage = performance** - Multi-agent enables spending enough tokens to solve the problem
2. **Detailed task descriptions** - Vague instructions cause duplication and gaps
3. **Scale effort to complexity** - Embed scaling rules in prompts
4. **Let agents improve themselves** - Use models to diagnose failures
5. **Start wide, then narrow** - Broad queries first, then specific
6. **Parallel execution transforms speed** - 90% reduction in research time
7. **Checkpoint everything** - Resume capability is essential for long-running tasks

---

*This architecture document represents world-class multi-agent design based on the latest research and production learnings from LangChain and Anthropic.*