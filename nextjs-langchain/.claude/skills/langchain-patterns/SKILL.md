---
name: langchain-patterns
description: Apply LangChain and LangGraph best practices and patterns
triggers:
  - "langchain"
  - "langgraph"
  - "agent"
  - "tool"
  - "state"
  - "graph"
---

# LangChain/LangGraph Patterns Skill

This skill provides guidance on implementing LangChain and LangGraph patterns correctly.

## When to Activate

Automatically activate when working on:
- Agent definitions
- State graphs
- Tool implementations
- Multi-agent orchestration

## Key Patterns

### 1. State Annotation (LangGraph)

Always use Annotation.Root with proper reducers for lists:

```typescript
import { Annotation } from "@langchain/langgraph";

const MyState = Annotation.Root({
  // Simple fields - no reducer needed
  query: Annotation<string>(),

  // List fields - MUST have reducer to accumulate
  results: Annotation<Result[]>({
    reducer: (a, b) => [...a, ...b]
  }),

  // Set-like accumulation
  tags: Annotation<string[]>({
    reducer: (a, b) => [...new Set([...a, ...b])]
  }),
});
```

### 2. Tool Definition (@langchain/core)

Use the modern tool() function with Zod:

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const myTool = tool(
  async ({ query, limit }) => {
    // Implementation
    return JSON.stringify(results);
  },
  {
    name: "search_database",
    description: "Search the database for records matching the query",
    schema: z.object({
      query: z.string().describe("The search query"),
      limit: z.number().default(10).describe("Max results to return"),
    }),
  }
);
```

### 3. Model Selection

Match model to task complexity:

| Task Type | Recommended Model | Thinking Level |
|-----------|------------------|----------------|
| Planning/Strategy | gemini-3-pro / claude-opus-4 | high |
| Execution/Classification | gemini-3-flash | medium |
| QA/Evaluation | claude-sonnet-4 | high |
| Simple/Fast | gemini-3-flash | minimal |

### 4. Graph Construction

```typescript
import { StateGraph } from "@langchain/langgraph";

const workflow = new StateGraph(MyState)
  .addNode("process", processNode)
  .addNode("validate", validateNode)
  .addEdge("__start__", "process")
  .addConditionalEdges("process", routingFunction, {
    success: "validate",
    retry: "process",
    fail: "__end__",
  })
  .addEdge("validate", "__end__");

const app = workflow.compile({
  checkpointer: new MemorySaver(),
  interruptBefore: ["human_review"], // For HITL
});
```

### 5. Parallel Execution

For independent tasks, use Promise.all:

```typescript
const results = await Promise.all(
  batches.map(batch =>
    processSubagent(batch)
  )
);
```

### 6. Checkpointing

Always checkpoint before risky operations:

```typescript
// Save state before batch processing
await checkpointer.put(threadId, checkpoint);

try {
  // Risky operation
} catch (error) {
  // Restore from checkpoint
  const saved = await checkpointer.get(threadId);
}
```

## Common Mistakes to Avoid

1. **Missing reducers** on array state fields
2. **Using old imports** from `langchain` instead of `@langchain/core`
3. **Skipping checkpoints** in long-running operations
4. **Single agent for 100+ items** - use subagents pattern
5. **No thinking configuration** for complex tasks
