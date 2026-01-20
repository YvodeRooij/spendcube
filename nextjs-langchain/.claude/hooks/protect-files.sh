#!/bin/bash
# Block edits to sensitive files

FILE_PATH="$1"

PROTECTED_PATTERNS=(
  ".env"
  ".env.local"
  ".env.production"
  "package-lock.json"
  "pnpm-lock.yaml"
  "yarn.lock"
  ".git/"
)

for pattern in "${PROTECTED_PATTERNS[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    echo "Protected file: $FILE_PATH" >&2
    exit 2  # Exit code 2 blocks the action
  fi
done

exit 0
