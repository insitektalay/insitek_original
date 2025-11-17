// src/v2/components/ui/RssFeedDetailsModal.jsx
import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export default function RssFeedDetailsModal({
  feedData,
  onClose,
  onImportClick,
  onFeedIncorrect
}) {
  const [episodes, setEpisodes] = useState([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [error, setError] = useState(null);

  // Load episodes when modal opens
  useEffect(() => {
    if (feedData?.feedUrl) {
      loadEpisodes();
    }
  }, [feedData]);

  const loadEpisodes = async () => {
    setIsLoadingEpisodes(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/podcast-feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: feedData.feedUrl }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      setEpisodes(data.episodes || []);
    } catch (err) {
      console.error("Failed to load episodes:", err);
      setError(err.message);
    } finally {
      setIsLoadingEpisodes(false);
    }
  };

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString();
    } catch (e) {
      return "Unknown date";
    }
  };

  const handleImport = () => {
    onImportClick(feedData.feedUrl);
    onClose();
  };

  if (!feedData) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-indigo-600 text-white p-6 flex justify-between items-start">
          <div className="flex-1">
            <h2 className="text-2xl font-bold mb-2">{feedData.podcastName}</h2>
            {feedData.author && (
              <p className="text-indigo-100 text-sm">By: {feedData.author}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl font-bold ml-4"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Podcast artwork and metadata */}
          <div className="flex gap-6 mb-6">
            {feedData.artwork && (
              <img
                src={feedData.artwork}
                alt={feedData.podcastName}
                className="w-32 h-32 rounded-lg shadow-md flex-shrink-0"
              />
            )}

            <div className="flex-1 space-y-3">
              {feedData.primaryGenre && (
                <div className="text-sm">
                  <span className="font-semibold text-gray-700">Genre:</span>
                  <span className="ml-2 text-gray-600">{feedData.primaryGenre}</span>
                </div>
              )}

              {feedData.trackCount > 0 && (
                <div className="text-sm">
                  <span className="font-semibold text-gray-700">Episodes:</span>
                  <span className="ml-2 text-gray-600">{feedData.trackCount} episodes</span>
                </div>
              )}

              {feedData.releaseDate && (
                <div className="text-sm">
                  <span className="font-semibold text-gray-700">Last Updated:</span>
                  <span className="ml-2 text-gray-600">{formatDate(feedData.releaseDate)}</span>
                </div>
              )}

              <div className="text-sm">
                <span className="font-semibold text-gray-700">RSS Feed:</span>
                <div className="mt-1 bg-gray-100 p-2 rounded text-xs text-gray-600 break-all font-mono">
                  {feedData.feedUrl}
                </div>
              </div>
            </div>
          </div>

          {/* Latest episodes */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Latest Episodes
            </h3>

            {isLoadingEpisodes && (
              <div className="text-center py-8 text-gray-500">
                Loading episodes...
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-700">
                Failed to load episodes: {error}
              </div>
            )}

            {!isLoadingEpisodes && !error && episodes.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No episodes found
              </div>
            )}

            {!isLoadingEpisodes && !error && episodes.length > 0 && (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {episodes.slice(0, 10).map((episode, index) => (
                  <div
                    key={episode.id || index}
                    className="bg-gray-50 border border-gray-200 rounded-md p-3 hover:bg-gray-100 transition-colors"
                  >
                    <div className="font-medium text-gray-900 text-sm mb-1">
                      {episode.title}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-3">
                      {episode.publishDate && (
                        <span>{formatDate(episode.publishDate)}</span>
                      )}
                      {episode.duration && (
                        <span>• {episode.duration}</span>
                      )}
                    </div>
                  </div>
                ))}
                {episodes.length > 10 && (
                  <div className="text-center text-sm text-gray-500 py-2">
                    ... and {episodes.length - 10} more episodes
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-between gap-3 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
          <div className="flex gap-3">
            {onFeedIncorrect && (
              <button
                onClick={onFeedIncorrect}
                className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors font-medium"
              >
                This feed is wrong
              </button>
            )}
            <button
              onClick={handleImport}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors font-medium"
            >
              Import Episodes from RSS
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
