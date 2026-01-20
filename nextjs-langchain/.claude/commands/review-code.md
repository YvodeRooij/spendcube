---
description: Spawn parallel review subagents to analyze code (Boris Cherny's pattern)
---

# Multi-Agent Code Review

Spawn multiple specialized subagents to review code from different angles.

## Arguments

$ARGUMENTS - Optional: Specific files or directory to review (defaults to staged changes)

## Review Process

Launch 5 parallel review subagents:

### Pass 1 - Initial Review (parallel)
1. **Style Reviewer**: Check coding conventions, naming, formatting
2. **Bug Hunter**: Look for logic errors, edge cases, null checks
3. **Security Auditor**: Check for OWASP vulnerabilities, input validation
4. **Performance Analyst**: Identify N+1 queries, unnecessary re-renders, memory leaks
5. **Architecture Reviewer**: Check patterns, separation of concerns, coupling

### Pass 2 - Challenge Phase (parallel)
Launch 5 more subagents to critically evaluate Pass 1 findings:
- Filter out false positives
- Verify each finding with evidence
- Prioritize by severity

### Output
Consolidated review with:
- Critical issues (must fix)
- Warnings (should fix)
- Suggestions (nice to have)
- False positives removed

## Notes

Based on Boris Cherny's approach: "Making [subagents] challenge each other produces cleaner results."
