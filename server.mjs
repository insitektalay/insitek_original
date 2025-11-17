/* ===================================================================
   server.mjs  –  Express backend for Insitek.ai with Podcast Support
   =================================================================== */
   import express from "express";
   import cors    from "cors";
   import { exec, spawn } from "node:child_process";
   import fs      from "node:fs/promises";
   import { existsSync } from "node:fs";
   import path    from "node:path";
   import { fileURLToPath } from "node:url";
   import xml2js from "xml2js";
   import { promisify } from "util";
   import { PrismaClient } from '@prisma/client';
   import { WebSocketServer } from 'ws';
   import { createServer } from 'http';
   import { streamText } from 'ai';
   import { createOpenAI } from '@ai-sdk/openai';
   import { initializePrompts, getPrompt } from './server/prompts/loader.js';
   import { jsonrepair } from 'jsonrepair';
   import multer from 'multer';
   import { processImageWithOCR, generateTitleFromContent } from './server/ocr.js';
   import agentDocumentsRouter from './routes/agentDocuments.js';
   import transcriptChunkingRouter from './routes/transcriptChunking.js';
   import { fetchYouTubeTranscript } from './services/youtubeTranscriptService.js';

   const execPromise = promisify(exec);
   const prisma = new PrismaClient();

   // Initialize prompt system
   console.log("🎯 Initializing prompt management system...");
   initializePrompts();
   console.log("✅ Prompts loaded successfully");


