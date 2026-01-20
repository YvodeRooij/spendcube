#!/bin/bash
# Warn about console.log statements left in code

CONSOLE_LOGS=$(grep -r "console\.log" --include="*.ts" --include="*.tsx" src/ 2>/dev/null | grep -v "// debug" | head -5)

if [[ -n "$CONSOLE_LOGS" ]]; then
  echo "Warning: Found console.log statements:" >&2
  echo "$CONSOLE_LOGS" >&2
fi

exit 0  # Non-blocking warning
