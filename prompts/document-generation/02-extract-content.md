# Stage 2: Extract Content from Transcript

## When Used
Called by `/api/documents/generate` during extraction phase - ONCE per transcript, immediately after Stage 1.5 determines what extract types are relevant.

## Input Variables
- `{{transcriptText}}` - Full text of ONE transcript
- `{{transcriptTitle}}` - Title of this transcript
- `{{outline}}` - Document outline from Stage 1
- `{{suggestedTypes}}` - The extract types suggested by Stage 1.5 for this transcript
- `{{documentType}}` - The document type being created

## Expected Output
JSON format with structured extractions organized by section:
```json
{
  "section_1": [
    {
      "type": "founder_quote",
      "content": "Exact quote or extracted information",
      "context": "Where in the transcript this came from and why it matters"
    }
  ],
  "section_2": []
}
```

## Success Criteria
- Extractions match the types suggested in Stage 1.5
- Content is extracted exactly as it appears (for quotes)
- Context explains relevance
- Empty arrays for sections with no relevant content
- Quality over quantity - better to have 5 great extracts than 20 mediocre ones

---

## Prompt

You are extracting specific content from a transcript to support writing sections of a "{{documentType}}".

## This Transcript

**Title:** {{transcriptTitle}}

**Content:**
{{transcriptText}}

## Document Outline

{{outline}}

## Suggested Extract Types (from analysis)

{{suggestedTypes}}

## Your Task

For each section, extract content from this transcript according to the suggested extract types. The previous analysis determined what types of content are available - now you need to actually pull out those specific pieces.

### Extraction Guidelines

**For direct quotes:**
- Copy the EXACT text from the transcript (don't paraphrase)
- Include enough context to understand what's being discussed
- Note who said it if there are multiple speakers

**For data/metrics:**
- Extract the precise numbers and timeframes
- Include any context about what was measured
- Note any caveats or conditions

**For processes/methods:**
- Capture the complete steps or approach
- Include relevant details about execution
- Note what made it successful or unsuccessful

**For insights/lessons:**
- Extract the core idea accurately
- Include the supporting evidence or story
- Capture the context that makes it meaningful

### Quality Standards

- **Relevance**: Only extract content that genuinely helps answer the section's key questions
- **Accuracy**: Preserve meaning and don't editorialize
- **Context**: Provide enough context that synthesis stage can use this effectively
- **Specificity**: Prefer concrete examples and specific details over vague generalizations

### For Each Section

1. Look at the suggested extract types for that section
2. Scan the transcript for content matching those types
3. Extract 3-10 items per section (not too few, not too many)
4. If a section has no suggested types (empty array), return empty array
5. Organize extractions by the type they represent

## Example Extraction

{
  "section_1": [
    {
      "type": "validation_signal",
      "content": "Posted MVP screenshots to Reddit within hours of seeing the shutdown announcement, got first paying customers before the post was even deleted",
      "context": "Demonstrates instant market validation from desperate users needing a replacement solution"
    },
    {
      "type": "founder_quote",
      "content": "When I saw Peter's tweet about the Skype shutdown, I thought \"that's me, I can build that\" and it's exactly what I did",
      "context": "Moment of opportunity recognition - example of how platform shutdowns create validated opportunities. Note the escaped quotes and apostrophe."
    },
    {
      "type": "revenue_milestone_with_timeframe",
      "content": "Month 1: $4,000 MRR. Month 2-3: $10,800 MRR. Month 6: $13,300 MRR",
      "context": "Revenue trajectory showing rapid growth from strong product-market fit"
    }
  ],
  "section_2": [
    {
      "type": "tech_stack_choice",
      "content": "Used Next.js for full-stack development instead of separate frontend and backend",
      "context": "Architectural decision that enabled shipping entire MVP in one weekend"
    },
    {
      "type": "chef_technique_quote",
      "content": "At this time of year in autumn, it's beautiful. The light is very different and it's such a privilege to cook at this time of day",
      "context": "Shows how the chef's philosophy connects to seasonal cooking. Apostrophes in 'it's' are handled correctly in JSON."
    }
  ]
}

## Important Guidelines

- **Match suggested types**: Use the exact type names suggested in Stage 1.5
- **Don't over-extract**: Quality matters more than quantity (3-10 items per section is ideal)
- **Empty is okay**: If a section has no suggested types, return `[]`
- **Preserve accuracy**: For quotes, use exact text. For data, use precise numbers.
- **Provide context**: The synthesis stage needs to understand why each extract matters

## Output Format Requirements

**CRITICAL: Your response will be parsed by JSON.parse(). Follow these rules EXACTLY:**

1. **NO markdown formatting** - Do NOT wrap your response in ```json or ``` code blocks
2. **NO trailing commas** - The last item in arrays and objects must NOT have a comma
3. **Properly escape strings** - This is critical when transcript content contains quotes or apostrophes:
   - Apostrophes like "it's" or "don't" are VALID in JSON strings - just write them normally: `"it's"`
   - For double quotes in content, escape them with backslash: `"He said \"hello\""`
   - Look at the example above - it shows correct handling of both apostrophes and quotes
4. **Every string value must have opening AND closing quotes** - Check that every `:` is followed by `"` before the value
5. **Start with { and end with }** - Your response should be ONLY the JSON object, nothing else
6. **Valid JSON only** - Your response must pass JSON.parse() without any errors
7. **Use exact section keys** - Use keys like "section_1", "section_2", etc. (NOT "section_1_ideation")

Return ONLY valid JSON in exactly this format (note: no code blocks, no trailing commas):

{
  "section_1": [
    {
      "type": "extract_type_from_suggested_list",
      "content": "The actual extracted content - exact quote, data point, insight, etc.",
      "context": "Brief explanation of where this came from and why it's relevant to this section"
    },
    {
      "type": "another_type",
      "content": "More extracted content",
      "context": "Context for this extraction"
    }
  ],
  "section_2": [],
  "section_3": [
    {
      "type": "yet_another_type",
      "content": "Additional content",
      "context": "Why this matters"
    }
  ]
}

**IMPORTANT:** Provide entries for all sections in the outline, even if some have empty arrays. Your entire response must be valid JSON that can be directly parsed.
