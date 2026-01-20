---
description: Run tests and automatically fix any failures
---

# Test and Fix Loop

Run the test suite and iteratively fix any failing tests.

## Steps

1. Run `npm run test` to execute all tests
2. If tests fail:
   - Analyze the failure output
   - Identify the root cause
   - Fix the code (not the test, unless the test is wrong)
   - Re-run tests
3. Repeat until all tests pass
4. Run `npm run lint` and `npm run type-check` to ensure code quality
5. Report final status

## Arguments

$ARGUMENTS - Optional: Specific test file or pattern to run (e.g., "agents/classification")

## Notes

- Fix the implementation, not the test (unless the test expectation is wrong)
- If a fix requires architectural changes, explain before proceeding
- Maximum 5 fix iterations before asking for guidance
