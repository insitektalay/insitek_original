// services/agentTools.js
// Tool implementations for agentic document generation

import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
const prisma = new PrismaClient();

/**
 * Tool 1: Read Transcript
 * Allows agent to read the full text of a transcript
 */
export async function readTranscript(documentId, { transcriptId }) {
  const startTime = Date.now();

  try {
    // Check if this transcript has already been read to prevent wasteful re-reading
    const allReads = await prisma.agentToolCall.findMany({
      where: {
        documentId,
        toolName: 'read_transcript',
        success: true
      },
      select: {
        id: true,
        calledAt: true,
        toolInput: true
      }
    });

    // Filter in memory to avoid JSON path query issues
    const previousRead = allReads.find(read => {
      try {
        const args = typeof read.toolInput === 'string' ? JSON.parse(read.toolInput) : read.toolInput;
        return args.transcriptId === transcriptId;
      } catch {
        return false;
      }
    });

    if (previousRead) {
      const message = `✓ You already read this transcript at ${previousRead.calledAt.toISOString()}. Use your notes or memory of this content instead of re-reading. Call get_current_document_state to see what notes you've collected.`;

      // Log this as a successful call but with duplicate flag
      await logToolCall(documentId, 'read_transcript', { transcriptId }, { alreadyRead: true }, Date.now() - startTime);

      return {
        success: true,
        alreadyRead: true,
        message,
        previousCallId: previousRead.id
      };
    }

    const transcript = await prisma.transcript.findUnique({
      where: { id: transcriptId },
      select: {
        id: true,
        title: true,
        channel: true,
        text: true,
        summary: true,
        publishDate: true,
        source: true,
        metadata: {
          select: {
            totalChunks: true,
            topics: true
          }
        }
      }
    });

    if (!transcript) {
      throw new Error(`Transcript with ID ${transcriptId} not found`);
    }

    // Check transcript size and warn if large
    const wordCount = transcript.text.trim().split(/\s+/).length;
    const LARGE_TRANSCRIPT_THRESHOLD = 5000;
    let warning = null;

    if (wordCount > LARGE_TRANSCRIPT_THRESHOLD) {
      warning = `⚠️ WARNING: This transcript has ${wordCount} words, which is very large. Reading full transcripts of this size repeatedly can cause context window issues. Consider using search_transcripts to find specific topics instead.`;
    }

    // Update metrics: increment transcriptsRead counter
    await prisma.agentDocument.update({
      where: { id: documentId },
      data: {
        transcriptsRead: { increment: 1 }
      }
    });

    // Log the tool call
    await logToolCall(documentId, 'read_transcript', { transcriptId }, { wordCount, isChunked: !!transcript.metadata }, Date.now() - startTime);

    const result = {
      success: true,
      alreadyRead: false,
      transcript: {
        id: transcript.id,
        title: transcript.title,
        channel: transcript.channel,
        text: transcript.text,
        summary: transcript.summary,
        publishDate: transcript.publishDate,
        source: transcript.source
      }
    };

    if (warning) {
      result.warning = warning;
    }

    return result;
  } catch (error) {
    await logToolCall(documentId, 'read_transcript', { transcriptId }, null, Date.now() - startTime, false, error.message);
    throw error;
  }
}

/**
 * Tool 2: Take Note
 * Allows agent to save notes for later synthesis with importance rating
 */
export async function takeNote(documentId, { section, note, content, source, transcriptId, noteType = 'general', importance = 'MEDIUM' }) {
  const startTime = Date.now();

  try {
    // Accept both 'note' and 'content' parameter names (note is preferred)
    const actualNote = note || content;

    // Accept both 'source' and 'transcriptId' parameter names
    const actualSource = source || transcriptId;

    // Validate required parameters
    if (!actualSource) {
      throw new Error('source (transcript ID) is required');
    }

    if (!actualNote || typeof actualNote !== 'string' || actualNote.trim().length === 0) {
      throw new Error('note content must be a non-empty string');
    }

    // Validate source is a transcript ID that exists
    const transcript = await prisma.transcript.findUnique({
      where: { id: actualSource }
    });

    if (!transcript) {
      throw new Error(`Source transcript with ID ${actualSource} not found`);
    }

    // Create the note
    const noteRecord = await prisma.agentNote.create({
      data: {
        documentId,
        sectionTitle: section,
        content: actualNote,
        noteType,
        importance,
        sourceTranscriptId: actualSource
      }
    });

    // Log the tool call
    await logToolCall(documentId, 'take_note', { section, note: actualNote, source: actualSource, noteType, importance }, { noteId: noteRecord.id }, Date.now() - startTime);

    return {
      success: true,
      noteId: noteRecord.id,
      importance,
      message: section
        ? `[${importance}] note saved for section "${section}"`
        : `[${importance}] note saved (no section assigned yet)`
    };
  } catch (error) {
    const actualNote = note || content;
    const actualSource = source || transcriptId;
    await logToolCall(documentId, 'take_note', { section, note: actualNote, source: actualSource, noteType, importance }, null, Date.now() - startTime, false, error.message);
    throw error;
  }
}

