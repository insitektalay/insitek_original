# Stage 4: Polish Complete Document

## When Used
Called by `/api/documents/generate` at the very end - ONCE after all sections are synthesized. Adds intro/conclusion and polishes the complete document.

## Input Variables
- `{{documentTitle}}` - The document title
- `{{documentType}}` - The document type
- `{{allSections}}` - All synthesized sections concatenated in order
- `{{sectionTitles}}` - Array of section titles for reference
- `{{preferences}}` - User preferences
- `{{transcriptCount}}` - How many transcripts were synthesized

## Expected Output
Complete markdown document with polished sections (no new sections added):
```markdown
# Document Title

# Section 1 Title
[Section 1 content - polished for clarity and flow]

# Section 2 Title
[Section 2 content - polished with smooth transitions]

...

[All sections from input, polished and consistent]
```

## Success Criteria
- Smooth transitions between sections
- Consistent tone throughout
- No redundancy across section boundaries
- Reads as one coherent document, not separate parts assembled
- NO sections added beyond what was provided (no intro/conclusion unless already present)
- All content traceable to the input sections

---

## Prompt

You are performing the final polish on a "{{documentType}}" created from {{transcriptCount}} transcripts.

## Document Title

{{documentTitle}}

## User Preferences

{{preferences}}

## All Section Content

The document has been written section by section. Here are all the sections in order:

{{allSections}}

## ⚠️ CRITICAL CONSTRAINTS - READ FIRST

**You MUST follow these rules strictly:**

1. **DO NOT add sections not already present**
   - Do NOT add an Introduction unless one already exists in the sections
   - Do NOT add a Conclusion unless one already exists in the sections
   - Only polish and improve the sections that were already written

2. **ONLY use content from the existing sections**
   - Do NOT add new information, advice, or examples
   - Do NOT use general knowledge or training data
   - Do NOT create new takeaways or action steps beyond what's in the sections
   - Your job is to POLISH, not to CREATE

3. **If an introduction/conclusion already exists:**
   - Polish it for clarity and impact
   - Ensure it reflects content from the other sections
   - Do NOT add external content to it

**The user approved a specific outline. Do not deviate from it by adding sections.**

---

## Your Task

Polish this document to make it feel like one cohesive piece rather than separate sections assembled together. Specifically:

### 1. Fix Transitions Between Sections

For each section transition, check:
- **Does the flow make sense?** Add a sentence or two to bridge if needed
- **Is there redundancy?** If Section 3 repeats something from Section 2, remove it
- **Are there gaps?** If sections jump topics abruptly, smooth it out

You can add transitional sentences or short paragraphs between sections if it helps flow, but ONLY using content already present in the sections. Example:
```
With a validated idea in hand, the next challenge is building fast enough to capture the opportunity...
```

### 2. Ensure Consistent Tone

- Check that all sections match the user's requested tone
- Adjust any sections that feel too formal/informal relative to others
- Make sure technical depth is consistent (or intentionally progressive)
- Verify audience level is appropriate throughout

### 3. Remove Cross-Section Redundancy

- If the same example or quote appears in multiple sections, keep it in the most relevant place
- If similar points are made multiple times, consolidate or rephrase for variety
- Ensure data points aren't repeated

### 4. Final Quality Check

- **Length check**: Is this an appropriate length given the content? (Typical: 5,000-15,000 words)
- **Readability**: Are paragraphs short? Is it scannable?
- **Specificity**: Are examples concrete and data points precise?
- **Value**: Will readers actually learn something valuable?

## Important Guidelines

- **Don't rewrite sections unnecessarily** - They've already been synthesized. Only improve transitions and fix inconsistencies.
- **Don't add new sections** - Only polish what already exists. No introductions or conclusions unless they were already in the outline.
- **Maintain the user's vision** - Honor their preferences throughout
- **Keep it cohesive** - This should feel like one document, one voice, one narrative
- **Stay faithful to source content** - Do not add information not present in the sections

## Output Format

Return the COMPLETE document in markdown format with:

1. Title (# Document Title)
2. All sections with polish and transition improvements (# Section Title, content)
3. Only add an Introduction or Conclusion if they were already present in the input sections

```markdown
# {{documentTitle}}

# Section 1 Title

[Section 1 content - from synthesis stage, with any minor polish or transition improvements]

# Section 2 Title

[Possibly a transitional sentence if needed to bridge from Section 1, using content already in the sections]

[Section 2 content - from synthesis stage, with any improvements]

...

[Continue with all sections from the input, polished for flow and consistency]
```

## Important

- This is the final version that will be saved and shown to users
- Polish for excellence WITHOUT adding new content
- Every paragraph should earn its place
- Ensure smooth flow and consistency across sections
- Remember: POLISH ONLY - do not create or add sections
