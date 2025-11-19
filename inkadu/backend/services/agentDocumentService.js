// services/agentDocumentService.js
// Core service for agentic document generation using OpenRouter with gpt-oss-120b

import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { PrismaClient } from '@prisma/client';
import { toolDefinitions, toolHandlers, getDocumentState } from './agentTools.js';
import {
  getAgentEmitter,
  cleanupAgentEmitter,
  emitReasoning,
  emitToolCall,
  emitToolResult,
  emitProgress,
  emitStatusChange,
  emitComplete,
  emitError
} from './agentEventEmitter.js';
import { getVariant, validateVariantForTranscripts } from './agentVariants.js';
import { Tiktoken } from 'js-tiktoken/lite';
import cl100k_base from 'js-tiktoken/ranks/cl100k_base';

const prisma = new PrismaClient();

// OpenRouter client setup
const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'HTTP-Referer': 'https://insitek.ai',
    'X-Title': 'Insitek.ai'
  }
});

// Constants
const MAX_TOOL_CALLS = 200; // Safety limit to prevent infinite loops
const MAX_GENERATION_TIME_MS = 30 * 60 * 1000; // 30 minutes
const AGENT_MODEL = 'openai/gpt-oss-120b'; // OpenRouter model with native tool use
const MAX_TOKENS = 32768; // Increased from 4096 to prevent JSON truncation in tool calls

// Token pricing for gpt-oss-120b (per 1k tokens - approximate)
const PRICING = {
  input: 0.0015,
  output: 0.002
};

// Token budget management constants
const CONTEXT_LIMIT = 131072; // OpenRouter's hard limit
const SAFE_LIMIT = 90000; // Start pruning/compression
const CAUTION_LIMIT = 70000; // Start degradation warning
const EMERGENCY_LIMIT = 110000; // Aggressive mode
const RESERVED_OUTPUT_TOKENS = MAX_TOKENS; // Reserved for response
const SLIDING_WINDOW_SIZE = 10; // Keep last N turns in full detail

// Initialize tokenizer (cl100k_base is used by GPT-4 and similar models)
let tokenizer;
function getTokenizer() {
  if (!tokenizer) {
    tokenizer = new Tiktoken(cl100k_base);
  }
  return tokenizer;
}

/**
 * Estimate token count for messages using tiktoken
 */
function estimateTokens(messages) {
  try {
    const enc = getTokenizer();
    let totalTokens = 0;

    for (const msg of messages) {
      // Add overhead for message formatting (~4 tokens per message)
      totalTokens += 4;

      if (msg.content) {
        totalTokens += enc.encode(msg.content).length;
      }

      if (msg.tool_calls) {
        totalTokens += enc.encode(JSON.stringify(msg.tool_calls)).length;
      }
    }

    // Add overhead for function definitions in request (~3 tokens per token in function def)
    totalTokens += 500; // Rough estimate for tool definitions

    return totalTokens;
  } catch (error) {
    console.warn('⚠️ Token estimation failed, using fallback:', error.message);
    // Fallback: estimate 4 chars per token (rough approximation)
    return Math.ceil(JSON.stringify(messages).length / 4);
  }
}

/**
 * Prune message history using sliding window approach
 * Keeps: system prompt, initial message, recent messages, compresses middle
 */
function pruneMessageHistory(messages, systemPrompt, targetTokens = SAFE_LIMIT) {
  if (messages.length <= SLIDING_WINDOW_SIZE + 2) {
    return messages; // Too short to prune
  }

  const currentTokens = estimateTokens(messages) + estimateTokens([{role: 'system', content: systemPrompt}]);

  if (currentTokens < targetTokens) {
    return messages; // Under budget, no pruning needed
  }

  console.log(`🔪 Pruning message history: ${currentTokens} tokens → target ${targetTokens}`);

  // Keep initial user message (index 0)
  const initialMessage = messages[0];

  // Keep last SLIDING_WINDOW_SIZE messages (recent context)
  const recentMessages = messages.slice(-SLIDING_WINDOW_SIZE);

  // Compress middle messages into summaries
  const middleMessages = messages.slice(1, -SLIDING_WINDOW_SIZE);

  const compressed = compressMiddleMessages(middleMessages);

  // Rebuild message array
  const prunedMessages = [
    initialMessage,
    ...compressed,
    ...recentMessages
  ];

  const newTokens = estimateTokens(prunedMessages) + estimateTokens([{role: 'system', content: systemPrompt}]);
  console.log(`✅ Pruned to ${newTokens} tokens (saved ${currentTokens - newTokens} tokens)`);

  return prunedMessages;
}

/**
 * Compress middle messages by summarizing tool results and removing verbose content
 */
function compressMiddleMessages(middleMessages) {
  const summaries = [];
  let currentBatch = [];

  for (const msg of middleMessages) {
    currentBatch.push(msg);

    // Create summary batch every 5 messages or at end
    if (currentBatch.length >= 5) {
      const toolCallsInBatch = currentBatch.filter(m => m.role === 'assistant' && m.tool_calls).length;
      const toolResultsInBatch = currentBatch.filter(m => m.role === 'tool').length;

      if (toolCallsInBatch > 0) {
        // Create compressed summary
        summaries.push({
          role: 'user',
          content: `[Compressed: ${toolCallsInBatch} tool calls completed, ${toolResultsInBatch} results processed]`
        });
      }

      currentBatch = [];
    }
  }

  // Handle remaining messages
  if (currentBatch.length > 0) {
    const toolCallsInBatch = currentBatch.filter(m => m.role === 'assistant' && m.tool_calls).length;
    if (toolCallsInBatch > 0) {
      summaries.push({
        role: 'user',
        content: `[Compressed: ${toolCallsInBatch} tool calls completed]`
      });
    }
  }

  return summaries;
}

/**
 * Get degradation mode based on current token budget
 */
function getDegradationMode(currentTokens) {
  if (currentTokens >= EMERGENCY_LIMIT) return 'EMERGENCY';
  if (currentTokens >= SAFE_LIMIT) return 'AGGRESSIVE';
  if (currentTokens >= CAUTION_LIMIT) return 'CAUTION';
  return 'NORMAL';
}

/**
 * Generate warning message based on degradation mode
 */
function generateDegradationWarning(mode, tokensRemaining, currentTokens) {
  if (mode === 'EMERGENCY') {
    return `🚨 CRITICAL TOKEN BUDGET WARNING 🚨

You are at ${currentTokens.toLocaleString()} tokens with only ${tokensRemaining.toLocaleString()} remaining before hitting the hard limit!

IMMEDIATE ACTIONS REQUIRED:
1. STOP reading new transcripts - use search_transcripts to find specific content only
2. If you have notes collected, START WRITING sections immediately
3. Finalize the document NOW if all sections have content
4. Focus on completing ONE section at a time

The system has aggressively compressed your conversation history. Do NOT re-read transcripts you've already processed.`;
  }

  if (mode === 'AGGRESSIVE') {
    return `⚠️ TOKEN BUDGET WARNING ⚠️

Token usage: ${currentTokens.toLocaleString()} / ${CONTEXT_LIMIT.toLocaleString()} (${Math.round(currentTokens / CONTEXT_LIMIT * 100)}%)

The system has compressed old messages to save space. Prioritize:
1. Use search_transcripts instead of read_transcript when possible
2. Write sections based on notes you've already collected
3. Avoid redundant tool calls

You have ~${Math.round(tokensRemaining / 1000)}k tokens remaining.`;
  }

  if (mode === 'CAUTION') {
    return `💡 Token Budget Notice: ${Math.round(currentTokens / 1000)}k tokens used. Consider focusing on writing sections from your collected notes rather than reading more transcripts.`;
  }

  return null;
}

