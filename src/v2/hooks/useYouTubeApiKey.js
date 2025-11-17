import { useState, useEffect, useCallback } from 'react';

const KEYS_STORAGE_KEY = 'youtube_api_keys';
const METADATA_STORAGE_KEY = 'youtube_api_keys_metadata';
const OLD_KEY_STORAGE_KEY = 'youtube_api_key'; // For migration

/**
 * Centralized YouTube API key management with automatic rotation on quota exhaustion.
 *
 * Features:
 * - Multiple API key support
 * - Automatic rotation when quota is exceeded
 * - Daily reset at midnight Pacific Time
 * - Backward compatible with single-key setup
 *
 * @returns {Object} { activeKey, allKeys, keyStatuses, markKeyExhausted, retryWithRotation, refreshKeys }
 */
export function useYouTubeApiKey() {
  const [apiKeys, setApiKeys] = useState([]);
  const [metadata, setMetadata] = useState({});
  const [currentKeyIndex, setCurrentKeyIndex] = useState(0);

  /**
   * Check if we need to reset quota flags (new day in Pacific Time)
   */
  const shouldResetQuota = useCallback((storedMetadata) => {
    const now = new Date();
    const pacificTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const currentDate = pacificTime.toISOString().split('T')[0]; // YYYY-MM-DD

    // Check if any key has a lastUsed date that's before today
    return Object.values(storedMetadata).some(meta => {
      if (!meta.lastUsed) return false;
      return meta.lastUsed < currentDate;
    });
  }, []);

  /**
   * Reset quota exceeded flags for all keys (called at midnight Pacific)
   */
  const resetQuotaFlags = useCallback((storedMetadata) => {
    const now = new Date();
    const pacificTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const currentDate = pacificTime.toISOString().split('T')[0];

    const resetMetadata = {};
    Object.keys(storedMetadata).forEach(keyIndex => {
      resetMetadata[keyIndex] = {
        ...storedMetadata[keyIndex],
        quotaExceeded: false,
        lastUsed: currentDate
      };
    });

    return resetMetadata;
  }, []);

  /**
   * Migrate from old single-key format to new multi-key format
   */
  const migrateOldKey = useCallback(() => {
    const oldKey = localStorage.getItem(OLD_KEY_STORAGE_KEY);
    if (oldKey && !localStorage.getItem(KEYS_STORAGE_KEY)) {
      // Migrate old key to new format
      localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify([oldKey]));
      localStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify({
        '0': { quotaExceeded: false, lastUsed: null }
      }));
      // Remove old key
      localStorage.removeItem(OLD_KEY_STORAGE_KEY);
      return true;
    }
    return false;
  }, []);

  /**
   * Load API keys and metadata from localStorage
   */
  const loadKeys = useCallback(() => {
    // Try migration first
    migrateOldKey();

    // Load keys
    const keysJson = localStorage.getItem(KEYS_STORAGE_KEY);
    const keys = keysJson ? JSON.parse(keysJson) : [];

    // Load metadata
    const metadataJson = localStorage.getItem(METADATA_STORAGE_KEY);
    let storedMetadata = metadataJson ? JSON.parse(metadataJson) : {};

    // Check if we need to reset quota flags
    if (shouldResetQuota(storedMetadata)) {
      storedMetadata = resetQuotaFlags(storedMetadata);
      localStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(storedMetadata));
    }

    // Ensure metadata exists for all keys
    keys.forEach((_, index) => {
      if (!storedMetadata[index]) {
        storedMetadata[index] = { quotaExceeded: false, lastUsed: null };
      }
    });

    setApiKeys(keys);
    setMetadata(storedMetadata);

    // Find first available key
    const availableIndex = keys.findIndex((_, idx) => !storedMetadata[idx]?.quotaExceeded);
    setCurrentKeyIndex(availableIndex >= 0 ? availableIndex : 0);
  }, [migrateOldKey, shouldResetQuota, resetQuotaFlags]);

  // Load keys on mount
  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  /**
   * Get the currently active API key (first non-exhausted key)
   */
  const activeKey = apiKeys.length > 0 && currentKeyIndex < apiKeys.length
    ? apiKeys[currentKeyIndex]
    : null;

  /**
   * Get status for each key
   * @returns {Array} Array of {key, status, index} objects
   */
  const keyStatuses = apiKeys.map((key, index) => {
    let status = 'Available';
    if (metadata[index]?.quotaExceeded) {
      status = 'Quota exceeded';
    } else if (index === currentKeyIndex) {
      status = 'Active';
    }

    return {
      key: key.substring(0, 10) + '...' + key.substring(key.length - 4), // Mask key
      fullKey: key,
      status,
      index,
      quotaExceeded: metadata[index]?.quotaExceeded || false
    };
  });

  /**
   * Mark a key as quota exhausted and switch to next available key
   * @param {number} keyIndex - Index of the key to mark as exhausted
   */
  const markKeyExhausted = useCallback((keyIndex) => {
    const now = new Date();
    const pacificTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const currentDate = pacificTime.toISOString().split('T')[0];

    // Update metadata
    const newMetadata = {
      ...metadata,
      [keyIndex]: {
        quotaExceeded: true,
        lastUsed: currentDate
      }
    };

    setMetadata(newMetadata);
    localStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(newMetadata));

    // Find next available key
    const nextAvailableIndex = apiKeys.findIndex((_, idx) =>
      idx !== keyIndex && !newMetadata[idx]?.quotaExceeded
    );

    if (nextAvailableIndex >= 0) {
      setCurrentKeyIndex(nextAvailableIndex);
    }

    return nextAvailableIndex;
  }, [apiKeys, metadata]);

  /**
   * Check if an error is a quota exceeded error
   * @param {Response} response - Fetch response object
   * @param {Object} data - Parsed response data
   * @returns {boolean}
   */
  const isQuotaError = (response, data) => {
    if (response.status === 403) {
      // Check for quota exceeded in error response
      const errorReason = data?.error?.errors?.[0]?.reason;
      const errorMessage = data?.error?.message || '';
      return errorReason === 'quotaExceeded' ||
             errorReason === 'rateLimitExceeded' ||
             errorMessage.toLowerCase().includes('quota');
    }
    return false;
  };

  /**
   * Retry a YouTube API fetch with automatic key rotation on quota errors
   * @param {Function} fetchFn - Async function that makes the API call, receives (apiKey) => Promise<Response>
   * @param {number} maxRetries - Maximum number of rotation attempts (default: number of keys)
   * @returns {Promise<{response: Response, data: Object, keyIndex: number}>}
   * @throws {Error} When all keys are exhausted or non-quota error occurs
   */
  const retryWithRotation = useCallback(async (fetchFn, maxRetries = null) => {
    const maxAttempts = maxRetries !== null ? maxRetries : apiKeys.length;
    let attempts = 0;
    let lastError = null;
    let currentIndex = currentKeyIndex;

    while (attempts < maxAttempts) {
      // Check if current key is exhausted
      if (metadata[currentIndex]?.quotaExceeded) {
        // Find next available key
        const nextIndex = apiKeys.findIndex((_, idx) => !metadata[idx]?.quotaExceeded);
        if (nextIndex < 0) {
          throw new Error('All API keys have reached daily quota. Try again tomorrow or add more keys.');
        }
        currentIndex = nextIndex;
        setCurrentKeyIndex(nextIndex);
      }

      const currentKey = apiKeys[currentIndex];
      if (!currentKey) {
        throw new Error('No API key available. Please add a YouTube API key in Settings.');
      }

      try {
        const response = await fetchFn(currentKey);
        const data = await response.json();

        if (!response.ok) {
          // Check for quota error
          if (isQuotaError(response, data)) {
            console.warn(`API key ${currentIndex} quota exceeded, rotating to next key...`);
            const nextIndex = markKeyExhausted(currentIndex);

            if (nextIndex < 0) {
              throw new Error('All API keys have reached daily quota. Try again tomorrow or add more keys.');
            }

            currentIndex = nextIndex;
            attempts++;
            continue;
          }

          // Non-quota error, throw immediately
          throw new Error(data?.error?.message || `YouTube API error: ${response.status}`);
        }

        // Success!
        return { response, data, keyIndex: currentIndex };
      } catch (error) {
        // Network or parsing error
        lastError = error;

        // If it's not a quota error, throw immediately
        if (!error.message?.toLowerCase().includes('quota')) {
          throw error;
        }

        // Otherwise try next key
        attempts++;
        const nextIndex = markKeyExhausted(currentIndex);
        if (nextIndex < 0) {
          throw new Error('All API keys have reached daily quota. Try again tomorrow or add more keys.');
        }
        currentIndex = nextIndex;
      }
    }

    // All attempts exhausted
    throw lastError || new Error('All API keys have reached daily quota. Try again tomorrow or add more keys.');
  }, [apiKeys, currentKeyIndex, metadata, markKeyExhausted]);

  /**
   * Refresh keys from localStorage (useful after settings update)
   */
  const refreshKeys = useCallback(() => {
    loadKeys();
  }, [loadKeys]);

  return {
    activeKey,
    allKeys: apiKeys,
    keyStatuses,
    markKeyExhausted,
    retryWithRotation,
    refreshKeys,
    hasKeys: apiKeys.length > 0
  };
}