/**
 * Tool 3: Create Section
 * Allows agent to define document structure
 */
export async function createSection(documentId, { title, description = '', order }) {
  const startTime = Date.now();

  try {
    // Validate required parameters
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      throw new Error('title is required and must be a non-empty string');
    }

    // If order not provided, auto-calculate as next available
    if (order === undefined || order === null) {
      const existingSections = await prisma.agentSection.findMany({
        where: { documentId },
        orderBy: { order: 'desc' },
        take: 1,
        select: { order: true }
      });

      order = existingSections.length > 0 ? existingSections[0].order + 1 : 0;
    }

    // Check if section with this order already exists
    const existing = await prisma.agentSection.findFirst({
      where: {
        documentId,
        order
      }
    });

    if (existing) {
      // Get all existing sections for helpful error message
      const allSections = await prisma.agentSection.findMany({
        where: { documentId },
        orderBy: { order: 'asc' },
        select: { title: true, order: true }
      });

      const sectionList = allSections.map(s => `"${s.title}" (order ${s.order})`).join(', ');
      throw new Error(`Section with order ${order} already exists ("${existing.title}"). Existing sections: ${sectionList}. Use get_current_document_state to see all sections, or choose a different order number.`);
    }

    // Create the section
    const section = await prisma.agentSection.create({
      data: {
        documentId,
        title,
        description,
        order
      }
    });

    // Get total section count for context
    const totalSections = await prisma.agentSection.count({
      where: { documentId }
    });

    // Log the tool call
    await logToolCall(documentId, 'create_section', { title, description, order }, { sectionId: section.id }, Date.now() - startTime);

    return {
      success: true,
      sectionId: section.id,
      message: `Section "${title}" created at position ${order}. You now have ${totalSections} section(s) defined. Remember to take notes and then write content for each section.`
    };
  } catch (error) {
    await logToolCall(documentId, 'create_section', { title, description, order }, null, Date.now() - startTime, false, error.message);
    throw error;
  }
}

/**
 * Tool 4: Write Section
 * Allows agent to write or update section content
 */
export async function writeSection(documentId, { sectionId, content }) {
  const startTime = Date.now();

  try {
    // Validate required parameters
    if (!sectionId) {
      // Get all available sections to help the agent
      const sections = await prisma.agentSection.findMany({
        where: { documentId },
        select: { id: true, title: true, order: true }
      });

      if (sections.length === 0) {
        throw new Error('No sections exist yet. You must call create_section first before writing content.');
      }

      const sectionList = sections.map(s => `"${s.title}" (ID: ${s.id})`).join(', ');
      throw new Error(`sectionId is required. Available sections: ${sectionList}. Use the section ID returned from create_section or call get_current_document_state to see all section IDs.`);
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('content must be a non-empty string');
    }

    // Validate minimum word count
    const wordCount = content.trim().split(/\s+/).length;
    const MIN_WORDS_PER_SECTION = 150;

    if (wordCount < MIN_WORDS_PER_SECTION) {
      throw new Error(
        `Section content too short. Current: ${wordCount} words, Minimum: ${MIN_WORDS_PER_SECTION} words. ` +
        `Please write more detailed, substantial content before proceeding. Include specific examples, quotes, and insights from the transcripts.`
      );
    }

    // Verify section exists and belongs to this document
    const section = await prisma.agentSection.findUnique({
      where: { id: sectionId }
    });

    if (!section) {
      throw new Error(`Section with ID ${sectionId} not found`);
    }

    if (section.documentId !== documentId) {
      throw new Error(`Section ${sectionId} does not belong to document ${documentId}`);
    }

    // Update section with new content (wordCount already calculated above for validation)
    const updated = await prisma.agentSection.update({
      where: { id: sectionId },
      data: {
        content,
        wordCount,
        revisionCount: { increment: 1 }
      }
    });

    // Get progress context
    const allSections = await prisma.agentSection.findMany({
      where: { documentId },
      select: { title: true, content: true, wordCount: true }
    });

    const sectionsComplete = allSections.filter(s => s.content && s.content.trim().length > 0).length;
    const totalSections = allSections.length;
    const sectionsNeedingContent = allSections
      .filter(s => !s.content || s.content.trim().length === 0)
      .map(s => s.title);

    let progressMessage = `Section "${section.title}" written with ${wordCount} words. Progress: ${sectionsComplete}/${totalSections} sections complete.`;

    if (sectionsNeedingContent.length > 0) {
      progressMessage += ` Still need content for: ${sectionsNeedingContent.join(', ')}.`;
    } else {
      progressMessage += ` All sections have content. Before finalizing, verify each section has sufficient depth (150+ words recommended) and the document meets all requirements.`;
    }

    // Log the tool call
    await logToolCall(documentId, 'write_section', { sectionId, contentLength: content.length }, { wordCount, revisionCount: updated.revisionCount }, Date.now() - startTime);

    return {
      success: true,
      wordCount,
      revisionCount: updated.revisionCount,
      sectionsComplete,
      totalSections,
      message: progressMessage
    };
  } catch (error) {
    await logToolCall(documentId, 'write_section', { sectionId }, null, Date.now() - startTime, false, error.message);
    throw error;
  }
}

