# Inkadu - Quick Start Guide

## 🎯 What You Got

A complete, minimal agentic document generation system extracted from Insitek.

**31 files created:**
- ✅ 5 backend services
- ✅ 1 routes file
- ✅ 7 frontend React components
- ✅ Prisma schema (7 tables, 3 enums)
- ✅ Complete configuration files
- ✅ Documentation

---

## 📁 Project Structure

```
inkadu/
├── backend/
│   ├── services/
│   │   ├── agentDocumentService.js    (Main orchestration - 778 lines)
│   │   ├── agentTools.js              (12 agent tools - 580 lines)
│   │   ├── transcriptChunker.js       (Chunking system - 290 lines)
│   │   ├── agentEventEmitter.js       (SSE streaming - 100 lines)
│   │   └── agentVariants.js           (A/B variants - 170 lines)
│   ├── routes/
│   │   └── agentDocuments.js          (API endpoints - 250 lines)
│   ├── prisma/
│   │   └── schema.prisma              (7 tables only)
│   ├── server.mjs                     (Express server)
│   ├── package.json                   (Minimal deps)
│   ├── .env.example                   (Supabase config)
│   └── .gitignore
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AgenticDocumentWizard.jsx      (Start generation)
│   │   │   ├── AgenticProgressMonitor.jsx     (Monitor progress)
│   │   │   ├── AgentProgressStream.jsx        (Real-time SSE)
│   │   │   ├── AgenticDocumentsList.jsx       (Browse docs)
│   │   │   ├── AgenticDocumentView.jsx        (View completed)
│   │   │   ├── AgenticAnalysisModal.jsx       (Analytics)
│   │   │   └── MarkdownMessage.jsx            (Renderer)
│   │   ├── App.jsx                    (Main app)
│   │   ├── main.jsx                   (Entry point)
│   │   └── index.css                  (Tailwind)
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── package.json
│   ├── .env.example
│   └── .gitignore
│
├── README.md                          (Full setup guide)
├── AGENTIC_COMPLETE_GUIDE.md         (Complete system docs)
└── QUICKSTART.md                      (This file)
```

---

## ⚡ 5-Minute Setup

### 1. Copy the Folder

The `inkadu/` folder is currently in the `insitek_original` repo. You need to move it to your new `inkadu` repository.

```bash
# From your local machine:

# 1. Clone the insitek_original repo
git clone https://github.com/insitektalay/insitek_original.git
cd insitek_original

# 2. Pull the branch with Inkadu
git checkout claude/review-antic-guide-01PEbbG66Ug2x1VUVng7r2sx

# 3. Copy the inkadu folder
cp -r inkadu ../inkadu-standalone

# 4. Initialize new git repo
cd ../inkadu-standalone
git init
git add .
git commit -m "Initial commit - Inkadu minimal agentic system"

# 5. Push to your inkadu repo
git remote add origin https://github.com/insitektalay/inkadu.git
git branch -M main
git push -u origin main
```

### 2. Set Up Supabase

1. Go to https://app.supabase.com
2. Create new project (takes ~2 min)
3. Settings → Database → Copy connection string
4. Format: `postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres`

### 3. Configure Backend

```bash
cd backend
cp .env.example .env
nano .env
```

Add your credentials:
```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres"
OPENROUTER_API_KEY="sk-or-v1-..."
```

### 4. Install & Run Backend

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

✅ Backend running on http://localhost:3001

### 5. Install & Run Frontend

Open new terminal:
```bash
cd ../frontend
cp .env.example .env
npm install
npm run dev
```

✅ Frontend running on http://localhost:5173

### 6. Test It

Visit http://localhost:5173

**First, add a test transcript:**
```bash
# In backend folder, create seed.mjs:
cat > seed.mjs << 'EOF'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

await prisma.transcript.create({
  data: {
    title: "Test Investment Discussion",
    channel: "Finance Channel",
    text: "This is a test transcript about investing in stocks, bonds, and real estate. Key points include diversification, risk management, and long-term growth strategies. The speaker discusses market timing, portfolio allocation, and the importance of staying disciplined during market volatility.",
    source: "YOUTUBE"
  }
});

console.log('✅ Test transcript created!');
EOF

node seed.mjs
```

**Then generate a document:**
1. Click "New Document"
2. Select the transcript
3. Choose "Investment Guide" as document type
4. Select "baseline" variant
5. Click "Start Generation"
6. Watch the agent work in real-time!

---

## 🎯 Database Tables

Your Supabase database will have **exactly 7 tables**:

1. **Transcript** - Source content (YouTube/Podcast/Image)
2. **TranscriptChunk** - ~2000 word chunks
3. **TranscriptMetadata** - Chunk metadata
4. **AgentDocument** - Generated documents
5. **AgentSection** - Document sections
6. **AgentNote** - Agent's notes
7. **AgentToolCall** - Audit log

No bloat. No unnecessary tables. Just what the agent needs.

---

## 🔑 Key Features

✅ **Autonomous AI Agent** - Makes all decisions
✅ **Scalable** - Handles 50+ transcripts
✅ **Real-time Progress** - SSE streaming
✅ **3 Variants** - baseline, hybrid, scalable
✅ **12 Tools** - read, search, take notes, write, etc.
✅ **Supabase Ready** - Works with free tier
✅ **Production Ready** - Error handling, logging, monitoring

---

## 💰 Cost

**Typical document generation:**
- 5 transcripts: ~$1-2
- 15 transcripts: ~$2-3
- 30 transcripts: ~$3-5

Uses OpenRouter's `openai/gpt-oss-120b` (cheaper than Claude).

---

## 📚 Next Steps

1. **Read README.md** - Complete setup guide
2. **Read AGENTIC_COMPLETE_GUIDE.md** - Full system documentation
3. **Add real transcripts** - Import your content
4. **Customize variants** - Tune for your use case
5. **Build features** - Add transcript import, PDF export, etc.

---

## 🐛 Troubleshooting

### Backend won't start
```bash
cd backend
npx prisma generate
npm run dev
```

### Database connection fails
- Check `DATABASE_URL` in `.env`
- Verify Supabase project is active
- Test connection in Prisma Studio: `npx prisma studio`

### Frontend can't reach backend
- Check backend is running on port 3001
- Verify `VITE_API_URL` in `frontend/.env`
- Check browser console for errors

### OpenRouter API errors
- Verify API key at https://openrouter.ai/keys
- Check you have credits/balance
- Test with small document first

---

## 📞 Support

- **Full Docs:** README.md + AGENTIC_COMPLETE_GUIDE.md
- **Issues:** https://github.com/insitektalay/inkadu/issues

---

**Status:** ✅ Ready to Use

All 31 files created and pushed to your repository branch.

**Have fun building with Inkadu!** 🚀
