/* src/v2/components/ui/QueuesPanel.jsx
   Queue management panel - list and detail views
   --------------------------------------------------------------- */
import { useState, useEffect, useRef } from 'react';
import { FolderOpen, ArrowLeft, Trash2, Play, CheckCircle, Clock, ExternalLink, AlertCircle } from 'lucide-react';
import ImportProgressSection from './ImportProgressSection';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export default function QueuesPanel() {
  const [queues, setQueues] = useState([]);
  const [selectedQueue, setSelectedQueue] = useState(null);
  const [queueDetails, setQueueDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [importStatus, setImportStatus] = useState(null);
  const pollingIntervalRef = useRef(null);

  useEffect(() => {
    fetchQueues();
  }, []);

  useEffect(() => {
    if (selectedQueue) {
      fetchQueueDetails(selectedQueue.id);
    }
  }, [selectedQueue]);

  const fetchQueues = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/queues`);
      if (response.ok) {
        const data = await response.json();
        setQueues(data.queues || []);
      } else {
        setErrorMessage('Failed to load queues');
      }
    } catch (error) {
      console.error('Error fetching queues:', error);
      setErrorMessage('Failed to load queues');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchQueueDetails = async (queueId) => {
    try {
      const response = await fetch(`${API_URL}/api/queues/${queueId}`);
      if (response.ok) {
        const data = await response.json();
        setQueueDetails(data);
      } else {
        setErrorMessage('Failed to load queue details');
      }
    } catch (error) {
      console.error('Error fetching queue details:', error);
      setErrorMessage('Failed to load queue details');
    }
  };

  const handleSelectQueue = (queue) => {
    setSelectedQueue(queue);
    setErrorMessage('');
  };

  const handleBackToList = () => {
    setSelectedQueue(null);
    setQueueDetails(null);
    fetchQueues(); // Refresh the list
  };

  const handleDeleteQueue = async (queueId, queueName) => {
    if (!confirm(`Are you sure you want to delete "${queueName}"? This will not delete any imported transcripts.`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/queues/${queueId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        alert(`Queue "${queueName}" deleted successfully`);
        if (selectedQueue?.id === queueId) {
          handleBackToList();
        } else {
          fetchQueues();
        }
      } else {
        const error = await response.json();
        setErrorMessage(error.error || 'Failed to delete queue');
      }
    } catch (error) {
      console.error('Error deleting queue:', error);
      setErrorMessage('Failed to delete queue');
    }
  };

  const fetchImportStatus = async (queueId) => {
    try {
      const response = await fetch(`${API_URL}/api/queues/${queueId}/import-status`);
      if (response.ok) {
        const data = await response.json();
        setImportStatus(data);

        // If import is complete, stop polling and refresh queue details
        if (!data.importing && pollingIntervalRef.current) {
          stopPolling();
          fetchQueueDetails(queueId);
          fetchQueues(); // Refresh queue list stats
        }

        return data;
      }
    } catch (error) {
      console.error('Error fetching import status:', error);
    }
  };

  const startPolling = (queueId) => {
    // Clear any existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Fetch immediately
    fetchImportStatus(queueId);

    // Then poll every 2 seconds
    pollingIntervalRef.current = setInterval(() => {
      fetchImportStatus(queueId);
    }, 2000);
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  // Start polling if viewing a queue with active imports
  useEffect(() => {
    if (selectedQueue) {
      // Check import status when queue is selected
      fetchImportStatus(selectedQueue.id).then((status) => {
        if (status?.importing) {
          startPolling(selectedQueue.id);
        }
      });
    } else {
      stopPolling();
    }
  }, [selectedQueue?.id]);

  const handleImportQueue = async () => {
    if (!selectedQueue) return;

    setIsImporting(true);
    setErrorMessage('');

    try {
      const response = await fetch(`${API_URL}/api/queues/${selectedQueue.id}/import`, {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();

        if (data.videosToImport === 0) {
          setErrorMessage(data.message);
          setIsImporting(false);
        } else {
          // Start polling for progress
          startPolling(selectedQueue.id);
          setIsImporting(false);
        }
      } else {
        const error = await response.json();
        setErrorMessage(error.error || 'Failed to start import');
        setIsImporting(false);
      }
    } catch (error) {
      console.error('Error importing queue:', error);
      setErrorMessage('Failed to start import');
      setIsImporting(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} years ago`;
  };

  const formatViewCount = (count) => {
    if (!count) return '0';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  // List View
  if (!selectedQueue) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Import Queues</h1>
          </div>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{errorMessage}</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">
            <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-3"></div>
            Loading queues...
          </div>
        ) : queues.length === 0 ? (
          /* Empty State */
          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 mb-2 font-medium">No queues yet</p>
            <p className="text-sm text-gray-500">
              Search for videos and add them to a queue to get started
            </p>
          </div>
        ) : (
          /* Queue List */
          <div className="space-y-4">
            {queues.map((queue) => (
              <div
                key={queue.id}
                className="border border-gray-200 rounded-lg p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <FolderOpen className="w-5 h-5 text-gray-600" />
                      <h3 className="text-lg font-semibold text-gray-900">{queue.name}</h3>
                    </div>

                    <div className="text-sm text-gray-600 mb-3 flex items-center gap-3">
                      <span>{queue.videoCount} videos</span>
                      <span>•</span>
                      <span className="text-green-600 font-medium">
                        {queue.importedCount} imported
                      </span>
                      <span>•</span>
                      <span className="text-blue-600 font-medium">
                        {queue.videoCount - queue.importedCount} pending
                      </span>
                    </div>

                    <p className="text-xs text-gray-500">
                      Last updated: {formatDate(queue.updatedAt)}
                    </p>
                  </div>

                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleSelectQueue(queue)}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 font-medium text-sm transition-colors"
                    >
                      View Details
                    </button>

                    {queue.videoCount > queue.importedCount && (
                      <button
                        onClick={() => {
                          setSelectedQueue(queue);
                          // Defer import to next tick to ensure state is set
                          setTimeout(() => handleImportQueue(), 0);
                        }}
                        className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 font-medium text-sm transition-colors flex items-center gap-2"
                      >
                        <Play className="w-4 h-4" />
                        Import
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteQueue(queue.id, queue.name)}
                      className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 font-medium text-sm transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Detail View
  const pendingVideos = queueDetails?.videos.filter(v => !v.transcriptId) || [];
  const importedVideos = queueDetails?.videos.filter(v => v.transcriptId) || [];

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Back Button */}
      <button
        onClick={handleBackToList}
        className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 mb-6 font-medium"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Queues
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <FolderOpen className="w-6 h-6 text-gray-700" />
          <h1 className="text-2xl font-bold text-gray-900">{selectedQueue.name}</h1>
        </div>

        <div className="text-sm text-gray-600 flex items-center gap-3">
          <span>{selectedQueue.videoCount} videos</span>
          <span>•</span>
          <span className="text-green-600 font-medium">{selectedQueue.importedCount} imported</span>
          <span>•</span>
          <span className="text-blue-600 font-medium">{selectedQueue.videoCount - selectedQueue.importedCount} pending</span>
        </div>

        {pendingVideos.length > 0 && !importStatus?.importing && (
          <button
            onClick={handleImportQueue}
            disabled={isImporting || importStatus?.importing}
            className="mt-4 bg-indigo-600 text-white px-6 py-3 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed font-medium transition-colors flex items-center gap-2"
          >
            <Play className="w-5 h-5" />
            {isImporting ? 'Starting Import...' : `Import ${pendingVideos.length} Pending Video(s)`}
          </button>
        )}
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{errorMessage}</p>
        </div>
      )}

      {/* Import Progress Section */}
      {importStatus && importStatus.importing && (
        <ImportProgressSection importStatus={importStatus} />
      )}

      {/* Pending Videos */}
      {!importStatus?.importing && pendingVideos.length > 0 && (
        <div className="mb-8">
          <div className="border-t border-gray-200 pt-4 mb-4">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">
                Pending Import ({pendingVideos.length})
              </h2>
            </div>

            <div className="space-y-3">
              {pendingVideos.map((video) => (
                <div
                  key={video.id}
                  className="border border-gray-200 rounded-lg p-4 bg-white"
                >
                  <div className="flex gap-4">
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      className="w-40 h-24 object-cover rounded flex-shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">
                        {video.title}
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">{video.channel}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{formatViewCount(video.viewCount)} views</span>
                        <span>•</span>
                        <span>{video.duration}</span>
                        <span>•</span>
                        <span>Added {formatDate(video.addedAt)}</span>
                      </div>
                    </div>

                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Imported Videos */}
      {importedVideos.length > 0 && (
        <div>
          <details className="border-t border-gray-200 pt-4">
            <summary className="cursor-pointer flex items-center gap-2 mb-4 font-semibold text-gray-900">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Already Imported ({importedVideos.length})
            </summary>

            <div className="space-y-3 mt-4">
              {importedVideos.map((video) => (
                <div
                  key={video.id}
                  className="border border-gray-200 rounded-lg p-4 bg-green-50"
                >
                  <div className="flex gap-4">
                    <div className="relative">
                      <img
                        src={video.thumbnailUrl}
                        alt={video.title}
                        className="w-40 h-24 object-cover rounded flex-shrink-0"
                      />
                      <div className="absolute top-1 right-1 bg-green-600 text-white rounded-full p-1">
                        <CheckCircle className="w-4 h-4" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">
                        {video.title}
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">{video.channel}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                        <span>{formatViewCount(video.viewCount)} views</span>
                        <span>•</span>
                        <span>{video.duration}</span>
                        <span>•</span>
                        <span>Imported {formatDate(video.importedAt)}</span>
                      </div>
                      {video.transcriptId && (
                        <a
                          href={`#transcript-${video.transcriptId}`}
                          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          View Transcript →
                        </a>
                      )}
                    </div>

                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Empty State */}
      {queueDetails && queueDetails.videos.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">This queue is empty</p>
        </div>
      )}
    </div>
  );
}
