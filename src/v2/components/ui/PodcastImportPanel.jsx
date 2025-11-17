// src/components/ui/PodcastImportPanel.jsx
import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const MAX_ITEMS = 20;

export default function PodcastImportPanel({ onDone, prefillFeedUrl }) {
  // Feed and episode states
  const [feedUrl, setFeedUrl] = useState("");
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  const [podcastInfo, setPodcastInfo] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [selectedEpisodes, setSelectedEpisodes] = useState([]);
  
  // Import progress states
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState([]);

  // Load podcast feed
  const loadPodcastFeed = async () => {
    if (!feedUrl.trim()) {
      alert("Please enter a podcast RSS feed URL");
      return;
    }

    setIsLoadingFeed(true);
    try {
      const response = await fetch(`${API_URL}/api/podcast-feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: feedUrl.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      setPodcastInfo({
        title: data.title,
        description: data.description,
        imageUrl: data.imageUrl,
        author: data.author
      });
      setEpisodes(data.episodes);
      setSelectedEpisodes([]);
    } catch (error) {
      console.error("Failed to load podcast feed:", error);
      alert(`Failed to load podcast feed: ${error.message}`);
    } finally {
      setIsLoadingFeed(false);
    }
  };


  // Auto-load feed if prefillFeedUrl is provided
  useEffect(() => {
    if (prefillFeedUrl && !feedUrl && !isLoadingFeed) {
      setFeedUrl(prefillFeedUrl);
      // Trigger load after a short delay to ensure state is set
      setTimeout(() => {
        loadPodcastFeed();
      }, 100);
    }
  }, [prefillFeedUrl]);
  // Handle episode selection
  const toggleEpisodeSelection = (episodeId) => {
    setSelectedEpisodes(prev => {
      if (prev.includes(episodeId)) {
        return prev.filter(id => id !== episodeId);
      } else {
        // Limit selection to MAX_ITEMS
        if (prev.length >= MAX_ITEMS) {
          alert(`You can only select up to ${MAX_ITEMS} episodes at once.`);
          return prev;
        }
        return [...prev, episodeId];
      }
    });
  };

  // Handle batch import
  const importSelected = async () => {
    if (selectedEpisodes.length === 0) {
      alert("Please select at least one episode to import");
      return;
    }

    setImporting(true);
    setImportStatus(selectedEpisodes.map(id => ({
      id,
      status: "pending",
      progress: 0,
      error: null
    })));

    // Process episodes one by one
    for (const episodeId of selectedEpisodes) {
      try {
        // Update status to processing
        setImportStatus(prev => 
          prev.map(item => 
            item.id === episodeId 
              ? { ...item, status: "processing", progress: 10 } 
              : item
          )
        );

        // Start import
        const episode = episodes.find(ep => ep.id === episodeId);
        const response = await fetch(`${API_URL}/api/transcribe-podcast`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            url: episode.audioUrl,
            title: episode.title,
            publishDate: episode.publishDate,
            podcastName: podcastInfo.title
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || `HTTP error ${response.status}`);
        }

        // Simulate progress updates
        for (let progress = 20; progress < 90; progress += 10) {
          setImportStatus(prev => 
            prev.map(item => 
              item.id === episodeId 
                ? { ...item, progress } 
                : item
            )
          );
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Update status to complete
        setImportStatus(prev => 
          prev.map(item => 
            item.id === episodeId 
              ? { ...item, status: "complete", progress: 100 } 
              : item
          )
        );
      } catch (error) {
        console.error(`Failed to import episode ${episodeId}:`, error);
        setImportStatus(prev => 
          prev.map(item => 
            item.id === episodeId 
              ? { ...item, status: "error", progress: 100, error: error.message } 
              : item
          )
        );
      }
    }

    setImporting(false);
    onDone?.(); // Refresh transcript list
  };

  // Format date
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString();
    } catch (e) {
      return "Unknown date";
    }
  };

  // Truncate text
  const truncate = (text, maxLength = 100) => {
    if (!text || text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  return (
    <div className="space-y-4">
      {/* Feed URL input */}
      <div className="space-y-3">
        <input
          type="text"
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          placeholder="Enter podcast RSS feed URL"
          className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
          disabled={isLoadingFeed || importing}
        />
        
        <p className="text-gray-500 text-sm">
          Example: https://feeds.megaphone.fm/darknetdiaries
        </p>
        
        <button
          onClick={loadPodcastFeed}
          disabled={isLoadingFeed || importing}
          className={`bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors ${
            isLoadingFeed || importing
              ? "bg-gray-400 cursor-not-allowed"
              : ""
          }`}
        >
          {isLoadingFeed ? "Loading..." : "Load Feed"}
        </button>
      </div>

      {/* Podcast info */}
      {podcastInfo && (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4 space-y-2">
          <div className="font-semibold text-gray-900">{podcastInfo.title}</div>
          {podcastInfo.author && (
            <div className="text-gray-600 text-sm">By: {podcastInfo.author}</div>
          )}
          <div className="text-sm text-gray-600">
            {truncate(podcastInfo.description, 200)}
          </div>
        </div>
      )}

      {/* Episode selection */}
      {episodes.length > 0 && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold text-gray-900">
              Episodes ({episodes.length})
            </h4>
            <div className="flex space-x-2">
              <button
                onClick={() => setSelectedEpisodes(episodes.slice(0, MAX_ITEMS).map(ep => ep.id))}
                disabled={importing}
                className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-md transition-colors disabled:bg-gray-400"
              >
                Select First {MAX_ITEMS}
              </button>
              <button
                onClick={() => setSelectedEpisodes([])}
                disabled={importing}
                className="text-sm bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded-md transition-colors disabled:bg-gray-400"
              >
                Clear
              </button>
            </div>
          </div>
          
          <div className="max-h-[40vh] overflow-y-auto border border-gray-200 rounded-md">
            {episodes.map((episode) => {
              const isSelected = selectedEpisodes.includes(episode.id);
              const importItem = importStatus.find(item => item.id === episode.id);
              
              return (
                <div 
                  key={episode.id}
                  className={`p-3 border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors ${
                    isSelected ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleEpisodeSelection(episode.id)}
                      disabled={importing && !isSelected}
                      className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm text-gray-900">{episode.title}</div>
                      <div className="text-sm text-gray-500 mt-1">
                        {formatDate(episode.publishDate)} • {episode.duration || "Unknown duration"}
                      </div>
                      
                      {importItem && (
                        <div className="mt-2">
                          <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                importItem.status === "error" 
                                  ? "bg-red-500" 
                                  : importItem.status === "complete"
                                  ? "bg-green-500"
                                  : "bg-blue-500"
                              }`}
                              style={{ width: `${importItem.progress}%` }}
                            />
                          </div>
                          {importItem.status === "error" && (
                            <div className="text-sm text-red-600 mt-2 bg-red-50 p-2 rounded border border-red-200">
                              <strong>Error:</strong> {importItem.error}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Import button */}
      {episodes.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={importSelected}
            disabled={selectedEpisodes.length === 0 || importing}
            className={`w-full py-3 rounded-md text-white font-medium ${
              selectedEpisodes.length === 0 || importing
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700 transition-colors"
            }`}
          >
            {importing
              ? "Importing..."
              : `Import ${selectedEpisodes.length} Selected Episode${selectedEpisodes.length !== 1 ? "s" : ""}`}
          </button>
          
          <div className="text-sm text-gray-500 text-center">
            Selected: {selectedEpisodes.length} / {MAX_ITEMS} maximum
          </div>
        </div>
      )}
    </div>
  );
}