/**
 * Main function: Start agentic document generation
 */
export async function generateAgenticDocument(transcriptIds, documentType, preferences = {}, variantId = 'scalable') {
  // Validate variant can handle transcript count
  const validation = validateVariantForTranscripts(variantId, transcriptIds.length);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const variant = getVariant(variantId);
  console.log(`🧪 Using variant: ${variant.name} for ${transcriptIds.length} transcripts`);

  // Create agent document record
  const document = await prisma.agentDocument.create({
    data: {
      title: `${documentType} - Draft`,
      documentType,
      preferences,
      variantId,
      status: 'INITIALIZING',
      transcripts: {
        connect: transcriptIds.map(id => ({ id }))
      }
    }
  });

  console.log(`🤖 Starting agentic generation for document ${document.id}`);

  // Run agent loop in background (non-blocking)
  runAgentLoop(document.id, transcriptIds, documentType, preferences, variantId)
    .then(() => {
      console.log(`✅ Document ${document.id} generation complete`);
    })
    .catch(async (error) => {
      console.error(`❌ Document ${document.id} generation failed:`, error);
      await handleAgentError(document.id, error);
    });

  return document;
}

/**
 * Core agent execution loop with OpenAI function calling
 */
async function runAgentLoop(documentId, transcriptIds, documentType, preferences, variantId) {
  const startTime = Date.now();
  let toolCallCount = 0;
  let totalTokens = 0;

  // Get variant configuration
  const variant = getVariant(variantId);
  console.log(`🧪 Variant "${variant.name}" enabled tools: ${variant.tools.enabled.join(', ')}`);

  try {
    // Load system prompt with variant config
    const systemPrompt = buildAgentSystemPrompt(documentType, preferences, transcriptIds, variant);

    // Convert toolDefinitions object to array with proper format
    const allToolsArray = Object.entries(toolDefinitions).map(([name, def]) => ({
      name,
      description: def.description,
      parameters: def.parameters
    }));

    // Filter based on variant
    const allowedTools = allToolsArray.filter(tool =>
      variant.tools.enabled.includes(tool.name)
    );

    console.log(`🔧 ${allowedTools.length}/${allToolsArray.length} tools enabled for variant "${variant.name}"`);

    // Initialize messages history
    const messages = [
      {
        role: 'user',
        content: buildInitialUserMessage(transcriptIds, documentType, preferences)
      }
    ];

    let isComplete = false;
    let turnCount = 0;
    let consecutiveTurnsWithoutTools = 0; // Track turns without tool calls

    while (!isComplete && toolCallCount < MAX_TOOL_CALLS) {
      turnCount++;

      // Check timeout
      if (Date.now() - startTime > MAX_GENERATION_TIME_MS) {
        throw new Error('Generation exceeded maximum time limit (30 minutes)');
      }

      console.log(`🔄 Agent turn ${turnCount}, total tool calls: ${toolCallCount}`);

      // === TOKEN BUDGET MANAGEMENT ===
      // Estimate current token usage
      const systemPromptTokens = estimateTokens([{role: 'system', content: systemPrompt}]);
      const messagesTokens = estimateTokens(messages);
      const estimatedTotalTokens = systemPromptTokens + messagesTokens + RESERVED_OUTPUT_TOKENS;

      console.log(`📊 Token budget: ${estimatedTotalTokens.toLocaleString()} / ${CONTEXT_LIMIT.toLocaleString()} (${Math.round(estimatedTotalTokens / CONTEXT_LIMIT * 100)}%)`);

      // Get degradation mode
      const degradationMode = getDegradationMode(estimatedTotalTokens);

      // Prune messages if approaching limit
      if (estimatedTotalTokens > SAFE_LIMIT) {
        console.log(`⚠️  Entering ${degradationMode} mode - token budget at ${estimatedTotalTokens.toLocaleString()}`);

        // Aggressive pruning
        const targetTokens = degradationMode === 'EMERGENCY' ? 60000 : 70000;
        messages.splice(0, messages.length, ...pruneMessageHistory(messages, systemPrompt, targetTokens));

        const newEstimate = systemPromptTokens + estimateTokens(messages) + RESERVED_OUTPUT_TOKENS;
        console.log(`   Pruned to ${newEstimate.toLocaleString()} tokens`);
      }

      // Inject degradation warning if needed
      if (degradationMode !== 'NORMAL' && turnCount % 3 === 0) {
        const tokensRemaining = CONTEXT_LIMIT - estimatedTotalTokens;
        const warningMessage = generateDegradationWarning(degradationMode, tokensRemaining, estimatedTotalTokens);
        if (warningMessage) {
          messages.push({
            role: 'user',
            content: warningMessage
          });
        }
      }

      // Call OpenRouter directly (bypassing AI SDK for v1 model compatibility)
      let response;
      try {
        const openrouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://insitek.ai',
            'X-Title': 'Insitek.ai'
          },
          body: JSON.stringify({
            model: AGENT_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages
            ],
            tools: allowedTools.map(tool => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
              }
            })),
            max_tokens: MAX_TOKENS,
            temperature: 0.7
          })
        });

        if (!openrouterResponse.ok) {
          const errorText = await openrouterResponse.text();
          throw new Error(`OpenRouter API error: ${openrouterResponse.status} - ${errorText}`);
        }

        // Parse JSON with better error handling
        let rawResponse;
        try {
          const responseText = await openrouterResponse.text();
          if (!responseText || responseText.trim() === '') {
            throw new Error('Empty response from OpenRouter API');
          }
          rawResponse = JSON.parse(responseText);
        } catch (jsonError) {
          console.error('❌ Failed to parse OpenRouter response:', {
            error: jsonError.message,
            responsePreview: responseText?.substring(0, 500)
          });
          throw new Error(`Invalid JSON response from OpenRouter: ${jsonError.message}`);
        }

        const choice = rawResponse.choices?.[0];
        if (!choice) {
          throw new Error('No choices in OpenRouter response');
        }

        // Convert OpenRouter response to our expected format
        response = {
          text: choice.message.content || '',
          toolCalls: choice.message.tool_calls?.map(tc => {
            // Handle cases where arguments might be undefined or malformed
            let args = {};
            try {
              if (tc.function.arguments && tc.function.arguments !== 'undefined' && tc.function.arguments.trim()) {
                args = JSON.parse(tc.function.arguments);
              }
            } catch (parseError) {
              console.error(`⚠️  Failed to parse tool arguments for ${tc.function.name}:`, parseError.message);
              console.error(`   Raw arguments:`, tc.function.arguments);
              // Return empty args and let tool validation catch it
            }

            return {
              toolCallId: tc.id,
              toolName: tc.function.name,
              args
            };
          }) || [],
          finishReason: choice.finish_reason,
          usage: rawResponse.usage
        };
      } catch (error) {
        // Handle truncated tool calls (InvalidToolArgumentsError)
        if (error.name === 'InvalidToolArgumentsError' || error.name === 'AI_InvalidToolArgumentsError') {
          console.error(`❌ Truncated tool call detected:`, error.message);
          console.error(`   This usually means the response was cut off mid-JSON due to token limits.`);
          console.error(`   Current MAX_TOKENS: ${MAX_TOKENS}, History length: ${JSON.stringify(messages).length} chars`);

          // Inject a recovery message to help the agent move forward
          messages.push({
            role: 'user',
            content: `⚠️ ERROR: Your last tool call was truncated before completion. This means the conversation history is consuming too many tokens. To recover:

1. Call get_current_document_state to see your progress
2. Focus on completing one task at a time
3. Avoid reading multiple transcripts in one turn
4. If you've read all transcripts, move to creating sections or writing content

What's the most important next step to complete this document?`
          });

          // Continue the loop instead of crashing
          continue;
        }

        // Re-throw other errors
        throw error;
      }

      // Track tokens (from actual usage)
      const tokensUsed = response.usage ? (response.usage.prompt_tokens + response.usage.completion_tokens) : 0;
      totalTokens += tokensUsed;

      // Update cost (from actual usage)
      const cost = response.usage
        ? ((response.usage.prompt_tokens / 1000) * PRICING.input + (response.usage.completion_tokens / 1000) * PRICING.output)
        : 0;

      await prisma.agentDocument.update({
        where: { id: documentId },
        data: {
          totalTokens: Math.floor(totalTokens),
          totalCost: { increment: cost }
        }
      });

      // Emit reasoning/thinking if the agent generated text
      if (response.text && response.text.trim()) {
        console.log(`💭 Agent reasoning: ${response.text.substring(0, 100)}...`);
        emitReasoning(documentId, response.text.trim());
      }

      // Check if there are tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        // Reset consecutive no-tool counter when agent uses tools
        consecutiveTurnsWithoutTools = 0;

        // Limit tool calls per turn to prevent infinite loops
        const MAX_TOOLS_PER_TURN = 5;
        let originalCallCount = response.toolCalls.length;

        if (response.toolCalls.length > MAX_TOOLS_PER_TURN) {
          console.warn(`⚠️  Agent attempted ${response.toolCalls.length} tool calls in one turn. Limiting to ${MAX_TOOLS_PER_TURN} to prevent loops.`);
          response.toolCalls = response.toolCalls.slice(0, MAX_TOOLS_PER_TURN);
        }

        // Add assistant message with tool calls (OpenRouter format)
        messages.push({
          role: 'assistant',
          content: response.text || null,
          tool_calls: response.toolCalls.map(tc => ({
            id: tc.toolCallId,
            type: 'function',
            function: {
              name: tc.toolName,
              arguments: JSON.stringify(tc.args)
            }
          }))
        });

        // Execute each tool call
        const toolResults = [];

        // If we limited the calls, inject a warning message
        if (originalCallCount > MAX_TOOLS_PER_TURN) {
          toolResults.push({
            role: 'user',
            content: `⚠️ WARNING: You attempted ${originalCallCount} tool calls in one turn. Only the first ${MAX_TOOLS_PER_TURN} were executed. Break your work into smaller steps. Call get_current_document_state to see your progress before continuing.`
          });
        }

        for (const toolCall of response.toolCalls) {
          toolCallCount++;

          console.log(`  🔧 Tool: ${toolCall.toolName}`);

          // Emit tool call event
          emitToolCall(documentId, toolCall.toolName, toolCall.args);

          try {
            const result = await executeToolCall(documentId, toolCall.toolName, toolCall.args);

            // Emit tool result event
            emitToolResult(
              documentId,
              toolCall.toolName,
              result.success !== false,
              result.message || 'Tool executed successfully',
              result
            );

            // OpenRouter format for tool results
            toolResults.push({
              role: 'tool',
              tool_call_id: toolCall.toolCallId,
              content: JSON.stringify(result)
            });
          } catch (error) {
            console.error(`  ❌ Tool ${toolCall.toolName} failed:`, error.message);

            // Emit tool error event
            emitToolResult(
              documentId,
              toolCall.toolName,
              false,
              `Error: ${error.message}`,
              null
            );

            // Get context-aware suggestion for the error
            const state = await getDocumentState(documentId);
            const suggestion = generateContextualSuggestion(toolCall.toolName, error.message, state);

            // OpenRouter format for tool error
            toolResults.push({
              role: 'tool',
              tool_call_id: toolCall.toolCallId,
              content: JSON.stringify({
                success: false,
                error: error.message,
                suggestion,
                hint: `Current state: ${state.stats.sectionsComplete}/${state.stats.totalSections} sections complete, ${state.stats.totalNotes} notes collected.`
              })
            });
          }
        }

        // Add tool results to messages
        messages.push(...toolResults);

        // Inject state summary after EVERY tool batch to maintain agent awareness
        // (Compressed format to save tokens)
        if (toolResults.length > 0) {
          const state = await getDocumentState(documentId);

          const sectionsWithContent = state.sections.filter(s => s.wordCount && s.wordCount > 0);
          const sectionsNeedingContent = state.sections.filter(s => !s.wordCount || s.wordCount === 0);

          // Generate compressed state summary based on degradation mode
          const mode = getDegradationMode(estimatedTotalTokens);
          const isCompressed = mode !== 'NORMAL';

          let stateSummary;
          if (isCompressed) {
            // Ultra-compact format for token conservation
            stateSummary = `Progress: ${sectionsWithContent.length}/${state.stats.totalSections} sections | ${state.stats.totalNotes} notes`;
            if (sectionsWithContent.length === state.stats.totalSections && state.stats.totalSections > 0) {
              stateSummary += ` | READY TO FINALIZE`;
            } else if (sectionsNeedingContent.length > 0) {
              stateSummary += ` | ${sectionsNeedingContent.length} sections need content`;
            }
          } else {
            // Standard format when tokens are plentiful
            stateSummary = `=== PROGRESS (T${turnCount}) ===\n`;
            stateSummary += `Sections: ${sectionsWithContent.length}/${state.stats.totalSections} complete | Notes: ${state.stats.totalNotes}\n`;

            if (sectionsWithContent.length === state.stats.totalSections && state.stats.totalSections > 0) {
              stateSummary += `✅ Ready to finalize!\n`;
            } else if (state.stats.totalSections === 0) {
              stateSummary += `Next: create_section\n`;
            } else if (sectionsNeedingContent.length > 0) {
              stateSummary += `Next: write ${sectionsNeedingContent.length} sections\n`;
            }
          }

          messages.push({
            role: 'user',
            content: stateSummary
          });

          // Emit progress update
          emitProgress(documentId, {
            totalSections: state.stats.totalSections,
            sectionsComplete: sectionsWithContent.length,
            totalNotes: state.stats.totalNotes,
            toolCallCount,
            transcriptsAvailable: state.transcripts.length
          });
        }

        // Compact checkpoint every 10 tool calls (token-efficient)
        if (toolCallCount > 0 && toolCallCount % 10 === 0) {
          console.log(`📊 Checkpoint at ${toolCallCount} tool calls`);

          const state = await getDocumentState(documentId);
          const sectionsComplete = state.sections.filter(s => s.wordCount > 0).length;

          // Ultra-compact checkpoint
          const checkpointMessage = `Checkpoint (${toolCallCount} calls): ${sectionsComplete}/${state.stats.totalSections} sections, ${state.stats.totalNotes} notes. Review progress and choose next action.`;

          messages.push({
            role: 'user',
            content: checkpointMessage
          });
        }

      } else {
        // No tool calls - agent is done or wants to respond
        consecutiveTurnsWithoutTools++;

        messages.push({
          role: 'assistant',
          content: response.text
        });

        // Check if document is actually complete
        const doc = await prisma.agentDocument.findUnique({
          where: { id: documentId }
        });

        if (doc.status === 'COMPLETE') {
          isComplete = true;
          console.log(`✅ Agent completed generation (${toolCallCount} tool calls)`);

          // Emit completion event
          emitComplete(documentId, doc.wordCount || 0, doc.sections?.length || 0);

          // Cleanup emitter
          cleanupAgentEmitter(documentId);
        } else {
          // Agent stopped but didn't finalize - provide escalating enforcement
          const state = await getDocumentState(documentId);
          const sectionsWithContent = state.sections.filter(s => s.wordCount && s.wordCount > 0);
          const sectionsNeedingContent = state.sections.filter(s => !s.wordCount || s.wordCount === 0);

          // CRITICAL: Detect suspiciously fast completion
          if (toolCallCount < 20 && transcriptIds.length > 10) {
            console.warn(`⚠️ ⚠️ ⚠️  SUSPICIOUSLY FAST COMPLETION DETECTED!`);
            console.warn(`   Tool calls: ${toolCallCount}, Transcripts: ${transcriptIds.length}`);
            console.warn(`   Expected: 50-150 tool calls for ${transcriptIds.length} transcripts`);
            console.warn(`   Agent is trying to finish without reading transcripts!`);
          }

          let recoveryMessage = '';

          // Turn 1: MUST start work immediately
          if (turnCount === 1) {
            console.log(`❌ Agent did nothing on turn 1. FORCING tool use...`);
            recoveryMessage = `❌ CRITICAL ERROR: You MUST call tools to do work.

You cannot respond with text-only on turn 1. This will cause generation to fail.

REQUIRED FIRST ACTION (pick ONE):
1. Call list_available_transcripts to see what you have
2. Call create_workflow_plan to outline your approach
3. Call get_current_document_state to check existing progress

CALL ONE OF THESE TOOLS NOW. Text-only responses are NOT allowed.`;
          }
          // Turns 2-3: Strong warning
          else if (turnCount <= 3 && consecutiveTurnsWithoutTools >= 2) {
            console.log(`⚠️  Agent hasn't used tools for ${consecutiveTurnsWithoutTools} consecutive turns. FORCING action...`);
            recoveryMessage = `⚠️ CRITICAL: ${consecutiveTurnsWithoutTools} consecutive turns without tool calls will cause FAILURE.

You MUST use tools to make progress. Text-only responses do not accomplish work.

Current state:
- Tool calls so far: ${toolCallCount}
- Sections created: ${state.stats.totalSections}
- Notes taken: ${state.stats.totalNotes}
- Transcripts available: ${transcriptIds.length}

REQUIRED NEXT STEP (no exceptions):
${state.stats.totalSections === 0 ? '→ CALL create_section to define document structure' :
  state.stats.totalNotes === 0 ? '→ CALL list_available_transcripts or search_transcripts to find content' :
  sectionsNeedingContent.length > 0 ? '→ CALL write_section to write content for empty sections' :
  '→ CALL finalize_document if all sections are complete'}

DO NOT respond with text. CALL THE REQUIRED TOOL NOW.`;
          }
          // Turn 4+: Maximum enforcement
          else if (consecutiveTurnsWithoutTools >= 3) {
            console.error(`❌ CRITICAL: ${consecutiveTurnsWithoutTools} consecutive turns without tools. Forcing hard stop...`);
            throw new Error(`Agent failed to use tools for ${consecutiveTurnsWithoutTools} consecutive turns. Expected behavior: use tools to read transcripts, take notes, create sections, and write content. Actual behavior: text-only responses with no work done. Total tool calls: ${toolCallCount} (expected: 50-150 for ${transcriptIds.length} transcripts).`);
          }
          // Normal recovery logic (turn count > 2 but not consecutive failures)
          else {
            console.log(`⚠️  Agent stopped without finalizing (turn ${turnCount}). Providing context-aware recovery prompt...`);

            recoveryMessage = `⚠️ INCOMPLETE WORK DETECTED\n\n`;
            recoveryMessage += `Current state:\n`;
            recoveryMessage += `- Tool calls: ${toolCallCount} (expected: 50-150 for ${transcriptIds.length} transcripts)\n`;
            recoveryMessage += `- Sections complete: ${sectionsWithContent.length}/${state.stats.totalSections}\n`;
            recoveryMessage += `- Notes available: ${state.stats.totalNotes}\n\n`;

            if (state.stats.totalSections === 0) {
              recoveryMessage += `❌ NO SECTIONS CREATED\n\n`;
              recoveryMessage += `No sections exist yet.\n\n`;
              recoveryMessage += `MANDATORY: CALL create_section now:\n`;
              recoveryMessage += `- Follow structure from custom instructions\n`;
              recoveryMessage += `- Create all required sections\n`;
              recoveryMessage += `- Set order: 1, 2, 3...\n\n`;
              recoveryMessage += `DO NOT respond with text. CALL THE TOOL NOW.`;
            } else if (sectionsNeedingContent.length > 0) {
              recoveryMessage += `📝 SECTIONS NEED CONTENT\n\n`;
              recoveryMessage += `These sections need content:\n\n`;

              sectionsNeedingContent.forEach(s => {
                const notesAvailable = state.stats.notesBySectionTitle[s.title] || 0;
                recoveryMessage += `- "${s.title}" (ID: ${s.id}, Notes: ${notesAvailable})\n`;
              });

              recoveryMessage += `\nMANDATORY: Pick ONE section and CALL write_section with that ID.\n`;
              recoveryMessage += `Follow custom instructions for content.\n\n`;
              recoveryMessage += `DO NOT respond with text. CALL THE TOOL NOW.`;
            } else if (sectionsWithContent.length === state.stats.totalSections && state.stats.totalSections > 0) {
              recoveryMessage += `✅ ALL SECTIONS COMPLETE!\n\n`;
              recoveryMessage += `All ${state.stats.totalSections} sections have content.\n\n`;
              recoveryMessage += `MANDATORY: CALL finalize_document now.\n\n`;
              recoveryMessage += `DO NOT respond with text. CALL THE TOOL NOW.`;
            } else {
              recoveryMessage += `⚠️ UNCLEAR STATE\n\n`;
              recoveryMessage += `MANDATORY: CALL get_current_document_state to see progress.\n\n`;
              recoveryMessage += `DO NOT respond with text. CALL THE TOOL NOW.`;
            }
          }

          messages.push({
            role: 'user',
            content: recoveryMessage
          });
        }
      }
    }

    if (toolCallCount >= MAX_TOOL_CALLS) {
      throw new Error(`Agent exceeded maximum tool call limit (${MAX_TOOL_CALLS})`);
    }

    // Calculate final stats
    const generationTime = Math.floor((Date.now() - startTime) / 1000);
    console.log(`📊 Generation stats: ${toolCallCount} tool calls, ${Math.floor(totalTokens)} tokens, ${generationTime}s`);

  } catch (error) {
    console.error(`❌ Agent loop error:`, error);
    throw error;
  }
}

