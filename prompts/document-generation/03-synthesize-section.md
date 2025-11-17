# Stage 3: Synthesize Section Content

## When Used
Called by `/api/documents/generate` during synthesis phase - ONCE per section. Takes all extractions from ALL transcripts for this section and creates polished prose.

## Input Variables
- `{{sectionNumber}}` - Which section this is (1, 2, 3, etc.)
- `{{sectionTitle}}` - Title of this section
- `{{sectionDescription}}` - What this section should cover
- `{{keyQuestions}}` - The questions this section should answer
- `{{allExtracts}}` - ALL extractions for this section from ALL transcripts, organized by type
- `{{fullTranscripts}}` - Full transcript texts for fact-checking and validation
- `{{documentType}}` - The document type being created
- `{{preferences}}` - User preferences (tone, audience, depth, etc.)
- `{{transcriptCount}}` - How many transcripts contributed to this section
- `{{targetWordCount}}` - Target word count for this section (e.g., "approximately 500 words" or "automatic")

## Expected Output
Markdown-formatted prose (500-1500 words per section):
```markdown
# Section Title

[Cohesive, well-written prose that weaves together insights from all transcripts]

[Includes relevant quotes, data, examples]

[Answers the key questions for this section]

[Flows naturally without feeling like a list]
```

## Success Criteria
- Reads as unified narrative, not "Transcript A says... Transcript B says..."
- Answers all key questions for the section
- Removes redundancy (if 3 founders said same thing, mention once)
- Handles conflicts thoughtfully (different perspectives presented as tradeoffs)
- Natural flow with transitions between ideas
- Appropriate length (500-1500 words)
- Matches user's requested tone and depth

---

## Prompt

You are writing one section of a "{{documentType}}" by synthesizing insights from {{transcriptCount}} transcripts.

## ⚠️ CRITICAL CONSTRAINTS - READ FIRST

**You MUST follow these rules strictly:**

1. **ONLY use content from the provided extracts and transcripts below**
   - Do NOT add information not present in the source material
   - Do NOT infer, extrapolate, or guess beyond what was explicitly stated
   - Do NOT use general knowledge, training data, or external information
   - Do NOT create examples, statistics, recipes, or advice not in the transcripts

2. **If content is insufficient:**
   - State "The available transcripts do not provide detailed information about [topic]"
   - Do NOT fill gaps with plausible-sounding content
   - It's better to acknowledge a gap than to invent content

3. **Your role is SYNTHESIS, not CREATION:**
   - Combine and organize existing content
   - Remove redundancy across transcripts
   - Create logical flow between points
   - But always stay faithful to the source material

4. **Fact-checking:**
   - You have access to full transcript texts below
   - If unsure about a detail, verify it against the full transcripts
   - Only include information you can trace back to the source

**Violating these constraints will result in hallucinated content that damages user trust.**

---

## This Section

**Section {{sectionNumber}}: {{sectionTitle}}**

**Should cover:** {{sectionDescription}}

**Key questions to answer:**
{{#each keyQuestions}}
- {{this}}
{{/each}}

## User Preferences

{{preferences}}

## All Extracted Content for This Section

You have extractions from {{transcriptCount}} transcripts. Here's all the relevant content, organized by type:

{{allExtracts}}

## Full Transcript Texts (For Fact-Checking)

Use these to verify details and ensure accuracy. Do not add content from here that wasn't already extracted above - these are for validation only.

{{fullTranscripts}}

## Your Task

Write this section as polished, cohesive prose that weaves together insights from all the extracts. This should read like a well-written article section, not a list of disconnected points.

**Remember: Synthesize ONLY what's in the extracts. Do not add external content.**

### Synthesis Guidelines

**1. Identify Patterns and Themes in the Extracts**
- What common approaches or insights appear across multiple transcripts?
- Are there interesting contrasts or different perspectives in the source material?
- What's the core message this section conveys based on the extracts?
- Stay within the bounds of what was actually said - do not infer broader themes

**2. Remove Redundancy**
- If 3 founders said essentially the same thing, mention it once
- Combine similar examples or quotes into unified points
- Don't repeat information just because multiple transcripts mentioned it

**3. Handle Conflicts Thoughtfully**
- If transcripts contradict each other, present both perspectives
- Frame as tradeoffs or different approaches, not one being "wrong"
- Example: "Some founders prioritize speed over scalability initially, while others invest in architecture upfront. The right choice depends on..."

**4. Weave in Quotes and Examples**
- Use direct quotes sparingly for impact, not for every point
- Integrate examples naturally into the narrative
- Attribute when it adds credibility, but don't over-attribute
- Example: Instead of "According to Transcript A, ...", just present the insight and use a quote for emphasis

**5. Create Natural Flow**
- Connect extracts logically with transitions
- Build from foundational concepts to specific tactics
- Group related points together
- End with a summary of key points from the extracts (do NOT add new advice or steps not in the source material)

**6. Match Tone and Depth**
- Honor user's preferences for audience level and detail
- If they wanted "beginner-friendly", explain concepts clearly
- If they wanted "technical depth", include implementation details
- If they wanted "tactical", focus on how-to; if "strategic", focus on why

**7. Answer the Key Questions**
- Make sure each key question gets addressed IF the extracts support it
- If a question cannot be answered from the extracts, explicitly state: "The available content does not address [question]"
- Do NOT invent answers to fill gaps - acknowledge limitations instead
- Add transitions that naturally lead into answering each question

### Length Guidance

**Target length for this section:** {{targetWordCount}}

- If a specific target is provided, aim to meet it (±20% is acceptable for natural flow)
- If "automatic", aim for 500-1500 words based on content complexity
- Shorter sections (500-800 words) work for focused topics
- Longer sections (1000-1500 words) work for complex topics with many examples
- Don't pad - if you've covered the topic well, stop (even if below target)
- Don't rush - if the content requires more words to do justice, use them (even if above target)

### Writing Style

- Write in clear, engaging prose
- Use active voice
- Vary sentence structure
- Include specific examples and data points
- Make it scannable (short paragraphs, occasional bullet points for lists)
- Avoid clichés and generic advice

## Example of Good Synthesis

**Bad (list-like, over-attributed):**
```
According to Founder A, you should validate your idea first. Founder B also mentioned validation. Founder C said that validation is important. Some ways to validate include posting on Reddit.
```

**Good (synthesized, natural flow):**
```
The founders converge on a counter-intuitive insight: validation matters more than originality. Rather than brainstorming novel ideas in isolation, successful founders test demand immediately. When Dennis saw the Skype shutdown announcement, he didn't spend weeks planning—he posted MVP screenshots to Reddit within hours and got paying customers before the post was deleted. This approach of "building in public" with rapid validation appears repeatedly across these stories, from Adrian's quick test of a scraping API idea to Mike's emphasis on picking problems that others have already solved.
```

## Output Format

Return ONLY the section content in markdown format:

```markdown
# {{sectionTitle}}

[Your synthesized prose here, weaving together insights from all extracts]

[Include relevant quotes, data, examples naturally]

[Answer the key questions for this section]

[Create natural flow and transitions]

[Match the user's requested tone and depth]
```

Do NOT include JSON. Do NOT include metadata. Just the markdown prose.

## Important

- This section will be combined with others to form the complete document
- Don't write an introduction that makes sense only as a standalone piece
- Don't write a conclusion that wraps up the entire document (that comes in Stage 4)
- Focus on making THIS section excellent and cohesive
- Trust that transitions between sections will be polished in Stage 4
