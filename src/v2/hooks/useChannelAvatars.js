// src/v2/hooks/useChannelAvatars.js - supports multiple API keys with rotation
import { useState } from 'react'
import { useYouTubeApiKey } from './useYouTubeApiKey'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

/**
 * Hook to fetch YouTube channel avatars using YouTube Data API v3
 * Batches requests for efficiency (up to 50 channel IDs per request)
 * Supports automatic API key rotation on quota exhaustion
 */
export function useChannelAvatars() {
  const { hasKeys, retryWithRotation } = useYouTubeApiKey()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Fetch channel avatars for the given channel IDs
   * @param {string[]} channelIds - Array of YouTube channel IDs
   * @returns {Promise<Map<string, string>>} Map of channelId -> avatarUrl
   */
  const fetchChannelAvatars = async (channelIds) => {
    if (!channelIds || channelIds.length === 0) {
      return new Map()
    }

    if (!hasKeys) {
      console.warn('[useChannelAvatars] No YouTube API key found')
      return new Map()
    }

    setLoading(true)
    setError(null)

    try {
      const avatarMap = new Map()

      // Batch requests in groups of 50 (YouTube API limit)
      for (let i = 0; i < channelIds.length; i += 50) {
        const batch = channelIds.slice(i, i + 50)
        const channelIdParam = batch.join(',')

        try {
          const { data } = await retryWithRotation(async (apiKey) => {
            const params = new URLSearchParams({
              part: 'snippet',
              id: channelIdParam,
              key: apiKey,
            })

            return fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`)
          })

          // Map channel IDs to avatar URLs
          if (data.items) {
            data.items.forEach((item) => {
              const avatarUrl = item.snippet?.thumbnails?.default?.url
              if (avatarUrl) {
                avatarMap.set(item.id, avatarUrl)
              }
            })
          }
        } catch (batchError) {
          console.error('[useChannelAvatars] Error fetching batch:', batchError)
          // Continue with next batch even if this one fails
        }
      }

      setLoading(false)
      return avatarMap
    } catch (err) {
      console.error('[useChannelAvatars] Error fetching avatars:', err)
      setError(err.message)
      setLoading(false)
      return new Map()
    }
  }

  /**
   * Update transcript avatar in database
   * @param {string} transcriptId - Transcript ID
   * @param {string} avatarUrl - Avatar URL to save
   * @returns {Promise<boolean>} Success status
   */
  const updateTranscriptAvatar = async (transcriptId, avatarUrl) => {
    try {
      const response = await fetch(`${API_URL}/api/transcripts/${transcriptId}/avatar`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelAvatarUrl: avatarUrl }),
      })

      if (!response.ok) {
        throw new Error(`Failed to update avatar: ${response.status}`)
      }

      return true
    } catch (err) {
      console.error('[useChannelAvatars] Error updating transcript avatar:', err)
      return false
    }
  }

  return {
    loading,
    error,
    fetchChannelAvatars,
    updateTranscriptAvatar,
  }
}
