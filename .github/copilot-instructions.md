# SpendCube AI - Copilot Instructions

## Architecture Overview

Multi-agent procurement analytics system using **LangGraph** with four patterns:
- **Subagents**: Supervisor orchestrates extraction → cleansing → normalization → classification → enrichment
- **Handoffs**: `__interrupt__` pauses graph for HITL (human-in-the-loop) review
- **Router**: Parallel dispatch to savings/risk/compliance/trend/benchmark analyzers
- **Skills**: Progressive UNSPSC taxonomy loading (only relevant segments)

## Model Selection Rules

| Task | Model | Thinking Budget |
|------|-------|-----------------|
| Planning/Orchestration | `gemini-3-pro-preview` | High (16K) |
| Classification | `gemini-3-flash-preview` | Medium (4K) |
| QA Judge | `claude-sonnet-4.5` | Medium |
| Analysis | `claude-sonnet-4.5` | High |
| Extraction | `gemini-3-flash-preview` | Low (1K) |

## LangChain/LangGraph Conventions

```typescript
// ✅ Use modular imports
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { Annotation } from "@langchain/langgraph";

// ❌ Never use legacy imports
import { ChatOpenAI } from "langchain/chat_models/openai";
```

**State with reducers** - Always define reducers for array fields:
```typescript
const State = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  records: Annotation<Record[]>({ reducer: (_, b) => b }), // replace
});
```

**Tools** - Use `tool()` with Zod schemas (see `src/tools/index.ts` for patterns).

## Code Conventions

- **Imports**: Use path alias `@/*` → `./src/*`
- **Exports**: Named exports preferred over default
- **Types**: Strict mode, no `any` - use Zod schemas in `src/types/`
- **Components**: `function` declarations; utilities use `const arrow`
- **Async**: `async/await` over raw promises

## Key Files

| Purpose | Location |
|---------|----------|
| Graph orchestration | `src/agents/supervisor/index.ts` |
| State shape | `src/types/state.ts` |
| Tool patterns | `src/tools/index.ts` |
| Model config | `src/lib/langchain/models.ts` |
| API routes | `src/app/api/graph/route.ts` (SSE streaming) |

## Commands

```bash
npm run dev          # Dev server (Turbopack)
npm run test         # All tests (Vitest)
npm run test:unit    # Unit tests only
npm run lint && npm run type-check  # Pre-commit checks
```

## Testing Patterns

- Mock LLM models with `vi.mock("@langchain/openai")` to avoid API calls
- Use 30s timeouts for async agent tests
- Create test state with factory helpers (see `tests/unit/`)

## Critical Rules

1. **Checkpointing**: Always checkpoint before HITL operations
2. **HITL threshold**: Items with confidence <70% go to human review
3. **Batch processing**: Classification (batch: 10, concurrency: 3), QA (batch: 5, concurrency: 2)
4. **Streaming**: Return SSE events: `stage`, `progress`, `classification`, `spendcube`, `complete`, `error`
5. **Parallel execution**: Use `Promise.all` for independent subagent calls

## Domain Terms

- **UNSPSC**: 8-digit product/service classification code
- **Spend Cube**: WHO (department) × WHAT (category) × FROM WHOM (vendor)
- **Maverick Spend**: Purchases without PO (compliance risk)
- **Skills Pattern**: Progressive taxonomy loading by category (`it_hardware`, `office_supplies`, etc.)
