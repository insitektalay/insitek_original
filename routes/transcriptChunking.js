// routes/transcriptChunking.js
// API routes for transcript chunking operations

import express from 'express';
import { chunkTranscript, chunkAllTranscripts } from '../services/transcriptChunker.js';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/transcripts/chunk/:id
 * Chunk a single transcript
 */
router.post('/chunk/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify transcript exists
    const transcript = await prisma.transcript.findUnique({
      where: { id },
      select: { id: true, title: true }
    });

    if (!transcript) {
      return res.status(404).json({
        error: `Transcript with ID ${id} not found`
      });
    }

    console.log(`📦 Chunking transcript: ${transcript.title}`);

    // Chunk the transcript
    const result = await chunkTranscript(id);

    res.json({
      success: true,
      ...result,
      message: result.alreadyChunked
        ? `Transcript already chunked (${result.totalChunks} chunks)`
        : `Successfully chunked transcript into ${result.totalChunks} chunks`
    });
  } catch (error) {
    console.error('❌ Chunk transcript error:', error);
    res.status(500).json({
      error: 'Failed to chunk transcript',
      details: error.message
    });
  }
});

/**
 * POST /api/transcripts/chunk-all
 * Chunk all transcripts that haven't been chunked yet
 */
router.post('/chunk-all', async (req, res) => {
  try {
    console.log('📦 Starting bulk chunking operation...');

    // Start chunking (this may take a while)
    const result = await chunkAllTranscripts();

    res.json({
      success: true,
      ...result,
      message: `Chunked ${result.successful} transcript(s), ${result.failed} failed`
    });
  } catch (error) {
    console.error('❌ Bulk chunk error:', error);
    res.status(500).json({
      error: 'Failed to chunk transcripts',
      details: error.message
    });
  }
});

/**
 * GET /api/transcripts/chunking-status
 * Get overview of chunking status across all transcripts
 */
router.get('/chunking-status', async (req, res) => {
  try {
    const totalTranscripts = await prisma.transcript.count();
    const chunkedTranscripts = await prisma.transcriptMetadata.count();
    const unchunkedTranscripts = totalTranscripts - chunkedTranscripts;

    // Get sample of chunked transcripts with stats
    const sampleChunked = await prisma.transcript.findMany({
      where: {
        metadata: { isNot: null }
      },
      select: {
        id: true,
        title: true,
        metadata: {
          select: {
            totalChunks: true,
            avgChunkSize: true,
            topics: true,
            hasSummary: true,
            lastChunkedAt: true
          }
        }
      },
      take: 10,
      orderBy: {
        metadata: {
          lastChunkedAt: 'desc'
        }
      }
    });

    res.json({
      success: true,
      totalTranscripts,
      chunkedTranscripts,
      unchunkedTranscripts,
      percentageChunked: totalTranscripts > 0 ? Math.round((chunkedTranscripts / totalTranscripts) * 100) : 0,
      recentlyChunked: sampleChunked
    });
  } catch (error) {
    console.error('❌ Chunking status error:', error);
    res.status(500).json({
      error: 'Failed to get chunking status',
      details: error.message
    });
  }
});

/**
 * GET /api/transcripts/:id/chunks
 * Get all chunks for a specific transcript
 */
router.get('/:id/chunks', async (req, res) => {
  try {
    const { id } = req.params;

    const transcript = await prisma.transcript.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        metadata: true,
        chunks: {
          orderBy: { chunkIndex: 'asc' },
          select: {
            id: true,
            chunkIndex: true,
            wordCount: true,
            summary: true,
            keywords: true,
            startTime: true,
            endTime: true
          }
        }
      }
    });

    if (!transcript) {
      return res.status(404).json({
        error: `Transcript with ID ${id} not found`
      });
    }

    if (!transcript.metadata) {
      return res.json({
        success: true,
        transcriptId: id,
        title: transcript.title,
        isChunked: false,
        chunks: [],
        message: 'Transcript has not been chunked yet. Use POST /api/transcripts/chunk/:id to chunk it.'
      });
    }

    res.json({
      success: true,
      transcriptId: id,
      title: transcript.title,
      isChunked: true,
      totalChunks: transcript.metadata.totalChunks,
      avgChunkSize: transcript.metadata.avgChunkSize,
      topics: transcript.metadata.topics,
      chunks: transcript.chunks
    });
  } catch (error) {
    console.error('❌ Get chunks error:', error);
    res.status(500).json({
      error: 'Failed to get chunks',
      details: error.message
    });
  }
});

export default router;
