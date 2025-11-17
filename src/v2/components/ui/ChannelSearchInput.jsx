/* src/v2/components/ui/ChannelSearchInput.jsx
   Channel search input with autocomplete dropdown - supports multiple API keys with rotation
   --------------------------------------------------------------- */
import { useState, useEffect, useRef } from 'react';
import { Search, Loader, Plus, X } from 'lucide-react';
import CategoryTagsInput from './CategoryTagsInput';
import { useYouTubeApiKey } from '../../hooks/useYouTubeApiKey';

export default function ChannelSearchInput({ onChannelSelect, availableCategories = [] }) {
  const { hasKeys, retryWithRotation } = useYouTubeApiKey();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(() => {
      searchChannels(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchChannels = async (query) => {
    if (!hasKeys) {
      setErrorMessage('API key required');
      return;
    }

    setIsSearching(true);
    setErrorMessage('');

    try {
      // Step 1: Search for channels using YouTube API with rotation
      const { data: searchData } = await retryWithRotation(async (apiKey) => {
        const searchParams = new URLSearchParams({
          part: 'snippet',
          q: query,
          type: 'channel',
          maxResults: 5,
          key: apiKey,
        });

        return fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams}`);
      });

      if (!searchData.items || searchData.items.length === 0) {
        setSearchResults([]);
        setShowDropdown(false);
        return;
      }

      // Step 2: Get full channel details including subscriber count with rotation
      const channelIds = searchData.items.map(item => item.id.channelId).join(',');

      const { data: detailsData } = await retryWithRotation(async (apiKey) => {
        const detailsParams = new URLSearchParams({
          part: 'snippet,statistics',
          id: channelIds,
          key: apiKey,
        });

        return fetch(`https://www.googleapis.com/youtube/v3/channels?${detailsParams}`);
      });

      // Format results
      const results = detailsData.items.map(item => ({
        channelId: item.id,
        channelName: item.snippet.title,
        avatarUrl: item.snippet.thumbnails.default.url,
        subscriberCount: parseInt(item.statistics.subscriberCount || 0),
        description: item.snippet.description,
      }));

      setSearchResults(results);
      setShowDropdown(true);
    } catch (error) {
      console.error('Channel search error:', error);
      setErrorMessage(error.message || 'Search failed');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const formatSubscriberCount = (count) => {
    if (!count) return '0 subscribers';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M subscribers`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K subscribers`;
    return `${count} subscribers`;
  };

  const handleSelectChannel = (channel) => {
    // Set selected channel and show category input
    setSelectedChannel(channel);
    setSearchQuery('');
    setSearchResults([]);
    setShowDropdown(false);
    setSelectedCategories([]);
  };

  const handleAddChannel = async () => {
    if (!selectedChannel) return;

    // Get the latest upload date for this channel
    try {
      const { data } = await retryWithRotation(async (apiKey) => {
        const searchParams = new URLSearchParams({
          part: 'snippet',
          channelId: selectedChannel.channelId,
          type: 'video',
          order: 'date',
          maxResults: 1,
          key: apiKey,
        });

        return fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams}`);
      });

      let lastUploadDate = null;
      if (data.items && data.items.length > 0) {
        lastUploadDate = data.items[0].snippet.publishedAt;
      }

      // Add the channel with categories and last upload date
      onChannelSelect({
        ...selectedChannel,
        lastUploadDate,
        categories: selectedCategories,
      });

      // Reset state
      setSelectedChannel(null);
      setSelectedCategories([]);
    } catch (error) {
      console.error('Error fetching latest upload:', error);
      // Still add the channel even if we can't get the latest upload date
      onChannelSelect({
        ...selectedChannel,
        categories: selectedCategories,
      });

      // Reset state
      setSelectedChannel(null);
      setSelectedCategories([]);
    }
  };

  const handleCancelSelection = () => {
    setSelectedChannel(null);
    setSelectedCategories([]);
  };

  return (
    <div className="space-y-3">
      {/* Channel Selected - Show Category Input */}
      {selectedChannel ? (
        <div className="border border-indigo-300 rounded-lg p-4 bg-indigo-50">
          {/* Selected Channel Info */}
          <div className="flex items-center gap-3 mb-3">
            <img
              src={selectedChannel.avatarUrl}
              alt={selectedChannel.channelName}
              className="w-12 h-12 rounded-full flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-gray-900 truncate">{selectedChannel.channelName}</h4>
              <p className="text-sm text-gray-600">{formatSubscriberCount(selectedChannel.subscriberCount)}</p>
            </div>
            <button
              onClick={handleCancelSelection}
              className="text-gray-400 hover:text-gray-600"
              title="Cancel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Category Input */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Add to categories (optional)
            </label>
            <CategoryTagsInput
              selectedCategories={selectedCategories}
              availableCategories={availableCategories}
              onChange={setSelectedCategories}
            />
          </div>

          {/* Add Channel Button */}
          <button
            onClick={handleAddChannel}
            className="w-full bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Channel
          </button>
        </div>
      ) : (
        /* Channel Search Input */
        <div className="relative" ref={dropdownRef}>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a channel to follow..."
              className="w-full p-3 pl-10 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            {isSearching && (
              <Loader className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 animate-spin" />
            )}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
          )}

          {/* Dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-80 overflow-y-auto">
              {searchResults.map((channel) => (
                <div
                  key={channel.channelId}
                  onClick={() => handleSelectChannel(channel)}
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                >
                  <img
                    src={channel.avatarUrl}
                    alt={channel.channelName}
                    className="w-12 h-12 rounded-full flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 truncate">{channel.channelName}</h4>
                    <p className="text-sm text-gray-600">{formatSubscriberCount(channel.subscriberCount)}</p>
                  </div>
                  <Plus className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