/**
 * Execute a single tool call
 */
async function executeToolCall(documentId, toolName, toolInput) {
  const handler = toolHandlers[toolName];

  if (!handler) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  try {
    const result = await handler(documentId, toolInput);
    return result;
  } catch (error) {
    // Tool execution failed - return error to agent
    throw error;
  }
}

/**
 * Generate context-aware suggestions for tool errors
 */
function generateContextualSuggestion(toolName, errorMessage, state) {
  // Handle create_section errors
  if (toolName === 'create_section') {
    if (errorMessage.includes('already exists')) {
      const existingSections = state.sections
        .map(s => `"${s.title}" (order ${s.order})`)
        .join(', ');
      return `A section with this order already exists. Current sections: ${existingSections}. Call get_current_document_state to see all sections, or use a different order number.`;
    }
  }

  // Handle write_section errors
  if (toolName === 'write_section') {
    if (errorMessage.includes('not found')) {
      const availableSections = state.sections
        .map(s => `"${s.title}" (ID: ${s.id})`)
        .join(', ');
      return `Section not found. Available sections: ${availableSections}. Use get_current_document_state to see current sections with their IDs.`;
    }
  }

  // Handle finalize_document errors
  if (toolName === 'finalize_document') {
    if (errorMessage.includes('need content') || errorMessage.includes('need more content')) {
      const emptySections = state.sections
        .filter(s => !s.wordCount || s.wordCount < 50)
        .map(s => `"${s.title}" (${s.wordCount || 0} words)`)
        .join(', ');
      return `Cannot finalize yet. Sections needing more content: ${emptySections}. Use write_section to add content to each section per custom instructions.`;
    }
  }

  // Default suggestion
  return `Call get_current_document_state to understand what exists before trying again. Avoid repeating actions that already succeeded.`;
}

