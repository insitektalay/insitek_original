// services/transcriptChunker.js
// Chunks large transcripts into manageable pieces for scalable access

import { PrismaClient } from '@prisma/client';
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const prisma = new PrismaClient();
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const TARGET_CHUNK_SIZE = 2000; // Words per chunk
const MIN_CHUNK_SIZE = 1500;    // Don't create chunks smaller than this
const MAX_CHUNK_SIZE = 2500;    // Don't create chunks larger than this

/**
 * Count words in text
 */
function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Extract keywords using simple TF-IDF-like approach
 * Returns top 10 most significant words
 */
function extractKeywords(text) {
  // Remove common words (basic stopwords)
  const stopwords = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
    'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go',
    'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
    'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them',
    'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over',
    'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work',
    'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
    'give', 'day', 'most', 'us', 'is', 'was', 'are', 'been', 'has', 'had',
    'were', 'said', 'did', 'having', 'may', 'should', 'could', 'would'
  ]);

  // Extract words, filter stopwords, count frequency
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopwords.has(word));

  const frequency = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });

  // Sort by frequency and return top 10
  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

/**
 * Split text into chunks respecting paragraph boundaries
 */
function intelligentChunk(text, targetSize = TARGET_CHUNK_SIZE) {
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let currentChunk = [];
  let currentWordCount = 0;

  for (const paragraph of paragraphs) {
    const paragraphWordCount = countWords(paragraph);

    // If single paragraph is already larger than max size, force split it
    if (paragraphWordCount > MAX_CHUNK_SIZE) {
      // Finish current chunk if it has content
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n\n'));
        currentChunk = [];
        currentWordCount = 0;
      }

      // Split the large paragraph by sentences
      const sentences = paragraph.split(/\.\s+/);
      let sentenceChunk = [];
      let sentenceWordCount = 0;

      for (const sentence of sentences) {
        const sentenceWords = countWords(sentence);
        if (sentenceWordCount + sentenceWords > TARGET_CHUNK_SIZE && sentenceChunk.length > 0) {
          chunks.push(sentenceChunk.join('. ') + '.');
          sentenceChunk = [];
          sentenceWordCount = 0;
        }
        sentenceChunk.push(sentence);
        sentenceWordCount += sentenceWords;
      }

      if (sentenceChunk.length > 0) {
        chunks.push(sentenceChunk.join('. ') + '.');
      }
      continue;
    }

    // Check if adding this paragraph would exceed target
    if (currentWordCount + paragraphWordCount > TARGET_CHUNK_SIZE && currentChunk.length > 0) {
      // Finish current chunk
      chunks.push(currentChunk.join('\n\n'));
      currentChunk = [];
      currentWordCount = 0;
    }

    currentChunk.push(paragraph);
    currentWordCount += paragraphWordCount;
  }

  // Add final chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n\n'));
  }

  return chunks;
}

/**
 * Extract time range from segments if available
 */
function getTimeRange(segments, startIndex, endIndex) {
  if (!segments || segments.length === 0) {
    return { startTime: null, endTime: null };
  }

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Find approximate segment indices based on character positions
  // This is approximate since we're chunking by words, not characters
  const totalChars = segments.reduce((sum, seg) => sum + (seg.text?.length || 0), 0);
  const startSegment = segments[Math.floor((startIndex / segments.length) * segments.length)];
  const endSegment = segments[Math.min(Math.floor((endIndex / segments.length) * segments.length), segments.length - 1)];

  return {
    startTime: startSegment?.start ? formatTime(startSegment.start) : null,
    endTime: endSegment?.end ? formatTime(endSegment.end) : null,
  };
}

/**
 * Generate summary for a chunk using AI
 */
async function generateChunkSummary(chunkContent, transcriptTitle) {
  try {
    const result = await generateText({
      model: openrouter('openai/gpt-4o-mini'), // Fast and cheap
      prompt: `Summarize this excerpt from "${transcriptTitle}" in 2-3 concise sentences. Focus on the main topics and key points discussed:\n\n${chunkContent.substring(0, 3000)}`,
      maxTokens: 150,
    });

    return result.text;
  } catch (error) {
    console.error('Error generating chunk summary:', error);
    return null;
  }
}

/**
 * Chunk and index a single transcript
 */