/**
 * Tool 5: Update Progress
 * Allows agent to update user-facing progress
 */
export async function updateProgress(documentId, { stage, percentage }) {
  const startTime = Date.now();

  try {
    // Clamp percentage to 0-100
    const clampedPercentage = Math.max(0, Math.min(100, percentage));

    // Map stage keywords to AgentStatus enum
    let status = 'WRITING'; // Default
    if (stage.toLowerCase().includes('read')) {
      status = 'READING';
    } else if (stage.toLowerCase().includes('plan') || stage.toLowerCase().includes('structur')) {
      status = 'PLANNING';
    } else if (stage.toLowerCase().includes('writ')) {
      status = 'WRITING';
    } else if (stage.toLowerCase().includes('polish') || stage.toLowerCase().includes('refin') || stage.toLowerCase().includes('final')) {
      status = 'POLISHING';
    }

    // Update document
    await prisma.agentDocument.update({
      where: { id: documentId },
      data: {
        status,
        progress: clampedPercentage,
        currentStage: stage
      }
    });

    // Log the tool call
    await logToolCall(documentId, 'update_progress', { stage, percentage: clampedPercentage }, { status, progress: clampedPercentage }, Date.now() - startTime);

    return {
      success: true,
      message: `Progress updated: ${clampedPercentage}% - ${stage}`
    };
  } catch (error) {
    await logToolCall(documentId, 'update_progress', { stage, percentage }, null, Date.now() - startTime, false, error.message);
    throw error;
  }
}

/**
 * Tool 6: Finalize Document
 * Assembles all sections into final document and marks complete
 */
export async function finalizeDocument(documentId, { finalThoughts = '' }) {
  const startTime = Date.now();

  try {
    // Get the document with complete context
    const document = await prisma.agentDocument.findUnique({
      where: { id: documentId },
      include: {
        sections: {
          orderBy: { order: 'asc' }
        },
        notes: true,
        transcripts: true,
        toolCalls: {
          where: {
            success: true
          },
          select: {
            toolName: true
          }
        }
      }
    });

    if (!document) {
      throw new Error(`Document with ID ${documentId} not found`);
    }

    // ===== STRUCTURAL VALIDATION =====
    // Only validate that the agent completed its own plan

    // Rule 1: Must have created sections
    if (document.sections.length === 0) {
      throw new Error(
        'Cannot finalize: No sections created. ' +
        'Create at least one section with create_section before finalizing.'
      );
    }

    // Rule 2: All created sections must have content
    const emptySections = document.sections.filter(s =>
      !s.content || s.content.trim() === ''
    );

    if (emptySections.length > 0) {
      const titles = emptySections.map(s => `"${s.title}"`).join(', ');
      throw new Error(
        `Cannot finalize: These sections have no content: ${titles}. ` +
        `Use write_section to add content to these sections before finalizing.`
      );
    }

    // Rule 3: 100% transcript coverage - all transcripts must be analyzed
    const allTranscriptIds = document.transcripts.map(t => t.id);
    const referencedTranscriptIds = new Set(
      document.notes
        .map(note => note.sourceTranscriptId)
        .filter(id => id) // Remove null/undefined
    );

    const missingTranscriptIds = allTranscriptIds.filter(
      id => !referencedTranscriptIds.has(id)
    );

    if (missingTranscriptIds.length > 0) {
      const missingTranscripts = document.transcripts
        .filter(t => missingTranscriptIds.includes(t.id))
        .slice(0, 10);

      const missingTitles = missingTranscripts.map(t => `"${t.title}"`).join(', ');
      const remaining = missingTranscriptIds.length > 10
        ? ` and ${missingTranscriptIds.length - 10} more`
        : '';

      throw new Error(
        `Cannot finalize: Not all transcripts have been analyzed.\n` +
        `Coverage: ${referencedTranscriptIds.size}/${allTranscriptIds.length} transcripts (${Math.round(referencedTranscriptIds.size / allTranscriptIds.length * 100)}%).\n` +
        `Missing analysis for ${missingTranscriptIds.length} transcript(s): ${missingTitles}${remaining}\n\n` +
        `You must analyze EVERY transcript. Use search_transcripts with diverse queries to find content ` +
        `across all transcripts, then take notes using take_note with the transcriptId as the source parameter.`
      );
    }

    // Assemble final markdown document
    const markdown = document.sections
      .map(section => section.content)
      .join('\n\n');

    // Calculate total word count
    const wordCount = markdown.trim().split(/\s+/).length;

    // Calculate generation time
    const generationTime = Math.floor((Date.now() - new Date(document.startedAt).getTime()) / 1000);

    // Update document with final content
    await prisma.agentDocument.update({
      where: { id: documentId },
      data: {
        content: markdown,
        wordCount,
        status: 'COMPLETE',
        progress: 100,
        currentStage: 'Complete',
        completedAt: new Date(),
        generationTime
      }
    });

    // Mark all notes as used (simplified - in real impl, would track which notes were actually used)
    await prisma.agentNote.updateMany({
      where: { documentId },
      data: { usedInFinal: true }
    });

    // Log the tool call
    await logToolCall(documentId, 'finalize_document', { finalThoughts }, { wordCount, generationTime }, Date.now() - startTime);

    return {
      success: true,
      wordCount,
      sectionCount: document.sections.length,
      generationTime,
      message: `Document complete! ${wordCount} words across ${document.sections.length} sections.`
    };
  } catch (error) {
    await logToolCall(documentId, 'finalize_document', { finalThoughts }, null, Date.now() - startTime, false, error.message);
    throw error;
  }
}

