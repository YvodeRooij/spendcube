---
description: Commit changes, push to remote, and create a PR (Boris Cherny's favorite command)
---

# Commit, Push, and Create PR

Automate the full git workflow in one command.

## Steps

1. Run `git status` to see all changes
2. Run `git diff --staged` and `git diff` to understand the changes
3. Run `npm run lint` and `npm run type-check` to validate code quality
4. Stage all relevant changes with `git add`
5. Create a commit with a clear, conventional message:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `refactor:` for refactoring
   - `docs:` for documentation
   - `test:` for tests
6. Push to the current branch (create remote branch if needed with `-u`)
7. Create a PR using `gh pr create` with:
   - Clear title following conventional commits
   - Summary section with bullet points
   - Test plan section
8. Return the PR URL

## Arguments

$ARGUMENTS - Optional: PR title override or additional context

## Example

User types: `/commit-push-pr add classification agent`
Result: Commits, pushes, creates PR titled "feat: add classification agent"