/**
 * Build Tools Available section based on variant
 */
function buildToolsSection(variant) {
  if (variant.id === 'baseline') {
    // Baseline: Classic tools only
    return `## Tools Available

1. **read_transcript** - Read full transcript content
2. **take_note** - Save notes organized by section
3. **create_section** - Define document structure
4. **write_section** - Write markdown content per custom instructions
5. **get_current_document_state** - Check your progress (use often!)
6. **update_progress** - Keep user informed
7. **finalize_document** - Complete when all sections meet requirements`;
  }

  if (variant.id === 'hybrid') {
    // Hybrid: Scalable transcript tools but no planning/importance
    return `## Tools Available

**Scalable Transcript Access:**
1. **list_available_transcripts** - Get overview without loading full content
2. **search_transcripts** - Search all transcripts for specific topics/keywords
3. **read_transcript_chunk** - Read specific chunks (for large transcripts)
4. **read_transcript** - Read full transcript (ONLY for small transcripts <5000 words)

**Document Creation:**
5. **take_note** - Save notes organized by section
6. **create_section** - Define document structure
7. **write_section** - Write markdown content per custom instructions
8. **get_current_document_state** - Check your progress (use often!)
9. **update_progress** - Keep user informed
10. **finalize_document** - Complete when all sections meet requirements`;
  }

  // Scalable: All tools
  return `## Tools Available

**Planning (CALL FIRST!):**
1. **create_workflow_plan** - CALL THIS FIRST! Plan your approach with steps, estimated tool calls, and rationale

**Scalable Transcript Access:**
2. **list_available_transcripts** - Get overview without loading full content
3. **search_transcripts** - Search all transcripts for specific topics/keywords
4. **read_transcript_chunk** - Read specific chunks (for large transcripts)
5. **read_transcript** - Read full transcript (ONLY for small transcripts <5000 words)

**Note Management:**
6. **take_note** - Save notes with importance level (CRITICAL/HIGH/MEDIUM/LOW)
7. **search_notes** - Find notes by keyword, section, or importance level

**Document Creation:**
8. **create_section** - Define document structure
9. **write_section** - Write markdown content per custom instructions
10. **get_current_document_state** - Check your progress (shows note importance breakdown!)
11. **update_progress** - Keep user informed
12. **finalize_document** - Complete when all sections meet requirements`;
}