/* ----- Global crash handlers to prevent silent failures --------- */
process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION:', error);
  console.error('Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION at:', promise);
  console.error('Reason:', reason);
});
   /* ----- OpenRouter AI client configuration ------------------------ */
   const openrouter = createOpenAI({
     apiKey: process.env.OPENROUTER_API_KEY,
     baseURL: 'https://openrouter.ai/api/v1',
     headers: {
       'HTTP-Referer': 'https://insitek.ai',
       'X-Title': 'Insitek.ai'
     }
   });
   
   /* ----- meta helpers ---------------------------------------------- */
   console.log(">>> STARTING server.mjs from", import.meta.url);
   
   const __filename = fileURLToPath(import.meta.url);
   const __dirname  = path.dirname(__filename);
   
   const app  = express();
   const PORT = process.env.PORT || 3001;
   
   app.use(cors());
   app.use(express.json());

   // Configure multer for image uploads (store in /tmp, max 10 images)
   const upload = multer({
     dest: '/tmp/insitek-uploads/',
     limits: {
       fileSize: 10 * 1024 * 1024, // 10MB per file
       files: 10 // Max 10 files per upload
     },
     fileFilter: (req, file, cb) => {
       const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic'];
       if (allowedTypes.includes(file.mimetype)) {
         cb(null, true);
       } else {
         cb(new Error('Invalid file type. Only JPG, PNG, and HEIC images are allowed.'));
       }
     }
   });

   // Create HTTP server and WebSocket server
   const server = createServer(app);
   const wss = new WebSocketServer({ server });
   
   // Store active WebSocket connections by import session ID
   const activeImports = new Map();
   // Store active import processes for cancellation
   const activeProcesses = new Map();

   wss.on('connection', (ws) => {
     console.log('WebSocket client connected');
     
     ws.on('message', (message) => {
       try {
         const data = JSON.parse(message);
         if (data.type === 'subscribe' && data.importId) {
           console.log(`Client subscribed to import ${data.importId}`);
           activeImports.set(data.importId, ws);
         }
       } catch (e) {
         console.error('Invalid WebSocket message:', e);
       }
     });
     
     ws.on('close', () => {
       console.log('WebSocket client disconnected');
       // Remove from active imports
       for (const [importId, socket] of activeImports.entries()) {
         if (socket === ws) {
           activeImports.delete(importId);
           break;
         }
       }
     });
   });
   
   // Helper function to send progress updates
   async function sendProgress(importId, stage, progress) {
     // Derive ImportJob.state based on stage text
     let derivedState = 'PROCESSING';
     if (stage === 'Completed') {
       derivedState = 'DONE';
     } else if (stage.toLowerCase().startsWith('error')) {
       derivedState = 'ERROR';
     }
   
     // Best-effort DB update (ignore if job doesn't exist)
     try {
       await prisma.importJob.update({
         where: { id: importId },
         data: {
           state: derivedState,
           progress
         }
       });
     } catch (e) {
       // Ignore not found errors – job may not have been created yet
     }
   
     // Broadcast to any subscribed WebSocket client
     const ws = activeImports.get(importId);
     if (ws && ws.readyState === 1) { // WebSocket.OPEN
       ws.send(JSON.stringify({
         type: 'progress',
         importId,
         stage,
         progress
       }));
     }
   }

   /* ─────────────────────────────────────────────────────────────────────
      generateTranscriptSummary – Generate AI summary using OpenRouter
      ───────────────────────────────────────────────────────────────────── */
   async function generateTranscriptSummary(transcriptText, title, channel) {
     try {
       // Check if OpenRouter is configured
       if (!process.env.OPENROUTER_API_KEY) {
         console.warn("⚠️ OPENROUTER_API_KEY not configured, skipping summary generation");
         return null;
       }

       console.log(`🤖 Generating summary for: ${title}`);

       // Prepare prompt for summary generation
       const prompt = `You are a professional content summarizer. Please provide a detailed summary (500-1000 words) of the following transcript.

Title: ${title}
Channel/Source: ${channel}

Focus on:
- Main topics and key points discussed
- Important insights and takeaways
- Notable quotes or statements
- Overall structure and flow of the content

Transcript:
${transcriptText}

Please provide a comprehensive summary:`;

       // Call OpenRouter API directly with fetch (AI SDK was hanging)
      // Call OpenRouter API with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 180 second timeout (3 minutes for large transcripts)
      
      let response;
      try {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://insitek.ai',
            'X-Title': 'Insitek.ai'
          },
          body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.5,
            max_tokens: 1500
          }),
          signal: controller.signal
        });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Summary generation timed out after 180 seconds');
        }
        throw fetchError;
      } finally {
        clearTimeout(timeoutId);
      }

       if (!response.ok) {
         throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
       }

       const data = await response.json();

       console.log('🔍 DEBUG 1: Raw OpenRouter response data:', JSON.stringify(data, null, 2));
       console.log('🔍 DEBUG 2: data.choices exists?', !!data.choices);
       console.log('🔍 DEBUG 3: data.choices length:', data.choices?.length);
       console.log('🔍 DEBUG 4: First choice:', JSON.stringify(data.choices?.[0], null, 2));

       const c0 = data.choices?.[0] ?? {};
       const message = c0.message ?? {};

       console.log('🔍 DEBUG 5: message object:', JSON.stringify(message, null, 2));
       console.log('🔍 DEBUG 6: message.content:', message.content);
       console.log('🔍 DEBUG 7: message.reasoning:', message.reasoning);
       console.log('🔍 DEBUG 8: All message keys:', Object.keys(message));
       console.log('🔍 DEBUG 8a: data.output_text:', data.output_text);
       console.log('🔍 DEBUG 8b: choices[0].text:', c0.text);

       // Try multiple well-known response slots in order of likelihood
       // Reasoning models and different providers use different fields
       const candidates = [
         // Standard chat completion format
         typeof message.content === 'string' ? message.content : null,
         // Reasoning models (OpenAI o1, etc.)
         typeof message.reasoning === 'string' ? message.reasoning : null,
         // OpenRouter convenience field
         typeof data.output_text === 'string' ? data.output_text : null,
         // Some providers return text at choice level
         typeof c0.text === 'string' ? c0.text : null,
         // Array-based content chunks (some chat formats)
         Array.isArray(message.content)
           ? message.content.map(p => p?.text).filter(Boolean).join('')
           : null,
       ].filter(Boolean);

       const summary = (candidates[0] || '').trim();

       console.log('🔍 DEBUG 9: Candidates found:', candidates.length);
       console.log('🔍 DEBUG 10: Final summary length:', summary.length);
       console.log('🔍 DEBUG 11: Final summary truthy?', !!summary);
       console.log('🔍 DEBUG 12: Which field was used?', candidates.length > 0 ? 'one of the candidates' : 'none');

       if (!summary || summary.length === 0) {
         console.error('❌ Summary generation returned empty response');
         console.error('❌ No valid text found in any known response field');
         console.error('❌ Keys seen:', {
           topLevel: Object.keys(data || {}),
           choiceKeys: Object.keys(c0 || {}),
           messageKeys: Object.keys(message || {})
         });
         return null;
       }

       console.log(`✅ Summary generated (${summary.length} characters)`);
       console.log(`✅ First 200 chars of summary: ${summary.substring(0, 200)}...`);
       return summary.trim();

     } catch (error) {
       console.error("❌ Error generating summary:", error.message);
       // Return null on error - don't block import process
       return null;
     }
   }

   // Flag to track if queue processing is already running
   let queueProcessing = false;
   let queueHealthCheckInterval = null;

   // Process import queue - called after bulk-import creates jobs
   async function processImportQueue() {
     // Prevent multiple instances from running simultaneously
     if (queueProcessing) {
       console.log('[Queue] Already processing, skipping');
       return;
     }

     queueProcessing = true;
     console.log('[Queue] Starting import queue processing');

     let jobsProcessed = 0;
     let jobsSucceeded = 0;
     let jobsFailed = 0;

     try {
       while (true) {
         let job = null;

         try {
           // Get the next pending job
           job = await prisma.importJob.findFirst({
             where: { state: 'PENDING' },
             orderBy: { createdAt: 'asc' }
           });

           if (!job) {
             console.log(`[Queue] No more pending jobs (processed ${jobsProcessed}, succeeded ${jobsSucceeded}, failed ${jobsFailed})`);
             break;
           }

           console.log(`[Queue] Processing job ${jobsProcessed + 1}: ${job.id} - ${job.url}`);

           // Update job to PROCESSING
           await prisma.importJob.update({
             where: { id: job.id },
             data: { state: 'PROCESSING', progress: 0 }
           });

           // Process the video - spawn the transcription script
           await processVideo(job);

           jobsProcessed++;
           jobsSucceeded++;
           console.log(`[Queue] ✅ Job ${job.id} completed successfully (${jobsSucceeded}/${jobsProcessed})`);

         } catch (error) {
           jobsProcessed++;
           jobsFailed++;

           if (job) {
             console.error(`[Queue] ❌ Error processing job ${job.id}:`, error.message);

             // Try to update job to ERROR state
             try {
               await prisma.importJob.update({
                 where: { id: job.id },
                 data: {
                   state: 'ERROR',
                   error: error.message,
                   progress: 100
                 }
               });
             } catch (updateError) {
               console.error(`[Queue] Failed to update job ${job.id} to ERROR state:`, updateError.message);
             }
           } else {
             console.error('[Queue] ❌ Error fetching next job:', error.message);
             // Wait a bit before retrying if database query failed
             await new Promise(resolve => setTimeout(resolve, 5000));
           }
         }

         // Small delay between jobs
         await new Promise(resolve => setTimeout(resolve, 1000));
       }
     } catch (fatalError) {
       console.error('[Queue] ⚠️ Fatal error in queue processing loop:', fatalError);
     } finally {
       queueProcessing = false;
       console.log(`[Queue] Queue processing finished - Total: ${jobsProcessed}, Succeeded: ${jobsSucceeded}, Failed: ${jobsFailed}`);
     }
   }

   // Process a single video import job
   async function processVideo(job) {
     return new Promise(async (resolve, reject) => {
       console.log('[Queue] Starting video transcription for:', job.url);

       // === NEW: Try to fetch existing transcript first ===
       try {
         await prisma.importJob.update({
           where: { id: job.id },
           data: { progress: 5 }
         });
       } catch (err) {
         console.error('[Queue] Failed to update progress:', err);
       }

       const fetchedTranscript = await fetchYouTubeTranscript(job.url);

       if (fetchedTranscript) {
         console.log('[Queue] Transcript fetched successfully, saving to database');
         try {
           // Update progress
           await prisma.importJob.update({
             where: { id: job.id },
             data: { progress: 50 }
           });

           // Save directly to database
           const savedTranscript = await prisma.transcript.create({
             data: {
               youtubeId: fetchedTranscript.youtubeId,
               title: fetchedTranscript.title,
               channel: fetchedTranscript.channel,
               channelId: fetchedTranscript.channelId,
               text: fetchedTranscript.text,
               segments: fetchedTranscript.segments,
               publishDate: fetchedTranscript.publishDate,
               source: 'YOUTUBE',
               sourceUrl: job.url
             }
           });

           console.log('[Queue] Saved fetched transcript to database:', savedTranscript.id);

           // Update progress
           await prisma.importJob.update({
             where: { id: job.id },
             data: { progress: 75 }
           });

           // Generate AI summary
           console.log('[Queue] Generating AI summary...');
           let summaryWarning = null;
           try {
             const summary = await generateTranscriptSummary(fetchedTranscript.text, fetchedTranscript.title, fetchedTranscript.channel);
             if (summary) {
               await prisma.transcript.update({
                 where: { id: savedTranscript.id },
                 data: { summary }
               });
               console.log('[Queue] ✅ Summary saved to database');
             } else {
               summaryWarning = '⚠️ Transcript imported successfully, but summary generation returned empty.';
               console.warn('[Queue] ⚠️ Summary generation failed or skipped');
             }
           } catch (summaryError) {
             console.error('[Queue] ❌ Summary generation error:', summaryError);
             summaryWarning = `⚠️ Transcript imported, but summary failed: ${summaryError.message}`;
           }

           // Mark job as complete
           await prisma.importJob.update({
             where: { id: job.id },
             data: {
               state: 'DONE',
               progress: 100,
               error: summaryWarning
             }
           });

           console.log('[Queue] 🎉 Import completed successfully via transcript fetch!');
           resolve();
           return;

         } catch (dbError) {
           console.error('[Queue] Database error saving fetched transcript:', dbError);

           // Handle duplicate
           if (dbError.code === 'P2002') {
             console.log('[Queue] Duplicate video detected.');
             try {
               const existing = await prisma.transcript.findFirst({
                 where: { youtubeId: fetchedTranscript.youtubeId }
               });
               if (existing && (!existing.summary || !existing.summary.trim())) {
                 console.log('[Queue] Backfilling summary for existing transcript...');
                 const summary = await generateTranscriptSummary(fetchedTranscript.text, fetchedTranscript.title, fetchedTranscript.channel);
                 if (summary) {
                   await prisma.transcript.update({
                     where: { id: existing.id },
                     data: { summary }
                   });
                   console.log('[Queue] ✅ Backfilled summary');
                 }
               }

               await prisma.importJob.update({
                 where: { id: job.id },
                 data: {
                   state: 'DONE',
                   progress: 100,
                   error: 'Video already imported'
                 }
               });

               resolve();
               return;
             } catch (backfillError) {
               console.error('[Queue] Error during duplicate handling:', backfillError);
             }
           }

           // For other errors, fall back to shell script
           console.log('[Queue] ⚠️ Falling back to local transcription due to database error');
         }
       } else {
         console.log('[Queue] ⚠️ No transcript available or fetch failed, falling back to local transcription');
       }

       // === FALLBACK: Run the bash script ===
       const scriptProcess = spawn('bash', ['youtube_transcribe.sh', job.url], {
         stdio: ['ignore', 'pipe', 'pipe']
       });

       // Store the process for potential cancellation
       activeProcesses.set(job.id, scriptProcess);

       let scriptOutput = '';
       let currentStage = 'Starting';
       let currentProgress = 0;

       scriptProcess.stdout.on('data', (data) => {
         const output = data.toString();
         scriptOutput += output;

         const lines = output.split('\n');
         for (const line of lines) {
           if (line.startsWith('STAGE:')) {
             currentStage = line.replace('STAGE:', '').trim();
             console.log(`[Queue] [${job.id}] Stage: ${currentStage}`);
           } else if (line.startsWith('PROGRESS:')) {
             currentProgress = parseInt(line.replace('PROGRESS:', '').trim());
             console.log(`[Queue] [${job.id}] Progress: ${currentProgress}%`);
           }
         }

         // Update job progress in database
         prisma.importJob.update({
           where: { id: job.id },
           data: { progress: currentProgress }
         }).catch(err => console.error('[Queue] Failed to update progress:', err));
       });

       scriptProcess.stderr.on('data', (data) => {
         const stderrOutput = data.toString();
         console.error(`[Queue] [${job.id}] stderr:`, stderrOutput);
       });

       scriptProcess.on('close', async (code) => {
         // Clean up the process from the map
         activeProcesses.delete(job.id);

         console.log(`[Queue] [${job.id}] Process exited with code ${code}`);

         if (code === 0) {
           // Success - now parse output and save to database
          // Declare variables outside try block so they're available in catch block
          let title = null;
          let channel = null;
          let youtubeId = null;
           try {
             console.log('[Queue] Parsing script output for:', job.id);
             const lines = scriptOutput.split('\n');

             // Parse the script output
             const fileLine = lines.find((l) => l.startsWith('FILE:'));
             const jsonLine = lines.find((l) => l.startsWith('JSON:'));
             const titleLine = lines.find((l) => l.startsWith('TITLE:'));
             const channelLine = lines.find((l) => l.startsWith('CHANNEL:') && !l.startsWith('CHANNEL_ID:'));
             const channelIdLine = lines.find((l) => l.startsWith('CHANNEL_ID:'));
             const publishLine = lines.find((l) => l.startsWith('PUBLISH:'));

             if (!fileLine) {
               throw new Error('No FILE: line found in script output');
             }

             // Extract values
             const filename = fileLine.replace('FILE:', '').trim();
             const jsonFilename = jsonLine ? jsonLine.replace('JSON:', '').trim() : null;
             title = titleLine ? titleLine.replace('TITLE:', '').trim() : 'Untitled';
             channel = channelLine ? channelLine.replace('CHANNEL:', '').trim() : 'Unknown';
             const channelId = channelIdLine ? channelIdLine.replace('CHANNEL_ID:', '').trim() : null;
             const publishDateStr = publishLine ? publishLine.replace('PUBLISH:', '').trim() : null;

             // Extract YouTube ID from the filename (yt_ABC123.txt -> ABC123)
             youtubeId = filename.replace('yt_', '').replace('.txt', '');

             // Read the transcript text file
             const transcriptPath = path.join(process.cwd(), filename);
             console.log('[Queue] Reading transcript from:', transcriptPath);
             const transcript = await fs.readFile(transcriptPath, 'utf-8');

             // Read the JSON file with timestamps (if exists)
             let segments = null;
             if (jsonFilename) {
               try {
                 const jsonPath = path.join(process.cwd(), jsonFilename);
                 const jsonData = await fs.readFile(jsonPath, 'utf-8');
                 const parsed = JSON.parse(jsonData);
                 segments = parsed.transcription || parsed.segments || null;
               } catch (jsonError) {
                 console.warn('[Queue] Failed to read/parse JSON file:', jsonError.message);
               }
             }

             // Parse publish date
             let publishDate = null;
             if (publishDateStr) {
               publishDate = new Date(publishDateStr);
               if (isNaN(publishDate.getTime())) {
                 publishDate = null;
               }
             }

            // Check if transcript already exists (handles server restart edge case)
            const existingTranscript = await prisma.transcript.findFirst({
              where: { youtubeId }
            });

            if (existingTranscript) {
              console.log(`[Queue] [${job.id}] Transcript exists (youtubeId: ${youtubeId}). Checking summary...`);
              let summaryWarning = null;

              if (!existingTranscript.summary || !existingTranscript.summary.trim()) {
                console.log(`[Queue] [${job.id}] No summary present. Generating now...`);
                try {
                  const summary = await generateTranscriptSummary(transcript, title, channel);
                  if (summary) {
                    await prisma.transcript.update({
                      where: { id: existingTranscript.id },
                      data: { summary }
                    });
                    console.log(`[Queue] [${job.id}] ✅ Backfilled summary for existing transcript`);
                  } else {
                    console.warn(`[Queue] [${job.id}] ⚠️ Summary generation returned empty for existing transcript`);
                    summaryWarning = 'Transcript existed; summary generation returned empty.';
                  }
                } catch (summaryError) {
                  console.error(`[Queue] [${job.id}] ❌ Summary backfill error:`, summaryError);
                  summaryWarning = `Transcript existed; summary failed: ${summaryError.message}`;
                }
              } else {
                console.log(`[Queue] [${job.id}] Summary already present (${existingTranscript.summary.length} chars). Skipping generation.`);
              }

              await prisma.importJob.update({
                where: { id: job.id },
                data: {
                  state: 'DONE',
                  progress: 100,
                  error: summaryWarning
                }
              });
              resolve();
              return;
            }

             // Save to database
             const savedTranscript = await prisma.transcript.create({
               data: {
                 youtubeId,
                 title,
                 channel,
                 channelId,
                 text: transcript,
                 segments: segments, // Prisma Json type handles serialization automatically
                 publishDate,
                 source: 'YOUTUBE',
                 sourceUrl: job.url
               }
             });

             console.log('[Queue] Transcript saved to database:', savedTranscript.id);
            console.log(`[processVideo] [${job.id}] ✓ CHECKPOINT 2: Transcript saved, starting summary generation`);

            // Generate AI summary using OpenRouter
            console.log('[Queue] Generating AI summary...');
            let summaryWarning = null;
            try {
              const summary = await generateTranscriptSummary(transcript, title, channel);
              console.log(`[Queue] 🔍 Summary returned: ${summary ? summary.length : 0} chars, type: ${typeof summary}, truthy: ${!!summary}`);
              console.log(`[Queue] 🔍 savedTranscript.id = ${savedTranscript.id}`);

              if (summary) {
                console.log(`[Queue] 🔍 About to update transcript ${savedTranscript.id} with summary...`);
                const updateResult = await prisma.transcript.update({
                  where: { id: savedTranscript.id },
                  data: { summary }
                });
                console.log(`[Queue] 🔍 Update result:`, updateResult ? 'success' : 'failed');

                // Verify the save worked
                const verification = await prisma.transcript.findUnique({
                  where: { id: savedTranscript.id },
                  select: { id: true, summary: true }
                });
                console.log(`[Queue] 🔍 Verification: summary exists = ${!!verification?.summary}, length = ${verification?.summary?.length || 0}`);
                console.log('[Queue] ✅ Summary saved to database');
              } else {
                summaryWarning = '⚠️ Transcript imported successfully, but summary generation returned empty. Please check OpenRouter API configuration.';
                console.warn('[Queue] ⚠️ Summary generation failed or skipped');
              }
            } catch (summaryError) {
              console.error('[Queue] ❌ Summary generation error:', summaryError);
              summaryWarning = `⚠️ Transcript imported, but summary failed: ${summaryError.message}`;
              // Log additional error details for debugging
              if (summaryError.cause) {
                console.error('[Queue] Error cause:', summaryError.cause);
              }
              if (summaryError.stack) {
                console.error('[Queue] Error stack:', summaryError.stack);
              }
            }

            console.log(`[processVideo] [${job.id}] ✓ CHECKPOINT 3: Summary complete, marking job as DONE`);

            // Try to update ImportJob, but handle case where it was already deleted
            try {
              await prisma.importJob.update({
                where: { id: job.id },
                data: {
                  state: 'DONE',
                  progress: 100,
                  error: summaryWarning // Store warning in error field for DONE jobs
                }
              });
            } catch (updateError) {
              if (updateError.code === 'P2025') {
                console.warn(`[processVideo] [${job.id}] ImportJob record no longer exists (may have been cancelled/deleted), but transcript was saved successfully`);
              } else {
                console.error(`[processVideo] [${job.id}] Failed to update ImportJob to DONE state:`, updateError);
                throw updateError; // Re-throw non-P2025 errors
              }
            }

            console.log(`[processVideo] [${job.id}] ✓ CHECKPOINT 4: Job completed successfully`);
            resolve();
          } catch (error) {
            // CRITICAL ERROR HANDLER - catches any unhandled errors in processVideo
            console.error(`[processVideo] [${job.id}] ❌ CRITICAL: Unhandled error in processVideo:`, error);
            console.error(`[processVideo] [${job.id}] Error message:`, error.message);
            console.error(`[processVideo] [${job.id}] Error stack:`, error.stack);
            if (error.cause) {
              console.error(`[processVideo] [${job.id}] Error cause:`, error.cause);
            }
            console.error(`[Queue] [${job.id}] Error processing import:`, error);
            
            // Create detailed error message
            let errorMessage = error.message;
            if (error.message.includes('Unique constraint failed')) {
              errorMessage = `Duplicate video: This video (${title || youtubeId}) has already been imported. ` +
                            `If you see this error, it may be due to a server restart during import. ` +
                            `The video is already in your library.`;
            } else if (error.code === 'ECONNRESET' || error.cause?.code === 'ECONNRESET') {
              errorMessage = `Network error: Connection lost while processing "${title || job.url}". ` +
                            `This is usually temporary. Try importing again.`;
            } else {
              errorMessage = `Failed to import "${title || job.url}": ${error.message}`;
            }

            // Try to update ImportJob, but handle case where it was already deleted
            try {
              await prisma.importJob.update({
                where: { id: job.id },
                data: {
                  state: 'ERROR',
                  error: errorMessage,
                  progress: 100
                }
              });
            } catch (updateError) {
              if (updateError.code === 'P2025') {
                console.warn(`[processVideo] [${job.id}] ImportJob record no longer exists (may have been cancelled/deleted)`);
              } else {
                console.error(`[processVideo] [${job.id}] Failed to update ImportJob to ERROR state:`, updateError);
              }
            }
            reject(error);
          }
         } else {
           // Error
           await prisma.importJob.update({
             where: { id: job.id },
             data: {
               state: 'ERROR',
               error: `Script exited with code ${code}`,
               progress: 100
             }
           });
           reject(new Error(`Script exited with code ${code}`));
         }
       });

       scriptProcess.on('error', async (error) => {
         console.error(`[Queue] [${job.id}] Process error:`, error);
         activeProcesses.delete(job.id);

         await prisma.importJob.update({
           where: { id: job.id },
           data: {
             state: 'ERROR',
             error: error.message,
             progress: 100
           }
         });
         reject(error);
       });
     });
   }

   // Queue health monitor - checks for orphaned pending jobs every 30s
   async function queueHealthCheck() {
     try {
       // Check if there are pending jobs
       const pendingCount = await prisma.importJob.count({
         where: { state: 'PENDING' }
       });

       // If there are pending jobs but queue isn't running, restart it
       if (pendingCount > 0 && !queueProcessing) {
         console.log(`[Health] Found ${pendingCount} pending jobs with queue not running - restarting queue`);
         processImportQueue().catch(err => {
           console.error('[Health] Error restarting queue:', err);
         });
       }
     } catch (error) {
       console.error('[Health] Error in health check:', error.message);
     }
   }

   // Start health monitoring
   function startQueueHealthMonitoring() {
     if (queueHealthCheckInterval) {
       clearInterval(queueHealthCheckInterval);
     }

     console.log('[Health] Starting queue health monitoring (check every 30s)');
     queueHealthCheckInterval = setInterval(queueHealthCheck, 30000); // Check every 30 seconds
   }

   /* ==================================================================
      /api/transcripts - GET ALL TRANSCRIPTS
      ================================================================== */
   app.get("/api/transcripts", async (req, res) => {
     try {
       const transcripts = await prisma.transcript.findMany({
         orderBy: { importedAt: 'desc' },
         select: {
           id: true,
           title: true,
           channel: true,
           channelId: true,
           channelAvatarUrl: true,
           publishDate: true,
           importedAt: true,
           source: true,
           description: true,
           summary: true,
           sourceUrl: true,
         }
       });
       res.json(transcripts);
     } catch (error) {
       console.error("Error fetching transcripts:", error);
       res.status(500).json({ error: "Failed to fetch transcripts" });
     }
   });
   
   /* ==================================================================
      /api/transcripts/:id - GET SINGLE TRANSCRIPT
      ================================================================== */
   app.get("/api/transcripts/:id", async (req, res) => {
     try {
       const transcript = await prisma.transcript.findUnique({
         where: { id: req.params.id }
       });
       
       if (!transcript) {
         return res.status(404).json({ error: "Transcript not found" });
       }
       
       res.json(transcript);
     } catch (error) {
       console.error("Error fetching transcript:", error);
       res.status(500).json({ error: "Failed to fetch transcript" });
     }
   });
   
   /* ==================================================================
      /api/transcripts/:id - DELETE TRANSCRIPT
      ================================================================== */
   app.delete("/api/transcripts/:id", async (req, res) => {
     try {
       // Fetch transcript first to get info for ImportJob matching
       const transcript = await prisma.transcript.findUnique({
         where: { id: req.params.id }
       });

       if (!transcript) {
         return res.status(404).json({ error: "Transcript not found" });
       }

       // Delete the transcript
       await prisma.transcript.delete({
         where: { id: req.params.id }
       });

       console.log(`🗑️ Deleted transcript ${req.params.id}, now cleaning up ImportJobs`);

       // Find and delete matching ImportJobs
       let deletedJobs = 0;
       let killedProcesses = 0;

       if (transcript.source === 'YOUTUBE' && transcript.youtubeId) {
         // Match YouTube videos by ID in URL
         const jobs = await prisma.importJob.findMany({
           where: {
             url: {
               contains: transcript.youtubeId
             }
           }
         });

         console.log(`Found ${jobs.length} ImportJobs matching youtubeId: ${transcript.youtubeId}`);

         // Kill active processes
         for (const job of jobs) {
           const process = activeProcesses.get(job.id);
           if (process) {
             try {
               process.kill('SIGTERM');
               activeProcesses.delete(job.id);
               activeImports.delete(job.id);
               killedProcesses++;
               console.log(`Killed process for job ${job.id}`);
             } catch (killError) {
               console.error(`Failed to kill process for job ${job.id}:`, killError);
             }
           }
         }

         // Delete jobs
         const deleteResult = await prisma.importJob.deleteMany({
           where: {
             url: {
               contains: transcript.youtubeId
             }
           }
         });
         deletedJobs = deleteResult.count;
       } else if (transcript.sourceUrl) {
         // Match podcasts by exact URL
         const jobs = await prisma.importJob.findMany({
           where: { url: transcript.sourceUrl }
         });

         console.log(`Found ${jobs.length} ImportJobs matching sourceUrl: ${transcript.sourceUrl}`);

         // Kill active processes
         for (const job of jobs) {
           const process = activeProcesses.get(job.id);
           if (process) {
             try {
               process.kill('SIGTERM');
               activeProcesses.delete(job.id);
               activeImports.delete(job.id);
               killedProcesses++;
               console.log(`Killed process for job ${job.id}`);
             } catch (killError) {
               console.error(`Failed to kill process for job ${job.id}:`, killError);
             }
           }
         }

         // Delete jobs
         const deleteResult = await prisma.importJob.deleteMany({
           where: { url: transcript.sourceUrl }
         });
         deletedJobs = deleteResult.count;
       }

       console.log(`✅ Deleted transcript + ${deletedJobs} ImportJobs, killed ${killedProcesses} processes`);

       res.json({
         success: true,
         deletedImportJobs: deletedJobs,
         killedProcesses: killedProcesses
       });
     } catch (error) {
       if (error.code === 'P2025') {
         return res.status(404).json({ error: "Transcript not found" });
       }
       console.error("Error deleting transcript:", error);
       res.status(500).json({ error: "Failed to delete transcript" });
     }
   });

   /* ==================================================================
      /api/transcripts/:id/avatar - UPDATE CHANNEL AVATAR URL
      ================================================================== */
   app.patch("/api/transcripts/:id/avatar", async (req, res) => {
     try {
       const { channelAvatarUrl } = req.body;

       if (!channelAvatarUrl) {
         return res.status(400).json({ error: "channelAvatarUrl is required" });
       }

       const transcript = await prisma.transcript.update({
         where: { id: req.params.id },
         data: { channelAvatarUrl }
       });

       res.json(transcript);
     } catch (error) {
       if (error.code === 'P2025') {
         return res.status(404).json({ error: "Transcript not found" });
       }
       console.error("Error updating transcript avatar:", error);
       res.status(500).json({ error: "Failed to update transcript avatar" });
     }
   });

   /* ==================================================================
   /api/transcribe-youtube  – IMPORT A SINGLE VIDEO WITH REAL-TIME PROGRESS
   ================================================================== */
   app.post("/api/transcribe-youtube", async (req, res) => {
     const { url, importId } = req.body;
     if (!url) return res.status(400).json({ error: "Missing YouTube URL" });
     if (!importId) return res.status(400).json({ error: "Missing import ID" });

     console.log("🚀 Starting transcription for URL:", url, "Import ID:", importId);

     // Start the import process immediately and return
     res.json({ importId, status: "started" });

     // === NEW: Try to fetch existing transcript first ===
     sendProgress(importId, 'Checking for existing transcript', 5);
     const fetchedTranscript = await fetchYouTubeTranscript(url);

     if (fetchedTranscript) {
       console.log("✅ Transcript fetched successfully, saving to database");
       try {
         // Save directly to database
         sendProgress(importId, 'Saving transcript', 50);

         const savedTranscript = await prisma.transcript.create({
           data: {
             youtubeId: fetchedTranscript.youtubeId,
             title: fetchedTranscript.title,
             channel: fetchedTranscript.channel,
             channelId: fetchedTranscript.channelId,
             text: fetchedTranscript.text,
             segments: fetchedTranscript.segments,
             publishDate: fetchedTranscript.publishDate,
             source: 'YOUTUBE',
             sourceUrl: url
           }
         });

         console.log("✅ Saved fetched transcript to database with ID:", savedTranscript.id);

         // Update any QueueVideo records
         try {
           const updatedQueueVideos = await prisma.queueVideo.updateMany({
             where: {
               youtubeId: fetchedTranscript.youtubeId,
               transcriptId: null
             },
             data: {
               transcriptId: savedTranscript.id,
               importedAt: new Date()
             }
           });
           if (updatedQueueVideos.count > 0) {
             console.log(`✅ Updated ${updatedQueueVideos.count} queue video(s)`);
           }
         } catch (queueErr) {
           console.warn("⚠️ Failed to update queue videos:", queueErr.message);
         }

         // Generate AI summary
         sendProgress(importId, 'Generating summary', 75);
         console.log("📝 Generating AI summary...");
         const summary = await generateTranscriptSummary(fetchedTranscript.text, fetchedTranscript.title, fetchedTranscript.channel);
         if (summary) {
           await prisma.transcript.update({
             where: { id: savedTranscript.id },
             data: { summary }
           });
           console.log("✅ Summary saved to database");
         }

         sendProgress(importId, 'Completed', 100);
         console.log("🎉 Import completed successfully via transcript fetch!");

         // Clean up
         setTimeout(() => {
           activeImports.delete(importId);
         }, 5000);

         return; // Exit early, don't run shell script

       } catch (dbError) {
         console.error("❌ Database error saving fetched transcript:", dbError);

         // Handle duplicate
         if (dbError.code === 'P2002') {
           console.log('[Import] Duplicate video detected. Checking for summary backfill...');
           try {
             const existing = await prisma.transcript.findFirst({
               where: { youtubeId: fetchedTranscript.youtubeId }
             });
             if (existing && (!existing.summary || !existing.summary.trim())) {
               console.log(`[Import] Backfilling summary for ${existing.id}...`);
               const summary = await generateTranscriptSummary(fetchedTranscript.text, fetchedTranscript.title, fetchedTranscript.channel);
               if (summary) {
                 await prisma.transcript.update({
                   where: { id: existing.id },
                   data: { summary }
                 });
                 console.log(`[Import] ✅ Backfilled summary for duplicate transcript`);
                 sendProgress(importId, 'Completed (existing video, summary added)', 100);
               } else {
                 sendProgress(importId, 'Completed (existing video, no summary)', 100);
               }
             } else if (existing) {
               console.log(`[Import] Duplicate transcript already has summary; skipping.`);
               sendProgress(importId, 'Completed (video already imported)', 100);
             }
           } catch (backfillError) {
             console.error('[Import] ❌ Error during summary backfill:', backfillError);
             sendProgress(importId, 'Completed (existing video, backfill failed)', 100);
           }

           // Clean up
           setTimeout(() => {
             activeImports.delete(importId);
           }, 5000);

           return;
         }

         // For other errors, fall back to shell script
         console.log("⚠️ Falling back to local transcription due to database error");
       }
     } else {
       console.log("⚠️ No transcript available or fetch failed, falling back to local transcription");
     }

     // === FALLBACK: Run the bash script with spawn for real-time output ===
     sendProgress(importId, 'Downloading video', 10);
     const scriptProcess = spawn('bash', ['youtube_transcribe.sh', url], {
       stdio: ['ignore', 'pipe', 'pipe']
     });

     // Store the process for potential cancellation
     activeProcesses.set(importId, scriptProcess);

     let scriptOutput = '';
     let currentStage = 'Starting';
     let currentProgress = 0;

     // Send initial progress
     sendProgress(importId, currentStage, currentProgress);
   
     scriptProcess.stdout.on('data', (data) => {
       const output = data.toString();
       scriptOutput += output;

       const lines = output.split('\n');
       for (const line of lines) {
         if (line.startsWith('STAGE:')) {
           currentStage = line.replace('STAGE:', '').trim();
           sendProgress(importId, currentStage, currentProgress);
           console.log(`📍 Stage: ${currentStage}`);
         } else if (line.startsWith('PROGRESS:')) {
           currentProgress = parseInt(line.replace('PROGRESS:', '').trim());
           sendProgress(importId, currentStage, currentProgress);
           console.log(`📊 Progress: ${currentProgress}%`);
         } else if (line.startsWith('HEARTBEAT:')) {
           // Heartbeat to keep connection alive and show process is running
           const heartbeatProgress = parseInt(line.replace('HEARTBEAT:', '').trim());
           sendProgress(importId, currentStage || 'Processing', heartbeatProgress || currentProgress);
           console.log(`💓 Heartbeat: ${currentStage} ${heartbeatProgress || currentProgress}%`);
         } else if (line.startsWith('DEBUG:')) {
           console.log(`🐛 Debug: ${line.replace('DEBUG:', '').trim()}`);
         }
       }
     });
   
     scriptProcess.stderr.on('data', (data) => {
       const stderrOutput = data.toString();
       console.error('Script stderr:', stderrOutput);

       // Parse stderr for useful information
       const lines = stderrOutput.split('\n');
       for (const line of lines) {
         // Check for specific error patterns
         if (line.includes('ERROR:') || line.toLowerCase().includes('error:')) {
           const errorMsg = line.replace(/^.*ERROR:/i, 'Error:').trim();
           sendProgress(importId, errorMsg.substring(0, 100), currentProgress);
         }
         // Check for download speed/ETA info from yt-dlp
         else if (line.includes('ETA') && line.includes('at')) {
           // Extract useful info like "at 1.2MiB/s ETA 00:15"
           const speedMatch = line.match(/at\s+([\d.]+\s*[KMG]iB\/s)/);
           const etaMatch = line.match(/ETA\s+([\d:]+)/);
           if (speedMatch || etaMatch) {
             const info = [
               speedMatch ? speedMatch[1] : null,
               etaMatch ? `ETA ${etaMatch[1]}` : null
             ].filter(Boolean).join(' - ');
             console.log(`📥 Download info: ${info}`);
           }
         }
       }
     });
   
     scriptProcess.on('close', async (code) => {
       // Clean up the process from the map
       activeProcesses.delete(importId);

       if (code !== 0) {
         console.error("❌ Shell script failed with code:", code);

         // Provide more specific error messages based on exit code
         let errorMessage = 'Error: Import failed';
         if (code === 1) {
           errorMessage = 'Error: Download or transcription failed';
         } else if (code === 130) {
           errorMessage = 'Error: Process interrupted (SIGINT)';
         } else if (code === 143 || code === 15) {
           errorMessage = 'Error: Process terminated (cancelled)';
         } else {
           errorMessage = `Error: Process exited with code ${code}`;
         }

         sendProgress(importId, errorMessage, 0);
         return;
       }
   
       console.log("✅ Script completed successfully");
       console.log("📋 Script output:", scriptOutput);
   
       const lines = scriptOutput.split("\n");
       
       // Parse the script output
       const fileLine = lines.find((l) => l.startsWith("FILE:"));
       const jsonLine = lines.find((l) => l.startsWith("JSON:"));
       const titleLine = lines.find((l) => l.startsWith("TITLE:"));
       const channelLine = lines.find((l) => l.startsWith("CHANNEL:"));
       const publishLine = lines.find((l) => l.startsWith("PUBLISH:"));

       if (!fileLine) {
         console.error("❌ No FILE: line found in output");
         sendProgress(importId, 'Error', 0);
         return;
       }

       // Extract values
       const filename = fileLine.replace("FILE:", "").trim();
       const jsonFilename = jsonLine ? jsonLine.replace("JSON:", "").trim() : null;
       const title = titleLine ? titleLine.replace("TITLE:", "").trim() : "Untitled";
       const channel = channelLine ? channelLine.replace("CHANNEL:", "").trim() : "Unknown";
       const publishDateStr = publishLine ? publishLine.replace("PUBLISH:", "").trim() : null;

       // Extract YouTube ID from the filename (yt_ABC123.txt -> ABC123)
       const youtubeId = filename.replace("yt_", "").replace(".txt", "");

       try {
         // READ THE TRANSCRIPT TEXT FILE
         const transcriptPath = path.join(process.cwd(), filename);
         console.log("📂 Reading transcript from:", transcriptPath);

         const transcript = await fs.readFile(transcriptPath, "utf-8");
         console.log("✅ File read successfully, length:", transcript.length);

         // READ THE JSON FILE WITH TIMESTAMPS (if exists)
         let segments = null;
         if (jsonFilename) {
           try {
             const jsonPath = path.join(process.cwd(), jsonFilename);
             console.log("📂 Reading JSON timestamps from:", jsonPath);
             const jsonData = await fs.readFile(jsonPath, "utf-8");
             const parsed = JSON.parse(jsonData);
             segments = parsed.transcription || parsed.segments || null;
             console.log("✅ JSON parsed successfully, segments:", segments?.length || 0);
           } catch (jsonError) {
             console.warn("⚠️ Failed to read/parse JSON file:", jsonError.message);
             // Continue without segments
           }
         }
         
         // Parse publish date
         let publishDate = null;
         if (publishDateStr) {
           try {
             publishDate = new Date(publishDateStr);
           } catch (e) {
             console.warn("⚠️ Failed to parse publish date:", publishDateStr);
           }
         }
         
         // Save to database using Prisma
         console.log("💾 Saving to database...");
         const savedTranscript = await prisma.transcript.create({
           data: {
             youtubeId,
             title,
             channel,
             text: transcript,
             segments: segments,  // Save timestamp segments from JSON
             publishDate,
             source: 'YOUTUBE',
             sourceUrl: url
           }
         });
         
         console.log("✅ Saved to database with ID:", savedTranscript.id);

         // Update any QueueVideo records that reference this YouTube ID
         try {
           const updatedQueueVideos = await prisma.queueVideo.updateMany({
             where: {
               youtubeId: youtubeId,
               transcriptId: null
             },
             data: {
               transcriptId: savedTranscript.id,
               importedAt: new Date()
             }
           });
           if (updatedQueueVideos.count > 0) {
             console.log(`✅ Updated ${updatedQueueVideos.count} queue video(s)`);
           }
         } catch (queueErr) {
           console.warn("⚠️ Failed to update queue videos:", queueErr.message);
         }

         // Generate AI summary using OpenRouter
         console.log("📝 Generating AI summary...");
         const summary = await generateTranscriptSummary(transcript, title, channel);
         if (summary) {
           await prisma.transcript.update({
             where: { id: savedTranscript.id },
             data: { summary }
           });
           console.log("✅ Summary saved to database");
         } else {
           console.warn("⚠️ Summary generation failed or skipped");
         }

         // Clean up the transcript file after saving to database
         try {
           await fs.unlink(transcriptPath);
           console.log("🗑️ Cleaned up transcript file:", filename);
         } catch (cleanupErr) {
           console.warn("⚠️ Could not clean up file:", filename, cleanupErr.message);
         }
         
         console.log("🎉 Import completed successfully!");
         
         // Send completion status
         sendProgress(importId, 'Completed', 100);
         
       } catch (dbError) {
         console.error("❌ Database error:", dbError);
         
         if (dbError.code === 'P2002') {
           // Attempt to backfill summary for duplicate
          console.log('[Import] Duplicate video detected. Checking for summary backfill...');
          try {
            const existing = await prisma.transcript.findFirst({ where: { youtubeId } });
            if (existing && (!existing.summary || !existing.summary.trim())) {
              console.log(`[Import] Duplicate video. Backfilling summary for ${existing.id}...`);
              const summary = await generateTranscriptSummary(transcript, title, channel);
              if (summary) {
                await prisma.transcript.update({
                  where: { id: existing.id },
                  data: { summary }
                });
                console.log(`[Import] ✅ Backfilled summary for duplicate transcript`);
                sendProgress(importId, 'Completed (existing video, summary added)', 100);
              } else {
                console.warn(`[Import] ⚠️ Duplicate transcript but summary generation returned empty`);
                sendProgress(importId, 'Completed (existing video, no summary)', 100);
              }
            } else if (existing) {
              console.log(`[Import] Duplicate transcript already has summary (${existing.summary.length} chars); skipping.`);
              sendProgress(importId, 'Completed (video already imported)', 100);
            } else {
              sendProgress(importId, 'Error: Video already imported', 0);
            }
          } catch (backfillError) {
            console.error('[Import] ❌ Error during summary backfill:', backfillError);
            sendProgress(importId, 'Completed (existing video, backfill failed)', 100);
          }
         } else if (dbError.code === 'ENOENT') {
           sendProgress(importId, 'Error: File not found', 0);
         } else {
           sendProgress(importId, 'Error: Save failed', 0);
         }
       } finally {
         // Clean up the WebSocket connection and process
         setTimeout(() => {
           activeImports.delete(importId);
           activeProcesses.delete(importId);
         }, 5000);
       }
     });
   });
   
   /* ==================================================================
      /api/cancel-import - CANCEL AN ACTIVE IMPORT
      ================================================================== */
   app.post("/api/cancel-import", async (req, res) => {
     const { importId } = req.body;
     if (!importId) return res.status(400).json({ error: "Missing import ID" });

     console.log("🛑 Canceling import:", importId);

     const process = activeProcesses.get(importId);
     if (!process) {
       return res.status(404).json({ error: "Import not found or already completed" });
     }

     try {
       // Kill the process and all its children
       process.kill('SIGTERM');

       // Send cancellation progress
       await sendProgress(importId, 'Cancelled', 0);

       // Clean up
       activeProcesses.delete(importId);
       activeImports.delete(importId);

       res.json({ success: true, message: "Import cancelled" });
     } catch (error) {
       console.error("Error cancelling import:", error);
       res.status(500).json({ error: "Failed to cancel import" });
     }
   });

   /* ==================================================================
      /api/cancel-all-imports - CANCEL ALL PENDING/PROCESSING IMPORTS
      ================================================================== */
   app.post("/api/cancel-all-imports", async (req, res) => {
     console.log("🛑 Canceling all pending/processing imports");

     try {
       // Fetch all PENDING and PROCESSING jobs
       const jobsToCancel = await prisma.importJob.findMany({
         where: {
           state: {
             in: ['PENDING', 'PROCESSING']
           }
         }
       });

       console.log(`Found ${jobsToCancel.length} jobs to cancel`);

       let processesKilled = 0;
       let filesDeleted = 0;

       // Process each job
       for (const job of jobsToCancel) {
         // Kill process if it's running
         if (job.state === 'PROCESSING') {
           const process = activeProcesses.get(job.id);
           if (process) {
             try {
               process.kill('SIGTERM');
               activeProcesses.delete(job.id);
               activeImports.delete(job.id);
               processesKilled++;
               console.log(`Killed process for job ${job.id}`);
             } catch (killError) {
               console.error(`Failed to kill process for job ${job.id}:`, killError);
             }
           }
         }

         // Extract ID from URL and delete files
         const ytIdMatch = job.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
         if (ytIdMatch) {
           const youtubeId = ytIdMatch[1];
           const filesToDelete = [
             `yt_${youtubeId}.mp3`,
             `yt_${youtubeId}.mp4`,
             `yt_${youtubeId}.txt`,
             `yt_${youtubeId}.json`,
             `yt_${youtubeId}.mp4.part`,
             `yt_${youtubeId}.mp4.ytdl`
           ];

           for (const filename of filesToDelete) {
             const filepath = path.join(process.cwd(), filename);
             try {
               if (existsSync(filepath)) {
                 await fs.unlink(filepath);
                 filesDeleted++;
                 console.log(`Deleted file: ${filename}`);
               }
             } catch (fileError) {
               console.error(`Failed to delete ${filename}:`, fileError);
             }
           }
         }
       }

       // Update all jobs to CANCELLED state
       const updateResult = await prisma.importJob.updateMany({
         where: {
           state: {
             in: ['PENDING', 'PROCESSING']
           }
         },
         data: {
           state: 'CANCELLED',
           error: 'Cancelled by user'
         }
       });

       console.log(`✅ Cancelled ${updateResult.count} jobs, killed ${processesKilled} processes, deleted ${filesDeleted} files`);

       res.json({
         success: true,
         cancelled: updateResult.count,
         processesKilled,
         filesDeleted
       });

     } catch (error) {
       console.error("Error cancelling all imports:", error);
       res.status(500).json({ error: "Failed to cancel imports" });
     }
   });

   /* ==================================================================
      /api/clear-completed-imports - CLEAR ALL COMPLETED IMPORT JOBS
      ================================================================== */
   app.post("/api/clear-completed-imports", async (req, res) => {
     console.log("🧹 Clearing all completed import jobs");

     try {
       const result = await prisma.importJob.deleteMany({
         where: {
           state: {
             in: ['DONE', 'ERROR', 'CANCELLED']
           }
         }
       });

       console.log(`✅ Cleared ${result.count} completed import jobs`);

       res.json({
         success: true,
         cleared: result.count
       });
     } catch (error) {
       console.error("Error clearing completed imports:", error);
       res.status(500).json({ error: "Failed to clear completed imports" });
     }
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
      /api/search-podcast-feed - SEARCH FOR PODCAST RSS FEED BY NAME
      ================================================================== */
   app.post("/api/search-podcast-feed", async (req, res) => {
     const { channelName } = req.body;
     if (!channelName) return res.status(400).json({ error: "Missing channel name" });

     try {
       console.log("Searching for podcast RSS feed for:", channelName);

       // Search iTunes API for podcasts matching the channel name
       const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(channelName)}&media=podcast&limit=10`;
       const response = await fetch(searchUrl);

       if (!response.ok) {
         console.error(`iTunes API request failed: HTTP ${response.status}`);
         return res.status(500).json({ error: `Failed to search podcasts: HTTP ${response.status}` });
       }

       const data = await response.json();
       console.log(`Found ${data.resultCount} podcast results`);

       if (data.resultCount === 0) {
         return res.json({ found: false, matches: [] });
       }

       // Format the results
       const matches = data.results.map(podcast => ({
         podcastName: podcast.collectionName || podcast.trackName,
         author: podcast.artistName,
         feedUrl: podcast.feedUrl,
         artwork: podcast.artworkUrl600 || podcast.artworkUrl100,
         trackCount: podcast.trackCount,
         primaryGenre: podcast.primaryGenreName,
         releaseDate: podcast.releaseDate
       }));

       // Find best match (exact or closest name match)
       const exactMatch = matches.find(m =>
         m.podcastName.toLowerCase() === channelName.toLowerCase()
       );

       res.json({
         found: true,
         bestMatch: exactMatch || matches[0],
         allMatches: matches
       });

     } catch (error) {
       console.error("Error searching for podcast feed:", error);
       res.status(500).json({ error: "Failed to search for podcast feed: " + error.message });
     }
   });

   /* ==================================================================
      /api/podcast-feed - FETCH AND PARSE PODCAST RSS FEED
      ================================================================== */
   app.post("/api/podcast-feed", async (req, res) => {
     const { url } = req.body;
     if (!url) return res.status(400).json({ error: "Missing podcast feed URL" });
   
     try {
       console.log("Fetching podcast feed from:", url);
       
       // Fetch the RSS feed
       const response = await fetch(url);
       if (!response.ok) {
         console.error(`Failed to fetch feed: HTTP ${response.status}`);
         return res.status(500).json({ error: `Failed to fetch feed: HTTP ${response.status}` });
       }
   
       const xmlData = await response.text();
       console.log("Fetched XML data, length:", xmlData.length);
       
       // Check if it's actually XML/RSS
       if (!xmlData.includes('<rss') && !xmlData.includes('<?xml')) {
         console.error("Response doesn't appear to be RSS/XML");
         return res.status(400).json({ error: "URL does not appear to be an RSS feed" });
       }
   
       const parser = new xml2js.Parser({ 
         explicitArray: false,
         mergeAttrs: true,
         normalize: true,
         normalizeTags: true,
         trim: true
       });
       
       const result = await parser.parseStringPromise(xmlData);
       console.log("Parsed XML successfully");
   
       // Extract podcast info
       const channel = result.rss.channel;
       if (!channel) {
         return res.status(400).json({ error: "Invalid RSS feed format" });
       }
   
       const podcastInfo = {
         title: channel.title || "Unknown Podcast",
         description: channel.description || "",
         imageUrl: channel.image?.url || channel.image?.href || "",
         author: channel.author || channel.managingEditor || "",
         episodes: []
       };
   
       // Extract episodes
       let items = channel.item || [];
       if (!Array.isArray(items)) {
         items = [items];
       }
   
       podcastInfo.episodes = items.map((item, index) => {
         // Find audio enclosure
         let audioUrl = "";
         if (item.enclosure) {
           if (Array.isArray(item.enclosure)) {
             // Find audio enclosure
             const audioEnclosure = item.enclosure.find(enc => 
               enc.type && enc.type.startsWith('audio/')
             );
             audioUrl = audioEnclosure?.url || item.enclosure[0]?.url || "";
           } else {
             audioUrl = item.enclosure.url || "";
           }
         }
   
         return {
           id: item.guid || `episode-${index}`,
           title: item.title || `Episode ${index + 1}`,
           description: item.description || "",
           publishDate: item.pubdate || "",
           duration: item.duration || "",
           audioUrl: audioUrl
         };
       }).filter(episode => episode.audioUrl); // Only include episodes with audio
   
       console.log(`Found ${podcastInfo.episodes.length} episodes with audio`);
       res.json(podcastInfo);
     } catch (error) {
       console.error("Error parsing podcast feed:", error);
       res.status(500).json({ error: "Failed to parse podcast feed: " + error.message });
     }
   });
   
   /* ==================================================================
      /api/transcribe-podcast - DOWNLOAD AND TRANSCRIBE PODCAST EPISODE
      ================================================================== */
   app.post("/api/transcribe-podcast", async (req, res) => {
     const { url, title, publishDate, podcastName } = req.body;
     if (!url) return res.status(400).json({ error: "Missing podcast audio URL" });
   
     try {
       console.log("Starting podcast transcription for:", title);
       
       // Check if this podcast episode already exists
       const existingTranscript = await prisma.transcript.findFirst({
         where: {
           sourceUrl: url,
           source: 'PODCAST'
         }
       });
       
       if (existingTranscript) {
         return res.status(400).json({ error: "This podcast episode has already been imported" });
       }
       
       // Create a temporary filename based on current timestamp
       const timestamp = Date.now();
       const audioFile = `podcast_${timestamp}.mp3`;
       const txtFile = `podcast_${timestamp}.txt`;
       
       // Download the audio file
       console.log("Downloading audio from:", url);
       await execPromise(`curl -L "${url}" -o "${audioFile}"`);
       
       // Transcribe using whisper.cpp
       console.log("Starting transcription...");
       await execPromise(`cd whisper.cpp && ./build/bin/whisper-cli -m models/ggml-base.en.bin -f "../${audioFile}" -otxt -of "../${txtFile.replace('.txt', '')}"`);
       
       // Read the transcription
       const transcript = await fs.readFile(txtFile, "utf-8");
       console.log("Transcription completed, length:", transcript.length);
       
       // Clean up the files
       try {
         await fs.unlink(audioFile);
         await fs.unlink(txtFile);
       } catch (cleanupError) {
         console.warn("Failed to clean up temporary files:", cleanupError);
       }
       
       // Parse publish date
       let parsedPublishDate = null;
       if (publishDate) {
         try {
           parsedPublishDate = new Date(publishDate);
         } catch (e) {
           console.warn("Failed to parse publish date:", publishDate);
         }
       }
       
       // Save to database using Prisma
       const savedTranscript = await prisma.transcript.create({
         data: {
           title: title || "Unknown Episode",
           channel: podcastName || "Unknown Podcast",
           text: transcript,
           publishDate: parsedPublishDate,
           source: 'PODCAST',
           sourceUrl: url
         }
       });

       // Generate AI summary using OpenRouter
       console.log("📝 Generating AI summary...");
       const summary = await generateTranscriptSummary(
         transcript,
         title || "Unknown Episode",
         podcastName || "Unknown Podcast"
       );
       if (summary) {
         await prisma.transcript.update({
           where: { id: savedTranscript.id },
           data: { summary }
         });
         console.log("✅ Summary saved to database");
       } else {
         console.warn("⚠️ Summary generation failed or skipped");
       }

       // Return the transcription and metadata
       res.json({
         title: savedTranscript.title,
         transcript,
         publishDate: savedTranscript.publishDate,
         channel: savedTranscript.channel,
         id: savedTranscript.id
       });
     } catch (error) {
       console.error("Podcast transcription error:", error);
       res.status(500).json({ error: "Failed to transcribe podcast: " + error.message });
     }
   });

 /* ==================================================================
    /api/transcribe-images - IMAGE OCR TRANSCRIPTION
    Upload multiple images and extract text via OCR using Gemini 2.0 Flash
    ================================================================== */
  app.post("/api/transcribe-images", upload.array('images', 10), async (req, res) => {
    const importId = req.body.importId || `image-${Date.now()}`;

    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No images uploaded" });
      }

      console.log(`Starting OCR processing for ${req.files.length} image(s)`);

      const results = [];
      const errors = [];

      // Process each image
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const imageNum = i + 1;
        const totalImages = req.files.length;

        try {
          // Send progress update
          await sendProgress(importId, `Processing image ${imageNum} of ${totalImages}`,
                           Math.round((i / totalImages) * 90)); // Reserve 10% for saving

          console.log(`Processing image ${imageNum}/${totalImages}: ${file.originalname}`);

          // Extract text using OCR
          const extractedText = await processImageWithOCR(
            file.path,
            process.env.OPENROUTER_API_KEY
          );

          // Generate title from content
          const title = await generateTitleFromContent(
            extractedText,
            file.originalname,
            process.env.OPENROUTER_API_KEY
          );

          // Save to database
          const transcript = await prisma.transcript.create({
            data: {
              title: title,
              channel: 'Image Upload',
              text: extractedText,
              source: 'IMAGE',
              imageFilename: file.originalname
            }
          });

          // Generate AI summary
          console.log("📝 Generating AI summary...");
          const summary = await generateTranscriptSummary(
            extractedText,
            title,
            'Image Upload'
          );

          if (summary) {
            await prisma.transcript.update({
              where: { id: transcript.id },
              data: { summary }
            });
            console.log("✅ Summary saved to database");
          }

          // Delete the uploaded file
          try {
            await fs.unlink(file.path);
          } catch (cleanupError) {
            console.warn(`Failed to delete ${file.path}:`, cleanupError.message);
          }

          results.push({
            success: true,
            filename: file.originalname,
            transcriptId: transcript.id,
            title: transcript.title,
            textLength: extractedText.length
          });

          console.log(`✅ Successfully processed image ${imageNum}/${totalImages}`);

        } catch (imageError) {
          console.error(`Error processing ${file.originalname}:`, imageError.message);

          // Clean up file on error
          try {
            await fs.unlink(file.path);
          } catch (cleanupError) {
            // Ignore cleanup errors
          }

          errors.push({
            filename: file.originalname,
            error: imageError.message
          });
        }
      }

      // Send completion progress
      await sendProgress(importId, 'Completed', 100);

      // Return results
      res.json({
        success: true,
        processedCount: results.length,
        errorCount: errors.length,
        results: results,
        errors: errors
      });

    } catch (error) {
      console.error("Image transcription error:", error);

      // Clean up any uploaded files on error
      if (req.files) {
        for (const file of req.files) {
          try {
            await fs.unlink(file.path);
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
        }
      }

      await sendProgress(importId, 'Error', 0);
      res.status(500).json({ error: "Failed to process images: " + error.message });
    }
  });
   
  /* ==================================================================
     /api/insights - GET ALL INSIGHTS
     ================================================================== */
  app.get("/api/insights", async (req, res) => {
    try {
      const { tags, search } = req.query;

      const whereClause = {};
      if (tags) {
        whereClause.tags = {
          hasSome: tags.split(',')
        };
      }
      if (search) {
        whereClause.insightName = {
          contains: search,
          mode: 'insensitive'
        };
      }

      const insights = await prisma.insight.findMany({
        where: whereClause,
        include: {
          sources: {
            include: {
              transcript: {
                select: {
                  id: true,
                  title: true,
                  channel: true,
                  publishDate: true,
                  source: true
                }
              }
            },
            orderBy: { capturedAt: 'asc' }
          }
        },
        orderBy: { updatedAt: 'desc' }
      });

      // Enhance insights with computed fields
      const enrichedInsights = insights.map(insight => ({
        ...insight,
        sourceCount: insight.sources.length,
        latestSourceDate: insight.sources.length > 0
          ? insight.sources.reduce((latest, src) =>
              !latest || src.capturedAt > latest ? src.capturedAt : latest, null)
          : null
      }));

      res.json(enrichedInsights);
    } catch (error) {
      console.error("Error fetching insights:", error);
      res.status(500).json({ error: "Failed to fetch insights" });
    }
  });

  /* ==================================================================
     /api/insights/:id - GET SINGLE INSIGHT WITH SOURCES
     ================================================================== */
  app.get("/api/insights/:id", async (req, res) => {
    try {
      const insight = await prisma.insight.findUnique({
        where: { id: req.params.id },
        include: {
          sources: {
            include: {
              transcript: {
                select: {
                  id: true,
                  title: true,
                  channel: true,
                  publishDate: true,
                  source: true,
                  sourceUrl: true
                }
              }
            },
            orderBy: { orderIndex: 'asc' }
          }
        }
      });

      if (!insight) {
        return res.status(404).json({ error: "Insight not found" });
      }

      res.json(insight);
    } catch (error) {
      console.error("Error fetching insight:", error);
      res.status(500).json({ error: "Failed to fetch insight" });
    }
  });

  /* ==================================================================
     /api/insights - CREATE NEW INSIGHT WITH FIRST SOURCE
     ================================================================== */
  app.post("/api/insights", async (req, res) => {
    try {
      const { insightName, content, tags, transcriptId, contentSnippet } = req.body;

      if (!insightName || !content) {
        return res.status(400).json({ error: "Insight name and content are required" });
      }

      // Check if insight with this name already exists
      const existing = await prisma.insight.findFirst({
        where: { insightName }
      });

      if (existing) {
        return res.status(400).json({
          error: "Insight already exists",
          existingId: existing.id
        });
      }

      // Create insight with optional source
      const insightData = {
        insightName,
        content,
        tags: tags || []
      };

      // If transcript source provided, create with source relation
      if (transcriptId && contentSnippet) {
        insightData.sources = {
          create: [{
            transcriptId,
            contentSnippet,
            orderIndex: 0
          }]
        };
      }

      const insight = await prisma.insight.create({
        data: insightData,
        include: {
          sources: {
            include: {
              transcript: true
            }
          }
        }
      });

      res.json(insight);
    } catch (error) {
      console.error("Error creating insight:", error);
      res.status(500).json({ error: "Failed to create insight" });
    }
  });

  /* ==================================================================
     /api/insights/:id - UPDATE INSIGHT (Content and Tags)
     ================================================================== */
  app.put("/api/insights/:id", async (req, res) => {
    try {
      const { insightName, content, tags } = req.body;

      const updateData = {};
      if (insightName !== undefined) updateData.insightName = insightName;
      if (content !== undefined) updateData.content = content;
      if (tags !== undefined) updateData.tags = tags || [];

      const insight = await prisma.insight.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          sources: {
            include: {
              transcript: true
            }
          }
        }
      });

      res.json(insight);
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: "Insight not found" });
      }
      console.error("Error updating insight:", error);
      res.status(500).json({ error: "Failed to update insight" });
    }
  });

  /* ==================================================================
     /api/insights/:id/sources - ADD SOURCE TO EXISTING INSIGHT
     ================================================================== */
  app.post("/api/insights/:id/sources", async (req, res) => {
    try {
      const { transcriptId, contentSnippet } = req.body;

      if (!transcriptId || !contentSnippet) {
        return res.status(400).json({ error: "Transcript ID and content snippet are required" });
      }

      // Get current max orderIndex for this insight
      const existingSources = await prisma.insightSource.findMany({
        where: { insightId: req.params.id },
        orderBy: { orderIndex: 'desc' },
        take: 1
      });

      const nextOrderIndex = existingSources.length > 0
        ? existingSources[0].orderIndex + 1
        : 0;

      const source = await prisma.insightSource.create({
        data: {
          insightId: req.params.id,
          transcriptId,
          contentSnippet,
          orderIndex: nextOrderIndex
        },
        include: {
          transcript: true
        }
      });

      res.json(source);
    } catch (error) {
      console.error("Error adding source:", error);
      res.status(500).json({ error: "Failed to add source" });
    }
  });

  /* ==================================================================
     /api/insights/:id - DELETE INSIGHT AND ALL SOURCES
     ================================================================== */
  app.delete("/api/insights/:id", async (req, res) => {
    try {
      await prisma.insight.delete({
        where: { id: req.params.id }
      });
      res.json({ success: true });
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: "Insight not found" });
      }
      console.error("Error deleting insight:", error);
      res.status(500).json({ error: "Failed to delete insight" });
    }
  });

  /* ==================================================================
     Prompt Templates API (Custom Instructions)
     ================================================================== */

  // GET /api/prompt-templates - List all templates with optional filtering
  app.get("/api/prompt-templates", async (req, res) => {
    try {
      const { category, search } = req.query;

      const whereClause = {};

      // Filter by category if provided (comma-separated list)
      if (category) {
        const categories = category.split(',').map(c => c.trim());
        whereClause.category = { hasSome: categories };
      }

      // Search by name or description if provided
      if (search) {
        whereClause.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ];
      }

      const templates = await prisma.promptTemplate.findMany({
        where: whereClause,
        orderBy: { updatedAt: 'desc' }
      });

      res.json(templates);
    } catch (error) {
      console.error("Error fetching prompt templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // GET /api/prompt-templates/recent - Get most recently used templates
  app.get("/api/prompt-templates/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 5;

      const templates = await prisma.promptTemplate.findMany({
        where: {
          lastUsedAt: { not: null }
        },
        orderBy: { lastUsedAt: 'desc' },
        take: limit
      });

      res.json(templates);
    } catch (error) {
      console.error("Error fetching recent templates:", error);
      res.status(500).json({ error: "Failed to fetch recent templates" });
    }
  });

  // GET /api/prompt-templates/:id - Get single template
  app.get("/api/prompt-templates/:id", async (req, res) => {
    try {
      const template = await prisma.promptTemplate.findUnique({
        where: { id: req.params.id }
      });

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      res.json(template);
    } catch (error) {
      console.error("Error fetching template:", error);
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  // POST /api/prompt-templates - Create new template
  app.post("/api/prompt-templates", async (req, res) => {
    try {
      const { name, description, promptText, category } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Template name is required" });
      }

      if (!promptText || !promptText.trim()) {
        return res.status(400).json({ error: "Prompt text is required" });
      }

      const template = await prisma.promptTemplate.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          promptText: promptText.trim(),
          category: category || []
        }
      });

      res.json(template);
    } catch (error) {
      console.error("Error creating template:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  // PUT /api/prompt-templates/:id - Update template
  app.put("/api/prompt-templates/:id", async (req, res) => {
    try {
      const { name, description, promptText, category } = req.body;

      const updateData = {};
      if (name !== undefined) updateData.name = name.trim();
      if (description !== undefined) updateData.description = description?.trim() || null;
      if (promptText !== undefined) updateData.promptText = promptText.trim();
      if (category !== undefined) updateData.category = category || [];

      const template = await prisma.promptTemplate.update({
        where: { id: req.params.id },
        data: updateData
      });

      res.json(template);
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: "Template not found" });
      }
      console.error("Error updating template:", error);
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  // DELETE /api/prompt-templates/:id - Delete template
  app.delete("/api/prompt-templates/:id", async (req, res) => {
    try {
      await prisma.promptTemplate.delete({
        where: { id: req.params.id }
      });
      res.json({ success: true });
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: "Template not found" });
      }
      console.error("Error deleting template:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // POST /api/prompt-templates/:id/use - Mark template as used (increment usage, update lastUsedAt)
  app.post("/api/prompt-templates/:id/use", async (req, res) => {
    try {
      const template = await prisma.promptTemplate.update({
        where: { id: req.params.id },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: new Date()
        }
      });

      res.json(template);
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: "Template not found" });
      }
      console.error("Error marking template as used:", error);
      res.status(500).json({ error: "Failed to update template usage" });
    }
  });

  /* ==================================================================
     YouTube Search Queue Management
     ================================================================== */

  // GET /api/queues - List all queues with stats
  app.get("/api/queues", async (req, res) => {
    try {
      const queues = await prisma.queue.findMany({
        include: {
          videos: true
        },
        orderBy: {
          updatedAt: 'desc' // Most recently updated first
        }
      });

      const queuesWithStats = queues.map(queue => ({
        id: queue.id,
        name: queue.name,
        videoCount: queue.videos.length,
        importedCount: queue.videos.filter(v => v.transcriptId !== null).length,
        createdAt: queue.createdAt,
        updatedAt: queue.updatedAt
      }));

      res.json({ queues: queuesWithStats });
    } catch (error) {
      console.error("Error fetching queues:", error);
      res.status(500).json({ error: "Failed to fetch queues" });
    }
  });

  // GET /api/queues/:id - Get queue details with videos
  app.get("/api/queues/:id", async (req, res) => {
    try {
      const queue = await prisma.queue.findUnique({
        where: { id: req.params.id },
        include: {
          videos: {
            orderBy: {
              addedAt: 'desc'
            }
          }
        }
      });

      if (!queue) {
        return res.status(404).json({ error: "Queue not found" });
      }

      res.json(queue);
    } catch (error) {
      console.error("Error fetching queue:", error);
      res.status(500).json({ error: "Failed to fetch queue" });
    }
  });

  // POST /api/queues - Create new queue with videos
  app.post("/api/queues", async (req, res) => {
    try {
      const { name, videos } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Queue name is required" });
      }

      if (!Array.isArray(videos) || videos.length === 0) {
        return res.status(400).json({ error: "At least one video is required" });
      }

      // Check for duplicate queue name
      const existingQueue = await prisma.queue.findFirst({
        where: { name: name.trim() }
      });

      if (existingQueue) {
        return res.status(400).json({ error: "A queue with this name already exists" });
      }

      // Create queue with videos
      const queue = await prisma.queue.create({
        data: {
          name: name.trim(),
          videos: {
            create: videos.map(v => ({
              youtubeId: v.youtubeId,
              title: v.title,
              channel: v.channel,
              thumbnailUrl: v.thumbnailUrl || null,
              duration: v.duration || null,
              viewCount: v.viewCount || null,
              publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
              url: v.url
            }))
          }
        },
        include: {
          videos: true
        }
      });

      res.json(queue);
    } catch (error) {
      console.error("Error creating queue:", error);
      res.status(500).json({ error: "Failed to create queue" });
    }
  });

  // POST /api/queues/:id/videos - Add videos to existing queue
  app.post("/api/queues/:id/videos", async (req, res) => {
    try {
      const { videos } = req.body;

      if (!Array.isArray(videos) || videos.length === 0) {
        return res.status(400).json({ error: "At least one video is required" });
      }

      // Check if queue exists
      const queue = await prisma.queue.findUnique({
        where: { id: req.params.id }
      });

      if (!queue) {
        return res.status(404).json({ error: "Queue not found" });
      }

      // Add videos to queue
      await prisma.queueVideo.createMany({
        data: videos.map(v => ({
          queueId: req.params.id,
          youtubeId: v.youtubeId,
          title: v.title,
          channel: v.channel,
          thumbnailUrl: v.thumbnailUrl || null,
          duration: v.duration || null,
          viewCount: v.viewCount || null,
          publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
          url: v.url
        })),
        skipDuplicates: true // Skip if video already in queue
      });

      // Update queue's updatedAt timestamp
      await prisma.queue.update({
        where: { id: req.params.id },
        data: { updatedAt: new Date() }
      });

      res.json({ success: true, added: videos.length });
    } catch (error) {
      console.error("Error adding videos to queue:", error);
      res.status(500).json({ error: "Failed to add videos to queue" });
    }
  });

  // DELETE /api/queues/:id - Delete queue
  app.delete("/api/queues/:id", async (req, res) => {
    try {
      await prisma.queue.delete({
        where: { id: req.params.id }
      });
      res.json({ success: true });
    } catch (error) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: "Queue not found" });
      }
      console.error("Error deleting queue:", error);
      res.status(500).json({ error: "Failed to delete queue" });
    }
  });

  // POST /api/queues/:id/import - Import pending videos from queue
  app.post("/api/queues/:id/import", async (req, res) => {
    try {
      const queueId = req.params.id;
      console.log(`[QueueImport] Starting import for queue: ${queueId}`);

      // Get all videos in queue that haven't been imported yet
      console.log('[QueueImport] Fetching pending videos...');
      const pendingVideos = await prisma.queueVideo.findMany({
        where: {
          queueId: queueId,
          transcriptId: null
        }
      });
      console.log(`[QueueImport] Found ${pendingVideos.length} pending videos`);

      if (pendingVideos.length === 0) {
        return res.json({
          message: "All videos in this queue have already been imported",
          videosToImport: 0
        });
      }

      // Create import jobs for each pending video
      console.log('[QueueImport] Processing videos...');
      const importJobs = await Promise.all(
        pendingVideos.map(async (video, index) => {
          console.log(`[QueueImport] Processing video ${index + 1}/${pendingVideos.length}: ${video.youtubeId}`);

          // Check if this YouTube ID already exists as a transcript
          const existingTranscript = await prisma.transcript.findUnique({
            where: { youtubeId: video.youtubeId }
          });

          if (existingTranscript) {
            console.log(`[QueueImport] Video ${index + 1} already imported, linking...`);
            // Link the existing transcript to this queue video
            await prisma.queueVideo.update({
              where: { id: video.id },
              data: {
                transcriptId: existingTranscript.id,
                importedAt: new Date()
              }
            });
            return null; // Skip creating import job
          }

          // Create import job for this video
          console.log(`[QueueImport] Creating import job for video ${index + 1}`);
          const job = await prisma.importJob.create({
            data: {
              url: video.url,
              state: 'PENDING',
              progress: 0
            }
          });
          console.log(`[QueueImport] Created import job ${job.id} for video ${index + 1}`);
          return job;
        })
      );

      const actualImportJobs = importJobs.filter(job => job !== null);
      console.log(`[QueueImport] Created ${actualImportJobs.length} import jobs`);

      res.json({
        message: `Started importing ${actualImportJobs.length} video(s)`,
        videosToImport: actualImportJobs.length,
        queueId: queueId
      });

      // Start processing the queue in the background (don't await)
      if (actualImportJobs.length > 0) {
        console.log('[QueueImport] Starting background processing');
        processImportQueue().catch(err => {
          console.error('[QueueImport] Background processing error:', err);
        });
      }
    } catch (error) {
      console.error("[QueueImport] Error importing queue:", error);
      res.status(500).json({ error: "Failed to import queue", details: error.message });
    }
  });

  // GET /api/queues/:id/import-status - Get import status for queue videos
  app.get("/api/queues/:id/import-status", async (req, res) => {
    try {
      const queueId = req.params.id;

      // Get all videos in the queue
      const queueVideos = await prisma.queueVideo.findMany({
        where: { queueId: queueId },
        orderBy: { addedAt: 'desc' }
      });

      // Get all import jobs
      const allImportJobs = await prisma.importJob.findMany({
        where: {
          state: { in: ['PENDING', 'PROCESSING'] }
        }
      });

      // Map videos to their import job status
      const videoStatuses = await Promise.all(
        queueVideos.map(async (video) => {
          // If already imported, return completed status
          if (video.transcriptId) {
            return {
              id: video.id,
              youtubeId: video.youtubeId,
              title: video.title,
              thumbnailUrl: video.thumbnailUrl,
              status: 'COMPLETED',
              progress: 100,
              stage: 'Complete',
              error: null
            };
          }

          // Find matching import job by URL
          const importJob = allImportJobs.find(job => job.url === video.url);

          if (importJob) {
            return {
              id: video.id,
              youtubeId: video.youtubeId,
              title: video.title,
              thumbnailUrl: video.thumbnailUrl,
              status: importJob.state,
              progress: importJob.progress || 0,
              stage: importJob.state === 'PENDING' ? 'Waiting in queue' : 'Processing',
              error: importJob.error
            };
          }

          // Video is pending import but no job created yet
          return {
            id: video.id,
            youtubeId: video.youtubeId,
            title: video.title,
            thumbnailUrl: video.thumbnailUrl,
            status: 'PENDING',
            progress: 0,
            stage: 'Waiting to start',
            error: null
          };
        })
      );

      // Check if any imports are in progress
      // Only true if there are actual import jobs running (not just videos waiting to be imported)
      const importing = allImportJobs.length > 0;

      res.json({
        importing,
        videos: videoStatuses,
        totalVideos: queueVideos.length,
        completed: videoStatuses.filter(v => v.status === 'COMPLETED').length,
        pending: videoStatuses.filter(v => v.status === 'PENDING').length,
        processing: videoStatuses.filter(v => v.status === 'PROCESSING').length,
        failed: videoStatuses.filter(v => v.status === 'ERROR').length
      });
    } catch (error) {
      console.error("Error fetching queue import status:", error);
      res.status(500).json({ error: "Failed to fetch import status" });
    }
  });

   /* ==================================================================
      /api/import-progress - For bulk import progress tracking
      ================================================================== */
   app.get("/api/import-progress", async (req, res) => {
     try {
       console.log('[API] /api/import-progress - Fetching import job counts');

       const pending = await prisma.importJob.count({ where: { state: 'PENDING' } });
       const processing = await prisma.importJob.count({ where: { state: 'PROCESSING' } });
       const done = await prisma.importJob.count({ where: { state: 'DONE' } });
       const error = await prisma.importJob.count({ where: { state: 'ERROR' } });

       const counts = {
         PENDING: pending,
         PROCESSING: processing,
         DONE: done,
         ERROR: error
       };

       console.log('[API] /api/import-progress - Counts:', counts);
       res.json(counts);
     } catch (error) {
       console.error('[API] /api/import-progress - Error:', error);
       res.status(500).json({ error: error.message });
     }
   });

   /* ==================================================================
      /api/bulk-import - For bulk YouTube video import
      ================================================================== */
   app.post("/api/bulk-import", async (req, res) => {
     try {
       const { videos } = req.body;
       console.log('[API] /api/bulk-import - Received request for', videos?.length, 'videos');

       if (!videos || !Array.isArray(videos)) {
         console.error('[API] /api/bulk-import - Invalid request: missing videos array');
         return res.status(400).json({ error: "Missing videos array" });
       }

       console.log('[API] /api/bulk-import - Videos:', videos);

       // Check which videos already exist in the database
       const skipped = [];
       for (const url of videos) {
         // Extract YouTube ID from URL
         const ytIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
         if (ytIdMatch) {
          const youtubeId = ytIdMatch[1];

          // Check if transcript already exists
          const existing = await prisma.transcript.findFirst({
            where: { youtubeId }
          });
          if (existing) {
            console.log('[API] /api/bulk-import - Skipping existing transcript:', url);
            skipped.push(url);
            continue;
          }

          // Check if there's already a pending/processing import job for this video
          const pendingJob = await prisma.importJob.findFirst({
            where: {
              url: {
                contains: youtubeId
              },
              state: {
                in: ['PENDING', 'PROCESSING']
              }
            }
          });
          if (pendingJob) {
            console.log('[API] /api/bulk-import - Skipping video with pending/processing job:', url);
            skipped.push(url);
            continue;
          }
         }
       }

       console.log('[API] /api/bulk-import - Skipped', skipped.length, 'existing/pending videos');

       // Create ImportJob records for new videos
       const newVideos = videos.filter(url => !skipped.includes(url));
       console.log('[API] /api/bulk-import - Creating', newVideos.length, 'import jobs');

       for (const url of newVideos) {
         await prisma.importJob.create({
           data: {
             url,
             state: 'PENDING',
             progress: 0
           }
         });
         console.log('[API] /api/bulk-import - Created import job for:', url);
       }

       console.log('[API] /api/bulk-import - Response:', { skipped, created: newVideos.length });

       // Return the skipped videos so UI can mark them as complete
       res.json({ skipped });

       // Start processing the queue in the background (don't await)
       if (newVideos.length > 0) {
         console.log('[API] /api/bulk-import - Starting background processing');
         processImportQueue().catch(err => {
           console.error('[API] /api/bulk-import - Background processing error:', err);
         });
       }
     } catch (error) {
       console.error('[API] /api/bulk-import - Error:', error);
       res.status(500).json({ error: error.message });
     }
   });
   
   /* ==================================================================
      /api/chat/completion – CHAT COMPLETION VIA OPENROUTER
      ================================================================== */
   app.post("/api/chat/completion", async (req, res) => {
     try {
       const { prompt, temperature = 0.7, stop = [], n_predict = 512, stream = false } = req.body;

       if (!prompt) {
         return res.status(400).json({ error: "Missing prompt" });
       }

       if (!process.env.OPENROUTER_API_KEY) {
         console.error("❌ OPENROUTER_API_KEY not configured");
         return res.status(500).json({ error: "OpenRouter API key not configured. Please add OPENROUTER_API_KEY to your .env file." });
       }

       console.log("🤖 Processing chat request via OpenRouter");
       console.log(`📊 Settings: temp=${temperature}, tokens=${n_predict}, stream=${stream}`);

       const result = await streamText({
         model: openrouter('openai/gpt-oss-120b'),
         prompt: prompt,
         temperature: temperature,
         maxTokens: n_predict,
         stop: stop.length > 0 ? stop : undefined,
       });

       if (stream) {
         console.log("🌊 Streaming response to client");

         // Set headers for SSE streaming
         res.setHeader('Content-Type', 'text/plain; charset=utf-8');
         res.setHeader('Cache-Control', 'no-cache');
         res.setHeader('Connection', 'keep-alive');

         // Stream tokens as they arrive
         for await (const textPart of result.textStream) {
           const chunk = `data: ${JSON.stringify({ content: textPart })}\n\n`;
           res.write(chunk);
         }

         // Send completion marker
         res.write('data: [DONE]\n\n');
         res.end();
         console.log("✅ Streaming completed");

       } else {
         console.log("📝 Collecting full response");
         // Non-streaming: collect full response
         const fullText = await result.text;
         console.log("🎉 Got response:", fullText.substring(0, 100) + "...");
         res.json({ content: fullText });
       }
     } catch (error) {
       console.error("❌ Chat completion error:", error);
       res.status(500).json({
         error: "Failed to process chat request: " + error.message,
         details: error.message
       });
     }
   });
   
   /* ==================================================================
      /api/transcripts/:id/generate-summary - Manually generate summary for existing transcript
      ================================================================== */
   app.post("/api/transcripts/:id/generate-summary", async (req, res) => {
     try {
       const transcriptId = req.params.id;

       // Get the transcript
       const transcript = await prisma.transcript.findUnique({
         where: { id: transcriptId }
       });

       if (!transcript) {
         return res.status(404).json({ error: "Transcript not found" });
       }

       console.log(`📝 Manually generating summary for: ${transcript.title}`);

       // Generate summary using OpenRouter
       const summary = await generateTranscriptSummary(
         transcript.text,
         transcript.title,
         transcript.channel
       );

       if (!summary) {
         return res.status(500).json({ error: "Failed to generate summary" });
       }

       // Update the transcript with the summary
       const updatedTranscript = await prisma.transcript.update({
         where: { id: transcriptId },
         data: { summary }
       });

       console.log(`✅ Summary generated and saved (${summary.length} characters)`);
       res.json({ summary, transcript: updatedTranscript });
     } catch (error) {
       console.error("Error generating summary:", error);
       res.status(500).json({ error: "Failed to generate summary: " + error.message });
     }
   });
/* ==================================================================
   DOCUMENT GENERATION ENDPOINTS
   Add these to server.mjs after the generate-summary endpoint
   ================================================================== */

// POST /api/documents/analyze - Analyze transcripts and propose document types
app.post("/api/documents/analyze", async (req, res) => {
  try {
    const { transcriptIds, customInstructions = '', documentId } = req.body;

    if (!transcriptIds || !Array.isArray(transcriptIds) || transcriptIds.length === 0) {
      return res.status(400).json({ error: "Missing or invalid transcriptIds array" });
    }

    if (transcriptIds.length > 20) {
      return res.status(400).json({ error: "Maximum 20 transcripts allowed" });
    }

    console.log(`📊 Analyzing ${transcriptIds.length} transcripts for document generation`);
    if (customInstructions) {
      console.log(`📝 Custom instructions: ${customInstructions.substring(0, 100)}...`);
    }

    // Fetch transcript summaries (not full text - optimize tokens)
    const transcripts = await prisma.transcript.findMany({
      where: { id: { in: transcriptIds } },
      select: {
        id: true,
        title: true,
        channel: true,
        description: true,
        summary: true
      }
    });

    if (transcripts.length === 0) {
      return res.status(404).json({ error: "No transcripts found with provided IDs" });
    }

    // Build transcript summaries with FULL summaries (NO truncation)
    const transcriptSummaries = transcripts.map(t => {
      const summary = t.summary || t.description || 'No summary available';
      return `
Title: ${t.title}
Channel: ${t.channel}
Summary: ${summary}
---`;
    }).join('\n\n');

    // Use prompt from prompt management system
    const prompt = getPrompt('analyze-transcripts', {
      transcriptSummaries,
      transcriptCount: transcripts.length,
      customInstructions: customInstructions || 'No specific requirements provided'
    });

    console.log("🤖 Calling OpenRouter for document type proposals");
    console.log("📏 Prompt length:", prompt.length, "characters");

    // Add timeout protection to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error("⏱️  Analysis request timed out after 120 seconds");
      controller.abort();
    }, 120000); // 120 second timeout

    let responseText;
    try {
      console.log("📤 [1/5] Sending request to OpenRouter...");
      const startTime = Date.now();

      const result = await streamText({
        model: openrouter('openai/gpt-oss-120b'),
        prompt: prompt,
        temperature: 0.7,
        maxTokens: 5000,
        abortSignal: controller.signal,
      });

      console.log("📥 [2/5] Got streamText result object after", Date.now() - startTime, "ms");
      console.log("📥 [2.5/5] Result object keys:", Object.keys(result));

      console.log("⏳ [3/5] Consuming textStream instead of awaiting result.text...");
      const textStartTime = Date.now();

      // Instead of using result.text (which hangs), manually consume the stream
      responseText = '';
      let chunkCount = 0;
      for await (const textPart of result.textStream) {
        responseText += textPart;
        chunkCount++;
        if (chunkCount <= 3) {
          console.log(`  📦 Chunk ${chunkCount}:`, textPart.substring(0, 50));
        }
      }

      console.log("✅ [4/5] Got responseText after", Date.now() - textStartTime, "ms");
      console.log("✅ [4.5/5] ResponseText length:", responseText.length, "characters, chunks:", chunkCount);
      console.log("📝 [5/5] Response preview:", responseText.substring(0, 200));
    } catch (streamError) {
      clearTimeout(timeoutId);
      console.error("❌ Error in streamText flow:", streamError.name, streamError.message);
      if (streamError.name === 'AbortError') {
        throw new Error('Analysis timed out after 120 seconds. The AI service may be experiencing delays. Please try again with fewer transcripts.');
      }
      throw streamError;
    } finally {
      clearTimeout(timeoutId);
    }

    // Parse JSON response
    let analysis;
    try {
      analysis = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse JSON response:", parseError);
      // Try to extract JSON from markdown code blocks
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    // Create or update Document record with AWAITING_QUESTIONS status
    let document;
    if (documentId) {
      // Update existing document (e.g., when updating suggestions)
      document = await prisma.document.update({
        where: { id: documentId },
        data: {
          preferences: {
            analysis,
            customInstructions: customInstructions || ''
          },
          transcripts: {
            set: [], // Clear existing connections
            connect: transcriptIds.map(id => ({ id }))
          }
        }
      });
      console.log(`✅ Updated Document record ${document.id} with new analysis`);
    } else {
      // Create new document (initial analysis)
      document = await prisma.document.create({
        data: {
          title: "Untitled Document", // Will be set later
          documentType: "", // Will be set when user selects type
          status: "AWAITING_QUESTIONS",
          preferences: {
            analysis,
            customInstructions: customInstructions || ''
          }, // Store analysis results and custom instructions
          progress: 5,
          transcripts: {
            connect: transcriptIds.map(id => ({ id }))
          }
        }
      });
      console.log(`✅ Created Document record ${document.id} with status AWAITING_QUESTIONS`);
    }

    // Return analysis with document ID
    res.json({
      ...analysis,
      documentId: document.id
    });
  } catch (error) {
    console.error("Error analyzing transcripts:", error);
    res.status(500).json({ error: "Failed to analyze transcripts: " + error.message });
  }
});

// POST /api/documents/refine-instructions - Refine user's custom instructions using LLM
app.post("/api/documents/refine-instructions", async (req, res) => {
  try {
    const { customInstructions } = req.body;

    if (!customInstructions || !customInstructions.trim()) {
      return res.status(400).json({ error: "Missing customInstructions" });
    }

    console.log(`✨ Refining custom instructions (${customInstructions.length} chars)`);

    // Use prompt from prompt management system
    const prompt = getPrompt('refine-instructions', {
      customInstructions: customInstructions.trim()
    });

    console.log("🤖 Calling OpenRouter to refine instructions");

    // Add timeout protection (10 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error("⏱️  Refine request timed out after 10 seconds");
      controller.abort();
    }, 10000);

    let refinedText;
    try {
      const result = await streamText({
        model: openrouter('openai/gpt-oss-120b'),
        prompt: prompt,
        temperature: 0.7,
        maxTokens: 2000,
        abortSignal: controller.signal,
      });

      // Consume the stream
      refinedText = '';
      for await (const textPart of result.textStream) {
        refinedText += textPart;
      }

      clearTimeout(timeoutId);
      console.log("✅ Refined instructions:", refinedText.substring(0, 100) + "...");

    } catch (streamError) {
      clearTimeout(timeoutId);
      console.error("❌ Error in streamText flow:", streamError.name, streamError.message);
      if (streamError.name === 'AbortError') {
        throw new Error('Request timed out after 10 seconds. Please try again.');
      }
      throw streamError;
    }

    // Return refined instructions
    res.json({ refinedInstructions: refinedText.trim() });

  } catch (error) {
    console.error("Error refining instructions:", error);
    res.status(500).json({ error: "Failed to refine instructions: " + error.message });
  }
});

// POST /api/documents/question-next - Generate next question iteratively
app.post("/api/documents/question-next", async (req, res) => {
  try {
    const { documentId, documentType, conversationHistory = [] } = req.body;

    if (!documentId || !documentType) {
      return res.status(400).json({ error: "Missing documentId or documentType" });
    }

    console.log(`❓ Generating next question for ${documentType} (${conversationHistory.length} previous answers)`);

    // Fetch document to get transcript topics
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        transcripts: {
          select: {
            title: true,
            channel: true,
            description: true
          }
        }
      }
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Create brief topic summary
    const transcriptTopics = document.transcripts.map(t => `"${t.title}" by ${t.channel}`).join(', ');

    // Get custom instructions from preferences
    const customInstructions = document.preferences?.customInstructions || '';

    // Get analysis results (including structured_facts) from preferences
    const analysis = document.preferences?.analysis || null;
    const structuredFacts = analysis?.structured_facts || null;

    // Use prompt from prompt management system
    const prompt = getPrompt('question-next', {
      documentType,
      conversationHistory,
      transcriptTopics,
      customInstructions: customInstructions || 'No specific requirements provided',
      analysisSummary: analysis?.analysis_summary || 'No analysis available',
      structuredFacts: structuredFacts ? JSON.stringify(structuredFacts, null, 2) : 'No structured facts extracted'
    });

    console.log("🤖 Calling OpenRouter for next question");

    // Use callLLM for consistent error handling, retry logic, and JSON formatting
    const responseText = await callLLM(prompt, 2000, 0, true);
    const questionData = JSON.parse(responseText);

    // Update document with conversation history
    await prisma.document.update({
      where: { id: documentId },
      data: {
        documentType: documentType,
        preferences: {
          ...document.preferences,
          conversationHistory,
          documentType
        }
      }
    });

    console.log(`✅ Question generated - isLastQuestion: ${questionData.isLastQuestion}`);

    res.json(questionData);
  } catch (error) {
    console.error("Error generating question:", error);
    res.status(500).json({ error: "Failed to generate question: " + error.message });
  }
});

// POST /api/documents/preview-structure - Generate document structure preview
app.post("/api/documents/preview-structure", async (req, res) => {
  try {
    const { documentId, pageLength = 0, customInstructions = '' } = req.body;

    if (!documentId) {
      return res.status(400).json({ error: "Missing documentId" });
    }

    console.log(`📋 Generating structure preview for document ${documentId}`);
    if (pageLength > 0) {
      console.log(`📏 Target length: ${pageLength} pages (~${pageLength * 600} words)`);
    }
    if (customInstructions) {
      console.log(`📝 Custom instructions: ${customInstructions.substring(0, 100)}...`);
    }

    // Fetch document with transcripts
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        transcripts: {
          select: {
            title: true,
            channel: true,
            summary: true,
            description: true
          }
        }
      }
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Get conversation history from preferences
    const conversationHistory = document.preferences?.conversationHistory || [];
    const documentType = document.documentType;

    // Build transcript summaries
    const transcriptSummaries = document.transcripts.map((t, i) => {
      const summary = t.summary || t.description || 'No summary available';
      return `
Transcript ${i + 1}: ${t.title} by ${t.channel}
${summary}
---`;
    }).join('\n\n');

    // Calculate target word count
    const targetWordCount = pageLength > 0 ? pageLength * 600 : 0;
    const pageLengthText = pageLength === 0 ? 'Automatic (AI decides based on content)' : `${pageLength} pages (~${targetWordCount} words)`;

    // Use prompt from prompt management system
    const prompt = getPrompt('preview-structure', {
      documentType,
      conversationHistory,
      transcriptSummaries,
      transcriptCount: document.transcripts.length,
      pageLength: pageLengthText,
      targetWordCount: targetWordCount > 0 ? targetWordCount : 'automatic',
      customInstructions: customInstructions || 'No additional instructions provided'
    });

    console.log("🤖 Calling OpenRouter for structure preview");

    // Add timeout protection
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error("⏱️  Structure preview timed out after 120 seconds");
      controller.abort();
    }, 120000);

    let responseText;
    try {
      const result = await streamText({
        model: openrouter('openai/gpt-oss-120b'),
        prompt: prompt,
        temperature: 0.7,
        maxTokens: 8000,
        abortSignal: controller.signal,
      });

      // Manually consume textStream
      responseText = '';
      for await (const textPart of result.textStream) {
        responseText += textPart;
      }
    } catch (streamError) {
      clearTimeout(timeoutId);
      if (streamError.name === 'AbortError') {
        throw new Error('Structure preview timed out. Please try again.');
      }
      throw streamError;
    } finally {
      clearTimeout(timeoutId);
    }

    // Parse JSON response
    let structurePreview;
    try {
      structurePreview = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse JSON response:", parseError);
      console.error("Raw response text (first 2000 chars):", responseText.substring(0, 2000));
      console.error("Raw response text (last 500 chars):", responseText.substring(Math.max(0, responseText.length - 500)));
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        structurePreview = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    // Update document with outline, status, and preferences
    await prisma.document.update({
      where: { id: documentId },
      data: {
        title: structurePreview.title,
        outline: structurePreview,
        status: "AWAITING_APPROVAL",
        progress: 10,
        preferences: {
          ...document.preferences,
          pageLength,
          customInstructions
        }
      }
    });

    console.log(`✅ Structure preview generated: ${structurePreview.sections.length} sections`);

    res.json(structurePreview);
  } catch (error) {
    console.error("Error generating structure preview:", error);
    res.status(500).json({ error: "Failed to generate structure preview: " + error.message });
  }
});

// GET /api/documents/:id/status - Get document generation status
app.get("/api/documents/:id/status", async (req, res) => {
  try {
    const { id } = req.params;

    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        progress: true,
        currentStage: true,
        errorMessage: true,
        title: true,
        documentType: true
      }
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json(document);
  } catch (error) {
    console.error("Error fetching document status:", error);
    res.status(500).json({ error: "Failed to fetch document status: " + error.message });
  }
});

// POST /api/documents/generate - Generate document with multi-stage pipeline
app.post("/api/documents/generate", async (req, res) => {
  const { documentId } = req.body;

  if (!documentId) {
    return res.status(400).json({ error: "Missing documentId" });
  }

  // Start generation in background - respond immediately
  res.json({ message: "Document generation started", documentId });

  // Run generation pipeline asynchronously
  generateDocumentPipeline(documentId).catch(error => {
    console.error(`❌ Document generation failed for ${documentId}:`, error);
  });
});

// Multi-stage document generation pipeline
async function generateDocumentPipeline(documentId) {
  try {
    console.log(`\n🚀 Starting document generation pipeline for ${documentId}\n`);

    // Fetch document with all data
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        transcripts: {
          select: {
            id: true,
            title: true,
            channel: true,
            text: true,
            summary: true,
            description: true
          }
        }
      }
    });

    if (!document) {
      throw new Error("Document not found");
    }

    const transcripts = document.transcripts;
    const outline = document.outline;
    const preferences = document.preferences?.conversationHistory || [];
    const pageLength = document.preferences?.pageLength || 0;
    const targetWordCount = pageLength > 0 ? pageLength * 600 : 0;

    // ========== STAGE 1: Use Approved Outline Directly ==========
    console.log("📋 [Stage 1/5] Using approved outline from Stage 0.75...");
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "GENERATING_OUTLINE", currentStage: "generating_outline", progress: 15 }
    });

    // CRITICAL: Use the approved outline directly - no regeneration!
    // This ensures perfect fidelity to what the user approved in Stage 0.75
    const detailedOutline = outline;

    // Validate outline structure
    if (!detailedOutline.sections || !Array.isArray(detailedOutline.sections)) {
      throw new Error("Invalid outline structure: missing sections array");
    }

    console.log(`✅ Using approved outline with ${detailedOutline.sections.length} sections:`);
    detailedOutline.sections.forEach((section, i) => {
      console.log(`   ${i + 1}. ${section.title}`);
    });

    // Create DocumentSection records using the APPROVED section titles
    for (const section of detailedOutline.sections) {
      await prisma.documentSection.create({
        data: {
          documentId,
          sectionNumber: section.number,
          title: section.title,
          description: section.description || '',
          keyTopics: section.keyQuestions || []
        }
      });
    }

    console.log(`✅ Created ${detailedOutline.sections.length} section records from approved outline`);

    // ========== STAGE 1.5 & 2: Extract Content (Sequential per transcript) ==========
    console.log(`\n📦 [Stage 2/5] Extracting content from ${transcripts.length} transcripts...\n`);
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "EXTRACTING", currentStage: `extracting_transcript_1_of_${transcripts.length}`, progress: 25 }
    });

    for (let i = 0; i < transcripts.length; i++) {
      const transcript = transcripts[i];
      const progressPercent = 25 + Math.floor((i / transcripts.length) * 35); // 25% → 60%

      console.log(`  📄 [${i + 1}/${transcripts.length}] Analyzing ${transcript.title}...`);
      await prisma.document.update({
        where: { id: documentId },
        data: { currentStage: `extracting_transcript_${i + 1}_of_${transcripts.length}`, progress: progressPercent }
      });

      // Stage 1.5: Determine extract types
      const extractTypesPrompt = getPrompt('determine-extract-types', {
        transcriptText: transcript.text,
        transcriptTitle: transcript.title,
        outline: JSON.stringify(detailedOutline, null, 2),
        documentType: document.documentType
      });

      const extractTypesResult = await callLLM(extractTypesPrompt, 12000);
      const suggestedTypes = JSON.parse(extractTypesResult);

      // Stage 2: Extract content using suggested types
      const extractContentPrompt = getPrompt('extract-content', {
        transcriptText: transcript.text,
        transcriptTitle: transcript.title,
        outline: JSON.stringify(detailedOutline, null, 2),
        suggestedTypes: JSON.stringify(suggestedTypes, null, 2),
        documentType: document.documentType
      });

      const extractContentResult = await callLLM(extractContentPrompt, 5000);
      const extractions = JSON.parse(extractContentResult);

      // Save extractions to database
      for (const [sectionKey, sectionExtracts] of Object.entries(extractions)) {
        if (!Array.isArray(sectionExtracts) || sectionExtracts.length === 0) continue;

        for (const extract of sectionExtracts) {
          await prisma.documentExtraction.create({
            data: {
              documentId,
              transcriptId: transcript.id,
              sectionRef: sectionKey,
              extractType: extract.type,
              content: extract.content,
              context: extract.context,
              suggestedTypes: suggestedTypes[sectionKey] || null
            }
          });
        }
      }

      console.log(`  ✅ Extracted content for ${Object.keys(extractions).length} sections`);
    }

    // ========== STAGE 3: Synthesize Each Section ==========
    console.log(`\n✍️  [Stage 3/5] Synthesizing ${detailedOutline.sections.length} sections...\n`);
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "SYNTHESIZING", currentStage: `synthesizing_section_1_of_${detailedOutline.sections.length}`, progress: 60 }
    });

    for (let i = 0; i < detailedOutline.sections.length; i++) {
      const section = detailedOutline.sections[i];
      const progressPercent = 60 + Math.floor((i / detailedOutline.sections.length) * 30); // 60% → 90%

      console.log(`  📝 [${i + 1}/${detailedOutline.sections.length}] Writing "${section.title}"...`);
      await prisma.document.update({
        where: { id: documentId },
        data: { currentStage: `synthesizing_section_${i + 1}_of_${detailedOutline.sections.length}`, progress: progressPercent }
      });

      // Fetch ALL extractions for this section
      const sectionKey = `section_${section.number}`;
      const allExtracts = await prisma.documentExtraction.findMany({
        where: { documentId, sectionRef: sectionKey }
      });

      // Organize extracts by type
      const extractsByType = {};
      for (const extract of allExtracts) {
        if (!extractsByType[extract.extractType]) {
          extractsByType[extract.extractType] = [];
        }
        extractsByType[extract.extractType].push({
          content: extract.content,
          context: extract.context
        });
      }

      // Calculate target word count per section (if specified)
      const sectionCount = detailedOutline.sections.length;
      const targetSectionWords = targetWordCount > 0 ? Math.floor(targetWordCount / sectionCount) : 0;
      const wordCountGuidance = targetSectionWords > 0
        ? `approximately ${targetSectionWords} words (±20% is acceptable)`
        : 'automatic (typically 800-1,500 words)';

      // Prepare transcript texts for fact-checking during synthesis
      const fullTranscripts = transcripts.map(t => ({
        title: t.title,
        channel: t.channel || '',
        text: t.text
      }));

      // Synthesize section with full transcript access for fact-checking
      const synthesizePrompt = getPrompt('synthesize-section', {
        sectionNumber: section.number,
        sectionTitle: section.title,
        sectionDescription: section.description,
        keyQuestions: JSON.stringify(section.keyQuestions || []),
        allExtracts: JSON.stringify(extractsByType, null, 2),
        fullTranscripts: JSON.stringify(fullTranscripts, null, 2),
        documentType: document.documentType,
        preferences: JSON.stringify(preferences, null, 2),
        transcriptCount: transcripts.length,
        targetWordCount: wordCountGuidance
      });

      const sectionContent = await callLLM(synthesizePrompt, 5000, 0, false);

      // Update section with synthesized content
      await prisma.documentSection.update({
        where: { documentId_sectionNumber: { documentId, sectionNumber: section.number } },
        data: { content: sectionContent }
      });

      console.log(`  ✅ Section "${section.title}" complete (${sectionContent.length} chars)`);
    }

    // ========== STAGE 4: Polish Final Document ==========
    console.log(`\n✨ [Stage 4/5] Polishing final document...\n`);
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "POLISHING", currentStage: "polishing_document", progress: 90 }
    });

    // Fetch all section content
    const sections = await prisma.documentSection.findMany({
      where: { documentId },
      orderBy: { sectionNumber: 'asc' }
    });

    const allSections = sections.map(s => `# ${s.title}\n\n${s.content}`).join('\n\n');
    const sectionTitles = sections.map(s => s.title);

    const polishPrompt = getPrompt('polish-document', {
      documentTitle: document.title,
      documentType: document.documentType,
      allSections,
      sectionTitles: JSON.stringify(sectionTitles),
      preferences: JSON.stringify(preferences, null, 2),
      transcriptCount: transcripts.length
    });

    const finalDocument = await callLLM(polishPrompt, 20000, 0, false);

    // Strip any markdown code fences that LLM might have added
    const sanitizedDocument = stripMarkdownCodeFences(finalDocument);

    // Calculate word count
    const wordCount = sanitizedDocument.split(/\s+/).filter(w => w.length > 0).length;

    // Save final document
    await prisma.document.update({
      where: { id: documentId },
      data: {
        content: sanitizedDocument,
        wordCount,
        status: "COMPLETE",
        currentStage: "complete",
        progress: 100
      }
    });

    console.log(`\n🎉 Document generation complete! ${wordCount} words\n`);

  } catch (error) {
    console.error("❌ Pipeline error:", error);
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: "FAILED",
        errorMessage: error.message
      }
    }).catch(err => console.error("Failed to update error status:", err));
  }
}

