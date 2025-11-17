// services/agentEventEmitter.js
// Event emitter for real-time agent progress streaming

import EventEmitter from 'events';

// Map of documentId -> EventEmitter
const activeEmitters = new Map();

/**
 * Get or create event emitter for a document
 */
export function getAgentEmitter(documentId) {
  if (!activeEmitters.has(documentId)) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(20); // Allow multiple listeners
    activeEmitters.set(documentId, emitter);

    console.log(`📡 Created event emitter for document ${documentId}`);
  }

  return activeEmitters.get(documentId);
}

/**
 * Check if an emitter exists for a document
 */
export function hasAgentEmitter(documentId) {
  return activeEmitters.has(documentId);
}

/**
 * Clean up emitter after generation complete
 */
export function cleanupAgentEmitter(documentId) {
  if (activeEmitters.has(documentId)) {
    const emitter = activeEmitters.get(documentId);
    emitter.removeAllListeners();
    activeEmitters.delete(documentId);

    console.log(`🧹 Cleaned up event emitter for document ${documentId}`);
  }
}

/**
 * Get count of active emitters (for monitoring)
 */
export function getActiveEmitterCount() {
  return activeEmitters.size;
}

/**
 * Emit reasoning/thinking event
 */
export function emitReasoning(documentId, reasoning) {
  const emitter = getAgentEmitter(documentId);
  emitter.emit('event', {
    type: 'reasoning',
    content: reasoning,
    timestamp: new Date().toISOString()
  });
}

/**
 * Emit tool call event
 */
export function emitToolCall(documentId, toolName, args) {
  const emitter = getAgentEmitter(documentId);
  emitter.emit('event', {
    type: 'tool_call',
    toolName,
    args,
    timestamp: new Date().toISOString()
  });
}

/**
 * Emit tool result event
 */
export function emitToolResult(documentId, toolName, success, message, data = null) {
  const emitter = getAgentEmitter(documentId);
  emitter.emit('event', {
    type: 'tool_result',
    toolName,
    success,
    message,
    data,
    timestamp: new Date().toISOString()
  });
}

/**
 * Emit progress update event
 */
export function emitProgress(documentId, stats) {
  const emitter = getAgentEmitter(documentId);
  emitter.emit('event', {
    type: 'progress',
    ...stats,
    timestamp: new Date().toISOString()
  });
}

/**
 * Emit status change event
 */
export function emitStatusChange(documentId, status, stage) {
  const emitter = getAgentEmitter(documentId);
  emitter.emit('event', {
    type: 'status',
    status,
    stage,
    timestamp: new Date().toISOString()
  });
}

/**
 * Emit completion event
 */
export function emitComplete(documentId, wordCount, sectionCount) {
  const emitter = getAgentEmitter(documentId);
  emitter.emit('event', {
    type: 'complete',
    wordCount,
    sectionCount,
    timestamp: new Date().toISOString()
  });
}

/**
 * Emit error event
 */
export function emitError(documentId, error) {
  const emitter = getAgentEmitter(documentId);
  emitter.emit('event', {
    type: 'error',
    error: error.message,
    timestamp: new Date().toISOString()
  });
}
