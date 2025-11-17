# Agentic Document Generation - Quick Start Guide

## 🚀 System Overview

You now have a **fully autonomous AI agent** that can generate documents by intelligently using up to 12 tools to read transcripts, organize notes, and synthesize content. The agent makes its own decisions about structure, content extraction, and writing approach.

**NEW:** The system now includes:
- ✨ **Scalability**: Handle 50+ transcripts via chunking and smart search
- 📡 **Real-time Streaming**: Server-Sent Events (SSE) for live progress updates
- 🧪 **A/B Testing**: 3 variant strategies (baseline, hybrid, scalable)
- 💭 **Reasoning Capture**: See the agent's thought process in real-time

### Key Differences from Pipeline System

| Feature | Pipeline System | Agentic System |
|---------|----------------|----------------|
| **Approach** | Fixed 7-stage deterministic sequence | Agent decides its own path |
| **Structure** | Predetermined outline approval | Agent creates structure autonomously |
| **Extraction** | Single-pass per stage | Agent can iterate and refine |
| **Control** | Step-by-step user approval | Fire-and-forget autonomous execution |
| **Scalability** | Limited to ~5 transcripts | Handles 50+ transcripts with chunking |
| **Observability** | Polling only | Real-time SSE streaming + reasoning |
| **Model** | Claude Sonnet 4.5 (Anthropic) | GPT-OSS-120B (OpenRouter) |
| **Cost** | ~$6/document | ~$2-4/document (estimated) |

---

## 🎯 Quick Test

### Test the Scalable Variant System

Run the variant comparison test to see A/B testing in action:

```bash
node test-variants.mjs
```

This will:
1. Generate the same document with **baseline** and **scalable** variants
2. Show real-time progress updates with metrics
3. Compare tool usage, cost, and performance between variants
4. Display detailed analytics for optimization

### Test a Single Generation

Run the basic test script:

```bash
node test-agentic-system.mjs
```

This will:
1. Start an agent to generate a "Recipe Collection Analysis" from 2 Jamie Oliver transcripts
2. Show real-time progress updates with live status bar
3. Display the final document and behavior analytics

---

## 📡 API Usage

### 1. Start Generation

**NEW:** You can now choose a variant strategy!

```bash
curl -X POST http://localhost:3001/api/agent-documents/generate \
  -H "Content-Type: application/json" \
  -d '{
    "transcriptIds": ["uuid1", "uuid2", "uuid3"],
    "documentType": "Founder Playbook",
    "variantId": "scalable",
    "preferences": {
      "tone": "casual",
      "depth": "detailed",
      "audience": "beginners",
      "customInstructions": "Focus on practical examples..."
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "documentId": "550e8400-e29b-41d4-a716-446655440000",
  "variantId": "scalable",
  "message": "Agent started. Poll /api/agent-documents/:id/status for progress."
}
```

**Available Variants:**
- `baseline` - Original 7-tool approach (max 5 transcripts)
- `hybrid` - Scalable tools without planning (max 30 transcripts)
- `scalable` - Full feature set with chunking and planning (max 50 transcripts)

### 2. Monitor Progress (Polling)

Poll every 2-5 seconds:

```bash
curl http://localhost:3001/api/agent-documents/{documentId}/status
```

**Response:**
```json
{
  "status": "WRITING",
  "progress": 67,
  "currentStage": "Writing section 3 of 5",
  "errorMessage": null,
  "stats": {
    "toolCallCount": 42,
    "totalTokens": 125000,
    "totalCost": 0.32,
    "sectionsCreated": 5,
    "sectionsWithContent": 3,
    "notesCollected": 87
  }
}
```

### 2b. Monitor Progress (Real-time Streaming) ✨ NEW

**Recommended:** Use Server-Sent Events for real-time updates:

```javascript
const eventSource = new EventSource(
  `http://localhost:3001/api/agent-documents/{documentId}/stream`
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'connected') {
    console.log('Connected to agent stream');
  }

  if (data.type === 'progress') {
    console.log(`Progress: ${data.progress}%`);
    console.log(`Stage: ${data.currentStage}`);
  }

  if (data.type === 'reasoning') {
    console.log(`💭 Agent: ${data.text}`);
  }

  if (data.type === 'tool_call') {
    console.log(`🔧 ${data.toolName}(${JSON.stringify(data.args)})`);
  }

  if (data.type === 'tool_result') {
    console.log(`✅ Tool completed in ${data.durationMs}ms`);
  }

  if (data.type === 'complete') {
    console.log('✅ Generation complete!');
    eventSource.close();
  }

  if (data.type === 'error') {
    console.error('❌ Generation failed:', data.error);
    eventSource.close();
  }
};
```

**Status Values:**
- `INITIALIZING` - Agent starting up
- `READING` - Reading transcripts
- `PLANNING` - Structuring document
- `WRITING` - Creating content
- `POLISHING` - Final refinements
- `COMPLETE` - ✅ Done!
- `FAILED` - ❌ Error occurred

### 3. Get Final Document

```bash
curl http://localhost:3001/api/agent-documents/{documentId}
```

**Response:**
```json
{
  "id": "uuid",
  "title": "Founder Playbook",
  "documentType": "Founder Playbook",
  "status": "COMPLETE",
  "content": "# Section 1\n\nContent here...",
  "wordCount": 4500,
  "generationTime": 420,
  "sections": [...],
  "notes": [...],
  "toolCalls": [...]
}
```

### 4. Analyze Agent Behavior

For A/B testing and optimization:

```bash
curl http://localhost:3001/api/agent-documents/{documentId}/analysis
```

**Response:**
```json
{
  "generationMetrics": {
    "totalToolCalls": 87,
    "totalTokens": 156000,
    "totalCost": 0.42,
    "generationTime": 420
  },
  "toolCallBreakdown": {
    "read_transcript": 5,
    "take_note": 42,
    "create_section": 6,
    "write_section": 12,
    "update_progress": 15,
    "finalize_document": 1
  },
  "readingPattern": [...],
  "noteUtilization": {
    "total": 42,
    "used": 38,
    "utilizationRate": 0.90
  },
  "sectionEvolution": [...]
}
```

---

## 🛠️ Agent Tools (What the Agent Can Do)

The agent autonomously decides when and how to use these tools. Available tools depend on the chosen variant:

### Core Tools (All Variants)
Available in baseline, hybrid, and scalable variants:

1. **`take_note`** - Save organized notes for later synthesis (quotes, insights, data points)
   - **NEW in scalable:** Supports `importance` rating (critical/high/medium/low)

2. **`create_section`** - Define document structure by creating sections in order

3. **`write_section`** - Write or revise section content (iterative refinement)

4. **`get_current_document_state`** - Get current document structure and content

5. **`update_progress`** - Report progress to user (stage and percentage)

6. **`finalize_document`** - Assemble all sections into final markdown document

### Baseline Tools (baseline variant only)

7. **`read_transcript`** - Read full text of a transcript
   - **Note:** Only in baseline variant. Scalable variants use chunking instead.

### Scalable Tools ✨ NEW (hybrid & scalable variants)

8. **`list_available_transcripts`** - List all transcripts with metadata (title, channel, word count)
   - Helps agent plan which transcripts to read first

9. **`search_transcripts`** - Search across all transcript content with keyword matching
   - Returns top 10 most relevant chunks with context

10. **`read_transcript_chunk`** - Read a specific chunk of a transcript (~2000 words)
    - Enables handling of very large transcripts without context overflow

### Planning Tools ✨ NEW (scalable variant only)

11. **`create_workflow_plan`** - Create a strategic plan before starting document generation
    - Helps agent organize approach for complex multi-transcript documents

### Note Management Tools ✨ NEW (scalable variant only)

12. **`search_notes`** - Search through previously collected notes
    - Find relevant notes by keyword, importance level, or section

---

## 📊 How the Agent Works

```
User submits request
        ↓