/**
 * Tool 7: List Available Transcripts
 * Get overview of all transcripts without loading full content
 */
export async function listAvailableTranscripts(documentId, {}) {
  const startTime = Date.now();

  try {
    // Get the document with its associated transcripts
    const document = await prisma.agentDocument.findUnique({
      where: { id: documentId },
      include: {
        transcripts: {
          select: {
            id: true,
            title: true,
            channel: true,
            publishDate: true,
            source: true,
            text: true,
            summary: true,
            metadata: {
              select: {
                totalChunks: true,
                avgChunkSize: true,
                topics: true,
                hasSummary: true
              }
            }
          }
        }
      }
    });

    if (!document) {
      throw new Error(`Document with ID ${documentId} not found`);
    }

    // Format transcript info
    const transcriptsList = document.transcripts.map(t => {
      const wordCount = t.text.trim().split(/\s+/).length;
      return {
        id: t.id,
        title: t.title,
        channel: t.channel,
        publishDate: t.publishDate,
        source: t.source,
        wordCount,
        summary: t.summary?.substring(0, 200) || null,
        isChunked: !!t.metadata,
        totalChunks: t.metadata?.totalChunks || null,
        topics: t.metadata?.topics || []
      };
    });

    // Log the tool call
    await logToolCall(documentId, 'list_available_transcripts', {}, { count: transcriptsList.length }, Date.now() - startTime);

    return {
      success: true,
      totalTranscripts: transcriptsList.length,
      transcripts: transcriptsList,
      message: `Found ${transcriptsList.length} available transcript(s). Use search_transcripts to find specific content, or read_transcript_chunk to read portions.`
    };
  } catch (error) {
    await logToolCall(documentId, 'list_available_transcripts', {}, null, Date.now() - startTime, false, error.message);
    throw error;
  }
}

/**
 * Tool 8: Search Transcripts
 * Search across all transcripts for specific topics/keywords
 */
