# Stage 1: Generate Document Outline

## When Used
Called by `/api/documents/generate` at the start of backend generation pipeline (after user approves structure preview)

## Input Variables
- `{{documentType}}` - The document type being created
- `{{approvedStructure}}` - The structure preview the user approved (from Stage 0.75)
- `{{transcriptSummaries}}` - Full summaries of all transcripts (NO truncation)
- `{{preferences}}` - All user preferences from conversation history
- `{{transcriptCount}}` - Number of transcripts

## Expected Output
JSON format:
```json
{
  "sections": [
    {
      "number": 1,
      "title": "Section Title",
      "description": "What this section should cover",
      "keyQuestions": ["Question 1", "Question 2", "Question 3"]
    }
  ]
}
```

## Success Criteria
- Number of sections exactly matches the approved structure
- Each section has clear scope and purpose
- Key questions guide what content to extract
- Sections flow logically and cover the topic as specified by user

---

## Prompt

You are creating a detailed outline for a "{{documentType}}" based on {{transcriptCount}} transcripts.

## User Approved This Structure

{{approvedStructure}}

## User Preferences

{{preferences}}

## Available Content (Transcript Summaries)

{{transcriptSummaries}}

## Your Task

Create a detailed outline that will guide the content extraction and synthesis process. You should follow the structure the user approved, but can make minor refinements for better flow.

For each section:

### 1. Confirm or Refine the Title
- Use the approved title unless you see a compelling reason to adjust
- Keep titles clear and descriptive

### 2. Write a Section Description
- Explain what this section should cover (1-2 paragraphs)
- Define the scope clearly
- Explain why this section matters in the context of the overall document

### 3. List Key Questions This Section Should Answer
- What specific questions should this section address?
- What should readers learn or be able to do after reading this section?
- List 3-5 key questions

These questions will guide what content gets extracted from transcripts and how it's synthesized.

## Example Section Entry

```json
{
  "number": 1,
  "title": "Finding Proven Ideas",
  "description": "This section explores methods for identifying validated business opportunities without starting from scratch. Rather than brainstorming original ideas, it focuses on systematic approaches for finding ideas that have already demonstrated market demand. This reduces risk and accelerates the path to revenue.",
  "keyQuestions": [
    "Where can founders find businesses that are already validated?",
    "How do you identify opportunities from platform changes or shutdowns?",
    "What signals indicate an idea has real market demand?",
    "How can solving your own problems lead to validated ideas?",
    "What's the difference between copying and smart replication?"
  ]
}
```

## Guidelines

- **Stay true to the approved structure** - User reviewed and approved this plan. Do not add or remove sections.
- **Respect user's scope** - If custom instructions specified minimal or focused content, keep each section focused on essentials only. If comprehensive coverage was requested, each section should cover meaningful ground.
- **Ensure logical flow** - Sections should build on each other when possible
- **Make questions actionable** - Questions should guide specific content extraction
- **Match user preferences** - If they wanted technical depth, questions should reflect that. If they wanted concise content, keep it focused.

## Output Format Requirements

**CRITICAL: Your response will be parsed by JSON.parse(). Follow these rules EXACTLY:**

1. **NO markdown formatting** - Do NOT wrap your response in ```json or ``` code blocks
2. **NO trailing commas** - The last item in arrays and objects must NOT have a comma
3. **Properly escape strings** - Use proper JSON string escaping for quotes and special characters
4. **Keep descriptions concise** - Descriptions should be 2-3 sentences, not full paragraphs
5. **Start with { and end with }** - Your response should be ONLY the JSON object, nothing else
6. **Valid JSON only** - Your response must pass JSON.parse() without any errors

Return ONLY valid JSON in exactly this format (note: no code blocks, no trailing commas):

{
  "sections": [
    {
      "number": 1,
      "title": "Section Title Here",
      "description": "Brief 2-3 sentence description of what this section covers and why it matters in the document.",
      "keyQuestions": [
        "Specific question 1",
        "Specific question 2",
        "Specific question 3",
        "Specific question 4",
        "Specific question 5"
      ]
    },
    {
      "number": 2,
      "title": "Another Section Title",
      "description": "Another brief description here.",
      "keyQuestions": ["Question 1", "Question 2", "Question 3"]
    }
  ]
}

**IMPORTANT:** You should have {{approvedStructure.sections.length}} sections matching the approved structure. Your entire response must be valid JSON that can be directly parsed.
