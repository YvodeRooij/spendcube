---
description: Create a new LangChain tool with proper typing and validation
---

# Add LangChain Tool

Create a new tool for agents to use.

## Arguments

$ARGUMENTS - Required: Tool name and description (e.g., "taxonomy_search - Search UNSPSC codes")

## Steps

1. Parse tool name and description from arguments
2. Create tool file at `src/tools/{name}.ts`
3. Use the modern @langchain/core tool() pattern:
   ```typescript
   import { tool } from "@langchain/core/tools";
   import { z } from "zod";

   export const myTool = tool(
     async (input) => {
       // Implementation
     },
     {
       name: "my_tool",
       description: "...",
       schema: z.object({
         // Input schema
       }),
     }
   );
   ```
4. Add proper TypeScript types
5. Export from `src/tools/index.ts`
6. Run type-check to verify

## Best Practices

- Use Zod for input validation (integrates with LangChain)
- Include detailed descriptions for LLM understanding
- Handle errors gracefully with informative messages
- Keep tools focused on single responsibilities
