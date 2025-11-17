// src/v2/components/ui/RssFeedCorrectionModal.jsx
import { useState } from "react";

export default function RssFeedCorrectionModal({
  channelId,
  channelName,
  allMatches,
  onClose,
  onSave
}) {
  const [selectedIndex, setSelectedIndex] = useState(null);

  const handleSave = () => {
    if (selectedIndex === null) {
      return; // No selection made
    }

    if (selectedIndex === "none") {
      // User selected "None of these are correct"
      onSave(null);
    } else {
      // User selected a specific podcast
      const selectedFeed = allMatches[selectedIndex];
      onSave(selectedFeed);
    }
    onClose();
  };

  const formatEpisodeCount = (count) => {
    if (!count) return "Unknown episodes";
    return `${count} episode${count !== 1 ? 's' : ''}`;
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-4xl w-full h-[55vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-indigo-600 text-white px-4 py-3 flex justify-between items-start">
          <div className="flex-1">
            <h2 className="text-lg font-bold">
              Correct RSS Feed for {channelName}
            </h2>
            <p className="text-indigo-100 text-xs">
              Select the correct podcast feed from iTunes results
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl font-bold ml-4"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 p-3 overflow-y-auto">
          <div className="mb-3 text-xs text-gray-600">
            Select the correct podcast feed for this channel. If none of these match, select "None of these are correct" to remove the RSS badge.
          </div>

          {/* Podcast options list */}
          <div className="space-y-2">
            {allMatches && allMatches.length > 0 ? (
              allMatches.map((podcast, index) => (
                <label
                  key={index}
                  className={`flex items-start gap-2 p-2 border-2 rounded-lg cursor-pointer transition-all ${
                    selectedIndex === index
                      ? "border-indigo-600 bg-indigo-50"
                      : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
                  }`}
                  onClick={() => setSelectedIndex(index)}
                >
                  {/* Radio button */}
                  <input
                    type="radio"
                    name="podcast-selection"
                    checked={selectedIndex === index}
                    onChange={() => setSelectedIndex(index)}
                    className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                  />

                  {/* Podcast artwork */}
                  {podcast.artwork && (
                    <img
                      src={podcast.artwork}
                      alt={podcast.podcastName}
                      className="w-12 h-12 rounded shadow-md flex-shrink-0"
                    />
                  )}

                  {/* Podcast details */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-gray-900">
                      {podcast.podcastName}
                    </div>
                    <div className="text-xs text-gray-600">
                      {podcast.author && (
                        <div>By: {podcast.author}</div>
                      )}
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{formatEpisodeCount(podcast.trackCount)}</span>
                        {podcast.primaryGenre && (
                          <>
                            <span>•</span>
                            <span>{podcast.primaryGenre}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </label>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                No podcast results available
              </div>
            )}

            {/* "None of these" option */}
            <label
              className={`flex items-start gap-2 p-2 border-2 rounded-lg cursor-pointer transition-all ${
                selectedIndex === "none"
                  ? "border-red-600 bg-red-50"
                  : "border-gray-200 hover:border-red-300 hover:bg-gray-50"
              }`}
              onClick={() => setSelectedIndex("none")}
            >
              <input
                type="radio"
                name="podcast-selection"
                checked={selectedIndex === "none"}
                onChange={() => setSelectedIndex("none")}
                className="mt-1 h-4 w-4 text-red-600 focus:ring-red-500"
              />
              <div>
                <div className="font-semibold text-sm text-gray-900">
                  None of these are correct
                </div>
                <div className="text-xs text-gray-600">
                  This channel doesn't have a podcast feed. Remove the RSS badge.
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-gray-50 px-4 py-2 flex justify-end gap-3 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={selectedIndex === null}
            className={`px-4 py-2 rounded-md transition-colors font-medium ${
              selectedIndex === null
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            Save Selection
          </button>
        </div>
      </div>
    </div>
  );
}
