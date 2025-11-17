/* src/v2/components/ui/YouTubeSearchPanel.jsx
   YouTube search panel with client-side API integration - supports multiple API keys with rotation
   --------------------------------------------------------------- */
import { useState, useEffect } from 'react';
import { Search, AlertCircle, CheckSquare, Square, ExternalLink, Loader, ChevronDown, ChevronUp, X, User, Edit2, Check } from 'lucide-react';
import ChannelSearchInput from './ChannelSearchInput';
import CategoryTagsInput from './CategoryTagsInput';
import { useYouTubeApiKey } from '../../hooks/useYouTubeApiKey';
import { usePodcastFeedDetection } from "../../hooks/usePodcastFeedDetection";
import RssFeedDetailsModal from "./RssFeedDetailsModal";
import RssFeedCorrectionModal from "./RssFeedCorrectionModal";

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export default function YouTubeSearchPanel() {
  const { activeKey, retryWithRotation, hasKeys } = useYouTubeApiKey();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedVideos, setSelectedVideos] = useState(new Set());
  const [errorMessage, setErrorMessage] = useState('');

  // Filters
  const [duration, setDuration] = useState('any');
  const [uploadDate, setUploadDate] = useState('any');
  const [sortBy, setSortBy] = useState('relevance');

  // Queue management
  const [queueMode, setQueueMode] = useState('new'); // 'new' or 'existing'
  const [newQueueName, setNewQueueName] = useState('');
  const [selectedQueueId, setSelectedQueueId] = useState('');
  const [queues, setQueues] = useState([]);
  const [isSavingToQueue, setIsSavingToQueue] = useState(false);

  // Followed channels
  const [followedChannels, setFollowedChannels] = useState([]);
  const [selectedChannels, setSelectedChannels] = useState(new Set());
  const [isChannelSectionCollapsed, setIsChannelSectionCollapsed] = useState(false);
  const [channelVideoTimeframe, setChannelVideoTimeframe] = useState('week');
  const [isFetchingChannelVideos, setIsFetchingChannelVideos] = useState(false);

  // Category management
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [editingChannelId, setEditingChannelId] = useState(null);
  const [editingCategories, setEditingCategories] = useState([]);

  // RSS feed detection
  const { searchFeed, batchSearchFeeds, getCachedFeed, updateChannelFeed, clearChannelFeed } = usePodcastFeedDetection();
  const [podcastFeeds, setPodcastFeeds] = useState({});
  const [selectedFeed, setSelectedFeed] = useState(null);
  const [selectedFeedChannel, setSelectedFeedChannel] = useState(null);
  const [showFeedModal, setShowFeedModal] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionChannelData, setCorrectionChannelData] = useState(null);

  // Load existing queues
  useEffect(() => {
    fetchQueues();
  }, []);

  // Load followed channels from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('followed_channels');
    if (saved) {
      try {
        const channels = JSON.parse(saved);
        setFollowedChannels(channels);
      } catch (error) {
        console.error('Error loading followed channels:', error);
      }
    }
  }, []);

  // Search for podcast RSS feeds when channels are loaded
  useEffect(() => {
    if (followedChannels.length === 0) return;

    // Check cache first and load cached feeds
    const cachedFeeds = {};
    let needsSearch = false;

    followedChannels.forEach(channel => {
      const cached = getCachedFeed(channel.channelId);
      if (cached && cached.feedData) {
        cachedFeeds[channel.channelId] = cached.feedData;
      } else if (!cached) {
        needsSearch = true;
      }
    });

    // Update state with cached feeds immediately
    if (Object.keys(cachedFeeds).length > 0) {
      setPodcastFeeds(cachedFeeds);
    }

    // Batch search for channels without cache
    if (needsSearch) {
      const channelsToSearch = followedChannels.filter(
        channel => !getCachedFeed(channel.channelId)
      );

      if (channelsToSearch.length > 0) {
        batchSearchFeeds(channelsToSearch).then(results => {
          setPodcastFeeds(prev => ({ ...prev, ...results }));
        });
      }
    }
  }, [followedChannels]);

  const fetchQueues = async () => {
    try {
      const response = await fetch(`${API_URL}/api/queues`);
      if (response.ok) {
        const data = await response.json();
        setQueues(data.queues || []);
      }
    } catch (error) {
      console.error('Error fetching queues:', error);
    }
  };

  // Followed channels management
  const saveFollowedChannels = (channels) => {
    localStorage.setItem('followed_channels', JSON.stringify(channels));
  };

  const addFollowedChannel = (channel) => {
    // Check if channel already exists
    if (followedChannels.some(c => c.channelId === channel.channelId)) {
      setErrorMessage('Channel already followed');
      return;
    }

    // Ensure categories field exists (default to empty array)
    const channelWithCategories = {
      ...channel,
      categories: channel.categories || []
    };

    const updatedChannels = [...followedChannels, channelWithCategories];
    setFollowedChannels(updatedChannels);
    saveFollowedChannels(updatedChannels);
  };

  const removeFollowedChannel = (channelId) => {
    const updatedChannels = followedChannels.filter(c => c.channelId !== channelId);
    setFollowedChannels(updatedChannels);
    saveFollowedChannels(updatedChannels);

    // Also remove from selection if selected
    const newSelected = new Set(selectedChannels);
    newSelected.delete(channelId);
    setSelectedChannels(newSelected);
  };

  const toggleSelectChannel = (channelId) => {
    const newSelected = new Set(selectedChannels);
    if (newSelected.has(channelId)) {
      newSelected.delete(channelId);
    } else {
      newSelected.add(channelId);
    }
    setSelectedChannels(newSelected);
  };

  const selectAllChannels = () => {
    // Only select filtered channels
    setSelectedChannels(new Set(getFilteredChannels().map(c => c.channelId)));
  };

  const clearAllChannels = () => {
    setSelectedChannels(new Set());
  };

  // Category management helpers
  const getAllCategories = () => {
    const categories = new Set();
    followedChannels.forEach(channel => {
      if (channel.categories && Array.isArray(channel.categories)) {
        channel.categories.forEach(cat => categories.add(cat));
      }
    });
    return Array.from(categories).sort();
  };

  const getFilteredChannels = () => {
    if (selectedCategoryFilter === 'all') {
      return followedChannels;
    }
    return followedChannels.filter(channel =>
      channel.categories && channel.categories.includes(selectedCategoryFilter)
    );
  };

  const updateChannelCategories = (channelId, newCategories) => {
    const updatedChannels = followedChannels.map(channel =>
      channel.channelId === channelId
        ? { ...channel, categories: newCategories }
        : channel
    );
    setFollowedChannels(updatedChannels);
    saveFollowedChannels(updatedChannels);

    // Reset editing state
    setEditingChannelId(null);
    setEditingCategories([]);
  };

  const startEditingCategories = (channel) => {
    setEditingChannelId(channel.channelId);
    setEditingCategories(channel.categories || []);
  };

  const cancelEditingCategories = () => {
    setEditingChannelId(null);
    setEditingCategories([]);
  };

  // Parse ISO 8601 duration (e.g., PT15M33S → "15:33")
  const parseDuration = (isoDuration) => {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '0:00';

    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Format view count (e.g., 320000 → "320K")
  const formatViewCount = (count) => {
    if (!count) return '0';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  // Format date (e.g., "2025-01-01T00:00:00Z" → "2 days ago")
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

  const fetchChannelVideos = async () => {
    if (!hasKeys) {
      setErrorMessage('Please add your YouTube API key in Settings first');
      return;
    }

    if (selectedChannels.size === 0) {
      setErrorMessage('Please select at least one channel');
      return;
    }

    setIsFetchingChannelVideos(true);
    setErrorMessage('');
    setSearchResults([]);
    setSelectedVideos(new Set());

    try {
      // Get filtered channels (based on category filter)
      const filteredChannels = getFilteredChannels();

      // Only fetch from selected channels that match the current filter
      const channelsToFetch = filteredChannels.filter(channel =>
        selectedChannels.has(channel.channelId)
      );

      if (channelsToFetch.length === 0) {
        setErrorMessage('No channels selected in the current category filter');
        setIsFetchingChannelVideos(false);
        return;
      }

      // Calculate publishedAfter date based on timeframe
      const now = new Date();
      let publishedAfter;

      switch (channelVideoTimeframe) {
        case 'today':
          publishedAfter = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          publishedAfter = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          publishedAfter = new Date(now.setMonth(now.getMonth() - 1));
          break;
        case 'year':
          publishedAfter = new Date(now.setFullYear(now.getFullYear() - 1));
          break;
      }

      const allVideoIds = [];
      const videoMetadata = {};

      // Fetch videos from each selected and filtered channel
      for (const channel of channelsToFetch) {
        const channelId = channel.channelId;

        try {
          const { data: searchData } = await retryWithRotation(async (apiKey) => {
            const searchParams = new URLSearchParams({
              part: 'snippet',
              channelId: channelId,
              type: 'video',
              order: 'date',
              maxResults: 10,
              key: apiKey,
              relevanceLanguage: 'en',
            });

            if (publishedAfter) {
              searchParams.append('publishedAfter', publishedAfter.toISOString());
            }

            return fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams}`);
          });

          if (searchData.items && searchData.items.length > 0) {
            searchData.items.forEach(item => {
              allVideoIds.push(item.id.videoId);
              videoMetadata[item.id.videoId] = {
                title: item.snippet.title,
                channel: item.snippet.channelTitle,
                thumbnailUrl: item.snippet.thumbnails.medium.url,
                publishedAt: item.snippet.publishedAt,
              };
            });
          }
        } catch (error) {
          console.error(`Error fetching videos from channel ${channelId}:`, error);
          // Continue with other channels
        }
      }

      if (allVideoIds.length === 0) {
        setErrorMessage('No videos found in the selected timeframe. Try a different timeframe.');
        setIsFetchingChannelVideos(false);
        return;
      }

      // Fetch video details in batches (max 50 per request)
      const batchSize = 50;
      const detailsData = [];

      for (let i = 0; i < allVideoIds.length; i += batchSize) {
        const batch = allVideoIds.slice(i, i + batchSize);

        try {
          const { data: batchData } = await retryWithRotation(async (apiKey) => {
            const detailsParams = new URLSearchParams({
              part: 'contentDetails,statistics',
              id: batch.join(','),
              key: apiKey,
            });

            return fetch(`https://www.googleapis.com/youtube/v3/videos?${detailsParams}`);
          });

          if (batchData.items) {
            detailsData.push(...batchData.items);
          }
        } catch (error) {
          console.error('Error fetching video details batch:', error);
          // Continue with other batches
        }
      }

      // Merge metadata with details
      const results = allVideoIds.map(videoId => {
        const metadata = videoMetadata[videoId];
        const details = detailsData.find(d => d.id === videoId);

        return {
          videoId,
          title: metadata.title,
          channel: metadata.channel,
          thumbnailUrl: metadata.thumbnailUrl,
          publishedAt: metadata.publishedAt,
          duration: details ? parseDuration(details.contentDetails.duration) : 'N/A',
          viewCount: details ? parseInt(details.statistics.viewCount) : 0,
          url: `https://youtube.com/watch?v=${videoId}`
        };
      });

      // Sort by published date (newest first)
      results.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

      setSearchResults(results);
    } catch (error) {
      console.error('Channel videos fetch error:', error);
      setErrorMessage(error.message || 'Unable to fetch videos. Please check your internet connection.');
    } finally {
      setIsFetchingChannelVideos(false);
    }
  };

  const searchYouTube = async () => {
    if (!hasKeys) {
      setErrorMessage('Please add your YouTube API key in Settings first');
      return;
    }

    if (!searchQuery.trim()) {
      setErrorMessage('Please enter a search query');
      return;
    }

    setIsSearching(true);
    setErrorMessage('');
    setSearchResults([]);
    setSelectedVideos(new Set());

    try {
      // Step 1: Search for videos with automatic key rotation
      const { data: searchData } = await retryWithRotation(async (apiKey) => {
        const searchParams = new URLSearchParams({
          part: 'snippet',
          q: searchQuery,
          type: 'video',
          maxResults: 20,
          key: apiKey,
        });

        // Add duration filter
        if (duration !== 'any') {
          searchParams.append('videoDuration', duration);
        }

        // Add upload date filter
        if (uploadDate !== 'any') {
          const now = new Date();
          let publishedAfter;

          switch (uploadDate) {
            case 'today':
              publishedAfter = new Date(now.setHours(0, 0, 0, 0));
              break;
            case 'week':
              publishedAfter = new Date(now.setDate(now.getDate() - 7));
              break;
            case 'month':
              publishedAfter = new Date(now.setMonth(now.getMonth() - 1));
              break;
            case 'year':
              publishedAfter = new Date(now.setFullYear(now.getFullYear() - 1));
              break;
          }

          if (publishedAfter) {
            searchParams.append('publishedAfter', publishedAfter.toISOString());
          }
        }

        // Add sort order
        searchParams.append('order', sortBy);

        // Add language filter for English-only results
        searchParams.append('relevanceLanguage', 'en');

        return fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams}`);
      });

      if (!searchData.items || searchData.items.length === 0) {
        setErrorMessage('No videos found. Try different search terms.');
        setIsSearching(false);
        return;
      }

      // Step 2: Get video details (duration, view count) with automatic key rotation
      const videoIds = searchData.items.map(item => item.id.videoId).join(',');

      const { data: detailsData } = await retryWithRotation(async (apiKey) => {
        const detailsParams = new URLSearchParams({
          part: 'contentDetails,statistics',
          id: videoIds,
          key: apiKey,
        });

        return fetch(`https://www.googleapis.com/youtube/v3/videos?${detailsParams}`);
      });

      // Step 3: Merge search results with details
      const results = searchData.items.map(item => {
        const details = detailsData.items.find(d => d.id === item.id.videoId);
        return {
          videoId: item.id.videoId,
          title: item.snippet.title,
          channel: item.snippet.channelTitle,
          thumbnailUrl: item.snippet.thumbnails.medium.url,
          publishedAt: item.snippet.publishedAt,
          duration: details ? parseDuration(details.contentDetails.duration) : 'N/A',
          viewCount: details ? parseInt(details.statistics.viewCount) : 0,
          url: `https://youtube.com/watch?v=${item.id.videoId}`
        };
      });

      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      setErrorMessage(error.message || 'Unable to search YouTube. Please check your internet connection.');
    } finally {
      setIsSearching(false);
    }
  };

  const toggleSelectVideo = (videoId) => {
    const newSelected = new Set(selectedVideos);
    if (newSelected.has(videoId)) {
      newSelected.delete(videoId);
    } else {
      newSelected.add(videoId);
    }
    setSelectedVideos(newSelected);
  };

  const selectAll = () => {
    setSelectedVideos(new Set(searchResults.map(v => v.videoId)));
  };

  const clearAll = () => {
    setSelectedVideos(new Set());
  };

  const handleAddToQueue = async () => {
    if (selectedVideos.size === 0) {
      setErrorMessage('Please select at least one video');
      return;
    }

    if (queueMode === 'new' && !newQueueName.trim()) {
      setErrorMessage('Please enter a queue name');
      return;
    }

    if (queueMode === 'existing' && !selectedQueueId) {
      setErrorMessage('Please select a queue');
      return;
    }

    setIsSavingToQueue(true);
    setErrorMessage('');

    try {
      const videos = Array.from(selectedVideos).map(videoId => {
        const video = searchResults.find(v => v.videoId === videoId);
        return {
          youtubeId: video.videoId,
          title: video.title,
          channel: video.channel,
          thumbnailUrl: video.thumbnailUrl,
          duration: video.duration,
          viewCount: video.viewCount,
          publishedAt: video.publishedAt,
          url: video.url
        };
      });

      if (queueMode === 'new') {
        // Create new queue
        const response = await fetch(`${API_URL}/api/queues`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newQueueName,
            videos: videos
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create queue');
        }

        setNewQueueName('');
      } else {
        // Add to existing queue
        const response = await fetch(`${API_URL}/api/queues/${selectedQueueId}/videos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videos })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to add videos to queue');
        }
      }

      // Clear selection and show success
      setSelectedVideos(new Set());
      alert(`${videos.length} video(s) added to queue successfully!`);

      // Refresh queues list
      await fetchQueues();
    } catch (error) {
      console.error('Error saving to queue:', error);
      setErrorMessage(error.message || 'Failed to save videos to queue');
    } finally {
      setIsSavingToQueue(false);
    }
  };

  // Check if API key is missing
  if (!hasKeys) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-yellow-900 mb-2">YouTube API Key Required</h3>
            <p className="text-sm text-yellow-800 mb-3">
              To search YouTube videos, you need to add your YouTube Data API key in Settings.
            </p>
            <button
              onClick={() => window.location.hash = '#settings'}
              className="bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700 font-medium text-sm"
            >
              Go to Settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Handler for "This feed is wrong" button
  const handleFeedIncorrect = (channelId, channelName) => {
    // Get all matches from cache
    const cached = getCachedFeed(channelId);
    const allMatches = cached?.allMatches || [];

    // Close the details modal and open correction modal
    setShowFeedModal(false);
    setSelectedFeed(null);

    // Set correction modal data
    setCorrectionChannelData({
      channelId,
      channelName,
      allMatches
    });
    setShowCorrectionModal(true);
  };

  // Handler for saving corrected feed
  const handleSaveCorrection = (selectedFeed) => {
    if (!correctionChannelData) return;

    const { channelId, channelName } = correctionChannelData;

    if (selectedFeed === null) {
      // User selected "None of these are correct"
      clearChannelFeed(channelId, channelName);

      // Remove from podcastFeeds state (remove badge)
      setPodcastFeeds(prev => {
        const updated = { ...prev };
        delete updated[channelId];
        return updated;
      });
    } else {
      // User selected a specific podcast
      updateChannelFeed(channelId, channelName, selectedFeed);

      // Update podcastFeeds state (refresh badge)
      setPodcastFeeds(prev => ({
        ...prev,
        [channelId]: selectedFeed
      }));
    }

    // Close correction modal and reset
    setShowCorrectionModal(false);
    setCorrectionChannelData(null);
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Search className="w-6 h-6 text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-900">YouTube Search</h1>
      </div>

      {/* Followed Channels Section */}
      <div className="mb-8 border border-gray-200 rounded-lg p-4 bg-gray-50">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-4">
          <div
            className="flex items-center gap-2 cursor-pointer flex-1"
            onClick={() => setIsChannelSectionCollapsed(!isChannelSectionCollapsed)}
          >
            <User className="w-5 h-5 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">
              Followed Channels {followedChannels.length > 0 && `(${followedChannels.length})`}
            </h2>
          </div>

          {/* Category Filter Dropdown */}
          {followedChannels.length > 0 && !isChannelSectionCollapsed && (
            <div className="flex items-center gap-2">
              <select
                value={selectedCategoryFilter}
                onChange={(e) => {
                  setSelectedCategoryFilter(e.target.value);
                  setSelectedChannels(new Set()); // Clear selections when filter changes
                }}
                className="text-sm p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                onClick={(e) => e.stopPropagation()}
              >
                <option value="all">All Categories</option>
                {getAllCategories().map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div onClick={() => setIsChannelSectionCollapsed(!isChannelSectionCollapsed)} className="cursor-pointer">
            {isChannelSectionCollapsed ? (
              <ChevronDown className="w-5 h-5 text-gray-600" />
            ) : (
              <ChevronUp className="w-5 h-5 text-gray-600" />
            )}
          </div>
        </div>

        {!isChannelSectionCollapsed && (
          <>
            {/* Channel Search Input */}
            <div className="mb-4">
              <ChannelSearchInput
                onChannelSelect={addFollowedChannel}
                availableCategories={getAllCategories()}
              />
            </div>

            {/* Followed Channels List */}
            {followedChannels.length > 0 ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex gap-2">
                    <button
                      onClick={selectAllChannels}
                      className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Select All
                    </button>
                    <span className="text-gray-400">|</span>
                    <button
                      onClick={clearAllChannels}
                      className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Clear All
                    </button>
                  </div>
                  <span className="text-sm text-gray-600">
                    {selectedChannels.size} selected
                    {selectedCategoryFilter !== 'all' && ` in ${selectedCategoryFilter}`}
                  </span>
                </div>

                <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
                  {getFilteredChannels().map((channel) => {
                    const isEditing = editingChannelId === channel.channelId;

                    return (
                      <div
                        key={channel.channelId}
                        className="bg-white border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {/* Checkbox */}
                          <div
                            className="flex-shrink-0 cursor-pointer"
                            onClick={() => toggleSelectChannel(channel.channelId)}
                          >
                            {selectedChannels.has(channel.channelId) ? (
                              <CheckSquare className="w-5 h-5 text-indigo-600" />
                            ) : (
                              <Square className="w-5 h-5 text-gray-400" />
                            )}
                          </div>

                          {/* Avatar */}
                          <img
                            src={channel.avatarUrl}
                            alt={channel.channelName}
                            className="w-10 h-10 rounded-full flex-shrink-0"
                          />

                          {/* Channel Info */}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 truncate">
                              {channel.channelName}
                            </h4>

                            {isEditing ? (
                              /* Editing Mode - Show Category Input */
                              <div className="mt-2">
                                <CategoryTagsInput
                                  selectedCategories={editingCategories}
                                  availableCategories={getAllCategories()}
                                  onChange={setEditingCategories}
                                  placeholder="Edit categories..."
                                />
                              </div>
                            ) : (
                              /* Normal Mode - Show Channel Info */
                              <div className="space-y-1">
                                <div className="flex items-center gap-3 text-xs text-gray-600">
                                  <span>
                                    {channel.subscriberCount >= 1000000
                                      ? `${(channel.subscriberCount / 1000000).toFixed(1)}M`
                                      : channel.subscriberCount >= 1000
                                      ? `${(channel.subscriberCount / 1000).toFixed(1)}K`
                                      : channel.subscriberCount}{' '}
                                    subscribers
                                  </span>
                                  {channel.lastUploadDate && (
                                    <>
                                      <span>•</span>
                                      <span>Last upload: {formatDate(channel.lastUploadDate)}</span>
                                    </>
                                  )}
                                </div>

                                {/* Show Categories */}
                                {channel.categories && channel.categories.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {channel.categories.map((cat, idx) => (
                                      <span
                                        key={cat}
                                        className={`text-xs px-2 py-0.5 rounded ${
                                          ['bg-blue-100 text-blue-800', 'bg-green-100 text-green-800', 'bg-purple-100 text-purple-800'][idx % 3]
                                        }`}
                                      >
                                        {cat}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* RSS Feed Badge */}
                                {podcastFeeds[channel.channelId] && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-800 font-medium">
                                      RSS Available
                                    </span>
                                    <button
                                      onClick={() => {
                                        setSelectedFeed(podcastFeeds[channel.channelId]);
                                        setSelectedFeedChannel(channel);
                                        setShowFeedModal(true);
                                      }}
                                      className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                                    >
                                      View Feed
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex-shrink-0 flex gap-2">
                            {isEditing ? (
                              /* Editing Mode Buttons */
                              <>
                                <button
                                  onClick={() => updateChannelCategories(channel.channelId, editingCategories)}
                                  className="text-green-600 hover:text-green-800 transition-colors"
                                  title="Save"
                                >
                                  <Check className="w-5 h-5" />
                                </button>
                                <button
                                  onClick={cancelEditingCategories}
                                  className="text-gray-400 hover:text-gray-600 transition-colors"
                                  title="Cancel"
                                >
                                  <X className="w-5 h-5" />
                                </button>
                              </>
                            ) : (
                              /* Normal Mode Buttons */
                              <>
                                <button
                                  onClick={() => startEditingCategories(channel)}
                                  className="text-gray-400 hover:text-indigo-600 transition-colors"
                                  title="Edit categories"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => removeFollowedChannel(channel.channelId)}
                                  className="text-gray-400 hover:text-red-600 transition-colors"
                                  title="Remove channel"
                                >
                                  <X className="w-5 h-5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Timeframe Filter and Fetch Button */}
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Timeframe
                    </label>
                    <select
                      value={channelVideoTimeframe}
                      onChange={(e) => setChannelVideoTimeframe(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="today">Today</option>
                      <option value="week">This Week</option>
                      <option value="month">This Month</option>
                      <option value="year">This Year</option>
                    </select>
                  </div>
                  <button
                    onClick={fetchChannelVideos}
                    disabled={isFetchingChannelVideos || selectedChannels.size === 0}
                    className="flex-1 bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {isFetchingChannelVideos ? (
                      <>
                        <Loader className="w-5 h-5 animate-spin" />
                        Fetching...
                      </>
                    ) : (
                      `Show Latest Videos (${selectedChannels.size})`
                    )}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-600 text-center py-4">
                No channels followed yet. Search for a channel above to get started.
              </p>
            )}
          </>
        )}
      </div>

      {/* Keyword Search Section */}
      <div className="mb-6">
        <h3 className="text-md font-semibold text-gray-700 mb-3">Or search by keyword</h3>
      </div>

      {/* Search Input */}
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && searchYouTube()}
          placeholder="Search videos..."
          className="flex-1 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <button
          onClick={searchYouTube}
          disabled={isSearching}
          className="bg-indigo-600 text-white px-6 py-3 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed font-medium transition-colors flex items-center gap-2"
        >
          {isSearching ? <Loader className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-4 text-sm">
        <div>
          <label className="block text-gray-700 font-medium mb-1">Duration</label>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
          >
            <option value="any">Any</option>
            <option value="short">Short (&lt;4 min)</option>
            <option value="medium">Medium (4-20 min)</option>
            <option value="long">Long (&gt;20 min)</option>
          </select>
        </div>

        <div>
          <label className="block text-gray-700 font-medium mb-1">Upload Date</label>
          <select
            value={uploadDate}
            onChange={(e) => setUploadDate(e.target.value)}
            className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
          >
            <option value="any">Any</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>
        </div>

        <div>
          <label className="block text-gray-700 font-medium mb-1">Sort By</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
          >
            <option value="relevance">Relevance</option>
            <option value="date">Upload Date</option>
            <option value="viewCount">View Count</option>
            <option value="rating">Rating</option>
          </select>
        </div>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{errorMessage}</p>
        </div>
      )}

      {/* Results */}
      {searchResults.length > 0 && (
        <>
          <div className="border-t border-gray-200 pt-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Results ({searchResults.length})
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Select All
                </button>
                <span className="text-gray-400">|</span>
                <button
                  onClick={clearAll}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Video Grid */}
            <div className="space-y-3 mb-6">
              {searchResults.map((video) => (
                <div
                  key={video.videoId}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => toggleSelectVideo(video.videoId)}
                >
                  <div className="flex gap-4">
                    {/* Checkbox */}
                    <div className="flex-shrink-0 pt-1">
                      {selectedVideos.has(video.videoId) ? (
                        <CheckSquare className="w-5 h-5 text-indigo-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                    </div>

                    {/* Thumbnail */}
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      className="w-40 h-24 object-cover rounded flex-shrink-0"
                    />

                    {/* Video Info */}
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
                        <span>{formatDate(video.publishedAt)}</span>
                      </div>
                    </div>

                    {/* External Link */}
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Queue Management */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Selected: {selectedVideos.size} video(s)
            </h3>

            <div className="space-y-4">
              {/* Queue Mode Selection */}
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="new"
                    checked={queueMode === 'new'}
                    onChange={(e) => setQueueMode(e.target.value)}
                    className="w-4 h-4 text-indigo-600"
                  />
                  <span className="text-sm font-medium text-gray-700">Create new queue</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="existing"
                    checked={queueMode === 'existing'}
                    onChange={(e) => setQueueMode(e.target.value)}
                    className="w-4 h-4 text-indigo-600"
                  />
                  <span className="text-sm font-medium text-gray-700">Add to existing queue</span>
                </label>
              </div>

              {/* Queue Name Input (for new queue) */}
              {queueMode === 'new' && (
                <input
                  type="text"
                  value={newQueueName}
                  onChange={(e) => setNewQueueName(e.target.value)}
                  placeholder="Enter queue name..."
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              )}

              {/* Queue Selection (for existing queue) */}
              {queueMode === 'existing' && (
                <select
                  value={selectedQueueId}
                  onChange={(e) => setSelectedQueueId(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select a queue...</option>
                  {queues.map((queue) => (
                    <option key={queue.id} value={queue.id}>
                      {queue.name} ({queue.videoCount} videos)
                    </option>
                  ))}
                </select>
              )}

              {/* Add to Queue Button */}
              <button
                onClick={handleAddToQueue}
                disabled={isSavingToQueue || selectedVideos.size === 0}
                className="w-full bg-indigo-600 text-white px-6 py-3 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed font-medium transition-colors"
              >
                {isSavingToQueue ? 'Adding...' : `Add ${selectedVideos.size} video(s) to Queue`}
              </button>
            </div>
          </div>
        </>
      )}

      {/* RSS Feed Details Modal */}
      {showFeedModal && selectedFeed && selectedFeedChannel && (
        <RssFeedDetailsModal
          feedData={selectedFeed}
          onClose={() => {
            setShowFeedModal(false);
            setSelectedFeed(null);
            setSelectedFeedChannel(null);
          }}
          onImportClick={(feedUrl) => {
            // TODO: Navigate to podcast import panel with pre-filled URL
            console.log('Import from RSS:', feedUrl);
            alert('RSS import functionality will be connected to PodcastImportPanel');
          }}
          onFeedIncorrect={() => handleFeedIncorrect(selectedFeedChannel.channelId, selectedFeedChannel.channelName)}
        />
      )}

      {/* RSS Feed Correction Modal */}
      {showCorrectionModal && correctionChannelData && (
        <RssFeedCorrectionModal
          channelId={correctionChannelData.channelId}
          channelName={correctionChannelData.channelName}
          allMatches={correctionChannelData.allMatches}
          onClose={() => {
            setShowCorrectionModal(false);
            setCorrectionChannelData(null);
          }}
          onSave={handleSaveCorrection}
        />
      )}
    </div>
  );
}
