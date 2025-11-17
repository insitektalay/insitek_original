// src/v2/components/ui/AgentProgressStream.jsx
// Real-time streaming component for agent progress with reasoning display

import { useState, useEffect, useRef } from 'react';
import {
  SparklesIcon,
  WrenchScrewdriverIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChartBarIcon,
  ClipboardDocumentIcon
} from '@heroicons/react/24/outline';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export default function AgentProgressStream({ documentId }) {
  const [currentReasoning, setCurrentReasoning] = useState('Initializing agent...');
  const [events, setEvents] = useState([]);
  const [progress, setProgress] = useState({
    totalSections: 0,
    sectionsComplete: 0,
    totalNotes: 0,
    toolCallCount: 0,
    transcriptsAvailable: 0
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const eventSourceRef = useRef(null);
  const eventsEndRef = useRef(null);

  // Auto-scroll to bottom of events
  const scrollToBottom = () => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [events]);

  useEffect(() => {
    // Set up Server-Sent Events connection
    const eventSource = new EventSource(`${API_URL}/api/agent-documents/${documentId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('📡 Connected to agent stream');
      setIsConnected(true);
    };

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);

        switch (event.type) {
          case 'connected':
            console.log('✓ Stream connected for document:', event.documentId);
            break;

          case 'reasoning':
            // Update the prominent reasoning display
            setCurrentReasoning(event.content);
            setEvents(prev => [...prev, {
              type: 'reasoning',
              content: event.content,
              timestamp: event.timestamp,
              id: Date.now() + Math.random()
            }]);
            break;

          case 'tool_call':
            setEvents(prev => [...prev, {
              type: 'tool_call',
              toolName: event.toolName,
              args: event.args,
              timestamp: event.timestamp,
              id: Date.now() + Math.random()
            }]);
            break;

          case 'tool_result':
            setEvents(prev => [...prev, {
              type: 'tool_result',
              toolName: event.toolName,
              success: event.success,
              message: event.message,
              data: event.data,
              timestamp: event.timestamp,
              id: Date.now() + Math.random()
            }]);
            break;

          case 'progress':
            setProgress({
              totalSections: event.totalSections || 0,
              sectionsComplete: event.sectionsComplete || 0,
              totalNotes: event.totalNotes || 0,
              toolCallCount: event.toolCallCount || 0,
              transcriptsAvailable: event.transcriptsAvailable || 0
            });
            break;

          case 'complete':
            setIsComplete(true);
            setCurrentReasoning(`✅ Document complete! ${event.wordCount} words across ${event.sectionCount} sections.`);
            break;

          case 'error':
            setError(event.error);
            setCurrentReasoning(`❌ Error: ${event.error}`);
            break;

          default:
            console.log('Unknown event type:', event.type);
        }
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('❌ SSE connection error:', err);
      setIsConnected(false);

      // Don't reconnect if we're complete or have an error
      if (!isComplete && !error) {
        console.log('Attempting to reconnect in 3 seconds...');
        setTimeout(() => {
          if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
            // Reconnect
            window.location.reload(); // Simple reconnection strategy
          }
        }, 3000);
      }
    };

    // Cleanup on unmount
    return () => {
      console.log('🔌 Closing SSE connection');
      eventSource.close();
    };
  }, [documentId, isComplete, error]);

  // Helper: Format timestamp
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Handler: Copy activity log to clipboard
  const handleCopyActivityLog = async () => {
    try {
      // Format all events as readable text
      const formattedText = events.map((event) => {
        const time = formatTime(event.timestamp);

        if (event.type === 'reasoning') {
          return `[${time}] 💭 THINKING:\n${event.content}\n`;
        } else if (event.type === 'tool_call') {
          const args = event.args ? `\nArguments: ${JSON.stringify(event.args, null, 2)}` : '';
          return `[${time}] 🔧 TOOL CALL: ${event.toolName}${args}\n`;
        } else if (event.type === 'tool_result') {
          const status = event.success ? '✅ SUCCESS' : '❌ FAILED';
          const duration = event.durationMs ? ` (${event.durationMs}ms)` : '';
          const message = event.result || event.error || '';
          return `[${time}] ${status}${duration}\n${message}\n`;
        } else if (event.type === 'progress') {
          return `[${time}] 📊 PROGRESS: ${event.progress}% - ${event.currentStage}\n`;
        } else if (event.type === 'complete') {
          return `[${time}] ✅ GENERATION COMPLETE\n`;
        } else if (event.type === 'error') {
          return `[${time}] ❌ ERROR: ${event.error}\n`;
        }

        return `[${time}] ${event.type}: ${JSON.stringify(event)}\n`;
      }).join('\n');

      // Copy to clipboard
      await navigator.clipboard.writeText(formattedText);

      // Show success feedback
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy activity log:', err);
    }
  };

  // Helper: Get tool icon and color
  const getToolDisplay = (toolName) => {
    const toolIcons = {
      list_available_transcripts: { icon: '📋', color: 'text-purple-600' },
      search_transcripts: { icon: '🔍', color: 'text-blue-600' },
      read_transcript_chunk: { icon: '📖', color: 'text-indigo-600' },
      read_transcript: { icon: '📄', color: 'text-gray-600' },
      take_note: { icon: '📝', color: 'text-yellow-600' },
      create_section: { icon: '🏗️', color: 'text-green-600' },
      write_section: { icon: '✍️', color: 'text-orange-600' },
      get_current_document_state: { icon: '📊', color: 'text-cyan-600' },
      update_progress: { icon: '📈', color: 'text-teal-600' },
      finalize_document: { icon: '✅', color: 'text-emerald-600' }
    };

    return toolIcons[toolName] || { icon: '🔧', color: 'text-gray-500' };
  };

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="flex items-center gap-2 text-sm">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
        <span className="text-gray-600">
          {isConnected ? 'Live stream active' : 'Connecting...'}
        </span>
      </div>

      {/* BIG PROMINENT REASONING DISPLAY */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border-l-8 border-blue-600 shadow-md">
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-700 mb-3">
          <SparklesIcon className="w-5 h-5" />
          <span>Agent's Current Thinking</span>
        </div>
        <div className="text-base text-gray-800 leading-relaxed whitespace-pre-wrap font-medium">
          {currentReasoning}
        </div>
      </div>

      {/* Progress Stats Grid */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{progress.transcriptsAvailable}</div>
          <div className="text-xs text-gray-600 mt-1">Transcripts</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{progress.totalSections}</div>
          <div className="text-xs text-gray-600 mt-1">Sections</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-green-600">{progress.sectionsComplete}</div>
          <div className="text-xs text-gray-600 mt-1">Written</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">{progress.totalNotes}</div>
          <div className="text-xs text-gray-600 mt-1">Notes</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-blue-600">{progress.toolCallCount}</div>
          <div className="text-xs text-gray-600 mt-1">Tool Calls</div>
        </div>
      </div>

      {/* Activity Log */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <ChartBarIcon className="w-5 h-5 text-gray-600" />
          <span className="text-sm font-semibold text-gray-700">Activity Log</span>
          <span className="text-xs text-gray-500 ml-auto">{events.length} events</span>

          {/* Copy Button */}
          <button
            onClick={handleCopyActivityLog}
            disabled={events.length === 0}
            className={`p-2 rounded-lg transition-all ${
              copySuccess
                ? 'bg-green-100 text-green-600'
                : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
            title={copySuccess ? 'Copied!' : 'Copy activity log to clipboard'}
          >
            {copySuccess ? (
              <CheckCircleIcon className="w-4 h-4" />
            ) : (
              <ClipboardDocumentIcon className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-4 space-y-2">
          {events.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              Waiting for agent activity...
            </div>
          ) : (
            events.slice(-30).map((event) => (
              <div
                key={event.id}
                className="border-l-2 border-gray-200 pl-3 py-2 hover:bg-gray-50 transition-colors"
              >
                {/* Reasoning Event */}
                {event.type === 'reasoning' && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <SparklesIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <span className="text-xs text-gray-500">{formatTime(event.timestamp)}</span>
                      <span className="text-xs font-semibold text-blue-600">Thinking</span>
                    </div>
                    <div className="text-sm text-gray-700 italic pl-6">
                      {event.content.length > 150
                        ? event.content.substring(0, 150) + '...'
                        : event.content
                      }
                    </div>
                  </div>
                )}

                {/* Tool Call Event */}
                {event.type === 'tool_call' && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <WrenchScrewdriverIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <span className="text-xs text-gray-500">{formatTime(event.timestamp)}</span>
                      <span className="text-xs font-semibold text-gray-700">Tool Call</span>
                    </div>
                    <div className="flex items-center gap-2 pl-6">
                      <span className={`text-lg ${getToolDisplay(event.toolName).color}`}>
                        {getToolDisplay(event.toolName).icon}
                      </span>
                      <code className="text-sm bg-gray-100 px-2 py-0.5 rounded font-mono">
                        {event.toolName}
                      </code>
                    </div>
                  </div>
                )}

                {/* Tool Result Event */}
                {event.type === 'tool_result' && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {event.success ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                      <span className="text-xs text-gray-500">{formatTime(event.timestamp)}</span>
                      <span className={`text-xs font-semibold ${event.success ? 'text-green-600' : 'text-red-600'}`}>
                        {event.success ? 'Success' : 'Failed'}
                      </span>
                    </div>
                    <div className={`text-sm pl-6 ${event.success ? 'text-gray-600' : 'text-red-600'}`}>
                      {event.message}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={eventsEndRef} />
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
          <div className="flex items-center gap-2 text-red-800 font-semibold mb-2">
            <XCircleIcon className="w-5 h-5" />
            <span>Generation Failed</span>
          </div>
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {/* Completion Display */}
      {isComplete && !error && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg">
          <div className="flex items-center gap-2 text-green-800 font-semibold mb-2">
            <CheckCircleIcon className="w-5 h-5" />
            <span>Generation Complete!</span>
          </div>
          <div className="text-sm text-green-700">
            The document has been successfully generated. You can now view the final content.
          </div>
        </div>
      )}
    </div>
  );
}
