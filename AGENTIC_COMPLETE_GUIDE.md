# Agentic Document Generation - Complete Implementation Guide

**Implementation Date:** November 8-10, 2025
**Status:** Fully Operational with Phase 1-4 Enhancements ✅

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Phase 1-4 Features](#phase-1-4-features)
4. [Variant System](#variant-system)
5. [Real-time Streaming](#real-time-streaming)
6. [API Reference](#api-reference)
7. [Tool Reference](#tool-reference)
8. [Advanced Features](#advanced-features)
9. [Testing & Monitoring](#testing--monitoring)
10. [Performance & Cost](#performance--cost)
11. [Recent Bug Fixes](#recent-bug-fixes)
12. [Troubleshooting](#troubleshooting)

---

## Overview

The Agentic Document Generation System is a **fully autonomous AI agent** that generates comprehensive documents from transcript sources using function calling and iterative refinement. The system has been enhanced across 4 major phases to support scalability, real-time observability, and A/B testing.

### Key Capabilities

- ✨ **Autonomous Generation**: Agent makes all decisions about structure, content extraction, and writing
- 🔄 **Iterative Refinement**: Agent can revise sections multiple times for quality
- 📊 **Scalability**: Handle 50+ transcripts through chunking and smart search
- 📡 **Real-time Streaming**: Server-Sent Events (SSE) for live progress and reasoning
- 🧪 **A/B Testing**: 3 variant strategies for performance optimization
- 💭 **Reasoning Capture**: See the agent's thought process in real-time
- 🔍 **Full Observability**: Complete audit trail of all agent actions

---

## Architecture

### Technology Stack

- **Model**: OpenRouter `openai/gpt-oss-120b` (bypassing AI SDK for v1 compatibility)
- **Backend**: Express.js with direct OpenRouter API calls
- **Database**: PostgreSQL + Prisma ORM
- **Real-time**: Server-Sent Events (SSE) + Polling
- **Event System**: Node.js EventEmitter for streaming

### Database Schema

```
AgentDocument
├── id (UUID)
├── title
├── documentType
├── status (INITIALIZING, READING, PLANNING, WRITING, POLISHING, COMPLETE, FAILED)
├── progress (0-100)
├── currentStage
├── variantId ✨ NEW
├── workflowPlan ✨ NEW
├── toolCallCount
├── totalTokens
├── totalCost
├── generationTimeMs
├── content (final markdown)
├── createdAt, updatedAt
└── Relations:
    ├── transcripts (many-to-many)
    ├── sections (one-to-many)
    ├── notes (one-to-many)
    └── toolCalls (one-to-many)

AgentSection
├── id
├── documentId
├── title
├── content
├── order
├── wordCount
├── revisionCount
└── createdAt, updatedAt

AgentNote
├── id
├── documentId
├── transcriptId
├── content
├── noteType (QUOTE, INSIGHT, DATA_POINT, EXAMPLE, QUESTION)
├── importance (CRITICAL, HIGH, MEDIUM, LOW) ✨ NEW
├── sectionTitle
├── sourceContext
└── createdAt

AgentToolCall
├── id
├── documentId
├── toolName
├── args
├── result
├── success
├── errorMessage
├── durationMs
├── reasoning ✨ NEW (captured explanatory text)
└── createdAt
```

---

## Phase 1-4 Features

### Phase 1: Transcript Chunking & Scalable Tools ✨

**Problem:** Baseline system couldn't handle more than 5 transcripts due to context limitations.

**Solution:**
- **Transcript Chunking** (`services/transcriptChunker.js`):
  - Splits transcripts into ~2000 word chunks (range: 1500-2500 words)
  - Respects paragraph boundaries, splits large paragraphs by sentences
  - AI-generated summaries per chunk using gpt-4o-mini
  - Keyword extraction for searchability
  - Time range mapping (startTime/endTime from transcript segments)
  - Database indexing on keywords for fast search
- **New Tools**:
  - `list_available_transcripts` - Get transcript metadata without loading full text
  - `search_transcripts` - Search across all transcripts with keyword matching
  - `read_transcript_chunk` - Read specific chunks by chunkId instead of full text

**Database Schema:**
- `TranscriptChunk` - chunkIndex, content, wordCount, summary, keywords[]
- `TranscriptMetadata` - totalChunks, avgChunkSize, topics[], speakers[]

**Impact:** Can now handle 50+ transcripts efficiently with intelligent chunk-based reading.

### Phase 2: Real-time Streaming & Observability ✨

**Problem:** No real-time visibility into agent decision-making process.

**Solution:**
- **Server-Sent Events (SSE)**: Stream updates in real-time via `/stream` endpoint
- **Event Emitter Infrastructure**: Document-specific event emitters for isolated streaming
- **Reasoning Capture**: Extract and stream agent's explanatory text before tool calls
- **Event Types**:
  - `connected` - Stream connection established
  - `progress` - Progress updates
  - `reasoning` - Agent's thought process
  - `tool_call` - Tool execution start
  - `tool_result` - Tool execution complete
  - `complete` - Generation finished
  - `error` - Generation failed

**Impact:** Full observability and debugging capability in real-time.

### Phase 3: Workflow Planning & Note Management ✨

**Problem:** Agent lacks strategic planning for complex multi-source documents.

**Solution:**
- **Workflow Planning Tool**: `create_workflow_plan` lets agent plan before execution
- **Note Importance**: Prioritize notes with 4-level importance ratings (critical/high/medium/low)
- **Note Search**: `search_notes` finds relevant notes by keyword or importance

**Impact:** Better organization and strategic approach for large documents.

### Phase 4: Variant System for A/B Testing ✨

**Problem:** No way to test different feature combinations or measure impact.

**Solution:**
- **3 Variants**: baseline, hybrid, scalable
- **Dynamic Tool Filtering**: Each variant has specific tool sets
- **Variant-Specific System Prompts**: Optimized instructions per variant
- **Comparison Analytics**: Detailed metrics for A/B testing

**Impact:** Systematic optimization and feature validation.

---

## Variant System

### Variant Definitions

| Feature | Baseline | Hybrid | Scalable |
|---------|----------|--------|----------|
| **Max Transcripts** | 5 | 30 | 50+ |
| **Total Tools** | 7 | 10 | 12 |
| **Transcript Reading** | Full text | Chunked | Chunked |
| **Transcript Search** | ❌ | ✅ | ✅ |
| **Workflow Planning** | ❌ | ❌ | ✅ |
| **Note Importance** | ❌ | ❌ | ✅ |
| **Note Search** | ❌ | ❌ | ✅ |
| **Reasoning Capture** | ✅ | ✅ | ✅ |
| **Best For** | Small docs | Medium docs | Large docs |

### Tool Availability by Variant

**Core Tools (All Variants):**
1. `take_note` - Collect notes (importance ratings in scalable only)
2. `create_section` - Define structure
3. `write_section` - Write content
4. `get_current_document_state` - Get current state
5. `update_progress` - Report progress
6. `finalize_document` - Complete document

**Baseline-Only:**
7. `read_transcript` - Read full transcript text

**Hybrid & Scalable:**
8. `list_available_transcripts` - List metadata
9. `search_transcripts` - Search content
10. `read_transcript_chunk` - Read chunks

**Scalable-Only:**
11. `create_workflow_plan` - Strategic planning
12. `search_notes` - Search collected notes

### Choosing a Variant

**Automatic Recommendation:**

```bash
GET /api/agent-documents/variants?transcriptCount=15
```

**Recommendation Logic:**
- **1-5 transcripts** → baseline (simplicity is best)
- **6-15 transcripts** → hybrid (scalable reading without planning overhead)
- **16+ transcripts** → scalable (full features for complexity)

---

## Real-time Streaming

### SSE Endpoint

```
GET /api/agent-documents/:id/stream
```

**Connection:**
```javascript
const eventSource = new EventSource(
  `http://localhost:3001/api/agent-documents/${documentId}/stream`
);
```

### Event Types

**1. Connected Event**
```json
{
  "type": "connected",
  "documentId": "uuid"
}
```

**2. Progress Event**
```json
{
  "type": "progress",
  "progress": 67,
  "status": "WRITING",
  "currentStage": "Writing section 3 of 5",
  "stats": {
    "toolCallCount": 42,
    "sectionsCreated": 5,
    "sectionsWithContent": 3,
    "notesCollected": 87
  }
}
```

**3. Reasoning Event** ✨ NEW
```json
{
  "type": "reasoning",
  "text": "I should start by reading the first transcript to understand the content..."
}
```

**4. Tool Call Event**
```json
{
  "type": "tool_call",
  "toolCallId": "call_abc123",
  "toolName": "read_transcript_chunk",
  "args": {
    "transcriptId": "uuid",
    "chunkIndex": 0
  }
}
```

**5. Tool Result Event**
```json
{
  "type": "tool_result",
  "toolCallId": "call_abc123",
  "success": true,
  "durationMs": 245
}
```

**6. Complete Event**
```json
{
  "type": "complete",
  "documentId": "uuid",
  "finalStats": {
    "toolCallCount": 87,
    "totalTokens": 156000,
    "totalCost": 0.42,
    "generationTimeMs": 420000,
    "wordCount": 4500
  }
}
```

**7. Error Event**
```json
{
  "type": "error",
  "error": "Error message",
  "documentId": "uuid"
}
```

### React Integration Example

```javascript
import { useEffect, useState } from 'react';

function AgenticProgressMonitor({ documentId }) {
  const [events, setEvents] = useState([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('INITIALIZING');

  useEffect(() => {
    const eventSource = new EventSource(
      `http://localhost:3001/api/agent-documents/${documentId}/stream`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setEvents(prev => [...prev, data]);

      if (data.type === 'progress') {
        setProgress(data.progress);
        setStatus(data.status);
      }

      if (data.type === 'complete' || data.type === 'error') {
        eventSource.close();
      }
    };

    return () => eventSource.close();
  }, [documentId]);

  return (
    <div>
      <div>Status: {status}</div>
      <div>Progress: {progress}%</div>
      <div>
        {events.map((event, i) => (
          <div key={i}>
            {event.type === 'reasoning' && `💭 ${event.text}`}
            {event.type === 'tool_call' && `🔧 ${event.toolName}`}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## API Reference

### 1. Start Generation

```bash
POST /api/agent-documents/generate
```

**Request Body:**
```json
{
  "transcriptIds": ["uuid1", "uuid2", "uuid3"],
  "documentType": "Investment Guide",
  "variantId": "scalable",
  "preferences": {
    "tone": "professional",
    "depth": "detailed",
    "audience": "practitioners",
    "customInstructions": "Focus on actionable insights with specific examples..."
  }
}
```

**Response:**
```json
{
  "success": true,
  "documentId": "uuid",
  "variantId": "scalable",
  "message": "Agent started. Poll /api/agent-documents/:id/status for progress."
}
```

**Validation:**
- `transcriptIds`: Required, array, 1-50 elements (depends on variant)
- `documentType`: Required, string
- `variantId`: Optional, default "scalable", one of: baseline, hybrid, scalable
- `preferences`: Optional object

### 2. Get Variants

```bash
GET /api/agent-documents/variants?transcriptCount=15
```

**Response:**
```json
{
  "variants": [
    {
      "id": "baseline",
      "name": "Baseline (Original)",
      "description": "Original approach without scalability enhancements",
      "maxTranscripts": 5
    },
    {
      "id": "hybrid",
      "name": "Hybrid (Selective Features)",
      "description": "Scalable tools without planning",
      "maxTranscripts": 30
    },
    {
      "id": "scalable",
      "name": "Scalable (All Features)",
      "description": "Full feature set with chunking and planning",
      "maxTranscripts": 50
    }
  ],
  "recommendation": "hybrid"
}
```

### 3. Stream Progress (SSE)

```bash
GET /api/agent-documents/:id/stream
```

**Headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Stream Format:**
```
data: {"type":"connected","documentId":"uuid"}

data: {"type":"progress","progress":10,"status":"READING"}

data: {"type":"reasoning","text":"I'll start by listing available transcripts..."}

data: {"type":"complete","documentId":"uuid"}
```

### 4. Poll Status

```bash
GET /api/agent-documents/:id/status
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

### 5. Get Complete Document

```bash
GET /api/agent-documents/:id
```

**Response:**
```json
{
  "id": "uuid",
  "title": "Investment Guide",
  "documentType": "Investment Guide",
  "status": "COMPLETE",
  "progress": 100,
  "variantId": "scalable",
  "content": "# Section 1\n\nContent here...",
  "wordCount": 4500,
  "toolCallCount": 87,
  "totalTokens": 156000,
  "totalCost": 0.42,
  "generationTimeMs": 420000,
  "workflowPlan": {
    "steps": [...]
  },
  "sections": [...],
  "notes": [...],
  "toolCalls": [...],
  "transcripts": [...]
}
```

### 6. Get Analytics

```bash
GET /api/agent-documents/:id/analysis
```

**Response:**
```json
{
  "generationMetrics": {
    "totalToolCalls": 87,
    "totalTokens": 156000,
    "totalCost": 0.42,
    "generationTimeMs": 420000
  },
  "toolCallBreakdown": {
    "list_available_transcripts": 1,
    "search_transcripts": 5,
    "read_transcript_chunk": 15,
    "take_note": 42,
    "create_section": 6,
    "write_section": 12,
    "update_progress": 15,
    "finalize_document": 1
  },
  "toolUsagePatterns": {
    "search_transcripts": 5,
    "read_transcript_chunk": 15,
    "search_notes": 3
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

### 7. Get Activity Log

```bash
GET /api/agent-documents/:id/activity-log
```

**Purpose:** Get complete detailed history of all tool calls with full inputs/outputs.

**Response:**
```json
{
  "documentId": "uuid",
  "activityLog": [
    {
      "id": "uuid",
      "toolName": "search_transcripts",
      "args": {"query": "investment strategy"},
      "result": {"results": [...]},
      "success": true,
      "durationMs": 245,
      "createdAt": "2025-11-10T12:34:56.789Z"
    }
  ],
  "totalToolCalls": 87
}
```

**Use Case:** Deep debugging of agent behavior, understanding decision flow, auditing tool usage patterns.

### 8. List Documents

```bash
GET /api/agent-documents?limit=50&offset=0
```

### 9. Delete Document

```bash
DELETE /api/agent-documents/:id
```

---

## Tool Reference

### Core Tools (All Variants)

#### 1. take_note
**Purpose:** Collect organized notes for synthesis

**Arguments:**
- `transcriptId` (string, required) - Source transcript
- `content` (string, required) - Note content
- `noteType` (enum, required) - QUOTE, INSIGHT, DATA_POINT, EXAMPLE, QUESTION
- `importance` (enum, optional, scalable only) - CRITICAL, HIGH, MEDIUM, LOW
- `sectionTitle` (string, optional) - Intended section
- `sourceContext` (string, optional) - Context around quote

**Example:**
```json
{
  "transcriptId": "uuid",
  "content": "Key insight about market timing",
  "noteType": "INSIGHT",
  "importance": "HIGH",
  "sectionTitle": "Investment Strategy"
}
```

#### 2. create_section
**Purpose:** Define document structure

**Arguments:**
- `title` (string, required) - Section title
- `order` (number, required) - Section order (0-indexed)

#### 3. write_section
**Purpose:** Write or revise section content

**Arguments:**
- `sectionId` (string, required) - Section to write
- `content` (string, required) - Markdown content

**Note:** Can be called multiple times for iterative refinement. `revisionCount` tracked automatically.

#### 4. get_current_document_state
**Purpose:** Get current document structure and content

**Returns:** Complete document state including all sections and their content.

#### 5. update_progress
**Purpose:** Report progress to user

**Arguments:**
- `stage` (string, required) - Human-readable stage description
- `progress` (number, required) - Progress percentage (0-100)

#### 6. finalize_document
**Purpose:** Assemble final document and mark complete

**Validation:** All sections must have content before finalization.

### Baseline-Only Tools

#### 7. read_transcript
**Purpose:** Read full transcript text

**Arguments:**
- `transcriptId` (string, required)

**Returns:** Complete transcript content with metadata.

**Note:** Only available in baseline variant. Limited to small transcripts.

### Scalable Tools (Hybrid & Scalable)

#### 8. list_available_transcripts
**Purpose:** Get transcript metadata without loading content

**Returns:** Array of transcripts with id, title, channel, wordCount.

**Use Case:** Plan reading strategy before loading content.

#### 9. search_transcripts
**Purpose:** Search across all transcript content

**Arguments:**
- `query` (string, required) - Search keywords

**Returns:** Top 10 most relevant chunks with context, transcript metadata, and relevance scores.

**Example:**
```json
{
  "query": "investment strategy market timing"
}
```

**Response:**
```json
{
  "results": [
    {
      "transcriptId": "uuid",
      "title": "Investment Masterclass",
      "chunkIndex": 5,
      "snippet": "...market timing is crucial for investment success...",
      "relevanceScore": 0.92
    }
  ]
}
```

#### 10. read_transcript_chunk
**Purpose:** Read specific chunk of transcript

**Arguments:**
- `transcriptId` (string, required)
- `chunkIndex` (number, required) - 0-indexed chunk number

**Returns:** ~2000 words of content with metadata.

**Use Case:** Read large transcripts incrementally without context overflow.

### Scalable-Only Tools

#### 11. create_workflow_plan
**Purpose:** Create strategic plan before generation

**Arguments:**
- `plan` (object, required) - Workflow plan with steps array

**Example:**
```json
{
  "plan": {
    "steps": [
      "List all available transcripts",
      "Search for key topics",
      "Read most relevant chunks",
      "Create document outline",
      "Write sections iteratively"
    ]
  }
}
```

#### 12. search_notes
**Purpose:** Search collected notes

**Arguments:**
- `query` (string, optional) - Search keywords
- `importance` (enum, optional) - Filter by importance level
- `sectionTitle` (string, optional) - Filter by section

**Returns:** Matching notes sorted by relevance/importance.

**Use Case:** Find relevant notes when writing sections.

---

## Advanced Features

### Token Budget Management System

The system includes sophisticated token management to prevent context overflow when processing large document generations.

**Configuration:**
- **Context Limit**: 131,072 tokens (OpenRouter hard limit)
- **Safe Limit**: 90,000 tokens (pruning threshold)
- **Emergency Limit**: 110,000 tokens (aggressive mode)
- **Reserved Output**: 32,768 tokens

**Degradation Modes:**

| Mode | Token Range | Behavior |
|------|-------------|----------|
| **NORMAL** | < 70,000 | No constraints, full conversation history |
| **CAUTION** | 70,000 - 90,000 | Warning injected every 3 turns |
| **AGGRESSIVE** | 90,000 - 110,000 | Sliding window pruning activated |
| **EMERGENCY** | > 110,000 | Critical warnings, aggressive compression |

**Pruning Strategy:**
- Keeps last 10 turns in full detail (sliding window)
- Compresses middle messages into summaries
- Preserves initial user message and system prompt
- Injects state-aware warnings based on degradation mode

**Implementation:** `agentDocumentService.js` lines 47-224

### 100% Transcript Coverage Enforcement

The system enforces that ALL provided transcripts must be analyzed before finalizing a document.

**How It Works:**
- Tracks which transcripts have been referenced in notes via `sourceTranscriptId`
- Compares against all provided transcripts
- Blocks `finalize_document` if any transcript is missing
- Provides detailed error with missing transcript titles

**Error Example:**
```
Cannot finalize: Not all transcripts have been analyzed.
Coverage: 38/46 transcripts (83%).
Missing analysis for 8 transcript(s): "Episode 1", "Episode 2", ...

You must analyze EVERY transcript. Use search_transcripts with diverse queries...
```

**Impact:** Ensures comprehensive, thorough document generation from all sources.

### Progressive Agent Enforcement System

Prevents agent from stalling or producing low-quality output through turn-based enforcement.

**Enforcement Schedule:**

**Turn 1:** MUST use tools immediately
- Text-only response triggers forced tool call prompt

**Turns 2-3:** Strong warnings for consecutive no-tool turns
- Shows expected vs. actual tool call count
- Lists required next action based on document state

**Turn 4+:** Hard failure
- Throws error if 3+ consecutive turns without tools
- Includes diagnostic info (expected 50-150 tool calls for N transcripts)

**Context-Aware Recovery Messages:**
- No sections created → "CALL create_section now"
- Sections need content → Lists specific sections with IDs
- All sections complete → "CALL finalize_document now"

**Implementation:** `agentDocumentService.js` lines 650-777

### Minimum Content Validation

Ensures quality by enforcing minimum content requirements.

**Rules:**
- Minimum 150 words per section
- Validation before accepting content via `write_section`
- Clear error message with word count if below threshold

**Example Error:**
```
Section content must be at least 150 words (current: 89 words)
```

**Implementation:** `agentTools.js` writeSection() lines 287-296

### Parameter Aliasing

Backward compatibility system for tool parameters.

**Example:** `take_note` tool accepts both:
- `source` (new parameter name)
- `transcriptId` (legacy parameter name)

**Implementation:**
- Zod refinement validation: `data.source || data.transcriptId`
- Automatic parameter mapping in tool function
- Enhanced parameter documentation in schemas

**Impact:** Graceful migration path, prevents agent confusion.

### Model Configuration

**Model:** `openai/gpt-oss-120b` (via OpenRouter)
- Cost-effective alternative to Claude Sonnet 4.5
- Strong function calling capabilities
- Extended context window support

**Parameters:**
- **Max Tokens**: 32,768 (increased from 4096 to prevent JSON truncation)
- **Temperature**: 0.7 (balanced creativity and consistency)
- **Pricing**: ~$0.0015 input, ~$0.002 output per 1K tokens

**API Integration:**
- Direct OpenRouter API calls (bypassing AI SDK for v1 compatibility)
- Robust JSON parsing with error recovery
- Response text preview in error logs

---

## Testing & Monitoring

### Automated Testing

#### Variant Comparison Test

**File:** `test-variants.mjs` (260 lines)

**Command:**
```bash
node test-variants.mjs
```

**What It Does:**
- Generates same document with baseline AND scalable variants in parallel
- Comprehensive A/B comparison across all metrics
- Color-coded console output with comparison tables

**Output Includes:**
- Tool usage patterns per variant
- Token consumption comparison
- Cost analysis
- Generation time comparison
- Quality metrics (note utilization, section revisions)
- Feature breakdown (what tools each variant used)
- Recommended variant for given transcript count

**Use Case:** Systematic A/B testing to validate variant performance differences.

#### Single Generation Test

**File:** `test-agentic-system.mjs` (201 lines)

**Command:**
```bash
node test-agentic-system.mjs
```

**What It Does:**
- Tests single variant (configurable)
- Real-time progress bar during generation
- Detailed behavior analysis display
- Final document preview

**Output Includes:**
- Live progress updates with current stage
- Tool call breakdown by type
- Note utilization statistics
- Section evolution tracking
- Final document content preview
- Generation metrics summary

**Use Case:** Quick validation of system functionality, debugging specific variant behavior.

**Configuration:**
Both test scripts can be configured by editing:
- `transcriptIds` - Which transcripts to use
- `variantId` - Which variant to test
- `documentType` - Type of document to generate
- `preferences` - Custom instructions

### Real-time Monitoring

**Watch SSE Stream:**
```bash
curl -N http://localhost:3001/api/agent-documents/{documentId}/stream
```

**Poll Status:**
```bash
watch -n 2 'curl -s http://localhost:3001/api/agent-documents/{documentId}/status | jq'
```

### Database Monitoring

**Recent Documents:**
```sql
SELECT id, title, status, progress, "variantId", "toolCallCount"
FROM "AgentDocument"
ORDER BY "createdAt" DESC
LIMIT 10;
```

**Tool Call Breakdown:**
```sql
SELECT "toolName", COUNT(*), AVG("durationMs")
FROM "AgentToolCall"
WHERE "documentId" = 'uuid'
GROUP BY "toolName"
ORDER BY COUNT(*) DESC;
```

**Note Utilization:**
```sql
SELECT importance, COUNT(*)
FROM "AgentNote"
WHERE "documentId" = 'uuid'
GROUP BY importance;
```

**Variant Performance:**
```sql
SELECT
  "variantId",
  COUNT(*) as documents,
  AVG("toolCallCount") as avg_tools,
  AVG("totalTokens") as avg_tokens,
  AVG("totalCost") as avg_cost,
  AVG("generationTimeMs" / 1000) as avg_time_seconds
FROM "AgentDocument"
WHERE status = 'COMPLETE'
GROUP BY "variantId";
```

### Server Logs

Look for these log patterns:

```
🚀 Starting agentic generation: [documentType] from [N] transcripts (variant: [variantId])
🔧 7/12 tools enabled for variant "baseline"
🔄 Agent turn 1, total tool calls: 0
  💭 Agent reasoning: I'll start by listing available transcripts...
  🔧 Tool: list_available_transcripts
  ✅ Tool completed in 123ms
🔄 Agent turn 2, total tool calls: 1
  💭 Agent reasoning: Based on the transcripts, I'll search for...
  🔧 Tool: search_transcripts
✅ Agent completed generation (87 tool calls)
📊 Generation stats: 87 tool calls, 156000 tokens, 420s, $0.42
```

---

## Performance & Cost

### Generation Time

| Variant | Transcripts | Expected Time |
|---------|-------------|---------------|
| Baseline | 1-5 | 3-8 minutes |
| Hybrid | 5-30 | 8-15 minutes |
| Scalable | 10-50+ | 12-25 minutes |

**Factors:**
- Number of transcripts
- Total word count
- Document complexity
- Agent iteration count
- Model response time

### Cost Breakdown

**Model:** `openai/gpt-oss-120b` via OpenRouter

**Pricing:**
- Input: ~$0.0001 per 1K tokens
- Output: ~$0.0002 per 1K tokens

**Typical Document:**
- Tokens: 100k-200k
- Cost: $2-$4
- vs Pipeline: ~$6 (Claude Sonnet 4.5)

**Cost by Variant:**
- **Baseline**: Lower tool count, fewer tokens (~$1-2)
- **Hybrid**: Moderate tool use (~$2-3)
- **Scalable**: More tools, planning overhead (~$3-5)

### Quality Indicators

**Good Performance:**
- ✅ Note utilization >80%
- ✅ Section revision count 1-3
- ✅ All transcripts read/searched
- ✅ Tool calls complete successfully
- ✅ Generation completes <30 minutes

**Warning Signs:**
- ⚠️ Note utilization <50% (collecting but not using)
- ⚠️ Excessive revisions (>5 per section)
- ⚠️ Some transcripts never accessed
- ⚠️ Many failed tool calls
- ⚠️ Approaching 200 tool call limit

---

## Recent Bug Fixes

### November 10, 2025 - Critical Fixes (Commit 448a5d1)

**4 Major Bug Fixes:**

#### 1. Removed False "3 Sections Minimum" Requirement
**Problem:** System enforced arbitrary minimum of 3 sections even when user requested fewer.

**Fix:**
- Changed default from `minSections: 3` to `minSections: 1`
- Added smart detection for implicit requirements from custom instructions
- Now allows valid 2-section documents

**Impact:** Prevents blocking of legitimate document requests.

#### 2. Robust JSON Parsing Error Handling
**Problem:** System crashed with "Unexpected end of JSON input" when OpenRouter returned malformed JSON.

**Fix:**
- Added try-catch around OpenRouter API response parsing
- Read response as text first before `JSON.parse()`
- Detailed error logging with response preview
- Graceful error recovery instead of crashes

**Code Location:** `agentDocumentService.js`

**Impact:** System continues working despite occasional OpenRouter API issues.

#### 3. Improved take_note Parameter Documentation
**Problem:** Agent confused about `source` vs `transcriptId` parameter naming.

**Fix:**
- Enhanced Zod schema description for `source` parameter
- Added `transcriptId` as explicit alias in documentation
- Better agent understanding of parameter mapping

**Impact:** Reduces agent errors when taking notes.

#### 4. Parameter Aliasing for Backward Compatibility
**Problem:** Legacy code used `transcriptId`, new code used `source`, causing inconsistencies.

**Fix:**
- `takeNote()` function accepts both `source` AND `transcriptId`
- Zod refinement validation: `data.source || data.transcriptId`
- Automatic parameter normalization

**Code Location:** `agentTools.js` lines 100-125

**Impact:** Smooth migration, no breaking changes.

**Test Results After Fixes:**
- Successful 9-transcript generation
- 5 sections, 27 tool calls, 904,763 tokens, 289 seconds
- No crashes, proper validation, successful completion

### November 10, 2025 - Duplicate Heading Fix (Commit bdea7bb)

**Problem:** Document sections showed duplicate headings (e.g., "## Introduction" appeared twice).

**Root Cause:** AI agent already included proper headings in section content, but `finalize_document` automatically prepended `## ${section.title}` again.

**Fix:**
- Removed automatic heading prepending in `finalize_document`
- Trust agent to include proper headings in content
- Cleaner final document output

**Code Location:** `agentTools.js` finalizeDocument() lines 440-500

**Impact:** Professional-looking documents without formatting redundancy.

---

## Troubleshooting

### Common Issues

**1. JSON Parsing Errors**
```
Error: Unterminated string in JSON at position 1396
```

**Cause:** Very long responses from OpenRouter with malformed JSON
**Status:** FIXED in commit 448a5d1 (Nov 10, 2025) - Added robust error handling with try-catch and response preview logging
**Note:** System continues to work despite occasional OpenRouter API issues
**Workaround:** Retry generation or use shorter customInstructions if errors persist

**2. Prisma Query Errors**
```
Input error. A JSON path cannot be set without a scalar filter
```

**Cause:** Complex Prisma queries with nested search
**Status:** Some advanced note search patterns may fail. Basic functionality works.

**3. Tool Counting Display Bug**
```
Console shows: 🔧 0/12 tools enabled
```

**Cause:** Tool definitions as object instead of array
**Status:** FIXED in latest version

**4. Route Conflicts**
```
GET /api/agent-documents/variants returns "Document not found"
```

**Cause:** `/variants` route caught by `/:id` route
**Status:** FIXED - `/variants` route moved before `/:id` route

**5. High Token Usage**
```
Document uses 300k+ tokens
```

**Cause:**
- Too many transcripts
- Very long customInstructions
- Excessive revisions

**Fix:**
- Reduce transcript count
- Simplify customInstructions
- Use baseline variant for simple documents

**6. Generation Timeout**
```
Status: FAILED, Error: "Generation exceeded 30 minute timeout"
```

**Cause:**
- Too many transcripts for variant
- Complex document requirements
- Model response delays

**Fix:**
- Use scalable variant for 15+ transcripts
- Break into multiple smaller documents
- Simplify requirements

**7. SSE Connection Drops**
```
EventSource connection closed unexpectedly
```

**Cause:**
- Network timeout
- Nginx buffering

**Fix:**
- Fallback to polling if SSE fails
- Check nginx configuration (X-Accel-Buffering: no)

### Debug Checklist

When generation fails:

1. ✅ Check server logs for errors
2. ✅ Query `AgentToolCall` table for failed tools
3. ✅ Check variant is appropriate for transcript count
4. ✅ Verify all transcripts exist in database
5. ✅ Check OpenRouter API key is valid
6. ✅ Review error message in `AgentDocument.errorMessage`
7. ✅ Check tool call count (approaching 200 limit?)
8. ✅ Review generation time (approaching 30min timeout?)

### Getting Help

**Check Documentation:**
1. `AGENTIC_QUICKSTART.md` - Quick start guide
2. `AGENTIC_SYSTEM_SUMMARY.md` - Technical details
3. `IMPLEMENTATION_COMPLETE.md` - Implementation summary
4. `AGENTIC_COMPLETE_GUIDE.md` - This comprehensive guide

**Database Inspection:**
```sql
-- Get document details
SELECT * FROM "AgentDocument" WHERE id = 'uuid';

-- Get failed tool calls
SELECT * FROM "AgentToolCall"
WHERE "documentId" = 'uuid' AND success = false;

-- Get all notes
SELECT importance, noteType, COUNT(*)
FROM "AgentNote"
WHERE "documentId" = 'uuid'
GROUP BY importance, noteType;
```

**API Debugging:**
```bash
# Get detailed document state
curl http://localhost:3001/api/agent-documents/{documentId} | jq

# Get analytics
curl http://localhost:3001/api/agent-documents/{documentId}/analysis | jq

# Watch SSE stream
curl -N http://localhost:3001/api/agent-documents/{documentId}/stream
```

---

## Summary

The Agentic Document Generation System now includes:

✅ **Phase 1**: Scalability for 50+ transcripts via chunking
✅ **Phase 2**: Real-time SSE streaming with reasoning capture
✅ **Phase 3**: Workflow planning and note importance
✅ **Phase 4**: Variant system for A/B testing

**3 Variants:** baseline (7 tools), hybrid (10 tools), scalable (12 tools)

**9 API Endpoints:** generate, status, stream, get, analysis, activity-log, variants, list, delete

**12 Agent Tools:** From basic reading/writing to advanced search and planning

**Advanced Systems:** Token management, 100% coverage enforcement, progressive enforcement, parameter aliasing

**Complete Observability:** Real-time streaming, reasoning capture, full audit trail

**Production Ready:** Tested, documented, and operational

---

**Next Steps:**
1. Run `node test-variants.mjs` to compare variant performance
2. Build frontend UI with SSE streaming support
3. Implement A/B testing dashboard for variant comparison
4. Optimize system prompts based on analytics
5. Add more variant configurations for specific use cases

**Status:** ✅ Fully Operational - Ready for Production Use
