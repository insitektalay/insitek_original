/* ===================================================================
   server.js  –  Express backend for Insitek.ai  (ES-module version)
   Works with package.json { "type": "module" }
   =================================================================== */
   import express from "express";
   import cors    from "cors";
   import { exec } from "node:child_process";
   import fs      from "node:fs/promises";
   import { existsSync } from "node:fs";
   import path    from "node:path";
   import { fileURLToPath } from "node:url";
   
   /* ----- meta helpers ---------------------------------------------- */
   console.log(">>> STARTING server.js from", import.meta.url);
   
   const __filename = fileURLToPath(import.meta.url);
   const __dirname  = path.dirname(__filename);
   
   const app  = express();
   const PORT = process.env.PORT || 3001;
   
   app.use(cors());
   app.use(express.json());
   
   /* ==================================================================
      /api/transcribe-youtube  – IMPORT A SINGLE VIDEO
      ================================================================== */
   app.post("/api/transcribe-youtube", (req, res) => {
     const { url } = req.body;
     if (!url) return res.status(400).json({ error: "Missing YouTube URL" });
   
     exec(`bash youtube_transcribe.sh "${url}"`, async (err, stdout) => {
       if (err) {
         console.error(err);
         return res.status(500).json({ error: "Transcription failed" });
       }
   
       const titleLine = stdout.split("\n").find((l) => l.startsWith("TITLE:"));
       const title     = titleLine ? titleLine.replace("TITLE:", "").trim() : "Untitled";
   
       try {
         const transcript = await fs.readFile(
           path.join(process.cwd(), "audio.txt"),
           "utf-8"
         );
         res.json({ title, transcript });
       } catch {
         res.status(500).json({ error: "audio.txt not found" });
       }
     });
   });
   
   /* ==================================================================
      /api/channel-info  – CHECK CHANNEL (count + first/last upload date)
      ================================================================== */
   app.post("/api/channel-info", (req, res) => {
     const { url } = req.body;
     if (!url) return res.status(400).json({ error: "Missing channel URL" });
   
     exec(
       `yt-dlp -s --flat-playlist --print "%(upload_date)s" "${url}"`,
       (err, stdout) => {
         if (err) {
           console.error(err);
           return res.status(500).json({ error: "yt-dlp failed" });
         }
   
         const lines  = stdout.trim().split("\n").filter(Boolean);
         const dates  = lines.filter((d) => /^\d{8}$/.test(d));
         const total  = lines.length;
         const first  = dates.length ? dates.at(-1) : null; // oldest
         const latest = dates.length ? dates[0]     : null; // newest
   
         res.json({ total, firstDate: first, lastDate: latest });
       }
     );
   });
   
   /* ==================================================================
      /api/channel-last-videos  – LIST NEWEST N VIDEO URLs (BULK IMPORT)
      ================================================================== */
   app.post("/api/channel-last-videos", (req, res) => {
     const { url, count = 10 } = req.body;
     if (!url)  return res.status(400).json({ error: "Missing channel URL" });
   
     exec(
       `yt-dlp -s --flat-playlist --print "%(upload_date)s|%(id)s" "${url}"`,
       (err, stdout) => {
         if (err) {
           console.error(err);
           return res.status(500).json({ error: "yt-dlp failed" });
         }
   
         const videos = stdout
           .trim()
           .split("\n")
           .filter(Boolean)
           .map((l) => l.split("|"))                  // [YYYYMMDD, id]
           .sort((a, b) => b[0].localeCompare(a[0])) // newest first
           .slice(0, Number(count))
           .map(([, id]) => `https://youtu.be/${id}`);
   
         res.json({ videos });
       }
     );
   });
   
   /* ==================================================================
      Optional: serve the Vite build from /dist if present
      ================================================================== */
   const webDir = path.join(__dirname, "dist");
   if (existsSync(webDir)) {
     app.use(express.static(webDir));
     app.get("*", (_req, res) =>
       res.sendFile(path.join(webDir, "index.html"))
     );
   }
   
   /* ----- log every registered route (helps catch bad paths) --------- */
   app._router.stack
     .filter((l) => l.route)
     .forEach((l) =>
       console.log(
         "ROUTE",
         Object.keys(l.route.methods)[0].toUpperCase(),
         l.route.path
       )
     );
   
   /* ----- start ------------------------------------------------------ */
   app.listen(PORT, () =>
     console.log(`API listening on http://localhost:${PORT}`)
   );
   