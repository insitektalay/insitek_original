# Stage 0: Analyze Transcripts and Propose Document Types

## When Used
Called by `/api/documents/analyze` endpoint when user selects transcripts and clicks "Generate Document"

## Input Variables
- `{{transcriptSummaries}}` - Array of full transcript summaries (NO truncation)
- `{{transcriptCount}}` - Number of transcripts selected
- `{{customInstructions}}` - User's specific requirements for the document (may be empty)

## Expected Output
JSON format:
```json
{
  "analysis_summary": "2-3 sentence overview of themes across transcripts",
  "structured_facts": {
    "counts": {
      "key_concept_1": 5,
      "key_concept_2": 12
    },
    "entities": ["Person/Company/Framework Name 1", "Person/Company/Framework Name 2"],
    "key_themes": ["Specific theme 1", "Specific theme 2", "Specific theme 3"],
    "time_periods": ["2020-2023", "Early stage startups"],
    "locations": ["Geographic regions if relevant"],
    "other_facts": ["Any other quantifiable or notable facts"]
  },
  "proposed_documents": [
    {
      "type": "Document Type Name",
      "description": "What this document would contain and who it's for",
      "rationale": "Why this would be valuable given the content"
    }
  ]
}
```

## Success Criteria
- Proposes 3-5 document types (not fewer, not more)
- Each type is distinct and valuable
- Descriptions are specific to the actual content (not generic)
- Rationale explains why THIS content supports THIS document type
- Extracts concrete, quantifiable facts from transcripts
- Identifies all named entities (people, companies, frameworks, tools)
- Lists specific themes (not generic categories like "business" but specific like "B2B SaaS pricing strategies")

---

## Prompt

You are a document strategy advisor analyzing transcript content to propose valuable documents.

You have {{transcriptCount}} transcript summaries about related topics. Your task is to analyze these summaries and propose 3-5 specific document types that would be valuable to create from this content.

## User's Primary Goal

{{customInstructions}}

**CRITICAL:** These custom instructions are your PRIMARY DIRECTIVE. All document proposals must be designed specifically to achieve this goal. Topic identification is secondary - the document TYPE (analytical, comparative, aggregative) must match the user's stated purpose.

If custom instructions are "No specific requirements provided," then propose document types based purely on content analysis using the standard guidelines below.

## How to Interpret Custom Instructions

When custom instructions ARE provided, they override standard content-based patterns. Use this guide:

**If the user requests:**
- "Identify conflicts" or "determine which is correct" → Propose: "Debate Analysis", "Comparative Framework", "Critical Assessment: Which Viewpoint Is Correct?"
- "Compare viewpoints" or "contrasting perspectives" → Propose: "Head-to-Head Analysis", "Perspective Comparison Study", "Evaluating Different Approaches"
- "Understand relationship between X and Y" → Propose: "Correlation Analysis", "Causal Framework", "X vs Y Impact Study"
- "Don't miss details" or "comprehensive" → Propose: "Exhaustive Deep Dive", "Complete Reference Guide", "Nothing-Left-Out Analysis"
- "For beginners" or "explain simply" → Propose: "Beginner's Guide", "ELI5 Breakdown", "Fundamentals Course"
- Generic/none → Use standard examples (Playbook, Technical Guide, etc.)

**Key principle:** If user wants "conflict analysis" but content is about "labor markets," propose "Labor Market Debate Analysis" NOT "Labor Market Report."

## Transcript Summaries

{{transcriptSummaries}}

## Your Task

1. **Check for custom instructions** - If provided, your PRIMARY goal is to fulfill that specific request. Skip to step 3.

2. **Extract structured facts** - As you analyze the transcripts, identify and count:
   - **Quantifiable items** - How many recipes, episodes, strategies, frameworks, case studies, etc.?
   - **Named entities** - Which specific people, companies, tools, frameworks, or products are mentioned?
   - **Specific themes** - Not just "marketing" but "cold email outreach for B2B SaaS"
   - **Time periods** - What years, stages, or timeframes are covered?
   - **Locations/contexts** - Geographic regions, industries, company stages (if relevant)
   - **Other notable facts** - Any other concrete, quantifiable information that would help generate accurate questions later

