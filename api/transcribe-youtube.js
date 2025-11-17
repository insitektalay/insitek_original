// api/transcribe-youtube.js
import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "Missing YouTube URL" });
  }

  console.log("🚀 Starting transcription for URL:", url);

  exec(`bash youtube_transcribe.sh "${url}"`, async (error, stdout, stderr) => {
    if (error) {
      console.error("❌ Shell error:", error);
      console.error("❌ stderr:", stderr);
      return res.status(500).json({ error: "Transcription failed" });
    }

    console.log("✅ Script completed successfully");
    console.log("📋 Script output:", stdout);

    const lines = stdout.split("\n");
    
    console.log("🔍 All lines from bash script:");
    lines.forEach((line, i) => console.log(`  ${i}: "${line}"`));
    
    // Parse the script output
    const fileLine = lines.find((line) => line.startsWith("FILE:"));
    const titleLine = lines.find((line) => line.startsWith("TITLE:"));
    const channelLine = lines.find((line) => line.startsWith("CHANNEL:"));
    const publishLine = lines.find((line) => line.startsWith("PUBLISH:"));
    
    console.log("🔍 Parsing results:");
    console.log("  FILE line found:", fileLine);
    console.log("  TITLE line found:", titleLine);
    console.log("  CHANNEL line found:", channelLine);
    console.log("  PUBLISH line found:", publishLine);
    
    if (!fileLine) {
      console.error("❌ No FILE: line found in output");
      return res.status(500).json({ error: "Script did not output filename" });
    }

    // Extract values
    const filename = fileLine.replace("FILE:", "").trim();
    const title = titleLine ? titleLine.replace("TITLE:", "").trim() : "Untitled";
    const channel = channelLine ? channelLine.replace("CHANNEL:", "").trim() : "Unknown";
    const publishDateStr = publishLine ? publishLine.replace("PUBLISH:", "").trim() : "";
    
    console.log("📝 Extracted values:");
    console.log("  filename:", `"${filename}"`);
    console.log("  title:", `"${title}"`);
    console.log("  channel:", `"${channel}"`);
    console.log("  publishDateStr:", `"${publishDateStr}"`);
    
    // Parse publish date
    let publishDate = null;
    if (publishDateStr && publishDateStr !== "") {
      try {
        publishDate = new Date(publishDateStr);
        console.log("✅ Parsed publish date:", publishDate);
      } catch (e) {
        console.warn("⚠️ Could not parse publish date:", publishDateStr);
      }
    }

    // Extract YouTube ID from the filename (yt_ABC123.txt -> ABC123)
    const youtubeId = filename.replace("yt_", "").replace(".txt", "");
    console.log("📹 YouTube ID:", youtubeId);

    // Read the transcript file
    const transcriptPath = path.join(process.cwd(), filename);
    console.log("📂 Full transcript path:", transcriptPath);
    
    try {
      // Check if file exists
      console.log("🔍 Checking if file exists...");
      try {
        await fs.access(transcriptPath);
        console.log("✅ File exists");
      } catch (accessErr) {
        console.log("❌ File does not exist");
        console.log("📁 Files in current directory:");
        const files = await fs.readdir(process.cwd());
        files.forEach(file => console.log(`  - ${file}`));
        throw new Error(`File not found: ${filename}`);
      }
      
      console.log("📖 Reading file content...");
      const transcript = await fs.readFile(transcriptPath, "utf-8");
      console.log("✅ File read successfully");
      console.log("📏 Transcript length:", transcript.length, "characters");
      console.log("👀 First 200 chars:", transcript.substring(0, 200));
      
      // **SAVE TO DATABASE**
      console.log("💾 Saving to database...");
      const savedTranscript = await prisma.transcript.create({
        data: {
          youtubeId: youtubeId,
          title: title,
          channel: channel,
          text: transcript,
          publishDate: publishDate,
          source: "YOUTUBE",
          sourceUrl: url
        }
      });

      console.log("✅ Saved to database with ID:", savedTranscript.id);
      
      // Clean up the transcript file after saving to database
      try {
        await fs.unlink(transcriptPath);
        console.log("🗑️ Cleaned up transcript file:", filename);
      } catch (cleanupErr) {
        console.warn("⚠️ Could not clean up file:", filename, cleanupErr.message);
      }
      
      console.log("🎉 Import completed successfully!");
      
      return res.status(200).json({ 
        title, 
        transcript,
        channel,
        publishDate: publishDateStr,
        source: "YOUTUBE",
        id: savedTranscript.id
      });
      
    } catch (err) {
      console.error("❌ DETAILED ERROR:");
      console.error("  Error type:", err.constructor.name);
      console.error("  Error code:", err.code);
      console.error("  Error message:", err.message);
      console.error("  Full error:", err);
      console.error("  Tried to read:", transcriptPath);
      
      // Check if it's a database error or file read error
      if (err.code && err.code.startsWith('P')) {
        // Prisma error
        console.error("🗄️ This is a Prisma/Database error");
        return res.status(500).json({ error: `Database error: ${err.message}` });
      } else if (err.code === 'ENOENT') {
        // File not found error
        console.error("📁 This is a file not found error");
        return res.status(500).json({ error: `Transcript file not found: ${filename}` });
      } else {
        // Other error
        console.error("❓ This is some other error");
        return res.status(500).json({ error: `Failed to save transcript: ${err.message}` });
      }
    }
  });
}