/**
 * Build Workflow section based on variant
 */
function buildWorkflowSection(variant) {
  if (variant.id === 'baseline') {
    // Baseline: Simple workflow
    return `## Workflow - Follow This Sequence

**Step 1: Read Transcripts**
- Use \`read_transcript\` to read each transcript
- Take notes using \`take_note\` as you discover relevant content

**Step 2: Create Structure**
- Call \`get_current_document_state\` to check if sections already exist
- Create ALL sections using \`create_section\` (order: 1, 2, 3...)

**Step 3: Write Content**
- Call \`get_current_document_state\` to see which sections need content
- Write each section using \`write_section\`
- Call \`update_progress\` periodically

**Step 4: Finalize**
- Call \`get_current_document_state\` to verify ALL sections have content
- When complete, call \`finalize_document\``;
  }

  if (variant.id === 'hybrid') {
    // Hybrid: Scalable tools but no planning
    return `## Workflow - Follow This Sequence

**Step 1: Explore Available Content**
- Start with \`list_available_transcripts\` to see what you have
- Use \`search_transcripts\` to find specific content across all transcripts
- Only use \`read_transcript\` for small transcripts (<5000 words)
- For large transcripts, use \`read_transcript_chunk\` with results from search

**Step 2: Create Structure**
- Call \`get_current_document_state\` to check if sections already exist
- Create ALL sections using \`create_section\` (order: 1, 2, 3...)

**Step 3: Gather Targeted Content**
- Use \`search_transcripts\` to find content for each section
- Read relevant chunks with \`read_transcript_chunk\`
- Take notes using \`take_note\` as you discover relevant content

**Step 4: Write Content**
- Call \`get_current_document_state\` to see which sections need content
- Write each section using \`write_section\`
- Call \`update_progress\` periodically

**Step 5: Finalize**
- Call \`get_current_document_state\` to verify ALL sections have content
- When complete, call \`finalize_document\``;
  }

  // Scalable: Full workflow with planning and importance
  return `## Workflow - Follow This Sequence

**Step 0: Create Strategic Plan (DO THIS FIRST!)**
- Call \`create_workflow_plan\` with your planned approach
- Outline major steps (e.g., "Survey all transcripts for AI themes", "Create 5-section structure", "Deep dive into top 3 examples")
- Estimate how many tool calls you'll need (~50-100 for thorough research)
- Explain your rationale for the approach

**Step 1: Explore Available Content**
- Start with \`list_available_transcripts\` to see what you have
- Identify key topics and themes from the overview
- Use \`search_transcripts\` to find specific content across all transcripts
- Only use \`read_transcript\` for small transcripts (<5000 words)
- For large transcripts, use \`read_transcript_chunk\` with results from search

---

## ⚠️ CRITICAL: Tool API Reference - Exact Parameter Names

**ALL parameters use camelCase. Copy these examples EXACTLY.**

### Reading & Searching Tools
\`\`\`javascript
// 1. Survey all available transcripts (use this first)
list_available_transcripts()
// Returns: array of { transcriptId, title, source, duration, wordCount }

// 2. Find relevant content across transcripts
search_transcripts({ query: "validation methods", maxResults: 10 })
// Returns: [{ transcriptId, chunkId, transcriptTitle, snippet, relevanceScore, chunkIndex, timeRange, keywords }]

// 3. Read specific chunk - ALWAYS USE THIS for selective reading
read_transcript_chunk({ chunkId: "chunk-uuid-from-search-results" })
// Returns: { chunkId, transcriptId, transcriptTitle, content, wordCount, chunkIndex, timeRange, summary, keywords, totalChunks }
// Optional: includeAdjacent: true to get previous/next chunk snippets

// ⚠️ NEVER USE read_transcript - causes token overflow on large transcripts
// DON'T: read_transcript({ transcriptId: "..." })  ← AVOID THIS
\`\`\`

### Note-Taking Tools
\`\`\`javascript
// COMPLETE EXAMPLE - Search → Read → Note workflow:
const searchResults = search_transcripts({ query: "validation methods" })
// searchResults.results[0] = { chunkId: "chunk-uuid", transcriptId: "transcript-uuid", snippet: "..." }

const chunk = read_transcript_chunk({ chunkId: searchResults.results[0].chunkId })
// Now you have full chunk.content to extract notes from

take_note({
  section: "Validation Methods",               // REQUIRED: exact section title
  source: searchResults.results[0].transcriptId, // REQUIRED: transcriptId from search
  note: "Deposit framework: collect $500 refundable deposit before building to prove willingness to pay",
  importance: "CRITICAL",                      // CRITICAL | HIGH | MEDIUM | LOW
  noteType: "method"                           // quote | insight | metric | example | method | story | data | task | general
})
// Returns: { success: true, noteId: "...", message: "[CRITICAL] note saved..." }

// Search through your saved notes
search_notes({ query: "deposit framework", section: "Validation Methods" })
// Returns: array of matching notes with content and metadata
\`\`\`

### Document Structure Tools
\`\`\`javascript
// Create a section (save the returned sectionId!)
const result = create_section({ title: "Market Analysis", description: "Analysis of target market", order: 1 })
// Returns: { sectionId: "uuid-123-abc", title: "Market Analysis", order: 1 }

// Write section content using the sectionId from create_section
write_section({
  sectionId: "uuid-123-abc",                   // REQUIRED: use sectionId from create_section result
  content: "## Market Analysis\\n\\nThe market analysis reveals..."
})
// Returns: { success: true, sectionId: "...", wordCount: 450 }

// Check your document progress
get_current_document_state()
// Returns: { sections: [...], notes: { total: 45, bySectionimportance: {...} }, status: "..." }

// Log progress updates
update_progress({ status: "gathered_validation_notes", details: "Collected 15 notes on validation" })

// Complete the document when all sections are written
finalize_document()
\`\`\`

### Correct Workflow Example
\`\`\`
1. list_available_transcripts() → see all 46 transcripts
2. search_transcripts({ query: "validation" }) → returns results with chunkId
3. read_transcript_chunk({ chunkId: result.chunkId }) → read the chunk content
4. take_note({ section: "Validation", source: result.transcriptId, note: "...", importance: "CRITICAL", noteType: "insight" })
5. Repeat steps 2-4 for different queries/sections
6. create_section({ title: "Validation Methods", order: 2 }) → get sectionId back
7. write_section({ sectionId: "returned-uuid", content: "synthesized content from notes" })
8. finalize_document() when all sections complete
\`\`\`

**Key Rules:**
- ✅ USE: \`read_transcript_chunk({ chunkId })\` - get chunkId from search_transcripts results
- ❌ AVOID: \`read_transcript({ transcriptId })\` causes token overflow
- ✅ ALWAYS include \`section\` and \`source\` in \`take_note\`
- ✅ Save \`sectionId\` from \`create_section\` to use in \`write_section\`
- ✅ Use camelCase for ALL parameters: \`chunkId\`, \`sectionId\`, \`noteType\`, \`maxResults\`

**⚠️ CRITICAL: 100% Transcript Coverage Requirement**

You MUST analyze EVERY transcript provided to you. \`finalize_document\` will FAIL if you haven't taken at least one note from each transcript.

**Coverage Strategy** (for 40+ transcripts):
1. \`list_available_transcripts()\` - see all transcripts (e.g., 46 available)
2. Use \`search_transcripts\` with 10-15 diverse thematic queries:
   - Each query returns results from multiple transcripts with their \`chunkId\`
   - Use \`maxResults: 10-15\` to get more coverage per search
3. For each search result:
   - Use \`read_transcript_chunk({ chunkId: result.chunkId })\` to read full content
   - Take notes with \`take_note({ source: result.transcriptId, ... })\`
4. Continue searching with different themes until all transcripts are covered

**Expected Tool Call Count:**
- 40 transcripts → 60-90 tool calls minimum
- 10-15 search queries + 40+ chunk reads + 40+ notes + section operations
- Generation time: 5-10 minutes for comprehensive coverage

**Example Coverage Queries:**
\`\`\`
search_transcripts({ query: "validation methods", maxResults: 15 })
search_transcripts({ query: "pricing strategy", maxResults: 15 })
search_transcripts({ query: "customer acquisition", maxResults: 15 })
search_transcripts({ query: "product market fit", maxResults: 15 })
search_transcripts({ query: "revenue models", maxResults: 15 })
// ... continue with 5-10 more diverse themes
\`\`\`

This ensures broad coverage across all transcripts.

---

**Step 2: Create Structure**
- Call \`get_current_document_state\` to check if sections already exist
- Create ALL sections using \`create_section\` (order: 1, 2, 3...)
- If you get "section already exists" error, call \`get_current_document_state\` to see what's there

**Step 3: Gather Targeted Content**
- Use \`search_transcripts\` to find content for each section
- Read relevant chunks with \`read_transcript_chunk\`
- Take notes using \`take_note\` - **BOTH section AND source are REQUIRED**:
  - **section**: REQUIRED - The exact section title (e.g., "Introduction", "Market Analysis")
  - **source**: REQUIRED - The transcript ID from search_transcripts results
  - **note**: The actual note content (quote, data point, insight, etc.)
  - **importance**: CRITICAL/HIGH/MEDIUM/LOW - how essential is this content?
  - **noteType**: quote/metric/insight/example/method/story/data/task/general
  - **Example**: \`take_note({section: "Introduction", source: "abc-123-xyz", note: "Key finding: 72% of founders used AI tools", importance: "CRITICAL", noteType: "metric"})\`
- As you collect many notes, use \`search_notes\` to find specific content later

**Step 4: Write Content**
- Call \`get_current_document_state\` to see which sections need content AND note importance breakdown
- Prioritize CRITICAL and HIGH importance notes when writing
- Write each section using \`write_section\` (synthesize your notes into cohesive prose)
- Follow custom instructions for content length and format
- Write cohesive content that fulfills each section's purpose
- Use \`search_notes\` to find relevant notes by keyword or section
- Call \`update_progress\` periodically

**Step 5: Finalize**
- Call \`get_current_document_state\` to verify ALL sections have content
- If any section is incomplete, write more content
- When complete, call \`finalize_document\``;
}

