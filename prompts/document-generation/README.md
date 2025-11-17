# Document Generation Prompts

This directory contains all LLM prompts used in the document generation pipeline. Each prompt is a separate markdown file that gets loaded by the server and has variables injected at runtime.

## Prompt Flow

The document generation system has two distinct flows:

### User-Facing Wizard Flow (00-series)
These prompts power the interactive wizard that guides users through document creation:

1. **00-analyze-transcripts.md** - Analyzes transcript summaries and proposes 3-5 document types
2. **00.5-question-next.md** - Generates questions one at a time based on conversation history
3. **00.75-preview-structure.md** - Creates detailed document outline for user approval

### Backend Generation Pipeline (01-04 series)
After user approves the structure, these prompts run in the background to generate the document:

1. **01-generate-outline.md** - Creates detailed document structure with 6-10 sections
2. **01.5-determine-extract-types.md** - Analyzes each transcript to suggest relevant extract types per section
3. **02-extract-content.md** - Extracts structured content from transcript using suggested types
4. **03-synthesize-section.md** - Synthesizes extracts from all transcripts into cohesive prose for one section
5. **04-polish-document.md** - Adds intro/conclusion and polishes complete document

## Variable Injection

Prompts use `{{variableName}}` syntax for variables that get injected at runtime:

### Common Variables
- `{{transcriptSummaries}}` - Array of transcript summaries (Stage 0)
- `{{transcriptText}}` - Full text of a single transcript (Stages 1.5, 2)
- `{{documentType}}` - Selected document type (e.g., "Founder Playbook")
- `{{outline}}` - Document structure from Stage 1
- `{{conversationHistory}}` - Q&A pairs from iterative questions
- `{{preferences}}` - User preferences from all answered questions
- `{{extracts}}` - Structured extractions for a section
- `{{sections}}` - All synthesized sections for final polish

## Prompt Best Practices

When editing prompts:

1. **Be Specific** - Give clear instructions about format and structure
2. **Provide Examples** - Show what good output looks like
3. **Define Success** - Explain what makes a high-quality response
4. **Limit Scope** - Each prompt should do one job well
5. **Test Iteratively** - Test with real transcripts and refine based on output

## Prompt Version History

Track significant prompt changes in git commits. Consider A/B testing major rewrites before deploying to all users.

## File Naming Convention

- `00-series` = User-facing wizard stages
- `01-04 series` = Background generation pipeline
- `.md` extension = Markdown format for readability
- Descriptive names reflecting what the prompt does

## Debugging Prompts

To debug a prompt:
1. Find the corresponding .md file
2. Check what variables are being injected (see API endpoint code)
3. Look at actual LLM output in database/logs
4. Refine instructions and test again

## Loading Mechanism

Prompts are loaded by `server/prompts/loader.js`:
- Reads all .md files at server startup
- Caches in memory for performance
- Hot-reloads in development mode (NODE_ENV=development)
- Injects variables using simple string replacement
