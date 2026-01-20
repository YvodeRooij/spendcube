#!/bin/bash
# Auto-format TypeScript/JavaScript files after edit

FILE_PATH="$1"

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Only format TS/JS/JSON files
if [[ "$FILE_PATH" =~ \.(ts|tsx|js|jsx|json)$ ]]; then
  if command -v npx &> /dev/null; then
    npx prettier --write "$FILE_PATH" 2>/dev/null || true
  fi
fi

exit 0
