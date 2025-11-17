import { useState, useCallback } from 'react';

const SEARCH_CACHE_KEY = 'podcast_feed_search_cache';
const CACHE_DURATION_DAYS = 7; // Cache results for 7 days

/**
 * Hook for detecting podcast RSS feeds for YouTube channels
 *
 * Features:
 * - Search iTunes API for podcast feeds matching channel names
 * - Cache search results to avoid redundant API calls
 * - Batch search for multiple channels
 * - Manual refresh capability
 *
 * @returns {Object} { searchFeed, batchSearchFeeds, clearCache, getCachedFeed }
 */
export function usePodcastFeedDetection() {
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState({ current: 0, total: 0 });

  /**
   * Load search cache from localStorage
   */
  const loadCache = useCallback(() => {
    const cacheJson = localStorage.getItem(SEARCH_CACHE_KEY);
    if (!cacheJson) return {};

    try {
      const cache = JSON.parse(cacheJson);
      const now = Date.now();

      // Filter out expired entries
      const validCache = {};
      Object.keys(cache).forEach(channelId => {
        const entry = cache[channelId];
        const cacheAge = now - entry.searchDate;
        const maxAge = CACHE_DURATION_DAYS * 24 * 60 * 60 * 1000;

        if (cacheAge < maxAge) {
          validCache[channelId] = entry;
        }
      });

      return validCache;
    } catch (e) {
      console.error('Error loading podcast feed cache:', e);
      return {};
    }
  }, []);

  /**
   * Save search cache to localStorage
   */
  const saveCache = useCallback((cache) => {
    try {
      localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
      console.error('Error saving podcast feed cache:', e);
    }
  }, []);

  /**
   * Get cached feed data for a channel
   * @param {string} channelId - YouTube channel ID
   * @returns {Object|null} Cached feed data or null if not found/expired
   */
  const getCachedFeed = useCallback((channelId) => {
    const cache = loadCache();
    return cache[channelId] || null;
  }, [loadCache]);

  /**
   * Search for podcast RSS feed for a single channel
   * @param {string} channelId - YouTube channel ID
   * @param {string} channelName - YouTube channel name
   * @param {boolean} forceRefresh - Force search even if cached (default: false)
   * @returns {Promise<Object|null>} Feed data or null if not found
   */
  const searchFeed = useCallback(async (channelId, channelName, forceRefresh = false) => {
    if (!channelId || !channelName) {
      console.error('channelId and channelName are required');
      return null;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getCachedFeed(channelId);
      if (cached) {
        console.log(`Using cached feed data for ${channelName}`);
        return cached.feedData;
      }
    }

    try {
      console.log(`Searching for podcast feed: ${channelName}`);

      const response = await fetch('http://localhost:3001/api/search-podcast-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();

      // Cache the result
      const cache = loadCache();
      cache[channelId] = {
        searchDate: Date.now(),
        channelName,
        feedData: result.found ? result.bestMatch : null,
        allMatches: result.allMatches || []
      };
      saveCache(cache);

      return result.found ? result.bestMatch : null;
    } catch (error) {
      console.error(`Error searching for podcast feed (${channelName}):`, error);

      // Cache negative result to avoid repeated failed searches
      const cache = loadCache();
      cache[channelId] = {
        searchDate: Date.now(),
        channelName,
        feedData: null,
        allMatches: [],
        error: error.message
      };
      saveCache(cache);

      return null;
    }
  }, [getCachedFeed, loadCache, saveCache]);

  /**
   * Batch search for podcast feeds for multiple channels
   * @param {Array<{channelId: string, channelName: string}>} channels - Array of channels
   * @param {boolean} forceRefresh - Force search even if cached (default: false)
   * @param {Function} onProgress - Optional progress callback (current, total) => void
   * @returns {Promise<Object>} Map of channelId => feedData
   */
  const batchSearchFeeds = useCallback(async (channels, forceRefresh = false, onProgress = null) => {
    if (!channels || channels.length === 0) {
      return {};
    }

    setIsSearching(true);
    setSearchProgress({ current: 0, total: channels.length });

    const results = {};
    const cache = loadCache();

    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];

      // Update progress
      setSearchProgress({ current: i + 1, total: channels.length });
      if (onProgress) {
        onProgress(i + 1, channels.length);
      }

      // Check cache first (unless force refresh)
      if (!forceRefresh && cache[channel.channelId]) {
        const cached = cache[channel.channelId];
        const now = Date.now();
        const cacheAge = now - cached.searchDate;
        const maxAge = CACHE_DURATION_DAYS * 24 * 60 * 60 * 1000;

        if (cacheAge < maxAge) {
          console.log(`Using cached feed data for ${channel.channelName}`);
          results[channel.channelId] = cached.feedData;
          continue;
        }
      }

      // Search for feed
      try {
        const feedData = await searchFeed(channel.channelId, channel.channelName, true);
        results[channel.channelId] = feedData;

        // Small delay to avoid overwhelming the API
        if (i < channels.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Error searching for ${channel.channelName}:`, error);
        results[channel.channelId] = null;
      }
    }

    setIsSearching(false);
    setSearchProgress({ current: 0, total: 0 });

    return results;
  }, [loadCache, searchFeed]);

  /**
   * Clear all cached search results
   */
  const clearCache = useCallback(() => {
    localStorage.removeItem(SEARCH_CACHE_KEY);
    console.log('Podcast feed search cache cleared');
  }, []);

  /**
   * Update a channel's RSS feed with user-selected podcast
   * @param {string} channelId - YouTube channel ID
   * @param {string} channelName - YouTube channel name
   * @param {Object} selectedFeed - Selected podcast feed data
   * @returns {void}
   */
  const updateChannelFeed = useCallback((channelId, channelName, selectedFeed) => {
    if (!channelId || !selectedFeed) {
      console.error('channelId and selectedFeed are required');
      return;
    }

    const cache = loadCache();
    cache[channelId] = {
      searchDate: Date.now(),
      channelName,
      feedData: selectedFeed,
      allMatches: cache[channelId]?.allMatches || [],
      userCorrected: true // Mark as manually corrected by user
    };
    saveCache(cache);
    console.log(`Updated feed for ${channelName} (user correction)`);
  }, [loadCache, saveCache]);

  /**
   * Clear a channel's RSS feed (mark as "no feed exists")
   * @param {string} channelId - YouTube channel ID
   * @param {string} channelName - YouTube channel name
   * @returns {void}
   */
  const clearChannelFeed = useCallback((channelId, channelName) => {
    if (!channelId) {
      console.error('channelId is required');
      return;
    }

    const cache = loadCache();
    cache[channelId] = {
      searchDate: Date.now(),
      channelName,
      feedData: null,
      allMatches: cache[channelId]?.allMatches || [],
      userCorrected: true, // Mark as manually cleared by user
      userMarkedNoFeed: true // Explicitly marked as "no feed exists"
    };
    saveCache(cache);
    console.log(`Cleared feed for ${channelName} (marked as no feed exists)`);
  }, [loadCache, saveCache]);

  /**
   * Get cache statistics
   * @returns {Object} { totalEntries, entriesWithFeeds, cacheSize }
   */
  const getCacheStats = useCallback(() => {
    const cache = loadCache();
    const entries = Object.values(cache);

    return {
      totalEntries: entries.length,
      entriesWithFeeds: entries.filter(e => e.feedData !== null).length,
      cacheSize: new Blob([JSON.stringify(cache)]).size
    };
  }, [loadCache]);

  return {
    searchFeed,
    batchSearchFeeds,
    getCachedFeed,
    clearCache,
    updateChannelFeed,
    clearChannelFeed,
    getCacheStats,
    isSearching,
    searchProgress
  };
}