export async function searchTranscripts(documentId, { query, maxResults = 10 }) {
  const startTime = Date.now();

  try {
    // Validate query parameter
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('query is required and must be a non-empty string');
    }

    // Get the document with its associated transcripts
    const document = await prisma.agentDocument.findUnique({
      where: { id: documentId },
      include: {
        transcripts: {
          include: {
            chunks: true,
            metadata: true
          }
        }
      }
    });

    if (!document) {
      throw new Error(`Document with ID ${documentId} not found`);
    }

    const queryLower = query.toLowerCase();
    const results = [];

    // Search through chunks if available, otherwise search full text
    for (const transcript of document.transcripts) {
      if (transcript.chunks && transcript.chunks.length > 0) {
        // Search through chunks
        for (const chunk of transcript.chunks) {
          // Check if query matches in content or keywords
          const contentMatches = (chunk.content.toLowerCase().match(new RegExp(queryLower, 'g')) || []).length;
          const keywordMatches = chunk.keywords.filter(kw => kw.toLowerCase().includes(queryLower)).length;
          const score = contentMatches + (keywordMatches * 3); // Weight keywords higher

          if (score > 0) {
            // Extract snippet around first match
            const index = chunk.content.toLowerCase().indexOf(queryLower);
            const snippetStart = Math.max(0, index - 100);
            const snippetEnd = Math.min(chunk.content.length, index + 200);
            const snippet = (snippetStart > 0 ? '...' : '') +
                          chunk.content.substring(snippetStart, snippetEnd) +
                          (snippetEnd < chunk.content.length ? '...' : '');

            results.push({
              transcriptId: transcript.id,
              transcriptTitle: transcript.title,
              channel: transcript.channel,
              wordCount: chunk.wordCount,
              totalChunks: transcript.chunks.length,
              chunkIndex: chunk.chunkIndex,
              chunkId: chunk.id,
              relevanceScore: score,
              snippet,
              timeRange: chunk.startTime && chunk.endTime ? `${chunk.startTime} - ${chunk.endTime}` : null,
              summary: chunk.summary,
              keywords: chunk.keywords.slice(0, 5) // Top 5 keywords
            });
          }
        }
      } else {
        // Search full text for non-chunked transcripts
        const contentMatches = (transcript.text.toLowerCase().match(new RegExp(queryLower, 'g')) || []).length;

        if (contentMatches > 0) {
          const index = transcript.text.toLowerCase().indexOf(queryLower);
          const snippetStart = Math.max(0, index - 100);
          const snippetEnd = Math.min(transcript.text.length, index + 200);
          const snippet = (snippetStart > 0 ? '...' : '') +
                        transcript.text.substring(snippetStart, snippetEnd) +
                        (snippetEnd < transcript.text.length ? '...' : '');

          // Estimate word count (rough approximation)
          const estimatedWordCount = Math.round(transcript.text.split(/\s+/).length / 1000) * 1000;

          results.push({
            transcriptId: transcript.id,
            transcriptTitle: transcript.title,
            channel: transcript.channel,
            wordCount: estimatedWordCount,
            totalChunks: 0, // Not chunked
            chunkIndex: null,
            chunkId: null,
            relevanceScore: contentMatches,
            snippet,
            timeRange: null,
            summary: transcript.summary,
            keywords: [] // No keywords for non-chunked
          });
        }
      }
    }

    // Sort by relevance and limit
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const topResults = results.slice(0, maxResults);

    // Update metrics
    await prisma.agentDocument.update({
      where: { id: documentId },
      data: {
        transcriptsSearched: { increment: 1 }
      }
    });

    // Log the tool call
    await logToolCall(documentId, 'search_transcripts', { query, maxResults }, { resultsFound: topResults.length }, Date.now() - startTime);

    return {
      success: true,
      query,
      totalResults: topResults.length,
      results: topResults,
      message: `Found ${topResults.length} relevant passage(s) for "${query}". Use read_transcript_chunk with chunkId to read full context.`
    };
  } catch (error) {
    await logToolCall(documentId, 'search_transcripts', { query, maxResults }, null, Date.now() - startTime, false, error.message);
    throw error;
  }
}

/**
 * Tool 9: Read Transcript Chunk
 * Read a specific chunk of a transcript with optional adjacent context
 */
export async function readTranscriptChunk(documentId, { chunkId, includeAdjacent = false }) {
  const startTime = Date.now();

  try {
    const chunk = await prisma.transcriptChunk.findUnique({
      where: { id: chunkId },
      include: {
        transcript: {
          select: {
            id: true,
            title: true,
            channel: true
          }
        }
      }
    });

    if (!chunk) {
      throw new Error(`Chunk with ID ${chunkId} not found`);
    }

    const result = {
      chunkId: chunk.id,
      transcriptId: chunk.transcript.id,
      transcriptTitle: chunk.transcript.title,
      channel: chunk.transcript.channel,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      wordCount: chunk.wordCount,
      timeRange: chunk.startTime && chunk.endTime ? `${chunk.startTime} - ${chunk.endTime}` : null,
      summary: chunk.summary,
      keywords: chunk.keywords
    };

    // Include adjacent chunks if requested
    if (includeAdjacent) {
      const previousChunk = await prisma.transcriptChunk.findFirst({
        where: {
          transcriptId: chunk.transcriptId,
          chunkIndex: chunk.chunkIndex - 1
        }
      });

      const nextChunk = await prisma.transcriptChunk.findFirst({
        where: {
          transcriptId: chunk.transcriptId,
          chunkIndex: chunk.chunkIndex + 1
        }
      });

      if (previousChunk) {
        result.previousChunk = {
          chunkId: previousChunk.id,
          chunkIndex: previousChunk.chunkIndex,
          summary: previousChunk.summary,
          snippet: previousChunk.content.substring(0, 200) + '...'
        };
      }

      if (nextChunk) {
        result.nextChunk = {
          chunkId: nextChunk.id,
          chunkIndex: nextChunk.chunkIndex,
          summary: nextChunk.summary,
          snippet: nextChunk.content.substring(0, 200) + '...'
        };
      }
    }

    // Get total chunks for context
    const metadata = await prisma.transcriptMetadata.findUnique({
      where: { transcriptId: chunk.transcriptId }
    });

    result.totalChunks = metadata?.totalChunks || null;

    // Log the tool call
    await logToolCall(documentId, 'read_transcript_chunk', { chunkId, includeAdjacent }, { chunkIndex: chunk.chunkIndex }, Date.now() - startTime);

    return {
      success: true,
      ...result,
      message: `Read chunk ${chunk.chunkIndex + 1}${metadata ? ` of ${metadata.totalChunks}` : ''} from "${chunk.transcript.title}" (${chunk.wordCount} words).`
    };
  } catch (error) {
    await logToolCall(documentId, 'read_transcript_chunk', { chunkId, includeAdjacent }, null, Date.now() - startTime, false, error.message);
    throw error;
  }
}

