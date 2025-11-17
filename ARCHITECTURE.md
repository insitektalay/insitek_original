# Insitek Application Architecture

**Version**: 1.0
**Last Updated**: November 4, 2025

This document provides a comprehensive overview of Insitek's architecture, focusing on the LLM integration, transcript database system, and the planned auto-summary feature.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [LLM Integration Architecture](#llm-integration-architecture)
3. [Transcript Database Architecture](#transcript-database-architecture)
4. [Import Pipeline](#import-pipeline)
5. [Auto-Summary Feature Implementation Plan](#auto-summary-feature-implementation-plan)
6. [Key File Reference](#key-file-reference)

---

## System Overview

Insitek is a multimedia content analysis platform that:
- Downloads and transcribes YouTube videos and podcasts locally using Whisper.cpp
- Provides AI-powered chat for analyzing transcript content
- Enables insight extraction and knowledge management
- Operates with zero cloud transcription costs

**Tech Stack**:
- **Frontend**: React 19 + Vite + Tailwind CSS
- **Backend**: Express + WebSocket (real-time progress)
- **Database**: PostgreSQL + Prisma ORM
- **Transcription**: Local whisper.cpp
- **Media Extraction**: yt-dlp
- **AI**: OpenRouter (LLM gateway)

---

## LLM Integration Architecture

### OpenRouter Configuration

**Location**: `server.mjs:16-30`

Insitek uses **OpenRouter** (https://openrouter.ai) as an LLM gateway, providing access to multiple models through a unified API.

```javascript
const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'HTTP-Referer': 'https://insitek.ai',
    'X-Title': 'Insitek.ai'
  }
});
```

**Current Model**: `openai/gpt-oss-120b` (server.mjs:1738)

**Environment Variable Required**: `OPENROUTER_API_KEY` in `.env`

---

### LLM API Endpoints

#### 1. Chat Completion Endpoint

**Endpoint**: `POST /api/chat/completion`
**Location**: `server.mjs:1718-1778`
**Purpose**: Main chat interface for transcript analysis

**Request Format**:
```json
{
  "prompt": "User message with context",
  "temperature": 0.7,
  "n_predict": 512,
  "stream": true,
  "stop": ["User:", "AI:"]
}
```

**Implementation**:
```javascript
const result = await streamText({
  model: openrouter('openai/gpt-oss-120b'),
  prompt: req.body.prompt,
  temperature: req.body.temperature || 0.7,
  maxTokens: req.body.n_predict || 512,
  stopSequences: req.body.stop,
});
```

**Response Types**:
- **Streaming** (default): Server-Sent Events (SSE)
  ```
  data: {"content":"Hello"}
  data: {"content":" there"}
  data: [DONE]
  ```
- **Non-streaming**: JSON `{ content: "Full response" }`

**Features**:
- Streaming support via AI SDK's `streamText`
- Configurable temperature (0.0 - 2.0)
- Token limit control (up to 5000 tokens)
- Stop sequences for controlled generation
- Markdown formatting instructions in prompts

---

#### 2. Description Generation Endpoint

**Endpoint**: `POST /api/transcripts/:id/generate-description`
**Location**: `server.mjs:1371-1443`
**Purpose**: Generate AI-powered short descriptions (120 char limit)

**Note**: Currently uses **local llama.cpp server** at `http://localhost:8080/completion` instead of OpenRouter. This is different from the chat endpoint.

**Implementation**:
```javascript
const response = await fetch('http://localhost:8080/completion', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: `Summarize this transcript in exactly one clear sentence...`,
    temperature: 0.3,
    n_predict: 50,
  })
});
```

**Character Limit**: 120 characters (enforced)
**Temperature**: 0.3 (lower for consistency)

---

#### 3. Bulk Description Generation

**Endpoints**:
- `POST /api/transcripts/generate-all-descriptions` (server.mjs:1448-1531)
  - Generates descriptions only for transcripts with missing descriptions
- `POST /api/transcripts/regenerate-all-descriptions` (server.mjs:1536-1622)
  - Regenerates all descriptions (overwrites existing)

**Concurrency**: Processes 3 transcripts simultaneously using `Promise.all` batching

---

### Frontend LLM Integration

#### Chat Hook

**Location**: `src/v2/components/ui/ChatPanel.jsx:258-440`

**Function**: `send()` - Main chat handler

**Prompt Structure**:
```javascript
const prompt = `You are an expert assistant analyzing transcripts.
Format your responses using Markdown...

**Transcript:**
${transcript.text}

**Conversation:**
${chatHistory.map(m => `${m.role}: ${m.content}`).join('\n')}
User: ${text}
AI:`;
```

**Features**:
- Streaming response handling with auto-scroll
- Markdown formatting support
- Insight detection after message completion
- Error handling with user-friendly messages

---

#### AI Suggestions Hook

**Location**: `src/v2/hooks/useAI.js:10-61`

**Function**: `generateAISuggestions(chatSoFar, selectedTranscript)`

**Purpose**: Generate 3-5 follow-up questions based on chat history

**Parameters**:
- Temperature: 0.7
- Max tokens: 400
- Returns array of suggested questions

---

### Request/Response Patterns

**Pattern 1: Streaming Chat** (Recommended)
```
Client → POST /api/chat/completion { stream: true, prompt: "..." }
       ← SSE Stream
Server → data: {"content":"Hello"}\n\n
Server → data: {"content":" world"}\n\n
Server → data: [DONE]\n\n
```

**Pattern 2: Non-streaming** (Simple but no progress feedback)
```
Client → POST /api/chat/completion { stream: false, prompt: "..." }
Server → { "content": "Complete response here" }
```

---

## Transcript Database Architecture

### Prisma Schema

**Location**: `prisma/schema.prisma:20-37`

```prisma
model Transcript {
  id           String   @id @default(uuid())
  youtubeId    String?  @unique              // YouTube video ID (optional for podcasts)
  title        String                        // Video/episode title
  channel      String                        // Channel/podcast name
  text         String   @db.Text             // Full transcript text (unlimited length)
  segments     Json?                         // Timestamped segments: [{start, end, text}]
  description  String?                       // AI-generated 120-char summary
  publishDate  DateTime?                     // Original publish date
  importedAt   DateTime @default(now())      // When imported to Insitek
  source       TranscriptSource @default(YOUTUBE)  // YOUTUBE | PODCAST
  sourceUrl    String?                       // Original URL
  createdAt    DateTime @default(now())

  // Relations
  insightSources InsightSource[]             // Links to user insights
}

enum TranscriptSource {
  YOUTUBE
  PODCAST
}
```

**Key Fields**:
- **text**: Full transcript (TEXT column, unlimited size)
- **segments**: JSON array of timestamped chunks from Whisper
  ```json
  [
    {"start": "00:00:00.000", "end": "00:00:05.120", "text": "Welcome to..."},
    {"start": "00:00:05.120", "end": "00:00:10.240", "text": "Today we'll..."}
  ]
  ```
- **description**: AI-generated summary (currently 120 char limit)
- **source**: Enum distinguishing YouTube vs Podcast content

---

### CRUD Operations

#### Read Operations

**1. List All Transcripts**
**Endpoint**: `GET /api/transcripts`
**Location**: `server.mjs:374-393`

```javascript
const transcripts = await prisma.transcript.findMany({
  orderBy: { importedAt: 'desc' },
  select: {
    id: true,
    title: true,
    channel: true,
    description: true,
    publishDate: true,
    importedAt: true,
    source: true,
    // NOTE: text and segments excluded for performance
  }
});
```

**2. Get Single Transcript**
**Endpoint**: `GET /api/transcripts/:id`
**Location**: `server.mjs:398-413`

```javascript
const transcript = await prisma.transcript.findUnique({
  where: { id },
  // Returns ALL fields including full text and segments
});
```

**Frontend Hook**: `src/v2/hooks/useTranscript.js`
- `handleSelect(payload)` - Load full transcript by ID
- `handleDeleteTranscript(transcriptId)` - Delete with confirmation
- `triggerRefresh()` - Force transcript list reload

---

#### Delete Operation

**Endpoint**: `DELETE /api/transcripts/:id`
**Location**: `server.mjs:418-522`

**Features**:
- Cascades to related ImportJobs
- Kills active import processes if in progress
- Cleans up temporary files
- Returns success confirmation

**Implementation**:
```javascript
// 1. Check for active import
const activeImport = await prisma.importJob.findFirst({
  where: {
    transcriptId: id,
    state: { in: ['PENDING', 'PROCESSING'] }
  }
});

// 2. Kill process if running
if (activeProcesses.has(activeImport.id)) {
  const process = activeProcesses.get(activeImport.id);
  process.kill('SIGTERM');
}

// 3. Delete transcript (cascades to importJobs)
await prisma.transcript.delete({ where: { id } });
```

---

#### Create Operation

**Created by Import Pipeline** - See [Import Pipeline](#import-pipeline) section

**Location**: `server.mjs:307-319` (bulk queue) and `server.mjs:690-730` (single import)

```javascript
const transcript = await prisma.transcript.create({
  data: {
    youtubeId: videoId,
    title: title,
    channel: channel,
    text: transcriptText,
    segments: timestampedSegments,
    publishDate: new Date(publishDate),
    source: 'YOUTUBE',
    sourceUrl: url,
  }
});
```

---

## Import Pipeline

### Complete Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. USER SUBMITS URL                                              │
│    - YouTube: Single video or bulk channel import                │
│    - Podcast: Episode URL from RSS feed                          │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. API ENDPOINT RECEIVES REQUEST                                 │
│    - POST /api/transcribe-youtube (single video)                 │
│    - POST /api/bulk-import (multiple videos)                     │
│    - POST /api/transcribe-podcast (podcast episode)              │
│                                                                   │
│    Location: server.mjs:527-738, 1654-1716                       │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. CREATE IMPORT JOB                                             │
│    const importJob = await prisma.importJob.create({             │
│      data: {                                                     │
│        videoUrl: url,                                            │
│        state: 'PENDING',                                         │
│        progress: 0,                                              │
│      }                                                           │
│    });                                                           │
│                                                                   │
│    Response: { importId: '123...', message: 'Import started' }  │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. SPAWN SHELL SCRIPT PROCESS                                    │
│                                                                   │
│    YouTube:                                                      │
│    spawn('bash', ['youtube_transcribe.sh', url, importId])      │
│                                                                   │
│    Podcast:                                                      │
│    spawn('bash', ['podcast_transcribe.sh', url, id, importId])  │
│                                                                   │
│    Store in activeProcesses Map for cancellation support         │
│    Location: server.mjs:204-369 (processVideo function)         │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ 5. SHELL SCRIPT EXECUTION (youtube_transcribe.sh)                │
│                                                                   │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ STAGE 1: Extract Metadata (Progress: 5-10%)                 │ │
│ │ - yt-dlp --print id --print title --print channel ...       │ │
│ │ - Extract: video ID, title, channel, upload date            │ │
│ │ - Output: STAGE:Extracting metadata                         │ │
│ │ - Output: PROGRESS:5, PROGRESS:10                            │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ STAGE 2: Download Audio (Progress: 10-30%)                  │ │
│ │ - yt-dlp -x --audio-format mp3 -o "yt_${VIDEO_ID}.mp3"      │ │
│ │ - Parse download progress from yt-dlp output                 │ │
│ │ - Output: STAGE:Downloading audio                            │ │
│ │ - Output: PROGRESS:10, 11, 12, ... 30                        │ │
│ │ - Heartbeat every 5 seconds: HEARTBEAT:downloading           │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ STAGE 3: Transcribe Audio (Progress: 30-85%)                │ │
│ │ - cd whisper.cpp                                             │ │
│ │ - ./build/bin/whisper-cli \                                 │ │
│ │     -m models/ggml-base.en.bin \                             │ │
│ │     -f "../yt_${VIDEO_ID}.mp3" \                             │ │
│ │     -oj -of "../yt_${VIDEO_ID}"                              │ │
│ │ - Output: STAGE:Transcribing audio                           │ │
│ │ - Parse Whisper progress from stdout                         │ │
│ │ - Output: PROGRESS:30, 35, 40, ... 85                        │ │
│ │ - Generates:                                                 │ │
│ │   * yt_{ID}.txt (plain text transcript)                      │ │
│ │   * yt_{ID}.json (timestamped segments)                      │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ STAGE 4: Save to Database (Progress: 85-100%)               │ │
│ │ - Output markers for server.mjs to parse:                   │ │
│ │   * FILE:yt_{ID}.txt                                         │ │
│ │   * JSON:yt_{ID}.json                                        │ │
│ │   * TITLE:Video Title Here                                  │ │
│ │   * CHANNEL:Channel Name                                     │ │
│ │   * PUBLISH:2024-01-01                                       │ │
│ │ - Output: STAGE:Saving to database                           │ │
│ │ - Output: PROGRESS:100                                       │ │
│ │ - Exit with code 0 (success)                                 │ │
│ └──────────────────────────────────────────────────────────────┘ │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ 6. PROGRESS PARSING (server.mjs)                                 │
│                                                                   │
│ scriptProcess.stdout.on('data', (data) => {                      │
│   const output = data.toString();                                │
│                                                                   │
│   // Parse stage changes                                         │
│   if (output.includes('STAGE:')) {                               │
│     const stage = output.match(/STAGE:(.*)/)[1];                 │
│     await sendProgress(importId, stage, currentProgress);        │
│   }                                                               │
│                                                                   │
│   // Parse progress updates                                      │
│   if (output.includes('PROGRESS:')) {                            │
│     const progress = parseInt(output.match(/PROGRESS:(\d+)/)[1]);│
│     await sendProgress(importId, currentStage, progress);        │
│   }                                                               │
│                                                                   │
│   // Handle heartbeat to keep connection alive                   │
│   if (output.includes('HEARTBEAT:')) {                           │
│     console.log('[Import] Heartbeat received');                  │
│   }                                                               │
│ });                                                               │
│                                                                   │
│ Location: server.mjs:245-281                                     │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ 7. WEBSOCKET PROGRESS UPDATES                                    │
│                                                                   │
│ async function sendProgress(importId, stage, progress) {         │
│   // Update database                                             │
│   await prisma.importJob.update({                                │
│     where: { id: importId },                                     │
│     data: {                                                      │
│       state: progress === 100 ? 'DONE' : 'PROCESSING',          │
│       progress: progress                                         │
│     }                                                            │
│   });                                                            │
│                                                                   │
│   // Send to WebSocket subscribers                               │
│   const clients = activeImports.get(importId) || [];             │
│   clients.forEach(ws => {                                        │
│     if (ws.readyState === WebSocket.OPEN) {                      │
│       ws.send(JSON.stringify({                                   │
│         type: 'progress',                                        │
│         importId: importId,                                      │
│         stage: stage,                                            │
│         progress: progress                                       │
│       }));                                                       │
│     }                                                            │
│   });                                                            │
│ }                                                                │
│                                                                   │
│ Location: server.mjs:44-113                                      │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ 8. COMPLETION HANDLER (scriptProcess.on('close'))                │
│                                                                   │
│ IF exit code === 0 (SUCCESS):                                    │
│   1. Parse shell script output for metadata:                     │
│      - FILE: yt_abc123.txt                                       │
│      - JSON: yt_abc123.json                                      │
│      - TITLE: Video Title                                        │
│      - CHANNEL: Channel Name                                     │
│      - PUBLISH: 2024-01-01                                       │
│                                                                   │
│   2. Read transcript files:                                      │
│      const text = fs.readFileSync(textFile, 'utf8');             │
│      const segments = JSON.parse(fs.readFileSync(jsonFile));     │
│                                                                   │
│   3. Create Transcript in database:                              │
│      const transcript = await prisma.transcript.create({         │
│        data: {                                                   │
│          youtubeId: videoId,                                     │
│          title: title,                                           │
│          channel: channel,                                       │
│          text: text,                                             │
│          segments: segments,                                     │
│          publishDate: new Date(publishDate),                     │
│          source: 'YOUTUBE',                                      │
│          sourceUrl: url,                                         │
│        }                                                         │
│      });                                                         │
│                                                                   │
│   4. Update ImportJob state to DONE:                             │
│      await prisma.importJob.update({                             │
│        where: { id: importId },                                  │
│        data: {                                                   │
│          state: 'DONE',                                          │
│          transcriptId: transcript.id,                            │
│          progress: 100                                           │
│        }                                                         │
│      });                                                         │
│                                                                   │
│   5. Clean up temporary files:                                   │
│      fs.unlinkSync(textFile);                                    │
│      fs.unlinkSync(jsonFile);                                    │
│      fs.unlinkSync(audioFile);                                   │
│                                                                   │
│   6. Send completion via WebSocket:                              │
│      sendProgress(importId, 'Completed', 100);                   │
│                                                                   │
│   7. Remove from activeProcesses Map                             │
│                                                                   │
│ IF exit code !== 0 (ERROR):                                      │
│   1. Update ImportJob state to ERROR                             │
│   2. Send error message via WebSocket                            │
│   3. Clean up any partial files                                  │
│                                                                   │
│ Location: server.mjs:283-340                                     │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│ 9. CLIENT RECEIVES COMPLETION                                    │
│                                                                   │
│ WebSocket message: {                                             │
│   type: 'progress',                                              │
│   importId: '123...',                                            │
│   stage: 'Completed',                                            │
│   progress: 100                                                  │
│ }                                                                │
│                                                                   │
│ Frontend updates:                                                │
│ - Import progress bar reaches 100%                               │
│ - TranscriptList refreshes                                       │
│ - New transcript appears in sidebar                              │
│ - User can select and chat with transcript                       │
│                                                                   │
│ Location: src/v2/hooks/useImport.js                              │
└──────────────────────────────────────────────────────────────────┘
```

---

### Import State Management

**ImportJob States** (Prisma enum):
```prisma
enum ImportState {
  PENDING      // Queued, not started
  PROCESSING   // Actively importing
  DONE         // Successfully completed
  ERROR        // Failed with error
  CANCELLED    // User cancelled
}
```

**State Transitions**:
```
PENDING → PROCESSING → DONE
                    ↓
                  ERROR

PROCESSING → CANCELLED (via DELETE request)
```

---

### WebSocket Connection

**Server Setup** (`server.mjs:44-113`):
```javascript
const wss = new WebSocket.Server({ noServer: true });

// Client subscribes to import updates
ws.on('message', (message) => {
  const data = JSON.parse(message);

  if (data.type === 'subscribe') {
    // Add client to subscription list
    if (!activeImports.has(data.importId)) {
      activeImports.set(data.importId, []);
    }
    activeImports.get(data.importId).push(ws);
  }
});
```

**Client Subscription** (`src/v2/hooks/useImport.js`):
```javascript
useEffect(() => {
  const ws = new WebSocket('ws://localhost:3001');

  ws.onopen = () => {
    // Subscribe to import updates
    ws.send(JSON.stringify({
      type: 'subscribe',
      importId: currentImportId
    }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'progress') {
      setProgress(data.progress);
      setStage(data.stage);
    }
  };
}, [currentImportId]);
```

---

### Cancellation Support

**API Endpoint**: `DELETE /api/import-jobs/:id`
**Location**: `server.mjs:743-824`

**Process**:
1. Update ImportJob state to CANCELLED
2. Kill shell script process: `process.kill('SIGTERM')`
3. Clean up temporary files
4. Send cancellation via WebSocket
5. Remove from activeProcesses Map

**Frontend**: Cancel button in ChannelImportPanel triggers deletion request

---

## Auto-Summary Feature Implementation Plan

### Current State

**Existing Summary System**:
- **Field**: `Transcript.description` (String, nullable)
- **Current Usage**: Manually triggered via API endpoint
- **Character Limit**: 120 characters
- **LLM**: Local llama.cpp server (localhost:8080)
- **Trigger**: Manual API call to `/api/transcripts/:id/generate-description`

### Proposed Auto-Summary System

#### Goals
1. **Automatic**: Generate summary immediately after import completion
2. **High Quality**: Use OpenRouter (better than local LLM)
3. **Non-Blocking**: Don't fail import if summary generation fails
4. **User Visible**: Show summary in transcript list
5. **Expandable**: Support longer summaries than current 120 char limit

---

### Recommended Implementation

#### Option A: Integrated Auto-Summary (RECOMMENDED)

**Integration Point**: After transcript is saved to database, before marking import DONE

**Files to Modify**: `server.mjs`

**Implementation Steps**:

##### Step 1: Create Summary Generation Function

Add this function to `server.mjs` (suggested location: after line 113, before route definitions):

```javascript
/**
 * Generate automatic summary for a transcript using OpenRouter
 *
 * @param {string} transcriptId - Transcript database ID
 * @param {string} transcriptText - Full transcript text
 * @returns {Promise<string>} Generated summary
 */
async function generateTranscriptSummary(transcriptId, transcriptText) {
  try {
    console.log(`[Auto-Summary] Generating summary for transcript ${transcriptId}...`);

    // Use first 5000 chars for efficiency (balance between context and cost)
    const textSample = transcriptText.substring(0, 5000);
    const charCount = transcriptText.length;
    const sampleNotice = charCount > 5000 ?
      `\n\n[Note: This is a ${charCount}-character transcript. Only the first 5000 characters are shown above for summarization.]` : '';

    const result = await streamText({
      model: openrouter('openai/gpt-oss-120b'),
      prompt: `Analyze this transcript and create a concise, informative summary.

Instructions:
- Write 2-3 sentences capturing the main topics, key insights, and overall theme
- Be specific about what's discussed, not generic
- Focus on substance and value
- Do not use phrases like "this transcript discusses" or "the speaker talks about" - just state the content directly
- Maximum 250 characters

Transcript:
${textSample}${sampleNotice}

Summary:`,
      temperature: 0.3,  // Lower temperature for consistent, focused summaries
      maxTokens: 150,    // ~250 chars = ~150 tokens
    });

    const summaryText = await result.text;
    const summary = summaryText.trim();

    // Truncate to 250 chars if needed (but usually won't be)
    const finalSummary = summary.length > 250 ? summary.substring(0, 247) + '...' : summary;

    // Save to database
    await prisma.transcript.update({
      where: { id: transcriptId },
      data: { description: finalSummary }
    });

    console.log(`[Auto-Summary] ✅ Summary generated and saved (${finalSummary.length} chars)`);
    return finalSummary;

  } catch (error) {
    console.error(`[Auto-Summary] ⚠️ Failed to generate summary for ${transcriptId}:`, error.message);
    // Don't throw - let import complete successfully even if summary fails
    return null;
  }
}
```

##### Step 2: Integrate into Single Import Flow

**Location**: `server.mjs:690-730` (inside `/api/transcribe-youtube` endpoint)

**Current Code**:
```javascript
// Around line 710
const savedTranscript = await prisma.transcript.create({
  data: {
    youtubeId: videoId,
    title: title,
    channel: channel,
    text: transcriptText,
    segments: timestampedSegments,
    publishDate: publishDate ? new Date(publishDate) : null,
    source: 'YOUTUBE',
    sourceUrl: url,
  }
});

console.log('[Import] Transcript saved to database:', savedTranscript.id);

// Mark import as done
await prisma.importJob.update({
  where: { id: importId },
  data: {
    state: 'DONE',
    transcriptId: savedTranscript.id,
    progress: 100
  }
});
```

**Modified Code** (add auto-summary):
```javascript
const savedTranscript = await prisma.transcript.create({
  data: {
    youtubeId: videoId,
    title: title,
    channel: channel,
    text: transcriptText,
    segments: timestampedSegments,
    publishDate: publishDate ? new Date(publishDate) : null,
    source: 'YOUTUBE',
    sourceUrl: url,
  }
});

console.log('[Import] Transcript saved to database:', savedTranscript.id);

// 🔥 NEW: Auto-generate summary
await sendProgress(importId, 'Generating summary...', 95);
await generateTranscriptSummary(savedTranscript.id, transcriptText);

// Mark import as done
await prisma.importJob.update({
  where: { id: importId },
  data: {
    state: 'DONE',
    transcriptId: savedTranscript.id,
    progress: 100
  }
});
```

##### Step 3: Integrate into Bulk Import Queue

**Location**: `server.mjs:307-327` (inside `processVideo` function)

**Current Code**:
```javascript
// Around line 307
const savedTranscript = await prisma.transcript.create({
  data: {
    youtubeId: videoId,
    title: title,
    channel: channel,
    text: transcriptText,
    segments: timestampedSegments,
    publishDate: publishDate ? new Date(publishDate) : null,
    source: 'YOUTUBE',
    sourceUrl: job.videoUrl,
  }
});

console.log('[Queue] Transcript saved to database:', savedTranscript.id);

await prisma.importJob.update({
  where: { id: job.id },
  data: {
    state: 'DONE',
    transcriptId: savedTranscript.id,
    progress: 100
  }
});
```

**Modified Code**:
```javascript
const savedTranscript = await prisma.transcript.create({
  data: {
    youtubeId: videoId,
    title: title,
    channel: channel,
    text: transcriptText,
    segments: timestampedSegments,
    publishDate: publishDate ? new Date(publishDate) : null,
    source: 'YOUTUBE',
    sourceUrl: job.videoUrl,
  }
});

console.log('[Queue] Transcript saved to database:', savedTranscript.id);

// 🔥 NEW: Auto-generate summary
await sendProgress(job.id, 'Generating summary...', 95);
await generateTranscriptSummary(savedTranscript.id, transcriptText);

await prisma.importJob.update({
  where: { id: job.id },
  data: {
    state: 'DONE',
    transcriptId: savedTranscript.id,
    progress: 100
  }
});
```

##### Step 4: Integrate into Podcast Import

**Location**: `server.mjs:1097-1115` (inside `/api/transcribe-podcast` endpoint)

**Current Code**:
```javascript
// Around line 1097
const savedTranscript = await prisma.transcript.create({
  data: {
    title: episode.title,
    channel: podcastTitle || 'Unknown Podcast',
    text: transcriptText,
    segments: timestampedSegments,
    publishDate: episode.pubDate ? new Date(episode.pubDate) : null,
    source: 'PODCAST',
    sourceUrl: episode.enclosure?.url || url,
  }
});

console.log('[Podcast] Transcript saved:', savedTranscript.id);

await prisma.importJob.update({
  where: { id: importId },
  data: {
    state: 'DONE',
    transcriptId: savedTranscript.id,
    progress: 100
  }
});
```

**Modified Code**:
```javascript
const savedTranscript = await prisma.transcript.create({
  data: {
    title: episode.title,
    channel: podcastTitle || 'Unknown Podcast',
    text: transcriptText,
    segments: timestampedSegments,
    publishDate: episode.pubDate ? new Date(episode.pubDate) : null,
    source: 'PODCAST',
    sourceUrl: episode.enclosure?.url || url,
  }
});

console.log('[Podcast] Transcript saved:', savedTranscript.id);

// 🔥 NEW: Auto-generate summary
await sendProgress(importId, 'Generating summary...', 95);
await generateTranscriptSummary(savedTranscript.id, transcriptText);

await prisma.importJob.update({
  where: { id: importId },
  data: {
    state: 'DONE',
    transcriptId: savedTranscript.id,
    progress: 100
  }
});
```

---

### Why This Approach?

**✅ Advantages**:
1. **Automatic**: Runs for every import without user action
2. **Integrated**: Part of import flow, user sees "Generating summary..." stage
3. **Non-Blocking**: Errors don't fail the import
4. **High Quality**: Uses OpenRouter instead of local LLM
5. **No Schema Changes**: Uses existing `description` field
6. **No Frontend Changes**: TranscriptList already displays descriptions
7. **Simple**: One function, three integration points

**⚠️ Considerations**:
1. **Cost**: Each summary costs ~0.5-1¢ via OpenRouter (vs free local LLM)
2. **Time**: Adds 2-5 seconds to import process
3. **Rate Limits**: OpenRouter has rate limits (handle gracefully)
4. **Transcript Length**: Using only first 5000 chars for efficiency

---

### Alternative Approaches

#### Option B: Background Job Queue

**Implementation**: Separate job queue that processes summaries after import

**Advantages**:
- Doesn't slow down import at all
- Can batch process multiple transcripts
- Can retry failures independently

**Disadvantages**:
- More complex (requires job queue system)
- Summary not immediately available
- Additional infrastructure

**When to Use**: If you have 100+ imports per day and need to optimize import speed

---

#### Option C: On-Demand Generation

**Implementation**: Generate summary when transcript is first viewed

**Advantages**:
- Zero cost for unused transcripts
- Can regenerate if user unhappy

**Disadvantages**:
- User must wait on first view
- Not searchable by summary
- Requires frontend loading state

**When to Use**: If most transcripts are never viewed

---

#### Option D: Scheduled Batch Processing

**Implementation**: Existing `/api/transcripts/generate-all-descriptions` endpoint

**Advantages**:
- Process many at once
- Run during off-peak hours
- Easy to implement (already exists)

**Disadvantages**:
- Not automatic
- Manual trigger required
- Summaries not immediately available

**When to Use**: For backfilling existing transcripts without descriptions

---

### Database Considerations

#### Current Schema (No Changes Needed)
```prisma
description  String?  // AI-generated short description
```

#### Optional: Extended Summary Field

If you want BOTH short description (120 chars) AND long summary (unlimited):

```prisma
model Transcript {
  // ... existing fields
  description  String?  @db.Text  // Short description (120 chars)
  summary      String?  @db.Text  // NEW: Full summary (unlimited)
}
```

**Migration**:
```prisma
// prisma/migrations/.../migration.sql
ALTER TABLE "Transcript" ADD COLUMN "summary" TEXT;
```

**Use Cases**:
- `description`: List view, search previews, quick glance
- `summary`: Full transcript view, detailed overview, insight extraction

---

### Implementation Checklist

**Phase 1: Core Implementation**
- [ ] Add `generateTranscriptSummary()` function to `server.mjs`
- [ ] Integrate into single import flow (server.mjs:710)
- [ ] Integrate into bulk import queue (server.mjs:307)
- [ ] Integrate into podcast import (server.mjs:1097)
- [ ] Test with sample YouTube video
- [ ] Test with sample podcast episode
- [ ] Verify summaries appear in TranscriptList

**Phase 2: Error Handling**
- [ ] Handle OpenRouter rate limits gracefully
- [ ] Handle network timeouts
- [ ] Log all summary generation attempts
- [ ] Add retry logic for transient failures

**Phase 3: Optimization**
- [ ] Tune prompt for best summary quality
- [ ] Adjust temperature and token limits
- [ ] Test with various transcript lengths
- [ ] Consider caching summaries

**Phase 4: Future Enhancements**
- [ ] Add "regenerate summary" button in UI
- [ ] Support multiple summary styles (technical, casual, brief, detailed)
- [ ] Add summary to search index
- [ ] Track summary generation metrics

---

### Cost Estimation

**OpenRouter Pricing** (openai/gpt-oss-120b):
- Input: ~$0.00005 per 1K tokens
- Output: ~$0.0001 per 1K tokens

**Per Summary**:
- Input: 5000 chars = ~1250 tokens × $0.00005 = $0.0000625
- Output: 150 tokens × $0.0001 = $0.000015
- **Total per summary**: ~$0.0001 (0.01 cents)

**Monthly Estimate** (100 imports/day):
- 100 imports × 30 days = 3000 summaries
- 3000 × $0.0001 = **$0.30/month**

**Conclusion**: Essentially free for typical usage.

---

## Key File Reference

### Backend (Express + WebSocket)

| File | Purpose | Key Functions |
|------|---------|---------------|
| `server.mjs` | Main backend server | All API routes, LLM integration, import processing |
| `youtube_transcribe.sh` | YouTube import script | Download + transcribe YouTube videos |
| `podcast_transcribe.sh` | Podcast import script | Download + transcribe podcast episodes |

### Frontend (React)

| File | Purpose | Key Components/Hooks |
|------|---------|---------------------|
| `src/v2/components/ui/ChatPanel.jsx` | Chat interface | Chat with transcripts using LLM |
| `src/v2/components/ui/TranscriptList.jsx` | Transcript sidebar | Display all transcripts |
| `src/v2/components/ui/ChannelImportPanel.jsx` | Bulk import UI | Import multiple videos from channel |
| `src/v2/hooks/useTranscript.js` | Transcript state | Select, delete, refresh transcripts |
| `src/v2/hooks/useImport.js` | Import orchestration | WebSocket progress, start/cancel imports |
| `src/v2/hooks/useAI.js` | AI suggestions | Generate follow-up questions |
| `src/v2/hooks/useInsightExtraction.js` | Insight capture | Extract insights from text/chat |

### Database

| File | Purpose | Key Models |
|------|---------|-----------|
| `prisma/schema.prisma` | Database schema | Transcript, ImportJob, Insight, InsightSource |

### Configuration

| File | Purpose | Required Variables |
|------|---------|-------------------|
| `.env` | Environment config | `OPENROUTER_API_KEY`, `DATABASE_URL` |

---

## Summary

This architecture document has outlined:

1. **LLM Integration**: OpenRouter-based chat system with streaming support, using the `openai/gpt-oss-120b` model for transcript analysis
2. **Database Design**: PostgreSQL with Prisma ORM, storing full transcripts with timestamped segments and AI-generated summaries
3. **Import Pipeline**: Multi-stage pipeline with real-time WebSocket progress tracking, from URL submission to database storage
4. **Auto-Summary Plan**: Integrated automatic summary generation using OpenRouter, triggered immediately after import completion, with minimal cost and no schema changes

The recommended auto-summary implementation adds ~3-5 seconds to import time, costs ~$0.0001 per transcript, and requires changes to only one file (`server.mjs`).

---

**Document Version**: 1.0
**Last Updated**: November 4, 2025
**Maintainer**: Insitek Development Team
