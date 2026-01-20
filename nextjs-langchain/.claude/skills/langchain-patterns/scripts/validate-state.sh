#!/bin/bash
# Validate LangGraph state definitions have proper reducers

echo "Checking for array state fields without reducers..."

# Find state definitions with array types but no reducer
grep -rn "Annotation<.*\[\]>" src/ --include="*.ts" | while read line; do
  file=$(echo "$line" | cut -d: -f1)
  linenum=$(echo "$line" | cut -d: -f2)

  # Check if reducer is defined on same or next line
  if ! sed -n "${linenum},$((linenum+1))p" "$file" | grep -q "reducer"; then
    echo "WARNING: $file:$linenum - Array annotation may be missing reducer"
  fi
done

echo "State validation complete."
