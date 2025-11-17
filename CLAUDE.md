# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Frontend Development:**
- `npm run dev` - Start Vite dev server (React frontend)
- `npm run build` - Build production frontend
- `npm run preview` - Preview production build

**Backend Development:**
- `npm run api` - Start Express backend with nodemon (server.mjs)

**Code Quality:**
- `npm run lint` - Run ESLint
- `npm test` - Run Jest tests with ESM and jsdom environment

**Database:**
- `npx prisma migrate dev` - Apply database migrations
- `npx prisma generate` - Generate Prisma client after schema changes

## Architecture Overview

Insitek is a multimedia content analysis platform that transcribes YouTube videos and podcasts locally using Whisper, then provides AI-powered chat and insight extraction.

**Core Stack:**
- Frontend: React 19 + Vite + Tailwind CSS
- Backend: Express + WebSocket (ws) for real-time progress
- Database: PostgreSQL + Prisma ORM
- Transcription: Local whisper.cpp (no cloud costs)
- Video/Audio: yt-dlp for media extraction

**Key Components:**

1. **UI Architecture:** Modern context-driven architecture in `/src/v2/` with PanelRouter navigation system

2. **Import Pipeline:** 
   - User submits URL → Express spawns shell script → yt-dlp downloads → whisper.cpp transcribes → WebSocket progress updates → Prisma stores result
   - Shell scripts: `youtube_transcribe.sh`, `podcast_transcribe.sh`
   - Progress tracking via `STAGE:` and `PROGRESS:` output parsing

3. **Real-time Communication:**
   - WebSocket server on port 3001 streams import progress
   - Progress format: `{type:"progress", importId, stage, progress}`
   - Fallback polling every 10s when WebSocket disconnected

**Data Models:**
- `Transcript` - Main content (YouTube/Podcast source, text, metadata)
- `Insight` - User-curated notes/quotes extracted from transcripts/chat
- `ImportJob` - Background import task tracking

**Context Architecture:**
- `NavigationContext` - UI routing and sidebar state
- `ChatContext` - Per-transcript chat sessions
- `ImportContext` - Import job management

**Custom Hooks:**
- `useTranscript` - CRUD operations and selection
- `useImport` - Import orchestration with WebSocket progress
- `useAI` - AI prompt suggestions
- `useInsight` - Insight capture and management
- `useInsightExtraction` - Auto-extraction from selected text

**API Endpoints:**
- `/api/transcripts` - CRUD for transcripts
- `/api/transcripts/:id/generate-description` - AI description generation
- `/api/transcribe-youtube` - Single video import with real-time progress
- `/api/channel-info` - Channel metadata extraction
- `/api/channel-last-videos` - Bulk channel imports
- `/api/podcast-feed` - RSS podcast parsing and episode extraction
- `/api/transcribe-podcast` - Podcast episode import
- `/api/insights` - CRUD for insights with folder/tag filtering
- `/api/import-jobs` - Import job status tracking

## Development Guidelines

**Working with Components:**
- Uses PanelRouter for navigation
- All UI components are in `/src/v2/components/ui/`

**Import System:**
- Import progress is tracked via WebSocket - always check both backend spawn process and frontend WebSocket handling
- Shell scripts output `STAGE:` and `PROGRESS:` lines parsed by server.mjs

**Database Changes:**
- Always run `npx prisma generate` after schema changes
- Use `npx prisma migrate dev` for development migrations

**Testing:**
- Jest configured for ESM with jsdom environment and no transpilation
- Tests are located in `__tests__/` directories within component folders
- Run individual tests: `npm test -- path/to/test.js`
- Testing libraries: Jest, supertest, @testing-library/react

## Project-Specific Rules

**Import System Development:**
- Import progress tracking requires coordination between backend spawn process and frontend WebSocket handling
- Shell scripts must output `STAGE:` and `PROGRESS:` lines for proper progress parsing  
- Always test import flows end-to-end with actual URLs to verify WebSocket progress updates

**UI Architecture Guidelines:**
- V2 architecture uses context-driven patterns - avoid mixing V1 imperative patterns
- All new UI components should go in `/src/v2/components/ui/`
- Navigation state should integrate with existing `NavigationContext` and `PanelRouter`

**Database Development:**
- Always run `npx prisma generate` after schema changes, before testing
- Import jobs use `ImportState` enum (PENDING/PROCESSING/DONE/ERROR)
- Transcript model supports both YOUTUBE and PODCAST sources via `TranscriptSource` enum

**Task Management:**
- Project uses Cursor rules for PRD creation and task breakdown (found in `.cursor/rules/`)
- When implementing features, follow the established pattern: PRD → Task List → Implementation  
- Task lists should be saved as `tasks-[feature-name].md` in `/tasks/` directory
- PRDs should be created as `prd-[feature-name].md` in `/tasks/` directory
- Follow completion protocol: mark subtasks complete before parent tasks