// Helper function to sanitize and extract JSON from LLM response
function sanitizeJSON(text) {
  // Step 1: Remove text before first { or [
  const startIdx = text.search(/[{\[]/);
  if (startIdx > 0) {
    text = text.substring(startIdx);
  }

  // Step 2: Remove text after last } or ]
  let endIdx = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (endIdx > 0 && endIdx < text.length - 1) {
    text = text.substring(0, endIdx + 1);
  }

  // Step 3: Remove markdown code blocks
  text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');

  // Step 4: Remove trailing commas
  text = text.replace(/,(\s*[}\]])/g, '$1');

  // Step 5: Trim whitespace
  text = text.trim();

  // Step 5.5: Pre-parse fixing - catch common LLM quote mistakes before jsonrepair
  let fixesApplied = [];

  // Fix 1: Missing opening quote after colon (e.g., "context":Indicates → "context": "Indicates)
  const missingOpenQuotePattern = /:\s*([A-Z][a-zA-Z]+)/g;
  if (missingOpenQuotePattern.test(text)) {
    text = text.replace(/:\s*([A-Z][a-zA-Z]+)/g, ': "$1');
    fixesApplied.push('missing-opening-quote');
  }

  if (fixesApplied.length > 0) {
    console.log(`🔧 Pre-parse fixes applied: ${fixesApplied.join(', ')}`);
  }

  // Step 6: Try parsing directly first
  try {
    JSON.parse(text);
    return text;
  } catch (err) {
    // Enhanced diagnostics before attempting repair
    console.error('❌ JSON.parse failed, attempting repair...');
    console.error('Parse error:', err.message);
    console.error('JSON length:', text.length, 'characters');

    // Extract error position if available
    const positionMatch = err.message.match(/position (\d+)/);
    if (positionMatch) {
      const errorPos = parseInt(positionMatch[1]);
      const contextStart = Math.max(0, errorPos - 100);
      const contextEnd = Math.min(text.length, errorPos + 100);
      const charAtError = text.charAt(errorPos);

      console.error(`🔍 Error at position ${errorPos} (char: "${charAtError}", code: ${charAtError.charCodeAt(0)})`);
      console.error('Context:', text.substring(contextStart, contextEnd));
    }

    console.error('📄 First 500 chars:', text.substring(0, 500));
    console.error('📄 Last 500 chars:', text.substring(Math.max(0, text.length - 500)));

    // Step 7: Fallback to jsonrepair for more aggressive fixing
    try {
      const repaired = jsonrepair(text);
      console.log('✅ JSON repaired successfully using jsonrepair');
      return repaired;
    } catch (repairErr) {
      console.error('❌ JSON repair also failed:', repairErr.message);
      throw new Error(`JSON repair failed: ${err.message}`);
    }
  }
}

