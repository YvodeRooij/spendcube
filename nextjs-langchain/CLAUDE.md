# SpendCube AI - Claude Code Project Context

## Project Overview

**SpendCube AI** is a multi-agent procurement analytics system built with:
- **Next.js 16** (App Router, Turbopack, React 19.2)
- **LangChain 1.2.10** + **LangGraph** for multi-agent orchestration
- **TypeScript** with strict mode
- **Tailwind CSS** for styling

## Architecture

This project implements a **hybrid multi-pattern architecture**:
- **Subagents Pattern** - Centralized orchestration with parallel execution
- **Handoffs Pattern** - State-driven HITL workflow transitions
- **Router Pattern** - Parallel dispatch for multi-domain analysis
- **Skills Pattern** - Progressive disclosure of UNSPSC taxonomy

See `docs/prd.md` for full architecture details.

## Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   └── (routes)/          # Page routes
├── agents/                # LangGraph agent definitions
│   ├── supervisor/        # Lead orchestrator agent
│   ├── classification/    # UNSPSC classification subagent
│   ├── qa/               # QA judge agent (LLM-as-Judge)
│   ├── analysis/         # Analysis router + subagents
│   └── hitl/             # Human-in-the-loop workflow
├── lib/                   # Shared utilities
│   ├── langchain/        # LangChain/LangGraph setup
│   ├── db/               # Database clients
│   └── utils/            # Helper functions
├── tools/                 # LangChain tool definitions
└── types/                 # TypeScript types
```

## Code Style

- Use `function` declarations for components, `const arrow` for utilities
- Prefer named exports over default exports
- Use TypeScript strict mode - no `any` types
- Use Zod for runtime validation (integrates with LangChain)
- Prefer `async/await` over raw promises
- Use `@langchain/core` imports over legacy `langchain` paths

## Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint check
npm run type-check   # TypeScript check
npm run test         # Run tests
```

## LangChain/LangGraph Conventions

### State Definitions
```typescript
// Use Annotation.Root for graph state
const MyState = Annotation.Root({
  field: Annotation<Type>(),
  listField: Annotation<Item[]>({ reducer: (a, b) => [...a, ...b] }),
});
```

### Agent Patterns
- **Supervisor**: Uses `gemini-3-pro` with high thinking for planning
- **Subagents**: Use `gemini-3-flash` with medium thinking for execution
- **QA Judge**: Use `claude-sonnet-4` for independent evaluation

### Tool Definitions
```typescript
// Use @langchain/core tool() with Zod schemas
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const myTool = tool(async (input) => { ... }, {
  name: "my_tool",
  description: "...",
  schema: z.object({ ... }),
});
```

## Important Notes

- **Checkpointing**: Always checkpoint before risky operations
- **Parallel Execution**: Use Promise.all for independent subagent calls
- **Token Budget**: Multi-agent uses ~15x more tokens - use strategically
- **HITL**: Items with confidence <70% go to human review queue

## Environment Variables

Required in `.env.local`:
```
OPENAI_API_KEY=         # For OpenAI models
GOOGLE_API_KEY=         # For Gemini models
ANTHROPIC_API_KEY=      # For Claude models
LANGSMITH_API_KEY=      # For tracing (optional)
```

## Git Workflow

- Branch naming: `feat/`, `fix/`, `refactor/`, `docs/`
- Commit messages: Conventional commits (feat:, fix:, etc.)
- Always run `npm run lint && npm run type-check` before committing
- PRs require passing CI checks

## Mistakes to Avoid

- Don't use `langchain` imports - use `@langchain/core`, `@langchain/openai`, etc.
- Don't forget reducers for array state fields in LangGraph
- Don't skip checkpointing for batch operations
- Don't use single agent for 100+ records - use subagents pattern