Agent reads system prompt
        ↓
Agent decides: "I should read transcript 1 first"
        ↓
Calls read_transcript tool
        ↓
Receives transcript content
        ↓
Agent decides: "I'll take notes on key points"
        ↓
Calls take_note multiple times
        ↓
Agent decides: "Now I'll create sections"
        ↓
Calls create_section for each section
        ↓
Agent decides: "Time to write section 1"
        ↓
Calls write_section with synthesized content
        ↓
Agent decides: "Section 1 needs improvement"
        ↓
Calls write_section again (revision 2)
        ↓
... repeats for all sections ...
        ↓
Agent decides: "All sections complete, let's finalize"
        ↓
Calls finalize_document
        ↓
✅ COMPLETE
```

**The agent has COMPLETE FREEDOM within safety constraints:**
- Max 200 tool calls
- 30-minute timeout
- Must only use transcript content (no hallucination)

---

## 🔍 Monitoring & Debugging

### View All Agent Documents

```bash
curl http://localhost:3001/api/agent-documents?limit=10
```

### Delete Test Document

```bash
curl -X DELETE http://localhost:3001/api/agent-documents/{documentId}
```

### Watch Database Activity

```sql
-- Recent agent documents
SELECT id, title, status, progress, "toolCallCount"
FROM "AgentDocument"
ORDER BY "createdAt" DESC
LIMIT 10;

-- Tool call breakdown for a document
SELECT "toolName", COUNT(*), success
FROM "AgentToolCall"
WHERE "documentId" = 'uuid'
GROUP BY "toolName", success
ORDER BY COUNT(*) DESC;

-- Notes collected by section
SELECT "sectionTitle", COUNT(*), "noteType"
FROM "AgentNote"
WHERE "documentId" = 'uuid'
GROUP BY "sectionTitle", "noteType";

-- Section evolution
SELECT title, "wordCount", "revisionCount"
FROM "AgentSection"
WHERE "documentId" = 'uuid'
ORDER BY "order";
```

### Server Logs

The agent service logs detailed progress:

```
🚀 Starting agentic generation: Founder Playbook from 5 transcripts
🔄 Agent turn 1, total tool calls: 0
  🔧 Tool: read_transcript
  🔧 Tool: take_note (x15)
  🔧 Tool: update_progress
🔄 Agent turn 2, total tool calls: 17
  🔧 Tool: create_section (x6)
  🔧 Tool: write_section (x2)
✅ Agent completed generation (87 tool calls)
📊 Generation stats: 87 tool calls, 156000 tokens, 420s, $0.42
```

---

## 🧪 Variant System & A/B Testing ✨ NEW

### Understanding Variants

The system supports 3 different agent strategies for A/B testing and optimization:

| Variant | Tools | Max Transcripts | Best For |
|---------|-------|----------------|----------|
| **baseline** | 7 tools | 5 transcripts | Small documents, testing baseline performance |
| **hybrid** | 10 tools | 30 transcripts | Medium documents, scalable reading without planning |
| **scalable** | 12 tools | 50+ transcripts | Large documents, complex multi-source synthesis |

### Variant Features Comparison

**Baseline (Original Approach):**
- ✅ Simple tool set (7 tools)
- ✅ Full transcript reading
- ❌ No chunking support
- ❌ No workflow planning
- ❌ No note importance ratings
- ❌ No note search

**Hybrid (Middle Ground):**
- ✅ Scalable transcript tools (10 tools)
- ✅ Chunked reading for large transcripts
- ✅ Transcript search
- ❌ No workflow planning
- ❌ No note importance ratings
- ❌ No note search

**Scalable (Full Features):**
- ✅ All 12 tools enabled
- ✅ Chunked reading for large transcripts
- ✅ Transcript search
- ✅ Workflow planning
- ✅ Note importance ratings
- ✅ Note search

### Choosing a Variant

**Automatic Recommendation:**
```bash
curl http://localhost:3001/api/agent-documents/variants?transcriptCount=15
```

**Response:**
```json
{
  "variants": [
    { "id": "baseline", "name": "Baseline (Original)", "maxTranscripts": 5 },
    { "id": "hybrid", "name": "Hybrid (Selective Features)", "maxTranscripts": 30 },
    { "id": "scalable", "name": "Scalable (All Features)", "maxTranscripts": 50 }
  ],
  "recommendation": "hybrid"
}
```

**Recommendation Logic:**
- 1-5 transcripts → **baseline** (simple is better)
- 6-15 transcripts → **hybrid** (scalable reading, no planning overhead)
- 16+ transcripts → **scalable** (full feature set for complex documents)

### Comparing Variants

Generate the same document with different variants:

```bash
# Generate with baseline
curl -X POST http://localhost:3001/api/agent-documents/generate \
  -d '{"transcriptIds": [...], "documentType": "Test", "variantId": "baseline"}'