3. **Analyze the content** (only if no custom instructions) - What are the main themes, topics, and insights across these transcripts?

4. **Identify patterns** - Are there:
   - Common success strategies or frameworks?
   - Contradictions or different perspectives worth comparing?
   - Step-by-step processes that could be systematized?
   - Case studies that illustrate principles?
   - Technical knowledge that could be documented?

5. **Propose 3-5 VARIATIONS of documents** that fulfill the user's goal (if provided) or fit the content. Each variation should approach the goal from a different angle while maintaining focus on the stated purpose.

## Examples of Document Types

**Goal-Driven (when user specifies analytical purpose):**
- "Debate Analysis: Which Economic Model Is More Accurate?"
- "Comparative Framework: Evaluating Conflicting Perspectives on [Topic]"
- "Critical Assessment: Resolving Contradictions in [Topic]"
- "Head-to-Head Analysis: Two Experts' Opposing Views on [Topic]"
- "Correlation Study: Understanding the Relationship Between X and Y"

**Content-Driven (when no specific goal provided):**
- "Complete Founder Playbook: From Idea to $10K MRR"
- "Technical Deep Dive: Building Scalable SaaS Architecture"
- "The Ultimate Guide to [Specific Topic]"
- "Lessons Learned: Mistakes and How to Avoid Them"
- "Framework Guide: [Specific Process] Broken Down"

**Choose the category that matches the user's request (or content if no request).**

## Important Guidelines

- **Prioritize user's goal over content patterns** - If they want conflict analysis, propose analytical documents even if content seems descriptive
- **Be specific to the content** - Don't propose a "Marketing Guide" if the transcripts barely mention marketing
- **Consider the audience** - Who would benefit most from each document type?
- **Think about structure** - Will this document type work well with the available content?
- **Provide value justification** - Why is each document type worth creating?

## Output Format Requirements

**CRITICAL: Your response will be parsed by JSON.parse(). Follow these rules EXACTLY:**

1. **NO markdown formatting** - Do NOT wrap your response in ```json or ``` code blocks
2. **NO trailing commas** - The last item in arrays and objects must NOT have a comma
3. **Properly escape strings** - Use proper JSON string escaping for quotes and special characters
4. **Keep descriptions concise** - Each field should be 2-3 sentences maximum
5. **Start with { and end with }** - Your response should be ONLY the JSON object, nothing else
6. **Valid JSON only** - Your response must pass JSON.parse() without any errors

Return ONLY valid JSON in exactly this format (note: no code blocks, no trailing commas):

{
  "analysis_summary": "Brief 2-3 sentence summary of what these transcripts cover and the main themes",
  "structured_facts": {
    "counts": {
      "recipes": 5,
      "techniques": 8,
      "topics": 3
    },
    "entities": ["Gordon Ramsay", "Thomas Keller", "Instant Pot", "Sous Vide method"],
    "key_themes": ["Italian home cooking", "Meal prep strategies", "Budget-friendly recipes"],
    "time_periods": ["2020-2023"],
    "locations": ["Mediterranean cuisine"],
    "other_facts": ["All recipes under 30 minutes", "Focus on beginner-friendly techniques"]
  },
  "proposed_documents": [
    {
      "type": "Specific Document Type Name",
      "description": "Description of what this document would contain and who it's for (2-3 sentences)",
      "rationale": "Why this document type makes sense given the content (1-2 sentences)"
    },
    {
      "type": "Another Document Type",
      "description": "Another description here",
      "rationale": "Another rationale here"
    }
  ]
}

**IMPORTANT:** Propose between 3 and 5 document types. Extract all quantifiable facts and entities you can identify from the transcripts. Your entire response must be valid JSON that can be directly parsed.
