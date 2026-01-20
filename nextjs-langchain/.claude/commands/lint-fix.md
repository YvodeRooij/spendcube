---
description: Run linting and automatically fix all issues
---

# Lint and Fix

Run ESLint and TypeScript checks, automatically fixing all issues.

## Steps

1. Run `npm run lint -- --fix` to auto-fix ESLint issues
2. Run `npm run type-check` to check TypeScript
3. If TypeScript errors exist:
   - Read the files with errors
   - Fix the type issues
   - Re-run type-check
4. Run `npx prettier --write "src/**/*.{ts,tsx}"` to format
5. Report all changes made

## Arguments

$ARGUMENTS - Optional: Specific directory or file to lint
