# Inkadu - Agentic Document Generation

**Autonomous AI agent that generates comprehensive documents from transcripts using function calling and iterative refinement.**

---

## 🎯 What is Inkadu?

Inkadu is a minimal, production-ready extraction of the **Agentic Document Generation System** from Insitek. It's a standalone application that:

- ✨ **Autonomously generates documents** from transcript sources using AI
- 🔄 **Iteratively refines** content for quality
- 📊 **Scales to 50+ transcripts** through intelligent chunking
- 📡 **Streams progress in real-time** via Server-Sent Events
- 🧪 **Supports A/B testing** with 3 variant strategies
- 💭 **Shows AI reasoning** as it works

---

## 📦 What's Included

### Backend (Node.js + Express + Prisma)
- **5 Core Services:**
  - `agentDocumentService.js` - Main orchestration engine
  - `agentTools.js` - 12 agent tools (read, search, write, etc.)
  - `transcriptChunker.js` - Chunking system for scalability
  - `agentEventEmitter.js` - Real-time SSE streaming
  - `agentVariants.js` - A/B testing variant system

- **Database (PostgreSQL via Supabase):**
  - 7 tables: Transcript, TranscriptChunk, TranscriptMetadata, AgentDocument, AgentSection, AgentNote, AgentToolCall
  - Prisma ORM for migrations and queries