/**
 * Build system prompt for agent
 */
function buildAgentSystemPrompt(documentType, preferences, transcriptIds, variant) {
  const { customInstructions, ...otherPreferences } = preferences;

  const customInstructionsSection = customInstructions ? `
## ⚠️ CRITICAL: User's Custom Instructions

${customInstructions}

**These custom instructions override any defaults below.**
` : '';

  // Variant-specific header
  const variantNotice = variant.id !== 'scalable' ? `
## 🧪 Variant: ${variant.name}

You are using the "${variant.name}" configuration. ${variant.description}
` : '';

  return `You are an expert document generation agent creating a ${documentType} from ${transcriptIds.length} transcripts.
${variantNotice}${customInstructionsSection}
## User Preferences
${JSON.stringify(otherPreferences, null, 2)}

## ⚠️ ⚠️ ⚠️ CRITICAL: YOU MUST READ TRANSCRIPTS BEFORE WRITING ⚠️ ⚠️ ⚠️

**THIS IS NOT OPTIONAL. THE FOLLOWING BEHAVIOR WILL CAUSE FAILURE:**

❌ Writing content without reading transcripts
❌ Finalizing with <${Math.max(20, transcriptIds.length * 2)} tool calls (you need 50-150 for ${transcriptIds.length} transcripts)
❌ Taking <${Math.max(10, transcriptIds.length)} notes (you need at least ${transcriptIds.length} notes, ideally 30-50)
❌ Skipping search_transcripts to find relevant content
❌ Responding with text-only for 3+ consecutive turns (you MUST use tools to work)

**EXPECTED WORKFLOW FOR ${transcriptIds.length} TRANSCRIPTS:**
1. Call create_workflow_plan FIRST to outline your approach
2. Call list_available_transcripts to see what you have (~1 call)
3. Use search_transcripts 10-20 times to find content for different topics/themes
4. Read relevant chunks with read_transcript_chunk (20-40 calls)
5. Take detailed notes with take_note as you read (30-50 notes minimum)
6. Create document sections with create_section (5-10 sections)
7. Write each section with write_section using your notes (5-10 calls)
8. ONLY THEN call finalize_document

Total expected tool calls: 50-150 for thorough research and writing.

If you try to finalize with fewer tool calls or notes, finalize_document will REJECT your attempt.

## ⚠️ CRITICAL: Reasoning and Communication

**Before every action, you MUST explain your thinking in natural language**, as if talking to a colleague:

- What have you discovered so far?
- What patterns, themes, or insights are emerging?
- Why are you choosing this next action?
- What specific value will this action provide?

**Example of GOOD reasoning:**
"I've now examined 3 transcripts and I'm noticing a strong recurring theme about supply chain disruptions - mentioned 15 times across all three sources. This seems important enough to warrant its own dedicated section. I'm also seeing that Transcript #2 has specific data about shipping delays (concrete numbers: 45-day average) which would make excellent supporting evidence. I'll create a 'Supply Chain Analysis' section and then search the remaining transcripts for related metrics using search_transcripts."

**Example of BAD reasoning:**
"Analyzing transcripts and deciding next steps."

Your reasoning should be conversational, specific, and insightful. Treat this like you're giving a running commentary to someone watching over your shoulder. Share your discoveries, thought process, and strategic decisions.

## ⚠️ IMPORTANT: Follow Custom Instructions Exactly

The custom instructions define ALL document requirements:
- Number of sections
- Section names
- Content length per section
- Format and structure

Follow the custom instructions exactly. Do NOT impose your own assumptions about document structure.

${buildToolsSection(variant)}

${buildWorkflowSection(variant)}

## Critical Rules

**⚠️ TOOLS ARE HOW YOU DO WORK - NOT TEXT RESPONSES:**
- Text-only responses = NO PROGRESS. Tools make things happen.
- If you respond with text for 3 consecutive turns, generation will FAIL.
- Every turn, you should be calling 1-5 tools to accomplish work.
- Reading, note-taking, creating sections, writing content - ALL require tool calls.

**AVOID LOOPS - You will see your progress after every tool batch:**
- After each batch of tool calls, you'll see a progress summary
- This shows sections created, sections with content, notes collected
- Use this feedback to decide your next action
- DO NOT repeat actions you've already done

**PREVENT DUPLICATE WORK:**
- Reading same transcript twice → You'll get "already read" message
- Creating same section twice → You'll get "section exists" error
- If you get errors, call \`get_current_document_state\` to understand why

**CONTENT QUALITY:**
- ONLY use content from the provided transcripts
- NO hallucination or external knowledge
- Write cohesive prose with examples and quotes, not bullet lists
- Each section should read like a well-written article

**Note Types:** quote, metric, insight, example, method, story, data, task, general

## ⚠️ CRITICAL: Multi-Section Document Requirements

**BEFORE you attempt to finalize the document, you MUST verify ALL of these requirements:**

1. **MINIMUM SECTION COUNT:** Document must have at least 3-5 substantial sections with descriptive titles
   - If custom instructions specify a number (e.g., "5 sections"), use that number
   - If custom instructions say "multiple sections" or "several sections", create at least 5
   - Each section must have a clear, descriptive title

2. **MINIMUM CONTENT PER SECTION:** Each section must contain substantial, detailed content
   - Minimum 150 words per section (200+ words for "detailed" or "comprehensive" documents)
   - Write cohesive prose with examples, quotes, and specific details
   - NO placeholder text, NO trivial summaries

3. **MINIMUM TOTAL WORD COUNT:** Complete document must be substantial
   - Minimum 500 words total (1000+ for "detailed" or "comprehensive" documents)
   - Quality over quantity, but don't cut corners

4. **EVIDENCE-BASED CONTENT:** All content must be grounded in the transcripts
   - Take notes from multiple transcripts (minimum 10 notes recommended)
   - Reference specific examples, quotes, metrics, and stories from the source material
   - NO hallucination or external knowledge

**⚠️ IMPORTANT: The finalize_document tool will REJECT your attempt if:**
- You have fewer than the required number of sections
- Any section has less than the minimum word count
- Total document word count is below the minimum
- Sections contain empty or placeholder content

**Before calling finalize_document:**
1. Call \`get_current_document_state\` to review all sections
2. Verify each section meets the minimum word count (150+ words)
3. Verify total section count meets requirements (3-5+ sections)
4. Ensure all content is substantial and evidence-based

## Example Good Section
\`\`\`markdown
# Finding Proven Ideas

The founders converge on a counter-intuitive insight: validation matters more than originality. When Dennis saw the Skype shutdown announcement, he posted MVP screenshots to Reddit within hours and got paying customers immediately. This "building in public" approach appears repeatedly across the transcripts...
\`\`\`

Make progress systematically. Check your state when unsure. Write quality prose. Only finalize when ALL requirements are met.`;
}

