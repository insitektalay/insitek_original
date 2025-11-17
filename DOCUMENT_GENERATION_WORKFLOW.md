# Document Generation Workflow - Complete Technical Documentation

This document provides a comprehensive overview of Insitek's AI-powered document generation pipeline, including all user steps, AI processing stages, database operations, and system architecture.

---

## Table of Contents

1. [Overview](#overview)
2. [User Workflow](#user-workflow)
3. [AI Processing Stages](#ai-processing-stages)
4. [Database Schema & State Management](#database-schema--state-management)
5. [API Endpoints](#api-endpoints)
6. [Error Handling](#error-handling)
7. [System Architecture](#system-architecture)

---

## Overview

The document generation system transforms multiple transcript sources (YouTube videos, podcasts, images) into cohesive, polished documents through a multi-stage AI synthesis pipeline. The system:

- **Analyzes** transcript content to propose document types
- **Customizes** through iterative user questions
- **Previews** the structure before generation
- **Generates** documents through a 4-stage AI pipeline
- **Tracks** progress in real-time with WebSocket updates

**Key Characteristics:**
- Multi-transcript synthesis (1-20 transcripts per document)
- Progressive customization (adaptive questioning)
- Background processing with status polling
- Structured AI pipeline prevents hallucination
- Real-time progress tracking

---

## User Workflow

### Phase 0: Selection & Initialization

**User Actions:**
1. User selects 1-20 transcripts from the transcript list
2. Clicks "Generate Document" button
3. `DocumentGenerationWizard` component opens

**System Actions:**
- Frontend: Opens wizard modal with selected transcript IDs
- Immediately transitions to Stage 0 (Analysis)

### Stage 0: Transcript Analysis & Document Type Proposals

**What the user sees:**
- Loading screen: "Analyzing your transcripts..."
- Duration: ~10-30 seconds depending on transcript count

**What happens behind the scenes:**

1. **Frontend** (`DocumentGenerationWizard.jsx:42-79`):
   - Calls `POST /api/documents/analyze`
   - Sends: `{ transcriptIds: [...], customInstructions: "" }`

2. **Backend** (`server.mjs` - `/api/documents/analyze`):
   - Fetches transcript summaries from database (not full text for token efficiency)
   - Creates or updates Document record with status `ANALYZING`
   - Calls AI with prompt from `prompts/document-generation/00-analyze-transcripts.md`

3. **AI Processing** (Stage 0 - Analyze):
   - **Input**: Transcript summaries, custom instructions (if any), transcript count
   - **Task**: Extract structured facts, identify themes, propose 3-5 document types
   - **Output**: JSON containing:
     ```json
     {
       "analysis_summary": "2-3 sentence overview of transcript themes",
       "structured_facts": {
         "counts": { "recipes": 5, "techniques": 8 },
         "entities": ["Gordon Ramsay", "Thomas Keller"],
         "key_themes": ["Italian home cooking", "Meal prep"],
         "time_periods": ["2020-2023"],
         "locations": ["Mediterranean cuisine"],
         "other_facts": ["All recipes under 30 minutes"]
       },
       "proposed_documents": [
         {
           "type": "Complete Founder Playbook",
           "description": "What this doc contains and who it's for",
           "rationale": "Why this makes sense for this content"
         }
       ]
     }
     ```

4. **Database Updates**:
   - Document status → `AWAITING_QUESTIONS`
   - Stores analysis results in `preferences` JSON field

**User sees:**
- Analysis summary text
- Optional "Custom Instructions" textarea with template loading/saving
- Page length slider (0 = auto, 1-10 pages)
- 3-5 proposed document type cards
- "Select This Type" button on each card

**User Actions:**
- (Optional) Add custom instructions to guide document type suggestions
- (Optional) Click "Update Suggestions" to re-run analysis with instructions
- (Optional) Adjust page length slider
- Select a document type → Triggers Stage 0.5

---

### Stage 0.5: Iterative Question Generation

**What the user sees:**
- Progress indicator showing "Question 1", "Question 2", etc.
- One question at a time with 3-4 multiple choice options
- "Other" option auto-added for custom text input
- "Skip to Preview" button to skip remaining questions
- "Continue" button to answer and proceed

**What happens behind the scenes:**

1. **Frontend** (`DocumentGenerationWizard.jsx:166-234`):
   - Calls `POST /api/documents/question-next`
   - Sends: `{ documentId, documentType, conversationHistory: [] }`

2. **Backend** (`server.mjs` - `/api/documents/question-next`):
   - Fetches document and transcript data
   - Calls AI with prompt from `prompts/document-generation/00.5-question-next.md`

3. **AI Processing** (Stage 0.5 - Iterative Questions):
   - **Input**: Document type, conversation history (all Q&A so far), transcript topics, analysis summary, structured facts
   - **Task**: Decide whether to ask another question or proceed to preview
   - **AI Freedom**: Complete freedom to ask relevant questions (no prescribed list)
   - **Typical Questions**: 2-4 questions total before stopping
   - **Output**: JSON containing:
     ```json
     {
       "question": "What level of detail do you want?",
       "options": ["High-level overview", "Detailed walkthrough", "In-depth technical", "Brief summary"],
       "isLastQuestion": false
     }
     ```
   - **When done**:
     ```json
     {
       "question": "",
       "options": [],
       "isLastQuestion": true
     }
     ```

4. **Conversation Loop**:
   - User answers question → Answer added to `conversationHistory`
   - Frontend calls `/api/documents/question-next` again with updated history
   - AI sees previous Q&A and decides next question
   - Process repeats until `isLastQuestion: true`

5. **Database Updates**:
   - Each answer stored in Document `preferences` field as JSON array:
     ```json
     {
       "conversationHistory": [
         { "question": "...", "answer": "..." },
         { "question": "...", "answer": "..." }
       ]
     }
     ```

**User Actions:**
- Answer each question by selecting an option
- OR type custom answer if "Other" is selected
- OR skip to preview at any point
- Click "Continue" to proceed

**When complete:**
- If AI sets `isLastQuestion: true` → Auto-transitions to Stage 0.75
- If user clicks "Skip to Preview" → Manually transitions to Stage 0.75

---

### Stage 0.75: Structure Preview

**What the user sees:**
- Loading screen: "Generating preview..."
- Then: Document structure preview showing:
  - Proposed document title
  - Document description (2-3 sentences)
  - Estimated word count
  - All sections with titles, descriptions, and key topics (5-8 bullet points each)
- "Back" button to return to questions
- "Approve & Generate" button to start generation

**What happens behind the scenes:**

1. **Frontend** (`DocumentGenerationWizard.jsx:237-264`):
   - Calls `POST /api/documents/preview-structure`
   - Sends: `{ documentId, pageLength, customInstructions }`

2. **Backend** (`server.mjs` - `/api/documents/preview-structure`):
   - Fetches document with all preferences
   - Calls AI with prompt from `prompts/document-generation/00.75-preview-structure.md`

3. **AI Processing** (Stage 0.75 - Preview Structure):
   - **Input**: Document type, conversation history, transcript summaries, page length target, custom instructions
   - **Task**: Create detailed document outline user will approve
   - **Output**: JSON containing:
     ```json
     {
       "title": "The Complete Indie SaaS Playbook",
       "description": "A comprehensive guide for...",
       "estimatedLength": "8,000-10,000 words",
       "sections": [
         {
           "number": 1,
           "title": "Finding Proven Ideas",
           "description": "This section explores methods for...",
           "keyTopics": [
             "Where to find validated businesses",
             "Platform change opportunities",
             "Market demand signals",
             "Solving your own problems",
             "Smart replication vs copying"
           ]
         }
       ]
     }
     ```

4. **Database Updates**:
   - Creates `DocumentSection` records for each section
   - Stores `keyTopics` as JSON in each section
   - Document status → `AWAITING_APPROVAL`

**User Actions:**
- Review the structure preview
- Click "Back" to modify answers (returns to Stage 0.5)
- Click "Approve & Generate" to start document generation → Triggers backend processing

---

### Stage 1-4: Document Generation (Background Processing)

**What the user sees:**
- Progress screen with:
  - Circular progress indicator (0-100%)
  - Progress bar
  - Current stage message (e.g., "Extracting content from transcript 3 of 10...")
  - Estimated time: "This may take 5-10 minutes depending on content complexity"
- Progress updates every 2 seconds via polling

**What happens behind the scenes:**

1. **Frontend** (`DocumentGenerationWizard.jsx:267-327`):
   - Calls `POST /api/documents/generate` to trigger generation
   - Starts polling `GET /api/documents/:id/status` every 2 seconds
   - Updates UI based on status changes
   - When status becomes `COMPLETE`:
     - Shows success message
     - Waits 1.5 seconds
     - Refreshes document list
     - Closes wizard and navigates to document

2. **Backend Processing Pipeline**:

   The backend processes the document through multiple stages sequentially. Each stage updates the database with progress and status.

---

#### **Stage 1: Generate Document Outline**

**Location**: `server.mjs` - `POST /api/documents/generate` (inline)

**Database State**:
- Status: `GENERATING_OUTLINE`
- Progress: 10%
- Current Stage: `generating_outline`

**AI Processing**:
- **Prompt**: `prompts/document-generation/01-generate-outline.md`
- **Input**: Document type, approved structure from preview, full transcript summaries, user preferences
- **Task**: Create detailed outline with section descriptions and key questions
- **Output**: JSON containing:
  ```json
  {
    "sections": [
      {
        "number": 1,
        "title": "Finding Proven Ideas",
        "description": "This section explores methods for identifying validated business opportunities...",
        "keyQuestions": [
          "Where can founders find validated businesses?",
          "How do you identify opportunities from platform changes?",
          "What signals indicate real market demand?",
          "How can solving your own problems lead to validated ideas?",
          "What's the difference between copying and smart replication?"
        ]
      }
    ]
  }
  ```

**Database Updates**:
- `Document.outline` = parsed JSON response
- Updates each `DocumentSection` with description from outline
- Status → `EXTRACTING`
- Progress → 20%

---

#### **Stage 2: Extract Content from Transcripts**

**Location**: `server.mjs` - Extraction loop per transcript

**Process**: For EACH transcript (sequential processing):

1. **Stage 1.5: Determine Extract Types** (inline before extraction)

   **AI Processing**:
   - **Prompt**: `prompts/document-generation/01.5-determine-extract-types.md`
   - **Input**: Single transcript full text, transcript title, complete outline
   - **Task**: Analyze what content types exist in this transcript for each section
   - **Output**: JSON mapping section IDs to extract types:
     ```json
     {
       "section_1": {
         "extractTypes": [
           "founder_quote",
           "validation_method",
           "revenue_milestone_with_timeframe",
           "tool_recommendation_with_rationale"
         ],
         "rationale": "This transcript has excellent founder stories and metrics"
       },
       "section_2": {
         "extractTypes": [],
         "rationale": "No relevant technical content in this transcript"
       }
     }
     ```

   **Important**: Extract type names must be:
   - Lowercase only
   - No apostrophes, quotes, or special punctuation
   - Only use: a-z, 0-9, underscore (_)
   - Prevents JSON parsing errors

2. **Stage 2: Extract Specific Content**

   **Database State**:
   - Status: `EXTRACTING`
   - Progress: 20% + (currentTranscript / totalTranscripts) * 40% (e.g., 20-60%)
   - Current Stage: `extracting_transcript_3_of_10`

   **AI Processing**:
   - **Prompt**: `prompts/document-generation/02-extract-content.md`
   - **Input**: Single transcript full text, outline, suggested extract types from 1.5
   - **Task**: Extract specific content matching the suggested types
   - **Output**: JSON with extractions organized by section:
     ```json
     {
       "section_1": [
         {
           "type": "founder_quote",
           "content": "When I saw Peter's tweet about shutdown, I thought 'that's me, I can build that'",
           "context": "Moment of opportunity recognition - platform shutdown example"
         },
         {
           "type": "revenue_milestone_with_timeframe",
           "content": "Month 1: $4,000 MRR. Month 2-3: $10,800 MRR.",
           "context": "Revenue trajectory showing rapid growth from PMF"
         }
       ],
       "section_2": []
     }
     ```

3. **Database Updates** (per transcript):
   - Creates `DocumentExtraction` records for each extraction:
     - `documentId`: Current document
     - `transcriptId`: Current transcript
     - `sectionRef`: "section_1", "section_2", etc.
     - `extractType`: The type from extraction (e.g., "founder_quote")
     - `content`: The extracted content
     - `context`: Why this matters
     - `suggestedTypes`: JSON of types from Stage 1.5
   - Updates progress incrementally

**After All Transcripts Processed**:
- Status → `SYNTHESIZING`
- Progress → 60%
- All extractions stored in database

---

#### **Stage 3: Synthesize Sections**

**Location**: `server.mjs` - Synthesis loop per section

**Process**: For EACH section (sequential):

**Database State**:
- Status: `SYNTHESIZING`
- Progress: 60% + (currentSection / totalSections) * 30% (e.g., 60-90%)
- Current Stage: `synthesizing_section_3_of_8`

**Data Preparation**:
1. Fetch all `DocumentExtraction` records for this section from ALL transcripts
2. Group extractions by type
3. Format as organized content for AI

**AI Processing**:
- **Prompt**: `prompts/document-generation/03-synthesize-section.md`
- **Input**:
  - Section number, title, description
  - Key questions to answer
  - ALL extractions for this section (from all transcripts), organized by type
  - Full transcript texts (for fact-checking only)
  - Document type, user preferences
  - Target word count (calculated from page length)
- **Task**: Write cohesive prose synthesizing all extractions
- **Critical Constraints**:
  - ONLY use content from provided extractions
  - NO hallucination or external knowledge
  - Remove redundancy across transcripts
  - Handle conflicts as tradeoffs
  - Natural narrative flow (not "Transcript A says... Transcript B says...")
- **Output**: Markdown prose (500-1500 words):
  ```markdown
  # Finding Proven Ideas

  The founders converge on a counter-intuitive insight: validation matters
  more than originality. Rather than brainstorming novel ideas in isolation,
  successful founders test demand immediately...

  [Cohesive narrative weaving together insights from all transcripts]

  [Includes relevant quotes, data, examples naturally integrated]
  ```

**Database Updates**:
- Updates `DocumentSection.content` with synthesized markdown
- Progress updates after each section

**After All Sections Synthesized**:
- Status → `POLISHING`
- Progress → 90%

---

#### **Stage 4: Polish Complete Document**

**Location**: `server.mjs` - Final polish stage

**Database State**:
- Status: `POLISHING`
- Progress: 90%
- Current Stage: `polishing_document`

**Data Preparation**:
1. Fetch all `DocumentSection` records in order
2. Concatenate all section content
3. Prepare full document for final polish

**AI Processing**:
- **Prompt**: `prompts/document-generation/04-polish-document.md`
- **Input**:
  - Document title and type
  - ALL synthesized sections concatenated
  - Section titles array
  - User preferences
  - Transcript count
- **Task**: Polish for cohesion WITHOUT adding new content
- **Critical Constraints**:
  - DO NOT add sections (no intro/conclusion unless already present)
  - ONLY polish existing content
  - Fix transitions between sections
  - Ensure consistent tone
  - Remove cross-section redundancy
- **Output**: Complete markdown document:
  ```markdown
  # The Complete Indie SaaS Playbook

  # Finding Proven Ideas

  [Section 1 content - polished with smooth transitions]

  # Building Fast

  [Transitional sentence bridging from Section 1]

  [Section 2 content - polished for flow]

  ...
  ```

**Database Updates**:
- `Document.content` = complete polished markdown
- `Document.wordCount` = calculated from content
- Status → `COMPLETE`
- Progress → 100%
- Current Stage: `complete`

---

### Completion

**Frontend Detection**:
- Polling detects `status === 'COMPLETE'`
- Shows success message: "Document Complete!"
- Waits 1.5 seconds
- Calls `triggerRefresh()` to update document list
- Closes wizard
- Returns user to Documents page

**User Actions**:
- Document now appears in Documents list
- Click to view/edit in `DocumentView` component
- Can export, share, or regenerate sections

---

## Database Schema & State Management

### Document Model

```prisma
model Document {
  id              String          @id @default(uuid())
  title           String
  content         String?         @db.Text         // Nullable until complete
  documentType    String                           // "Tutorial Guide", etc.
  preferences     Json                             // User answers + analysis
  wordCount       Int?
  status          DocumentStatus  @default(ANALYZING)
  outline         Json?                            // Stage 1 output
  errorMessage    String?         @db.Text
  currentStage    String?                          // "extracting_transcript_3_of_10"
  progress        Int             @default(0)      // 0-100
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  transcripts     Transcript[]
  sections        DocumentSection[]
  extractions     DocumentExtraction[]
}
```

### Document Status Enum

```prisma
enum DocumentStatus {
  ANALYZING          // Stage 0: AI analyzing transcripts
  AWAITING_QUESTIONS // Stage 0.5: Ready for user questions
  AWAITING_PREVIEW   // Stage 0.75: Ready for structure preview
  AWAITING_APPROVAL  // User reviewing structure
  GENERATING_OUTLINE // Stage 1: Creating outline
  EXTRACTING         // Stage 2: Extracting from transcripts
  SYNTHESIZING       // Stage 3: Writing sections
  POLISHING          // Stage 4: Final polish
  COMPLETE           // Done
  FAILED             // Error occurred
}
```

### DocumentSection Model

```prisma
model DocumentSection {
  id              String    @id @default(uuid())
  documentId      String
  sectionNumber   Int                   // 1, 2, 3, etc.
  title           String
  description     String?   @db.Text    // From outline
  content         String?   @db.Text    // From synthesis (Stage 3)
  keyTopics       Json?                 // For preview display
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  document        Document  @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([documentId, sectionNumber])
  @@index([documentId])
}
```

### DocumentExtraction Model

```prisma
model DocumentExtraction {
  id              String    @id @default(uuid())
  documentId      String
  transcriptId    String
  sectionRef      String                // "section_1", "section_2"
  extractType     String                // "founder_quote", "metric_with_timeframe"
  content         String    @db.Text    // Extracted content
  context         String?   @db.Text    // Why it's relevant
  suggestedTypes  Json?                 // Stage 1.5 output
  createdAt       DateTime  @default(now())

  document        Document   @relation(fields: [documentId], references: [id], onDelete: Cascade)
  transcript      Transcript @relation(fields: [transcriptId], references: [id], onDelete: Cascade)

  @@index([documentId, sectionRef])
  @@index([transcriptId])
  @@index([documentId])
}
```

### State Progression Example

```
ANALYZING (0%)
  ↓ AI analyzes transcripts
AWAITING_QUESTIONS (5%)
  ↓ User selects document type
[Question loop]
  ↓ User answers questions
AWAITING_PREVIEW (8%)
  ↓ AI generates structure preview
AWAITING_APPROVAL (10%)
  ↓ User approves structure
GENERATING_OUTLINE (10%)
  ↓ AI creates detailed outline
EXTRACTING (20%)
  ↓ Stage 1.5: Determine types (per transcript)
  ↓ Stage 2: Extract content (per transcript)
  → Progress: 20% → 60% (incremental per transcript)
SYNTHESIZING (60%)
  ↓ Stage 3: Write sections (per section)
  → Progress: 60% → 90% (incremental per section)
POLISHING (90%)
  ↓ Stage 4: Final document polish
COMPLETE (100%)
```

---

## API Endpoints

### POST `/api/documents/analyze`

**Purpose**: Stage 0 - Analyze transcripts and propose document types

**Request Body**:
```json
{
  "transcriptIds": ["uuid1", "uuid2"],
  "customInstructions": "I want a trader's handbook",
  "documentId": "existing-uuid" // Optional, for re-analysis
}
```

**Response**:
```json
{
  "documentId": "uuid",
  "analysis_summary": "These transcripts cover...",
  "structured_facts": { ... },
  "proposed_documents": [ ... ]
}
```

**Database Operations**:
1. If `documentId` provided: Update existing document
2. Otherwise: Create new Document with status `ANALYZING`
3. Link to transcripts via Many-to-Many relation
4. Store analysis in `preferences` JSON field
5. Update status to `AWAITING_QUESTIONS`

---

### POST `/api/documents/refine-instructions`

**Purpose**: Use AI to refine messy custom instructions

**Request Body**:
```json
{
  "customInstructions": "I want a meal planner thingy with shopping..."
}
```

**Response**:
```json
{
  "refinedInstructions": "Create a concise meal planner with the following sections ONLY:\n\n1. **Sunday Prep List**..."
}
```

**AI Processing**:
- **Prompt**: `prompts/document-generation/refine-instructions.md`
- **Task**: Rewrite rambling instructions into clear, structured format

---

### POST `/api/documents/question-next`

**Purpose**: Stage 0.5 - Get next iterative question or signal completion

**Request Body**:
```json
{
  "documentId": "uuid",
  "documentType": "Founder Playbook",
  "conversationHistory": [
    { "question": "...", "answer": "..." }
  ]
}
```

**Response** (if more questions):
```json
{
  "question": "What level of detail do you want?",
  "options": ["High-level", "Detailed", "In-depth", "Brief"],
  "isLastQuestion": false
}
```

**Response** (if done):
```json
{
  "question": "",
  "options": [],
  "isLastQuestion": true
}
```

**Database Operations**:
1. Fetch document and analysis
2. Update `preferences` with conversation history after each answer

---

### POST `/api/documents/preview-structure`

**Purpose**: Stage 0.75 - Generate structure preview for user approval

**Request Body**:
```json
{
  "documentId": "uuid",
  "pageLength": 5,
  "customInstructions": "Focus on metrics and data"
}
```

**Response**:
```json
{
  "title": "The Complete Guide...",
  "description": "This document covers...",
  "estimatedLength": "8,000-10,000 words",
  "sections": [
    {
      "number": 1,
      "title": "Section Title",
      "description": "What this covers...",
      "keyTopics": ["Topic 1", "Topic 2", ...]
    }
  ]
}
```

**Database Operations**:
1. Create `DocumentSection` records for each section
2. Store `keyTopics` as JSON
3. Update Document status to `AWAITING_APPROVAL`

---

### POST `/api/documents/generate`

**Purpose**: Start background generation process (Stages 1-4)

**Request Body**:
```json
{
  "documentId": "uuid"
}
```

**Response**:
```json
{
  "message": "Document generation started",
  "documentId": "uuid"
}
```

**Background Process**:
- Triggers async generation pipeline
- Updates database with status/progress throughout
- Returns immediately (doesn't wait for completion)

**Database Operations**: See [Stage 1-4](#stage-1-4-document-generation-background-processing) above

---

### GET `/api/documents/:id/status`

**Purpose**: Poll for generation status and progress

**Response**:
```json
{
  "status": "EXTRACTING",
  "progress": 45,
  "currentStage": "extracting_transcript_5_of_10",
  "errorMessage": null
}
```

**Database Operations**:
- Simple SELECT on Document record
- Returns status, progress, currentStage

---

### GET `/api/documents`

**Purpose**: List all documents

**Response**:
```json
{
  "documents": [
    {
      "id": "uuid",
      "title": "The Complete Guide",
      "documentType": "Playbook",
      "status": "COMPLETE",
      "wordCount": 8500,
      "createdAt": "2025-11-08T...",
      "transcripts": [...]
    }
  ]
}
```

---

### GET `/api/documents/:id`

**Purpose**: Get complete document with content

**Response**:
```json
{
  "id": "uuid",
  "title": "...",
  "content": "# Title\n\n# Section 1...",
  "documentType": "Playbook",
  "wordCount": 8500,
  "status": "COMPLETE",
  "sections": [...],
  "transcripts": [...]
}
```

---

## Error Handling

### Frontend Error Detection

**Location**: `DocumentGenerationWizard.jsx:660-752`

Errors are categorized by stage for user-friendly messages:

- **Analysis Failed**: "Unable to analyze your transcripts. Please check that the transcripts contain valid content."
- **Question Generation Failed**: "The AI was unable to generate the next question for customization."
- **Preview Generation Failed**: "The AI was unable to generate a structure preview."
- **Outline Generation Failed**: "The AI was unable to create a valid document outline."
- **Content Extraction Failed**: "The AI encountered an error while extracting relevant content from your transcripts."
- **Section Synthesis Failed**: "The AI had trouble writing one of the document sections."
- **Document Polishing Failed**: "The AI encountered an error during the final polish stage."

**Recovery Actions**:
- "Try Again" button (restarts from beginning)
- "Go Back" button (returns to document list)
- Technical details expandable section for debugging

### Backend Error Handling

**Database State on Error**:
- Status → `FAILED`
- `errorMessage` field populated with error details
- Progress remains at last successful stage

**Common Errors**:
1. **JSON Parsing Failures**: AI returns invalid JSON
   - Cause: Trailing commas, unescaped quotes, improper formatting
   - Prevention: Prompts include strict JSON formatting rules
   - Recovery: Error message guides user to retry

2. **Anthropic API Errors**: Rate limits, timeouts, API failures
   - Logged to console with full error details
   - User sees generic "AI service error" message

3. **Database Errors**: Constraint violations, connection issues
   - Transaction rollback where applicable
   - Error logged server-side

4. **Content Insufficiency**: Not enough transcript content
   - AI explicitly states gaps in synthesis
   - Document still completes but acknowledges limitations

---

## System Architecture

### Component Hierarchy

```
App
└── PanelRouter
    └── DocumentsList
        └── DocumentGenerationWizard (Modal)
            ├── TemplateSelector (Modal)
            ├── TemplateEditor (Modal)
            └── DocumentStructurePreview
```

### State Management

**Frontend State** (`DocumentGenerationWizard.jsx`):
- `stage`: Current UI stage (analyzing, proposals, question, preview, generating, complete, error)
- `documentId`: Document UUID persisted throughout workflow
- `analysis`: Stage 0 results
- `selectedDocType`: User's chosen document type
- `conversationHistory`: Q&A pairs from Stage 0.5
- `currentQuestion`: Active question in Stage 0.5
- `structurePreview`: Stage 0.75 results
- `generationStatus`: Real-time status from polling
- `customInstructions`: User's additional requirements
- `pageLength`: Target document length (0-10)

**Backend State** (Database):
- `Document.status`: Current DocumentStatus enum
- `Document.progress`: 0-100 percentage
- `Document.currentStage`: Descriptive string (e.g., "extracting_transcript_3_of_10")
- `Document.preferences`: JSON with all user choices
- `Document.outline`: JSON from Stage 1
- `DocumentSection[]`: Individual sections with content
- `DocumentExtraction[]`: All extractions from Stage 2

### Real-Time Progress Tracking

**Polling Strategy**:
- Frontend polls every 2 seconds during generation
- `GET /api/documents/:id/status` endpoint
- Stops polling when status is `COMPLETE` or `FAILED`
- Cleanup interval on component unmount

**Progress Calculation**:
```javascript
// Stage 0: 0-10%
ANALYZING: 0-5%
AWAITING_QUESTIONS: 5%
AWAITING_PREVIEW: 8%
AWAITING_APPROVAL: 10%

// Stage 1: 10-20%
GENERATING_OUTLINE: 10% → 20%

// Stage 2: 20-60%
EXTRACTING: 20% + (currentTranscript / totalTranscripts) * 40%

// Stage 3: 60-90%
SYNTHESIZING: 60% + (currentSection / totalSections) * 30%

// Stage 4: 90-100%
POLISHING: 90% → 100%
```

**Status Messages** (`DocumentGenerationWizard.jsx:330-356`):
```javascript
getStageMessage(status) {
  if (status.currentStage === 'generating_outline')
    return 'Creating document outline...'

  if (status.currentStage?.startsWith('extracting_transcript_')) {
    const [_, current, __, total] = status.currentStage.match(/(\d+)_of_(\d+)/)
    return `Extracting content from transcript ${current} of ${total}...`
  }

  if (status.currentStage?.startsWith('synthesizing_section_')) {
    const [_, current, __, total] = status.currentStage.match(/(\d+)_of_(\d+)/)
    return `Writing section ${current} of ${total}...`
  }

  if (status.currentStage === 'polishing_document')
    return 'Polishing final document...'

  return 'Processing...'
}
```

### AI Integration

**Anthropic Client**:
- Library: `@anthropic-ai/sdk`
- Model: Claude 3.5 Sonnet (`claude-3-5-sonnet-20241022`)
- Configuration: 8192 max tokens, standard temperature

**Prompt Management**:
- All prompts stored in `prompts/document-generation/*.md`
- Handlebars-style templating: `{{variable}}`
- Strict JSON output requirements in prompts
- Context-aware prompts with full conversation history

**Token Optimization**:
- Stage 0: Uses transcript `summary` field (not full text)
- Stages 1.5, 2: Uses full transcript text (required for extraction)
- Stage 3: Passes full transcripts for fact-checking
- Stage 4: Only passes synthesized sections

---

## Custom Instructions & Template System

### Purpose
Allow users to save and reuse common document generation instructions.

### Features

**Template Library** (`TemplateLibrary.jsx`):
- Browse saved templates
- Filter by category
- Sort by usage count or last used
- Load template into wizard

**Template Editor** (`TemplateEditor.jsx`):
- Create new templates
- Edit existing templates
- Set name, description, categories
- Preview prompt text

**Integration in Wizard**:
- "Load Instruction" button → Opens template selector
- "Save as Instruction" button → Opens template editor
- "Refine Instructions" button → Uses AI to polish messy instructions

### Database Model

```prisma
model PromptTemplate {
  id              String    @id @default(uuid())
  name            String
  description     String?
  promptText      String    @db.Text
  category        String[]
  usageCount      Int       @default(0)
  lastUsedAt      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([category])
}
```

### API Endpoints

- `GET /api/templates` - List all templates
- `POST /api/templates` - Create template
- `PUT /api/templates/:id` - Update template
- `DELETE /api/templates/:id` - Delete template
- `POST /api/templates/:id/use` - Increment usage count

---

## Performance Considerations

**Generation Time**:
- Typical: 5-10 minutes for 5 transcripts, 8 sections
- Factors: Transcript count, section count, transcript length
- Bottleneck: AI API calls (sequential processing required)

**Optimization Strategies**:
1. **Token Efficiency**: Use summaries in early stages
2. **Progressive Progress**: Update after each transcript/section
3. **Async Processing**: Non-blocking backend generation
4. **Polling Over WebSocket**: Simpler, more reliable for this use case

**Scalability Limits**:
- Max 20 transcripts per document (API validation)
- Typical 6-10 sections per document
- Max ~15,000 words per document

---

## Future Enhancements

**Potential Improvements**:
1. **Parallel Processing**: Extract from multiple transcripts simultaneously
2. **Caching**: Cache analysis results for same transcript sets
3. **Incremental Updates**: Allow editing/regenerating individual sections
4. **Export Formats**: PDF, DOCX, HTML exports
5. **Collaboration**: Share documents, comment on sections
6. **Version History**: Track document revisions

---

## Troubleshooting Guide

### User Reports "Stuck at Analyzing"
- Check: Backend logs for AI API errors
- Check: Database status (may be FAILED with errorMessage)
- Fix: Restart generation with "Try Again"

### User Reports "Preview Never Loads"
- Check: DocumentSection records created
- Check: Status is AWAITING_APPROVAL
- Fix: Ensure Stage 0.75 AI call succeeded

### User Reports "Progress Stuck at X%"
- Check: Backend still processing (check logs)
- Check: Error in current stage (extraction/synthesis)
- Check: Database `currentStage` and `errorMessage`
- Fix: If backend crashed, status may need manual update to FAILED

### Extraction Returns Empty Content
- Cause: Stage 1.5 suggested no types for section
- Expected: Some sections may have no relevant content
- Result: Section will synthesize with "transcripts do not provide..." message

### JSON Parsing Errors in Extraction
- Cause: Extract type names contain apostrophes/special chars
- Prevention: Stage 1.5 prompt enforces snake_case naming
- Fix: Retry generation (AI usually corrects on second attempt)

---

## Conclusion

The document generation system is a sophisticated multi-stage pipeline that:

1. **Analyzes** transcript content intelligently
2. **Customizes** through natural conversation
3. **Previews** structure for user approval
4. **Extracts** relevant content systematically
5. **Synthesizes** cohesive prose from multiple sources
6. **Polishes** for professional quality

The system prevents hallucination through structured extraction, provides real-time progress feedback, and handles errors gracefully with user-friendly messaging.

**Key Files**:
- Frontend: `src/v2/components/ui/DocumentGenerationWizard.jsx`
- Backend: `server.mjs` (Document endpoints)
- Prompts: `prompts/document-generation/*.md`
- Schema: `prisma/schema.prisma`

For questions or issues, refer to the codebase or contact the development team.