### Frontend (React + Vite + Tailwind CSS)
- **7 UI Components:**
  - `AgenticDocumentWizard.jsx` - Start document generation
  - `AgenticProgressMonitor.jsx` - Monitor progress
  - `AgentProgressStream.jsx` - Real-time SSE display
  - `AgenticDocumentsList.jsx` - Browse documents
  - `AgenticDocumentView.jsx` - View completed documents
  - `AgenticAnalysisModal.jsx` - Analytics dashboard
  - `MarkdownMessage.jsx` - Markdown renderer

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Supabase account** (free tier works)
- **OpenRouter API key** (get from https://openrouter.ai/keys)

### 1. Clone the Repository

```bash
git clone https://github.com/insitektalay/inkadu.git
cd inkadu
```

### 2. Set Up Supabase Database

1. Go to [Supabase](https://app.supabase.com) and create a new project
2. Wait for the database to provision (~2 minutes)
3. Go to **Settings → Database**
4. Copy the **Connection String** (under "Connection pooling")
5. It looks like: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`

### 3. Configure Backend

```bash
cd backend

# Copy environment template
cp .env.example .env

# Edit .env and add your credentials:
nano .env
```

**Edit `.env`:**
```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres"
OPENROUTER_API_KEY="your-openrouter-api-key"
PORT=3001
NODE_ENV=development
```

### 4. Install Backend Dependencies

```bash
npm install
```

### 5. Run Database Migrations

```bash
# Generate Prisma client
npx prisma generate

# Run migrations to create tables
npx prisma migrate dev --name init

# (Optional) Open Prisma Studio to view database
npx prisma studio
```

You should see 7 tables created in your Supabase database.

### 6. Start Backend Server

```bash
npm run dev
```

You should see:
```
═══════════════════════════════════════════════════
  🚀 Inkadu Backend Server
═══════════════════════════════════════════════════
  🌐 Server:        http://localhost:3001
  🏥 Health Check:  http://localhost:3001/health
  📡 API Base:      http://localhost:3001/api
═══════════════════════════════════════════════════
```

### 7. Configure Frontend

Open a **new terminal**:

```bash
cd ../frontend

# Copy environment template
cp .env.example .env

# Install dependencies
npm install
```

### 8. Start Frontend

```bash
npm run dev
```

You should see:
```
  VITE v6.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### 9. Open the App

Go to **http://localhost:5173** in your browser.

---

## 📚 Usage Guide

### Step 1: Add Transcripts

Before generating documents, you need transcripts in the database.

**Option A: Manual Database Insert**

Use Prisma Studio to add transcripts:
```bash
cd backend
npx prisma studio
```

Then add a Transcript record with:
- `title`: "Example Video"
- `channel`: "Example Channel"
- `text`: "Your transcript content here..."
- `source`: YOUTUBE

**Option B: API Insert** (recommended for development)

Create a test script `backend/seed-transcript.mjs`:

```javascript
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const transcript = await prisma.transcript.create({
  data: {
    title: "Example Investment Discussion",
    channel: "Finance Channel",
    text: "This is the full transcript text. It can be very long...",
    source: "YOUTUBE",
    sourceUrl: "https://youtube.com/watch?v=example"
  }
});

console.log('Created transcript:', transcript.id);
```

Run it:
```bash
node seed-transcript.mjs
```

### Step 2: Generate a Document

1. Click **"New Document"** in the UI
2. Select transcripts to include
3. Choose document type (e.g., "Investment Guide")
4. Select variant:
   - **Baseline** (1-5 transcripts)
   - **Hybrid** (6-15 transcripts)
   - **Scalable** (16-50+ transcripts)
5. Add custom instructions (optional)
6. Click **"Start Generation"**

### Step 3: Watch Real-time Progress

You'll see:
- 💭 Agent's reasoning in real-time
- 🔧 Tool calls as they execute
- 📊 Progress updates
- ✅ Completion notification

Generation typically takes:
- 3-8 minutes for 1-5 transcripts
- 8-15 minutes for 6-30 transcripts
- 12-25 minutes for 30-50 transcripts

### Step 4: View Generated Document

When complete, you'll see the final document with:
- Full markdown content
- Word count
- Generation analytics
- Cost breakdown

---

## 🏗️ Architecture

### Backend Flow

```
User Request → Express Server → Agent Orchestrator
                                      ↓
                            [Agent makes decisions]
                                      ↓
                            Calls tools autonomously:
                            - read_transcript_chunk
                            - search_transcripts
                            - take_note
                            - create_section
                            - write_section
                            - finalize_document
                                      ↓
                            Stores in PostgreSQL (Supabase)
                                      ↓
                            Streams progress via SSE
```

### Frontend Flow

```
User Interface → API Calls → Backend
                    ↓
            EventSource (SSE) ← Real-time updates
                    ↓
            React Components update in real-time
```

### Database Schema

```
Transcript
├── TranscriptChunk (many)
└── TranscriptMetadata (one)

AgentDocument
├── AgentSection (many)
├── AgentNote (many)
└── AgentToolCall (many)
```

---

## 🔧 Development

### Backend Scripts

```bash
cd backend

# Start dev server with auto-reload
npm run dev

# Generate Prisma client after schema changes
npm run prisma:generate

# Create new migration
npm run prisma:migrate

# Open database browser
npm run prisma:studio
```

### Frontend Scripts

```bash
cd frontend

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Making Schema Changes

1. Edit `backend/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name your_change_name`
3. Run `npx prisma generate`
4. Restart backend server

---

## 📊 API Reference

### Generate Document
```
POST /api/agent-documents/generate
Content-Type: application/json

{
  "transcriptIds": ["uuid1", "uuid2"],
  "documentType": "Investment Guide",
  "variantId": "scalable",
  "preferences": {
    "tone": "professional",
    "customInstructions": "Focus on actionable insights..."
  }
}
```

### Stream Progress (SSE)
```
GET /api/agent-documents/:id/stream
```

### Get Document Status
```
GET /api/agent-documents/:id/status
```

### Get Complete Document
```
GET /api/agent-documents/:id
```

### Get Analytics
```
GET /api/agent-documents/:id/analysis
```

Full API documentation in [AGENTIC_COMPLETE_GUIDE.md](./AGENTIC_COMPLETE_GUIDE.md)

---

## 🧪 Testing

### Test Variant Performance

```bash
cd backend
node test-variants.mjs
```

This runs the same document generation with different variants and compares:
- Tool usage patterns
- Token consumption
- Cost
- Generation time
- Quality metrics

---

## 🔐 Environment Variables

### Backend `.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Supabase PostgreSQL connection string |
| `OPENROUTER_API_KEY` | ✅ | OpenRouter API key for AI model |
| `PORT` | ❌ | Server port (default: 3001) |
| `NODE_ENV` | ❌ | Environment (development/production) |

### Frontend `.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | ❌ | Backend URL (default: http://localhost:3001) |

---

## 💰 Cost Estimates

Uses OpenRouter's `openai/gpt-oss-120b` model:

**Pricing:**
- Input: ~$0.0015 per 1K tokens
- Output: ~$0.002 per 1K tokens

**Typical Costs:**
- 5 transcripts: $1-2
- 15 transcripts: $2-3
- 30 transcripts: $3-5

Much cheaper than Claude Sonnet 4.5 (~$6 for similar output).

---

## 🐛 Troubleshooting

### "Connection refused" on backend
- Check if backend is running on port 3001
- Verify `.env` has correct `PORT`

### "Prisma Client not generated"
```bash
cd backend
npx prisma generate
```

### "Migration failed"
- Check `DATABASE_URL` is correct
- Verify Supabase project is active
- Check network connection to Supabase

### Frontend not connecting to backend
- Check `VITE_API_URL` in `frontend/.env`
- Verify backend is running and accessible
- Check browser console for CORS errors

### "OpenRouter API error"
- Verify `OPENROUTER_API_KEY` is set correctly
- Check API key is valid at https://openrouter.ai
- Ensure you have credits/balance

---

## 📖 Documentation

- **AGENTIC_COMPLETE_GUIDE.md** - Comprehensive system documentation
- **API Reference** - Full endpoint documentation
- **Architecture Guide** - Deep dive into system design

---

## 🎯 Next Steps

1. **Add Transcript Import:**
   - Build API endpoint to import YouTube videos
   - Add podcast RSS feed parsing
   - Implement image OCR transcription

2. **Enhance UI:**
   - Add transcript management page
   - Build document comparison view
   - Add export to PDF/DOCX

3. **Advanced Features:**
   - Multi-user support with authentication
   - Transcript search and filtering
   - Document templates

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🙏 Credits

Extracted from the **Insitek** project - an AI-powered multimedia content analysis platform.

Built with:
- [OpenRouter](https://openrouter.ai) - AI model routing
- [Supabase](https://supabase.com) - PostgreSQL database
- [Prisma](https://prisma.io) - Database ORM
- [React](https://react.dev) - Frontend framework
- [Express](https://expressjs.com) - Backend framework
- [Vite](https://vitejs.dev) - Build tool

---

## 📞 Support

- **Issues**: https://github.com/insitektalay/inkadu/issues
- **Documentation**: See docs/ folder

---

**Status:** ✅ Production Ready - Fully Operational

Enjoy building with Inkadu! 🚀