/**
 * Tool 10: Create Workflow Plan
 * Allows agent to outline their approach before starting work
 */
export async function createWorkflowPlan(documentId, { plannedSteps, estimatedToolCalls, rationaleForApproach }) {
  const startTime = Date.now();

  try {
    // Validate input - be lenient to avoid early failures
    let steps = plannedSteps;

    // If plannedSteps is not provided or invalid, create reasonable defaults
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      console.log('⚠️  create_workflow_plan received invalid plannedSteps, using defaults');
      steps = [
        'List and analyze available transcripts',
        'Identify key themes and patterns',
        'Create document structure with sections',
        'Gather notes from transcripts',
        'Write content for each section',
        'Finalize document'
      ];
    }

    // Store the workflow plan in the document
    await prisma.agentDocument.update({
      where: { id: documentId },
      data: {
        workflowPlan: {
          steps: steps,
          estimatedToolCalls: estimatedToolCalls || null,
          rationale: rationaleForApproach || null,
          createdAt: new Date().toISOString()
        }
      }
    });

    // Log the tool call
    await logToolCall(documentId, 'create_workflow_plan', { plannedSteps: steps, estimatedToolCalls, rationaleForApproach }, { success: true }, Date.now() - startTime);

    return {
      success: true,
      message: `✓ Workflow plan created with ${steps.length} major steps (estimated ${estimatedToolCalls || 'unknown'} tool calls). Now begin executing your plan.`,
      plan: {
        steps: steps,
        estimatedToolCalls,
        rationale: rationaleForApproach
      }
    };
  } catch (error) {
    await logToolCall(documentId, 'create_workflow_plan', { plannedSteps, estimatedToolCalls, rationaleForApproach }, null, Date.now() - startTime, false, error.message);
    throw error;
  }
}

/**
 * Tool 11: Search Notes
 * Search through notes you've taken
 */
export async function searchNotes(documentId, { query, sectionFilter, importanceFilter, maxResults = 10 }) {
  const startTime = Date.now();

  try {
    // Build query conditions
    const where = {
      documentId,
      ...(sectionFilter && { sectionTitle: sectionFilter }),
      ...(importanceFilter && { importance: importanceFilter })
    };

    // Get all notes matching filters
    const notes = await prisma.agentNote.findMany({
      where,
      include: {
        transcript: {
          select: {
            title: true,
            channel: true
          }
        }
      }
    });

    // Simple text search (score by keyword matches)
    const queryLower = query.toLowerCase();
    const scored = notes.map(note => {
      const contentLower = note.content.toLowerCase();
      const matches = (contentLower.match(new RegExp(queryLower, 'g')) || []).length;

      // Boost score for importance
      let importanceBoost = 1;
      if (note.importance === 'CRITICAL') importanceBoost = 4;
      else if (note.importance === 'HIGH') importanceBoost = 2;
      else if (note.importance === 'MEDIUM') importanceBoost = 1;
      else importanceBoost = 0.5;

      return {
        note,
        score: matches * importanceBoost
      };
    });

    // Sort by score and limit results
    const results = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(s => ({
        id: s.note.id,
        section: s.note.sectionTitle,
        content: s.note.content.substring(0, 200) + (s.note.content.length > 200 ? '...' : ''),
        fullContent: s.note.content,
        noteType: s.note.noteType,
        importance: s.note.importance,
        source: s.note.transcript.title,
        relevanceScore: s.score
      }));

    // Log the tool call
    await logToolCall(documentId, 'search_notes', { query, sectionFilter, importanceFilter, maxResults }, { resultsFound: results.length }, Date.now() - startTime);

    return {
      success: true,
      query,
      resultsFound: results.length,
      results,
      message: `Found ${results.length} relevant note(s) for "${query}".`
    };
  } catch (error) {
    await logToolCall(documentId, 'search_notes', { query, sectionFilter, importanceFilter, maxResults }, null, Date.now() - startTime, false, error.message);
    throw error;
  }
}