// Helper function to strip markdown code fences from LLM output
// LLMs sometimes wrap content in ```markdown or ``` fences, which would render as code blocks
function stripMarkdownCodeFences(text) {
  // Remove opening ```markdown or ``` at start
  text = text.replace(/^```(?:markdown)?\s*\n/i, '');

  // Remove closing ``` at end
  text = text.replace(/\n```\s*$/i, '');

  return text.trim();
}

// Helper function to call LLM with consistent error handling and retry logic
async function callLLM(prompt, maxTokens = 2000, retryCount = 0, expectJSON = true) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min per call

  try {
    const streamConfig = {
      model: openrouter('openai/gpt-oss-120b'),
      prompt,
      temperature: 0.7,
      maxTokens,
      abortSignal: controller.signal
    };

    // Force JSON output format when expecting JSON
    if (expectJSON) {
      streamConfig.response_format = { type: "json_object" };
    }

    const result = await streamText(streamConfig);

    let responseText = '';
    for await (const textPart of result.textStream) {
      responseText += textPart;
    }

    clearTimeout(timeoutId);

    // If we don't expect JSON, return the raw text
    if (!expectJSON) {
      console.log('✅ Returning text response (no JSON parsing)');
      return responseText;
    }

    // Try to parse as JSON
    try {
      const sanitized = sanitizeJSON(responseText);
      JSON.parse(sanitized); // Validate it's valid JSON
      return sanitized;
    } catch (parseError) {
      console.error(`❌ JSON parse error (attempt ${retryCount + 1}):`, parseError.message);

      // Extract error position if available (e.g., "at position 515")
      const positionMatch = parseError.message.match(/position (\d+)/);
      if (positionMatch) {
        const errorPos = parseInt(positionMatch[1]);
        const contextStart = Math.max(0, errorPos - 100);
        const contextEnd = Math.min(responseText.length, errorPos + 100);
        const context = responseText.substring(contextStart, contextEnd);
        const charAtError = responseText.charAt(errorPos);

        console.error(`🔍 Context around error position ${errorPos}:`);
        console.error(`   "${context}"`);
        console.error(`   Character at position ${errorPos}: "${charAtError}" (code: ${charAtError.charCodeAt(0)})`);
      }

      console.error('📄 Full LLM response (first 1000 chars):', responseText.substring(0, 1000));

      // If this is the first attempt, retry with a clearer prompt emphasizing JSON structure
      if (retryCount === 0) {
        console.log('🔄 Retrying with clearer JSON prompt and structural guidance...');
        const retryPrompt = `Your previous response had invalid JSON structure that could not be parsed.

CRITICAL RULES for your response:

1. **Return PURE JSON ONLY** - no markdown code fences (\`\`\`json), no explanations, no text outside the JSON object
2. **Start with { and end with }** - nothing before or after
3. **Proper structure:**
   - All property names in double quotes: "section_1"
   - Commas between all items (except the last in each group)
   - NO trailing commas before closing braces or brackets

4. **Extract type names** (in arrays):
   - Use ONLY lowercase letters, numbers, underscores: a-z, 0-9, _
   - No special characters: NO apostrophes ('), dollar signs ($), hyphens (-)
   - Good: "metric_5k_mrr", "dont_rush_technique"
   - Bad: "don't_rush", "$5K", "metric-name"

5. **Rationale text** (prose description):
   - Apostrophes are fine: "The chef's technique..."
   - But escape double quotes: "The chef said \\"fresh\\" ingredients..."
   - Example: "rationale": "This transcript covers the chef's technique using \\"fresh\\" ingredients and demonstrates..."

6. **Complete the response** - don't truncate mid-JSON

Example valid structure:
{
  "section_1": {
    "extractTypes": ["type_one", "type_two"],
    "rationale": "This section's content uses \\"specific\\" examples..."
  }
}

Original request:
${prompt}`;
        return await callLLM(retryPrompt, maxTokens, retryCount + 1, expectJSON);
      }

      // If it's markdown content (not JSON), return as-is
      if (!responseText.includes('{') && !responseText.includes('[')) {
        return responseText;
      }

      // Final attempt failed - throw detailed error
      throw new Error(`Failed to parse JSON after ${retryCount + 1} attempts: ${parseError.message}. Response preview: ${responseText.substring(0, 200)}`);
    }
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('LLM call timed out after 2 minutes');
    }
    throw error;
  }
}