/**
 * Build initial user message for conversation
 */
function buildInitialUserMessage(transcriptIds, documentType, preferences) {
  const { customInstructions, ...otherPreferences } = preferences;

  const customInstructionsSection = customInstructions ? `

## ⚠️ CRITICAL REQUIREMENTS

The user has provided these specific instructions for the document:

${customInstructions}

**You MUST follow these instructions carefully. They define the structure, sections, and format requirements.**
` : '';

  return `Please generate a ${documentType} document from the ${transcriptIds.length} transcripts provided.

## Available Transcripts
${transcriptIds.map((id, i) => `${i + 1}. Transcript ID: ${id}`).join('\n')}
${customInstructionsSection}
## User Preferences
${JSON.stringify(otherPreferences, null, 2)}

## Instructions

Read all ${transcriptIds.length} transcripts, take notes organized by section, create a well-structured document outline${customInstructions ? ' following the custom requirements above' : ''}, write each section with synthesized content from your notes, and finalize when complete.

Remember: ONLY use content from the transcripts. No hallucination.

Begin by reading the transcripts and planning your document structure${customInstructions ? ' according to the custom instructions' : ''}.`;
}

/**
 * Handle agent errors
 */
async function handleAgentError(documentId, error) {
  try {
    // Emit error event
    emitError(documentId, error);

    // Cleanup emitter
    cleanupAgentEmitter(documentId);

    await prisma.agentDocument.update({
      where: { id: documentId },
      data: {
        status: 'FAILED',
        errorMessage: error.message,
        currentStage: 'Failed: ' + error.message.substring(0, 100)
      }
    });
  } catch (dbError) {
    console.error(`Failed to update error status:`, dbError);
  }
}

