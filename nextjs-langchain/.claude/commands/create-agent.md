---
description: Scaffold a new LangGraph agent with proper structure
---

# Create LangGraph Agent

Create a new agent following the SpendCube architecture patterns.

## Arguments

$ARGUMENTS - Required: Agent name and type (e.g., "normalization subagent" or "pricing router")

## Steps

1. Parse the agent name and type from arguments
2. Determine the pattern to use:
   - "subagent" → Subagents pattern (parallel execution, isolated context)
   - "router" → Router pattern (query decomposition, parallel dispatch)
   - "hitl" → Handoffs pattern (state-driven, human review)
   - "judge" → LLM-as-Judge pattern (QA evaluation)
3. Create directory structure:
   ```
   src/agents/{name}/
   ├── index.ts        # Main agent export
   ├── state.ts        # State annotation definition
   ├── nodes.ts        # Node functions
   ├── prompts.ts      # System prompts
   └── tools.ts        # Agent-specific tools
   ```
4. Generate boilerplate based on pattern
5. Add TypeScript types to `src/types/agents.ts`
6. Update `src/agents/index.ts` with export
7. Run type-check to verify

## Pattern Templates

### Subagent Pattern
- Uses Annotation.Root with reducers for list fields
- Implements parallel batch processing
- Includes checkpoint support

### Router Pattern
- Query decomposition logic
- Parallel subagent dispatch
- Result synthesis

### HITL Pattern
- State machine for handoff states
- Interrupt before human nodes
- Conversation history tracking