// GET /api/documents - List all documents
app.get("/api/documents", async (req, res) => {
  try {
    const documents = await prisma.document.findMany({
      include: {
        transcripts: {
          select: {
            id: true,
            title: true,
            channel: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform to include transcript count
    const documentsWithCount = documents.map(doc => ({
      ...doc,
      transcriptCount: doc.transcripts.length
    }));

    res.json(documentsWithCount);
  } catch (error) {
    console.error("Error fetching documents:", error);
    res.status(500).json({ error: "Failed to fetch documents: " + error.message });
  }
});

// GET /api/documents/:id - Get single document
app.get("/api/documents/:id", async (req, res) => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: {
        transcripts: {
          select: {
            id: true,
            title: true,
            channel: true
          }
        }
      }
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json(document);
  } catch (error) {
    console.error("Error fetching document:", error);
    res.status(500).json({ error: "Failed to fetch document: " + error.message });
  }
});

// DELETE /api/documents/:id - Delete document
app.delete("/api/documents/:id", async (req, res) => {
  try {
    await prisma.document.delete({
      where: { id: req.params.id }
    });

    console.log(`🗑️  Document deleted: ${req.params.id}`);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    res.status(500).json({ error: "Failed to delete document: " + error.message });
  }
});

/* ==================================================================
   AGENTIC DOCUMENT GENERATION ENDPOINTS
   Autonomous agent-based document generation for A/B testing
   ================================================================== */
app.use('/api/agent-documents', agentDocumentsRouter);

/* ==================================================================
   TRANSCRIPT CHUNKING ENDPOINTS
   Chunk transcripts for scalable agent access
   ================================================================== */
app.use('/api/transcripts', transcriptChunkingRouter);

// PUT /api/documents/:id/regenerate - Regenerate document
app.put("/api/documents/:id/regenerate", async (req, res) => {
  try {
    // Get existing document
    const existingDoc = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: {
        transcripts: {
          select: { id: true }
        }
      }
    });

    if (!existingDoc) {
      return res.status(404).json({ error: "Document not found" });
    }

    console.log(`🔄 Regenerating document: ${existingDoc.title}`);

    // Fetch transcripts with full text
    const transcripts = await prisma.transcript.findMany({
      where: { id: { in: existingDoc.transcripts.map(t => t.id) } },
      select: {
        id: true,
        title: true,
        channel: true,
        text: true,
        description: true,
        summary: true
      }
    });

    // Build generation prompt (same as generate endpoint)
    const transcriptTexts = transcripts.map(t => `
═══════════════════════════════════════
Title: ${t.title}
Channel: ${t.channel}
Summary: ${t.summary || t.description || 'No summary'}

Full Transcript:
${t.text}
═══════════════════════════════════════
`).join('\n\n');

    const preferencesText = Object.entries(existingDoc.preferences || {})
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');

    const prompt = `You are a professional document writer creating a "${existingDoc.documentType}".

User Preferences:
${preferencesText || '- No specific preferences provided'}

Your task: Create a comprehensive, well-structured ${existingDoc.documentType} by synthesizing ALL the content from the transcripts below.

Guidelines:
- Use markdown formatting with clear headers (##, ###)
- Include relevant examples and quotes from the transcripts
- Create a logical flow and structure
- Match the requested tone and detail level

Transcripts to synthesize:
${transcriptTexts}

Now write the ${existingDoc.documentType}:`;

    const result = await streamText({
      model: openrouter('openai/gpt-oss-120b'),
      prompt: prompt,
      temperature: 0.7,
      maxTokens: 8000,
    });

    const fullContent = await result.text;
    const wordCount = fullContent.split(/\s+/).filter(w => w.length > 0).length;

    // Update existing document (overwrite)
    const updatedDoc = await prisma.document.update({
      where: { id: req.params.id },
      data: {
        content: fullContent,
        wordCount: wordCount,
        updatedAt: new Date()
      },
      include: {
        transcripts: {
          select: {
            id: true,
            title: true,
            channel: true
          }
        }
      }
    });

    console.log(`✅ Document regenerated: ${updatedDoc.id} (${wordCount} words)`);
    res.json(updatedDoc);

  } catch (error) {
    console.error("Error regenerating document:", error);
    res.status(500).json({ error: "Failed to regenerate document: " + error.message });
  }
});

// GET /api/documents/:id/download/:format - Download document
app.get("/api/documents/:id/download/:format", async (req, res) => {
  try {
    const { id, format } = req.params;

    const document = await prisma.document.findUnique({
      where: { id }
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (format === 'md' || format === 'markdown') {
      // Download as Markdown
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="${document.title.replace(/[^a-z0-9]/gi, '_')}.md"`);
      res.send(document.content);
    } else if (format === 'pdf') {
      // TODO: Implement PDF export using puppeteer
      res.status(501).json({ error: "PDF export not yet implemented" });
    } else if (format === 'docx') {
      // TODO: Implement DOCX export
      res.status(501).json({ error: "DOCX export not yet implemented" });
    } else {
      res.status(400).json({ error: "Unsupported format. Use: md, pdf, or docx" });
    }
  } catch (error) {
    console.error("Error downloading document:", error);
    res.status(500).json({ error: "Failed to download document: " + error.message });
  }
});

   /* ==================================================================
      /api/import-jobs – GET CURRENT IMPORT JOBS
      ================================================================== */
   app.get("/api/import-jobs", async (req, res) => {
     try {
       const { status } = req.query;
       
       // Validate status query if provided
       const allowedStatus = ['active', 'pending', 'processing', 'done', 'error'];
       if (status && !allowedStatus.includes(String(status).toLowerCase())) {
         return res.status(400).json({ error: "Invalid status filter" });
       }
       
       // Build optional filtering based on status
       const whereClause = {};
       
       if (status && String(status).toLowerCase() === 'active') {
         // Treat active as jobs that are pending or currently processing
         whereClause.state = { in: ['PENDING', 'PROCESSING'] };
       } else if (status) {
         // Map to single state filter (uppercase enum)
         whereClause.state = String(status).toUpperCase();
       }
       
       const jobs = await prisma.importJob.findMany({
         where: whereClause,
         select: {
           id: true,
           url: true,
           state: true,
           progress: true,
           error: true
         },
         orderBy: { createdAt: 'desc' }
       });
       res.json(jobs);
     } catch (error) {
       console.error("Error fetching import jobs:", error);
       res.status(500).json({ error: "Failed to fetch import jobs" });
     }
   });

   /* ==================================================================
      /api/process-queue - Manually trigger queue processing
      ================================================================== */
   app.post("/api/process-queue", async (req, res) => {
     try {
       console.log('[API] /api/process-queue - Manual queue trigger requested');

       // Check if there are pending jobs
       const pendingCount = await prisma.importJob.count({ where: { state: 'PENDING' } });
       console.log('[API] /api/process-queue - Found', pendingCount, 'pending jobs');

       if (pendingCount === 0) {
         return res.json({ message: 'No pending jobs to process', pending: 0 });
       }

       // Start the queue processor in the background
       res.json({ message: `Starting queue processor for ${pendingCount} jobs`, pending: pendingCount });

       // Trigger processing (don't await - let it run in background)
       console.log('[API] /api/process-queue - Starting background processing');
       processImportQueue().catch(err => {
         console.error('[API] /api/process-queue - Background processing error:', err);
       });

     } catch (error) {
       console.error('[API] /api/process-queue - Error:', error);
       res.status(500).json({ error: error.message });
     }
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
   
   // Clean up Prisma connection on exit
   process.on('beforeExit', async () => {
     await prisma.$disconnect();
   });
   
   /* ----- start ------------------------------------------------------ */
   server.listen(PORT, async () => {
     console.log(`>>> API listening on http://localhost:${PORT}`);
     console.log(`>>> WebSocket server ready for real-time progress updates`);

     // Log registered routes
     if (app._router && app._router.stack) {
       console.log("Registered routes:");
       app._router.stack
         .filter((l) => l.route)
         .forEach((l) =>
           console.log(
             "  ",
             Object.keys(l.route.methods)[0].toUpperCase(),
             l.route.path
           )
         );
     }

     // Auto-resume: Check for orphaned jobs on startup
     try {
       console.log('[Startup] Checking for orphaned import jobs...');

       // Reset any stuck PROCESSING jobs back to PENDING
       // (they were interrupted by server restart)
       const stuckJobs = await prisma.importJob.updateMany({
         where: { state: 'PROCESSING' },
         data: { state: 'PENDING', progress: 0 }
       });

       if (stuckJobs.count > 0) {
         console.log(`[Startup] Reset ${stuckJobs.count} stuck PROCESSING jobs to PENDING`);
       }

       // Check for PENDING jobs
       const pendingCount = await prisma.importJob.count({
         where: { state: 'PENDING' }
       });

       if (pendingCount > 0) {
         console.log(`[Startup] Found ${pendingCount} pending jobs - starting queue processor`);
         // Start the queue processor in the background
         processImportQueue().catch(err => {
           console.error('[Startup] Queue processor error:', err);
         });
       } else {
         console.log('[Startup] No pending jobs found');
       }

       // Start queue health monitoring
       startQueueHealthMonitoring();

     } catch (error) {
       console.error('[Startup] Error checking for orphaned jobs:', error);
     }
   });

export { app };