export async function chunkTranscript(transcriptId) {
  console.log(`[ChunkService] Starting chunking for transcript ${transcriptId}`);

  // Get transcript
  const transcript = await prisma.transcript.findUnique({
    where: { id: transcriptId },
    include: {
      metadata: true,
      chunks: true,
    },
  });

  if (!transcript) {
    throw new Error(`Transcript ${transcriptId} not found`);
  }

  // Check if already chunked
  if (transcript.chunks.length > 0) {
    console.log(`[ChunkService] Transcript ${transcriptId} already chunked, skipping`);
    return {
      transcriptId,
      alreadyChunked: true,
      totalChunks: transcript.chunks.length,
    };
  }

  const wordCount = countWords(transcript.text);
  console.log(`[ChunkService] Transcript has ${wordCount} words`);

  // If transcript is small, create a single chunk
  if (wordCount < MIN_CHUNK_SIZE) {
    console.log(`[ChunkService] Transcript is small, creating single chunk`);

    const summary = await generateChunkSummary(transcript.text, transcript.title);
    const keywords = extractKeywords(transcript.text);

    await prisma.transcriptChunk.create({
      data: {
        transcriptId,
        chunkIndex: 0,
        content: transcript.text,
        wordCount,
        summary,
        keywords,
        startTime: transcript.segments?.[0]?.start ? formatTime(transcript.segments[0].start) : null,
        endTime: transcript.segments?.[transcript.segments.length - 1]?.end ? formatTime(transcript.segments[transcript.segments.length - 1].end) : null,
      },
    });

    await prisma.transcriptMetadata.create({
      data: {
        transcriptId,
        totalChunks: 1,
        avgChunkSize: wordCount,
        topics: keywords,
        speakers: [],
        hasSummary: !!summary,
      },
    });

    console.log(`[ChunkService] Created single chunk for transcript ${transcriptId}`);
    return { transcriptId, totalChunks: 1, avgChunkSize: wordCount };
  }

  // Chunk the transcript
  const chunks = intelligentChunk(transcript.text);
  console.log(`[ChunkService] Created ${chunks.length} chunks`);

  // Process each chunk
  const chunkRecords = [];
  let totalWords = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunkContent = chunks[i];
    const chunkWordCount = countWords(chunkContent);
    totalWords += chunkWordCount;

    console.log(`[ChunkService] Processing chunk ${i + 1}/${chunks.length} (${chunkWordCount} words)`);

    // Generate summary
    const summary = await generateChunkSummary(chunkContent, transcript.title);

    // Extract keywords
    const keywords = extractKeywords(chunkContent);

    // Estimate time range if segments available
    const { startTime, endTime } = getTimeRange(transcript.segments, i, i + 1);

    const chunkRecord = await prisma.transcriptChunk.create({
      data: {
        transcriptId,
        chunkIndex: i,
        content: chunkContent,
        wordCount: chunkWordCount,
        summary,
        keywords,
        startTime,
        endTime,
      },
    });

    chunkRecords.push(chunkRecord);
  }

  // Extract overall topics (most common keywords across all chunks)
  const allKeywords = chunkRecords.flatMap(chunk => chunk.keywords);
  const keywordFrequency = {};
  allKeywords.forEach(kw => {
    keywordFrequency[kw] = (keywordFrequency[kw] || 0) + 1;
  });
  const topics = Object.entries(keywordFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  // Create metadata
  await prisma.transcriptMetadata.create({
    data: {
      transcriptId,
      totalChunks: chunks.length,
      avgChunkSize: Math.round(totalWords / chunks.length),
      topics,
      speakers: [], // TODO: Extract from transcript if available
      hasSummary: chunkRecords.every(chunk => chunk.summary !== null),
    },
  });

  console.log(`[ChunkService] Successfully chunked transcript ${transcriptId}: ${chunks.length} chunks, avg ${Math.round(totalWords / chunks.length)} words`);

  return {
    transcriptId,
    totalChunks: chunks.length,
    avgChunkSize: Math.round(totalWords / chunks.length),
    topics,
  };
}

/**
 * Chunk all transcripts in the database that haven't been chunked yet
 */
export async function chunkAllTranscripts() {
  console.log('[ChunkService] Starting bulk chunking operation');

  const transcripts = await prisma.transcript.findMany({
    where: {
      metadata: null, // Not yet chunked
    },
    select: {
      id: true,
      title: true,
    },
  });

  console.log(`[ChunkService] Found ${transcripts.length} transcripts to chunk`);

  const results = [];
  for (const transcript of transcripts) {
    try {
      console.log(`[ChunkService] Chunking: ${transcript.title}`);
      const result = await chunkTranscript(transcript.id);
      results.push({ success: true, ...result });
    } catch (error) {
      console.error(`[ChunkService] Error chunking transcript ${transcript.id}:`, error);
      results.push({ success: false, transcriptId: transcript.id, error: error.message });
    }
  }

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`[ChunkService] Bulk operation complete: ${successful} successful, ${failed} failed`);

  return {
    total: transcripts.length,
    successful,
    failed,
    results,
  };
}

// Helper function for time formatting
function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