# Generate with scalable
curl -X POST http://localhost:3001/api/agent-documents/generate \
  -d '{"transcriptIds": [...], "documentType": "Test", "variantId": "scalable"}'
```

Then compare using the analysis endpoint:

```bash
curl http://localhost:3001/api/agent-documents/{baselineId}/analysis > baseline.json
curl http://localhost:3001/api/agent-documents/{scalableId}/analysis > scalable.json
```

**Key Metrics to Compare:**
- `toolCallCount` - How many tool calls were made
- `totalTokens` - Token usage (impacts cost)
- `totalCost` - Estimated cost in USD
- `generationTimeMs` - Time taken
- `toolUsagePatterns` - Which tools were used and how often
- `noteUtilization` - Percentage of notes used in final document
- `sectionEvolution` - Number of revisions per section

---

## 💡 Tips for Best Results

### 1. Transcript Selection
- **Baseline variant**: 1-5 transcripts (limited by full-text reading)
- **Hybrid variant**: 5-30 transcripts (chunked reading, no planning)
- **Scalable variant**: 10-50+ transcripts (full features for complex synthesis)
- Choose related transcripts for coherent synthesis
- **NEW:** Agent can now handle 10x more transcripts with chunking!

### 2. Document Types
Be specific about what you want:
- ✅ "Founder Playbook on Finding Product-Market Fit"
- ✅ "Technical Deep Dive: React Performance Optimization"
- ❌ "Document" (too vague)

### 3. Preferences
Guide the agent's approach:
```json
{
  "tone": "casual|professional|academic|conversational",
  "depth": "concise|detailed|comprehensive",
  "audience": "beginners|practitioners|experts",
  "customInstructions": "Detailed requirements for structure, sections, format..."
}
```

**NEW `customInstructions` Feature:**
Provide detailed guidance for the agent:
```json
{
  "customInstructions": "Create a weekly meal plan with:\n- Breakfast, lunch, dinner, snacks\n- Shopping list by category\n- Prep time and serving sizes\n- Focus on quick weeknight meals"
}
```

The agent will follow these instructions while maintaining autonomy in execution.

### 4. Cost Optimization
- Agent typically uses 100k-200k tokens per document
- Cost: ~$2-4 per document with gpt-oss-120b
- Longer documents with more transcripts = higher cost
- Monitor `totalCost` in status updates

---

## 🎯 Use Cases

### 1. Content Synthesis
Generate comprehensive guides by analyzing multiple expert interviews.

**Example:**
```json
{
  "transcriptIds": ["interview1", "interview2", "interview3"],
  "documentType": "Complete Guide to Email Marketing",
  "preferences": { "tone": "professional", "depth": "comprehensive" }
}
```

### 2. Comparative Analysis
Extract patterns and insights across multiple sources.

**Example:**
```json
{
  "transcriptIds": ["founder1", "founder2", "founder3"],
  "documentType": "Common Patterns in Successful Startup Launches",
  "preferences": { "emphasis": "case studies", "format": "reference" }
}
```

### 3. Knowledge Extraction
Create structured documentation from unstructured content.

**Example:**
```json
{
  "transcriptIds": ["webinar1", "webinar2"],
  "documentType": "Developer Onboarding Playbook",
  "preferences": { "format": "instructional", "audience": "beginners" }
}
```

---

## 🔒 Safety Features

### Built-in Safeguards

1. **Tool Call Limit**: Max 200 tool calls per document
2. **Timeout**: 30-minute maximum generation time
3. **Source Validation**: All notes must reference valid transcripts
4. **Content Verification**: Sections must have content before finalization
5. **Audit Trail**: Every tool call logged with input/output/duration

### System Prompt Constraints

The agent is instructed to:
- ✅ Only use content from provided transcripts
- ✅ Update progress regularly
- ✅ Stay organized with sections
- ✅ Think step-by-step
- ❌ Never hallucinate or use external knowledge
- ❌ Never skip transcripts
- ❌ Never leave sections incomplete

---

## 📈 Expected Performance

**Generation Time:**
- 3 transcripts: ~5-8 minutes
- 5 transcripts: ~8-12 minutes
- 10 transcripts: ~12-20 minutes

**Quality Indicators:**
- Note utilization rate >80% (agent uses most of what it collects)
- Section revision count 1-3 (agent iterates appropriately)
- Tool call efficiency (reads all transcripts, organized note-taking)

---

## 🆚 When to Use Agent vs Pipeline

### Use Agentic System When:
- You want maximum quality through iterative refinement
- Document structure is not predetermined
- Content requires adaptive extraction
- You're willing to wait for autonomous completion
- Lower cost is important

### Use Pipeline System When:
- You want predictable structure and timing
- You need step-by-step control and approval
- You prefer Claude Sonnet 4.5's writing style
- Real-time preview and adjustments are important
- You want to see intermediate stages

### A/B Testing Recommended:
Generate the same document with both systems and compare:
- Quality (coherence, depth, accuracy)
- Cost (tokens used, API cost)
- Time (generation duration)
- Structure (sections, organization)

Use `/api/agent-documents/:id/analysis` to compare agent behavior metrics.

---

## ✅ System Status

**Current Configuration:**
- Model: `openai/gpt-oss-120b` via OpenRouter
- Base URL: `https://openrouter.ai/api/v1`
- Max Tool Calls: 200
- Timeout: 30 minutes
- Database: PostgreSQL with Prisma ORM

