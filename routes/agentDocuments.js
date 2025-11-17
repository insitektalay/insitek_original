// routes/agentDocuments.js
// API routes for agentic document generation

import express from 'express';
import {
  generateAgenticDocument,
  getAgentDocumentStatus,
  getAgentDocument,
  getAgentAnalysis
} from '../services/agentDocumentService.js';
import { getAgentEmitter, hasAgentEmitter } from '../services/agentEventEmitter.js';
import { getAllVariants, getRecommendedVariant } from '../services/agentVariants.js';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/agent-documents/generate
 * Start agentic document generation
 */
router.post('/generate', async (req, res) => {
  try {
    const { transcriptIds, documentType, preferences = {}, variantId = 'scalable' } = req.body;

    // Validate input
    if (!transcriptIds || !Array.isArray(transcriptIds) || transcriptIds.length === 0) {
      return res.status(400).json({
        error: 'transcriptIds array is required and must not be empty'
      });
    }

    if (transcriptIds.length > 50) {
      return res.status(400).json({
        error: 'Maximum 50 transcripts allowed per document'
      });
    }

    if (!documentType || typeof documentType !== 'string') {
      return res.status(400).json({
        error: 'documentType string is required'
      });
    }

    // Verify all transcripts exist
    const transcripts = await prisma.transcript.findMany({
      where: { id: { in: transcriptIds } }
    });

    if (transcripts.length !== transcriptIds.length) {
      return res.status(404).json({
        error: `Some transcripts not found. Expected ${transcriptIds.length}, found ${transcripts.length}`
      });
    }

    console.log(`🚀 Starting agentic generation: ${documentType} from ${transcriptIds.length} transcripts (variant: ${variantId})`);

    // Start generation (non-blocking)
    const document = await generateAgenticDocument(
      transcriptIds,
      documentType,
      preferences,
      variantId
    );

    res.json({
      success: true,
      documentId: document.id,
      variantId,
      message: 'Agent started. Poll /api/agent-documents/:id/status for progress.'
    });
  } catch (error) {
    console.error('❌ Generate endpoint error:', error);
    res.status(500).json({
      error: 'Failed to start generation',
      details: error.message
    });
  }
});

/**
 * GET /api/agent-documents/:id/stream
 * Server-Sent Events (SSE) endpoint for real-time agent progress
 */
router.get('/:id/stream', async (req, res) => {
  const { id } = req.params;

  try {
    // Verify document exists
    const document = await prisma.agentDocument.findUnique({
      where: { id },
      select: { id: true, status: true }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', documentId: id })}\n\n`);

    // Get or create event emitter for this document
    const emitter = getAgentEmitter(id);

    // Set up event listener
    const eventListener = (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    emitter.on('event', eventListener);

    // Handle client disconnect
    req.on('close', () => {
      console.log(`📡 Client disconnected from stream for document ${id}`);
      emitter.off('event', eventListener);
      res.end();
    });

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 30000); // Every 30 seconds

    // Clean up heartbeat on close
    req.on('close', () => {
      clearInterval(heartbeat);
    });

  } catch (error) {
    console.error('❌ Stream endpoint error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to start stream', details: error.message });
    }
  }
});

/**
 * GET /api/agent-documents/:id/status
 * Poll for generation status and progress
 */
router.get('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;

    const status = await getAgentDocumentStatus(id);

    res.json(status);
  } catch (error) {
    console.error('❌ Status endpoint error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to get status', details: error.message });
    }
  }
});

/**
 * GET /api/agent-documents/variants
 * List all available variants for A/B testing
 * MUST come before /:id route to avoid conflicts
 */
router.get('/variants', async (req, res) => {
  try {
    const { transcriptCount } = req.query;

    const variants = getAllVariants();

    const response = {
      variants,
      recommendation: transcriptCount
        ? getRecommendedVariant(parseInt(transcriptCount))
        : null
    };

    res.json(response);
  } catch (error) {
    console.error('❌ Variants endpoint error:', error);
    res.status(500).json({ error: 'Failed to list variants', details: error.message });
  }
});

/**
 * GET /api/agent-documents/:id
 * Get complete document with all content
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const document = await getAgentDocument(id);

    res.json(document);
  } catch (error) {
    console.error('❌ Get document endpoint error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to get document', details: error.message });
    }
  }
});

/**
 * GET /api/agent-documents/:id/analysis
 * Get detailed agent behavior analysis for A/B testing
 */
router.get('/:id/analysis', async (req, res) => {
  try {
    const { id } = req.params;

    const analysis = await getAgentAnalysis(id);

    res.json(analysis);
  } catch (error) {
    console.error('❌ Analysis endpoint error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to get analysis', details: error.message });
    }
  }
});

/**
 * GET /api/agent-documents/:id/activity-log
 * Get complete activity log (all tool calls) for a document
 */
router.get('/:id/activity-log', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify document exists
    const document = await prisma.agentDocument.findUnique({
      where: { id }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Fetch all tool calls for this document
    const toolCalls = await prisma.agentToolCall.findMany({
      where: { documentId: id },
      orderBy: { calledAt: 'asc' },
      select: {
        id: true,
        toolName: true,
        toolInput: true,
        toolOutput: true,
        success: true,
        errorMessage: true,
        durationMs: true,
        calledAt: true
      }
    });

    res.json({
      documentId: id,
      totalCalls: toolCalls.length,
      successfulCalls: toolCalls.filter(c => c.success).length,
      failedCalls: toolCalls.filter(c => !c.success).length,
      toolCalls
    });
  } catch (error) {
    console.error('❌ Activity log endpoint error:', error);
    res.status(500).json({ error: 'Failed to get activity log', details: error.message });
  }
});

/**
 * GET /api/agent-documents
 * List all agent documents (optional: for admin/testing)
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const documents = await prisma.agentDocument.findMany({
      take: parseInt(limit),
      skip: parseInt(offset),
      orderBy: { createdAt: 'desc' },
      include: {
        transcripts: {
          select: {
            id: true,
            title: true,
            channel: true
          }
        },
        sections: {
          select: {
            id: true,
            title: true,
            order: true,
            wordCount: true
          },
          orderBy: { order: 'asc' }
        }
      }
    });

    const total = await prisma.agentDocument.count();

    res.json({
      documents,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total
      }
    });
  } catch (error) {
    console.error('❌ List endpoint error:', error);
    res.status(500).json({ error: 'Failed to list documents', details: error.message });
  }
});

/**
 * DELETE /api/agent-documents/:id
 * Delete an agent document (for testing/cleanup)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Delete will cascade to sections, notes, and tool calls
    await prisma.agentDocument.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Document deleted'
    });
  } catch (error) {
    console.error('❌ Delete endpoint error:', error);
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Document not found' });
    } else {
      res.status(500).json({ error: 'Failed to delete document', details: error.message });
    }
  }
});

export default router;
