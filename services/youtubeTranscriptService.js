import { Innertube } from 'youtubei.js';

// Rate limiting configuration
const RATE_LIMIT_DELAY_MS = 150; // 150ms delay between requests
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000; // Start at 1 second

// Request queue for rate limiting
class TranscriptRequestQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.lastRequestTime = 0;
  }

  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift();

      // Rate limiting: ensure minimum delay between requests
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < RATE_LIMIT_DELAY_MS) {
        await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS - timeSinceLastRequest));
      }

      try {
        this.lastRequestTime = Date.now();
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    this.processing = false;
  }
}

const requestQueue = new TranscriptRequestQueue();

/**
 * Extracts video ID from various YouTube URL formats
 * @param {string} url - YouTube URL
 * @returns {string|null} - Video ID or null if invalid
 */
export function extractVideoId(url) {
  try {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting video ID:', error);
    return null;
  }
}

/**
 * Sleeps for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Converts YouTube transcript segments to application format
 * Matches the format used by the UI (offsets.from/to structure)
 * @param {Array} segments - YouTube transcript segments
 * @returns {Array} - Application-compatible segments
 */
function convertToWhisperFormat(segments) {
  if (!segments || !Array.isArray(segments)) return [];

  return segments.map((segment, index) => {
    // YouTube provides start_ms and duration_ms
    const startMs = segment.start_ms || 0;
    const durationMs = segment.duration_ms || 0;
    const endMs = startMs + durationMs;

    return {
      id: index,
      text: segment.snippet?.text || segment.text || '',
      offsets: {
        from: startMs,
        to: endMs
      }
    };
  });
}

/**
 * Attempts to fetch YouTube transcript with exponential backoff on rate limits
 * @param {string} url - YouTube video URL
 * @param {number} retryCount - Current retry attempt (internal)
 * @returns {Promise<Object|null>} - Transcript data or null if unavailable
 */
async function fetchTranscriptWithRetry(url, retryCount = 0) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    console.log('[Transcript Fetch] Invalid URL or video ID:', url);
    return null;
  }

  try {
    console.log(`[Transcript Fetch] Attempting to fetch transcript for video: ${videoId}`);

    // Queue the request to ensure rate limiting
    const result = await requestQueue.add(async () => {
      const youtube = await Innertube.create();
      const info = await youtube.getInfo(videoId);

      // Extract metadata
      const title = info.basic_info?.title || 'Unknown Title';
      const channel = info.basic_info?.author || 'Unknown Channel';
      const channelId = info.basic_info?.channel_id || null;
      const publishDate = info.basic_info?.publish_date
        ? new Date(info.basic_info.publish_date)
        : null;

      // Get transcript/captions
      const transcriptData = await info.getTranscript();

      return {
        videoId,
        title,
        channel,
        channelId,
        publishDate,
        transcriptData
      };
    });

    const { videoId: vid, title, channel, channelId, publishDate, transcriptData } = result;

    if (!transcriptData) {
      console.log('[Transcript Fetch] No transcript available for video:', vid);
      return null;
    }

    // Get available transcript tracks
    const tracks = transcriptData.transcript?.content?.body?.initial_segments || [];

    if (!tracks || tracks.length === 0) {
      console.log('[Transcript Fetch] No transcript segments found for video:', vid);
      return null;
    }

    // Prefer manual transcripts over auto-generated
    // Filter for English language only
    let selectedSegments = tracks;

    // Convert to whisper.cpp format
    const segments = convertToWhisperFormat(selectedSegments);

    // Combine all text
    const text = segments.map(s => s.text).join(' ').trim();

    if (!text) {
      console.log('[Transcript Fetch] Empty transcript text for video:', vid);
      return null;
    }

    console.log(`[Transcript Fetch] Successfully fetched transcript for video: ${vid} (${text.length} chars, ${segments.length} segments)`);

    return {
      youtubeId: vid,
      title,
      channel,
      channelId,
      publishDate,
      text,
      segments,
      method: 'FETCHED'
    };

  } catch (error) {
    // Check if it's a rate limit error (429)
    if (error.message?.includes('429') || error.message?.includes('rate limit')) {
      if (retryCount < MAX_RETRIES) {
        const backoffMs = BACKOFF_BASE_MS * Math.pow(2, retryCount);
        console.log(`[Transcript Fetch] Rate limited. Retrying in ${backoffMs}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await sleep(backoffMs);
        return fetchTranscriptWithRetry(url, retryCount + 1);
      } else {
        console.log(`[Transcript Fetch] Rate limit exceeded after ${MAX_RETRIES} retries for video: ${videoId}`);
        return null;
      }
    }

    // Log other errors
    console.log('[Transcript Fetch] Error fetching transcript:', error.message);
    return null;
  }
}

/**
 * Attempts to fetch YouTube transcript (primary method)
 * Falls back to null if unavailable (triggers local transcription)
 *
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object|null>} - Transcript data or null for fallback
 *
 * Returns:
 * {
 *   youtubeId: string,
 *   title: string,
 *   channel: string,
 *   channelId: string|null,
 *   publishDate: Date|null,
 *   text: string,
 *   segments: Array<whisper.cpp format>,
 *   method: 'FETCHED'
 * }
 */
export async function fetchYouTubeTranscript(url) {
  return fetchTranscriptWithRetry(url, 0);
}

export default {
  fetchYouTubeTranscript,
  extractVideoId
};