**API Endpoints Ready:**
- ✅ POST `/api/agent-documents/generate` - Start generation with variant selection
- ✅ GET `/api/agent-documents/:id/status` - Poll for progress
- ✅ GET `/api/agent-documents/:id/stream` ✨ NEW - Real-time SSE streaming
- ✅ GET `/api/agent-documents/:id` - Get complete document
- ✅ GET `/api/agent-documents/:id/analysis` - Behavior analytics
- ✅ GET `/api/agent-documents/variants` ✨ NEW - List available variants
- ✅ GET `/api/agent-documents` - List all documents
- ✅ DELETE `/api/agent-documents/:id` - Delete document

**Database Tables:**
- ✅ `AgentDocument` (main document record)
- ✅ `AgentSection` (individual sections)
- ✅ `AgentNote` (research notes)
- ✅ `AgentToolCall` (audit trail)

---

## 🎉 Ready to Use!

The agentic document generation system is fully operational. Start your first generation:

```bash
# Quick test with included script
node test-agentic-system.mjs

# Or via API
curl -X POST http://localhost:3001/api/agent-documents/generate \
  -H "Content-Type: application/json" \
  -d '{
    "transcriptIds": ["YOUR_TRANSCRIPT_IDS"],
    "documentType": "Your Document Type",
    "preferences": {}
  }'
```

For detailed technical documentation, see `AGENTIC_SYSTEM_SUMMARY.md`.
