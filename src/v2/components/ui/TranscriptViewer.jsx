import { Card, CardContent } from "./card";
import { useEffect, useState } from "react";
import { ArrowLeftIcon, DocumentDuplicateIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/20/solid';
import MarkdownMessage from './MarkdownMessage';
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// Helper function to format milliseconds to HH:MM:SS or MM:SS
function formatTimestamp(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function TranscriptViewer({ transcriptId, onClose, initialViewMode = 'transcript' }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [viewMode, setViewMode] = useState(initialViewMode); // 'transcript' or 'summary'
  const [copiedWith, setCopiedWith]       = useState(false);
  const [copiedWithout, setCopiedWithout] = useState(false);
  /* ---------- update viewMode when initialViewMode changes ---------- */
  useEffect(() => {
    setViewMode(initialViewMode);
  }, [initialViewMode, transcriptId]);

  /* ---------- fetch when id changes ---------- */
  useEffect(() => {
    if (!transcriptId) return;
    const fetchOne = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/transcripts/${transcriptId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        // Parse segments if it's a JSON string
        if (json.segments && typeof json.segments === 'string') {
          try {
            json.segments = JSON.parse(json.segments);
          } catch (e) {
            console.error('Failed to parse segments:', e);
            json.segments = null;
          }
        }

        setData(json);
        setError(null);
      } catch (err) {
        console.error(err);
        setError("Failed to fetch transcript");
      } finally {
        setLoading(false);
      }
    };
    fetchOne();
  }, [transcriptId]);

  /* ---------- Copy handlers ---------- */
  const handleCopyWithTimestamps = async () => {
    if (!data?.segments?.length) return;

    const textWithTimestamps = data.segments
      .map(segment => `[${formatTimestamp(segment.offsets.from)}] ${segment.text}`)
      .join('\n');

    try {
      await navigator.clipboard.writeText(textWithTimestamps);
      setCopiedWith(true);
      setTimeout(() => setCopiedWith(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopyWithoutTimestamps = async () => {
    if (!data?.segments?.length && !data?.text) return;

    const plainText = data.segments?.length
      ? data.segments.map(segment => segment.text).join(' ')
      : data.text;

    try {
      await navigator.clipboard.writeText(plainText);
      setCopiedWithout(true);
      setTimeout(() => setCopiedWithout(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopySummary = async () => {
    if (!data?.summary) return;

    try {
      await navigator.clipboard.writeText(data.summary);
      setCopiedWithout(true); // Reuse this state
      setTimeout(() => setCopiedWithout(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  /* ---------- UI states ---------- */
  if (!transcriptId) {
    return (
      <Card className="h-full relative flex flex-col bg-white rounded-xl" style={{ border: '0', borderWidth: '0', borderStyle: 'none', boxShadow: 'none' }}>
        <CardContent
          className="flex-1 overflow-auto p-4 text-xs text-gray-500"
          style={{
            fontFamily:
              '-apple-system, BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
          }}
        >
          Select a transcript to view.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header with Back Button */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-start space-x-3">
          {/* Back Button */}
          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors"
            title="Back to list"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>

          {/* Transcript Info */}
          {data && (
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold text-gray-900 truncate">
                {data.title || 'Transcript'}
              </h1>
              <div className="flex items-center mt-1 text-sm text-gray-500">
                <span>{data.channel || 'Unknown Channel'}</span>
                {data.createdAt && (
                  <>
                    <span className="mx-2">•</span>
                    <span>{new Date(data.createdAt).toLocaleDateString()}</span>
                  </>
                )}
              </div>
              {/* View Mode Tabs */}
              {data.summary && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setViewMode('transcript')}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      viewMode === 'transcript'
                        ? 'bg-indigo-100 text-indigo-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Transcript
                  </button>
                  <button
                    onClick={() => setViewMode('summary')}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      viewMode === 'summary'
                        ? 'bg-green-100 text-green-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    AI Summary
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Copy Buttons */}
          {data && (
            <div className="flex items-center space-x-2">
              {viewMode === 'transcript' ? (
                <>
                  {/* Copy with timestamps */}
                  <button
                    onClick={handleCopyWithTimestamps}
                    disabled={!data?.segments?.length}
                    className="flex-shrink-0 p-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Copy with timestamps"
                  >
                    {copiedWith ? (
                      <CheckIcon className="w-5 h-5 text-green-600" />
                    ) : (
                      <DocumentDuplicateIcon className="w-5 h-5" />
                    )}
                  </button>

                  {/* Copy without timestamps */}
                  <button
                    onClick={handleCopyWithoutTimestamps}
                    disabled={!data?.segments?.length && !data?.text}
                    className="flex-shrink-0 p-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Copy without timestamps"
                  >
                    {copiedWithout ? (
                      <CheckIcon className="w-5 h-5 text-green-600" />
                    ) : (
                      <ClipboardDocumentIcon className="w-5 h-5" />
                    )}
                  </button>
                </>
              ) : (
                /* Copy summary button */
                <button
                  onClick={handleCopySummary}
                  disabled={!data?.summary}
                  className="flex-shrink-0 p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Copy summary"
                >
                  {copiedWithout ? (
                    <CheckIcon className="w-5 h-5 text-green-600" />
                  ) : (
                    <ClipboardDocumentIcon className="w-5 h-5" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 text-xs text-gray-700"
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
        }}
      >
        {loading && <div className="text-gray-400 italic">Fetching…</div>}
        {error && <div className="text-red-500">{error}</div>}
        {!loading && !error && data && (
          viewMode === 'summary' ? (
            // Display AI Summary
            data.summary ? (
              <div className="prose prose-sm max-w-none">
                <MarkdownMessage content={data.summary} />
              </div>
            ) : (
              <div className="text-gray-400 italic">No summary available for this transcript.</div>
            )
          ) : (
            // Display Transcript
            data.segments && data.segments.length > 0 ? (
              // Display segments with timestamps
              <div className="space-y-3">
                {data.segments.map((segment, idx) => (
                  <div key={idx} className="flex gap-3">
                    <a
                      href={data.sourceUrl ? `${data.sourceUrl}?t=${Math.floor(segment.offsets.from / 1000)}` : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-indigo-600 hover:text-indigo-800 hover:underline font-mono text-xs"
                      title="Jump to this timestamp in video"
                    >
                      [{formatTimestamp(segment.offsets.from)}]
                    </a>
                    <span className="flex-1">{segment.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              // Fallback to plain text if no segments
              <div className="whitespace-pre-wrap">{data.text}</div>
            )
          )
        )}
      </div>
    </div>
  );
}