/**
 * Helper: Log Tool Call
 * Logs all tool executions for analysis and debugging
 */
async function logToolCall(documentId, toolName, toolInput, toolOutput, durationMs, success = true, errorMessage = null) {
  try {
    await prisma.agentToolCall.create({
      data: {
        documentId,
        toolName,
        toolInput: toolInput || {},
        toolOutput: toolOutput || {},
        success,
        errorMessage,
        durationMs
      }
    });

    // Increment tool call count on document
    await prisma.agentDocument.update({
      where: { id: documentId },
      data: {
        toolCallCount: { increment: 1 }
      }
    });
  } catch (error) {
    console.error('Failed to log tool call:', error);
    // Don't throw - logging failure shouldn't break the tool
  }
}

/**
 * Helper: Get Document State
 * Returns current state of document for agent context
 */
export async function getDocumentState(documentId) {
  const document = await prisma.agentDocument.findUnique({
    where: { id: documentId },
    include: {
      sections: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          order: true,
          wordCount: true,
          revisionCount: true,
          content: false // Don't return full content for efficiency
        }
      },
      notes: {
        select: {
          id: true,
          sectionTitle: true,
          noteType: true,
          importance: true,
          createdAt: true
        }
      },
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
    throw new Error(`Document with ID ${documentId} not found`);
  }

  // Calculate stats including importance breakdown
  const notesBySectionTitle = {};
  const notesByImportance = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const notesBySectionAndImportance = {};

  document.notes.forEach(note => {
    // Count by section
    notesBySectionTitle[note.sectionTitle] = (notesBySectionTitle[note.sectionTitle] || 0) + 1;

    // Count by importance
    notesByImportance[note.importance] = (notesByImportance[note.importance] || 0) + 1;

    // Count by section AND importance
    if (!notesBySectionAndImportance[note.sectionTitle]) {
      notesBySectionAndImportance[note.sectionTitle] = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    }
    notesBySectionAndImportance[note.sectionTitle][note.importance]++;
  });

  return {
    documentId: document.id,
    title: document.title,
    documentType: document.documentType,
    status: document.status,
    progress: document.progress,
    currentStage: document.currentStage,
    toolCallCount: document.toolCallCount,
    workflowPlan: document.workflowPlan || null,
    sections: document.sections.map(s => {
      const sectionNotes = notesBySectionAndImportance[s.title] || { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      return {
        id: s.id,
        title: s.title,
        description: s.description,
        order: s.order,
        hasContent: !!s.content,
        wordCount: s.wordCount || 0,
        revisionCount: s.revisionCount,
        notesAvailable: notesBySectionTitle[s.title] || 0,
        notesByImportance: sectionNotes
      };
    }),
    transcripts: document.transcripts,
    stats: {
      totalSections: document.sections.length,
      sectionsComplete: document.sections.filter(s => s.wordCount && s.wordCount > 0).length,
      totalNotes: document.notes.length,
      notesBySectionTitle,
      notesByImportance
    }
  };
}

/**
 * Export tool definitions for OpenAI function calling (OpenRouter compatible)
 */
export const toolDefinitions = {
  list_available_transcripts: {
    description: 'Get an overview of all available transcripts without loading full content. Use this FIRST to understand what transcripts you have access to and their topics. This is much more efficient than reading full transcripts.',
    parameters: z.object({})
  },
  search_transcripts: {
    description: 'Search across all transcripts for specific topics, keywords, or concepts. Returns relevant excerpts with context. Use this to find specific information without reading entire transcripts. Much more efficient than reading full transcripts when looking for specific topics.',
    parameters: z.object({
      query: z.string().describe('The topic, keyword, or concept to search for (e.g., "AI safety", "revenue growth", "customer feedback")'),
      maxResults: z.number().optional().describe('Maximum number of results to return (default: 10)')
    })
  },
  read_transcript_chunk: {
    description: 'Read a specific chunk of a transcript. Use this after search_transcripts to get full context of relevant sections. More efficient than reading entire transcripts.',
    parameters: z.object({
      chunkId: z.string().describe('The chunk ID returned from search_transcripts'),
      includeAdjacent: z.boolean().optional().describe('Whether to include summaries of previous/next chunks for context (default: false)')
    })
  },
  read_transcript: {
    description: 'Read the full text of a transcript. WARNING: Only use this for small transcripts (<5000 words). For larger transcripts, use list_available_transcripts, search_transcripts, and read_transcript_chunk instead to avoid context limits.',
    parameters: z.object({
      transcriptId: z.string().describe('UUID of the transcript to read')
    })
  },
  take_note: {
    description: 'Save a note for later use in writing. IMPORTANT: You must provide BOTH section (which section) AND source (transcript ID) for every note. Use this to capture quotes, insights, data points, examples, or any other content you want to include in the final document.',
    parameters: z.object({
      section: z.string().describe('REQUIRED: Which section this note is for. Use the exact section title from create_section (e.g., "Introduction", "Market Analysis").'),
      note: z.string().describe('The note content - can be a quote, insight, data point, example, method, etc.'),
      source: z.string().describe('REQUIRED: The transcript ID this note came from. Use the transcriptId field from search_transcripts or list_available_transcripts results.'),
      transcriptId: z.string().optional().describe('Alternative to source - the transcript ID this note came from. Provide either source or transcriptId (source is preferred).'),
      noteType: z.enum(['quote', 'metric', 'insight', 'example', 'method', 'story', 'data', 'task', 'general']).optional().describe('Type of note - choose the most specific type: quote (direct quotes), metric (numbers/data), insight (key takeaways), example (concrete examples), method (how-to steps), story (anecdotes), data (facts), task (action items/todos), general (other)'),
      importance: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional().describe('How important is this note? CRITICAL = must include in document, HIGH = should include if possible, MEDIUM = good to have, LOW = optional filler content. Default: MEDIUM')
    })
  },
  create_section: {
    description: 'Define a new section for the document. Call this to establish the document structure before writing. Sections will be auto-numbered if order is not provided.',
    parameters: z.object({
      title: z.string().describe('The section title from your document structure'),
      description: z.string().optional().describe('What this section will cover (optional but recommended)'),
      order: z.number().optional().describe('Position in document (0 for first section, 1 for second, etc.). If not provided, sections will be auto-numbered in creation order.')
    })
  },
  write_section: {
    description: 'Write or update the markdown content for a section. Use your notes and insights to create well-structured prose. You can call this multiple times for the same section to revise it.',
    parameters: z.object({
      sectionId: z.string().describe('The ID of the section to write (returned from create_section)'),
      content: z.string().describe('Markdown content for this section. Should be well-structured prose that synthesizes your notes.')
    })
  },
  update_progress: {
    description: 'Update the user on your progress. Call this regularly to keep them informed about what you\'re working on.',
    parameters: z.object({
      stage: z.string().describe('Description of current stage (e.g., "Reading transcript 2 of 5", "Writing section 3", "Polishing document")'),
      percentage: z.number().describe('Progress percentage (0-100)')
    })
  },
  finalize_document: {
    description: 'Mark the document as complete and assemble all sections into the final output. Only call this when all sections have been written and you\'re satisfied with the quality.',
    parameters: z.object({
      finalThoughts: z.string().optional().describe('Optional final notes about the generation process')
    })
  },
  get_current_document_state: {
    description: 'Get the current state of document generation including which sections exist, which have content, notes taken (with importance breakdown), workflow plan, and overall progress. Use this to avoid duplicate work, plan next steps, and verify completion before finalizing.',
    parameters: z.object({})
  },
  create_workflow_plan: {
    description: 'CALL THIS FIRST before starting any work. Create a strategic plan outlining your approach to this document. This helps you stay organized and allows monitoring of your strategy. Think through how you\'ll handle the transcripts, what structure makes sense, in what order you\'ll work, and estimate tool calls.',
    parameters: z.object({
      plannedSteps: z.array(z.string()).describe('Ordered list of major steps you plan to take. Example: ["List all transcripts to understand content", "Search for key themes across transcripts", "Create 5-section outline based on themes", "Take detailed notes per section", "Write sections in order", "Finalize document"]'),
      estimatedToolCalls: z.number().describe('Your estimate of total tool calls needed (be realistic, typical range: 30-100)'),
      rationaleForApproach: z.string().describe('Why you chose this workflow approach. Explain your strategic thinking.')
    })
  },
  search_notes: {
    description: 'Search through notes you\'ve taken when you have many notes and need to find specific ones. Useful when you have collected numerous notes and want to find those related to specific topics or with certain importance levels.',
    parameters: z.object({
      query: z.string().describe('Keywords or topic to search for in your notes'),
      sectionFilter: z.string().optional().describe('Only search notes from this section (section title)'),
      importanceFilter: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional().describe('Only return notes of this importance level'),
      maxResults: z.number().optional().describe('Maximum number of results to return (default: 10)')
    })
  }
};

// Export tool handler map for easy execution
export const toolHandlers = {
  list_available_transcripts: listAvailableTranscripts,
  search_transcripts: searchTranscripts,
  read_transcript_chunk: readTranscriptChunk,
  read_transcript: readTranscript,
  take_note: takeNote,
  create_section: createSection,
  write_section: writeSection,
  update_progress: updateProgress,
  finalize_document: finalizeDocument,
  get_current_document_state: getDocumentState,
  create_workflow_plan: createWorkflowPlan,
  search_notes: searchNotes
};