/**
 * Get document status for polling
 */
export async function getAgentDocumentStatus(documentId) {
  const doc = await prisma.agentDocument.findUnique({
    where: { id: documentId },
    select: {
      status: true,
      progress: true,
      currentStage: true,
      errorMessage: true,
      toolCallCount: true,
      totalTokens: true,
      totalCost: true,
      sections: {
        select: {
          id: true,
          title: true,
          order: true,
          wordCount: true
        },
        orderBy: { order: 'asc' }
      },
      notes: {
        select: {
          id: true,
          sectionTitle: true
        }
      }
    }
  });

  if (!doc) {
    throw new Error(`Document ${documentId} not found`);
  }

  return {
    status: doc.status,
    progress: doc.progress,
    currentStage: doc.currentStage,
    errorMessage: doc.errorMessage,
    stats: {
      toolCallCount: doc.toolCallCount,
      totalTokens: doc.totalTokens,
      totalCost: Number(doc.totalCost.toFixed(2)),
      sectionsCreated: doc.sections.length,
      sectionsWithContent: doc.sections.filter(s => s.wordCount && s.wordCount > 0).length,
      notesCollected: doc.notes.length
    },
    sections: doc.sections
  };
}

/**
 * Get complete document with content
 */
export async function getAgentDocument(documentId) {
  const doc = await prisma.agentDocument.findUnique({
    where: { id: documentId },
    include: {
      sections: {
        orderBy: { order: 'asc' }
      },
      transcripts: {
        select: {
          id: true,
          title: true,
          channel: true,
          source: true
        }
      },
      notes: {
        select: {
          id: true,
          sectionTitle: true,
          noteType: true,
          content: true,
          sourceTranscriptId: true
        }
      }
    }
  });

  if (!doc) {
    throw new Error(`Document ${documentId} not found`);
  }

  return doc;
}

/**
 * Get detailed agent behavior analysis
 */
export async function getAgentAnalysis(documentId) {
  const doc = await prisma.agentDocument.findUnique({
    where: { id: documentId },
    include: {
      sections: {
        orderBy: { order: 'asc' }
      },
      notes: {
        select: {
          sectionTitle: true,
          noteType: true,
          usedInFinal: true,
          sourceTranscriptId: true
        }
      },
      toolCalls: {
        orderBy: { calledAt: 'asc' },
        select: {
          toolName: true,
          toolInput: true,
          toolOutput: true,
          success: true,
          durationMs: true,
          calledAt: true
        }
      }
    }
  });

  if (!doc) {
    throw new Error(`Document ${documentId} not found`);
  }

  // Analyze tool call patterns
  const toolCallBreakdown = {};
  doc.toolCalls.forEach(call => {
    toolCallBreakdown[call.toolName] = (toolCallBreakdown[call.toolName] || 0) + 1;
  });

  // Analyze reading pattern
  const readingPattern = doc.toolCalls
    .filter(call => call.toolName === 'read_transcript')
    .map((call, index) => ({
      transcriptId: call.toolInput.transcriptId,
      order: index + 1,
      timestamp: call.calledAt
    }));

  // Analyze note utilization
  const totalNotes = doc.notes.length;
  const usedNotes = doc.notes.filter(n => n.usedInFinal).length;

  // Analyze section revisions
  const sectionEvolution = doc.sections.map(section => ({
    sectionId: section.id,
    title: section.title,
    order: section.order,
    finalWordCount: section.wordCount,
    revisionCount: section.revisionCount
  }));

  return {
    documentId: doc.id,
    generationMetrics: {
      totalToolCalls: doc.toolCallCount,
      totalTokens: doc.totalTokens,
      totalCost: Number(doc.totalCost.toFixed(2)),
      generationTime: doc.generationTime
    },
    toolCallBreakdown,
    readingPattern,
    noteUtilization: {
      total: totalNotes,
      used: usedNotes,
      unused: totalNotes - usedNotes,
      utilizationRate: totalNotes > 0 ? (usedNotes / totalNotes).toFixed(2) : 0
    },
    sectionEvolution,
    timeline: doc.toolCalls.map(call => ({
      time: call.calledAt,
      tool: call.toolName,
      success: call.success,
      duration: call.durationMs
    }))
  };
}

export default {
  generateAgenticDocument,
  getAgentDocumentStatus,
  getAgentDocument,
  getAgentAnalysis
};
