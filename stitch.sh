#!/bin/bash

# Define the output file
OUTPUT="full_project_manifest.md"

# Clear previous version
echo "# Hanumant Marble Full Project Manifest" > $OUTPUT
echo "Generated on: $(date)" >> $OUTPUT

# Use find to get all relevant files (Next.js focus)
# Excluding build folders, git, and media
find . -maxdepth 4 -not -path '*/.*' \
  -not -path './node_modules*' \
  -not -path './.next*' \
  -not -path './public*' \
  -type f \( -name "*.js" -o -name "*.jsx" -o -name "*.css" -o -name "*.mjs" -o -name "tailwind.config.js" \) | while read FILE; do
    echo -e "\n\n---" >> $OUTPUT
    echo -e "### FILE: $FILE" >> $OUTPUT
    echo -e "\`\`\`javascript" >> $OUTPUT
    cat "$FILE" >> $OUTPUT
    echo -e "\n\`\`\`" >> $OUTPUT
done

echo "Success! $OUTPUT created. Upload this to Google Stitch."