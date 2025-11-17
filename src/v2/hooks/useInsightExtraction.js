// src/v2/hooks/useInsightExtraction.js
// ⓘ Changes:
//    • clearInsightSuggestions is now memo-ised with useCallback
// ---------------------------------------------------------------

import { useState, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function useInsightExtraction() {
  const [insightSuggestions, setInsightSuggestions] = useState([]);

  /* ──────────── helpers ──────────── */

  // Stable - clears all queued suggestions
  const clearInsightSuggestions = useCallback(() => {
    setInsightSuggestions([]);
  }, []);

  // 🤖 SMART SELECTIVE INSIGHT EXTRACTION
  const extractSelectiveInsights = async (messageContent, messageIndex) => {
    console.log(`🔍 Smart extract attempt for message ${messageIndex}, length: ${messageContent?.length}`);
    
    if (!messageContent || messageContent.length < 200) {
      console.log(`❌ Smart extract skipped - content too short (${messageContent?.length} chars)`);
      return;
    }

    console.log(`✅ Smart extract starting for message ${messageIndex}`);

    try {
      const prompt = `Extract 1-3 specific valuable insights from this AI response. Find the most insightful sentences or short paragraphs.

Response:
"${messageContent}"

For each insight found, you MUST format exactly like this:
INSIGHT_START
[extract the specific insightful text - 1-3 sentences only]
INSIGHT_END
TITLE: [short descriptive title for this insight]
REASON: [why this specific text is valuable]

IMPORTANT: Use exactly "INSIGHT_START" and "INSIGHT_END" (not INSIGHT_1, not anything else). Only extract text that contains actual insights, analysis, or key information. Skip filler text.`;

      const response = await fetch(`${API_URL}/api/chat/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          temperature: 0.2,
          n_predict: 400,
          stop: ['Response:', 'Extract'],
          stream: false,
        }),
      });

      if (!response.ok) {
        console.log(`❌ Smart extract API failed: ${response.status}`);
        return;
      }

      const data = await response.json();
      const analysis = data.content || '';
      console.log(`📝 Smart extract AI response (full):`, analysis);

      // Parse extracted insights
      const insightMatches = analysis.match(
        /INSIGHT_START\s*(.*?)\s*INSIGHT_END\s*TITLE:\s*(.*?)\s*REASON:\s*(.*?)(?=INSIGHT_START|$)/gs,
      );
      
      console.log(`🎯 Found ${insightMatches?.length || 0} insight matches`);

      if (insightMatches?.length) {
        insightMatches.forEach((match, index) => {
          const insightText = match.match(/INSIGHT_START\s*(.*?)\s*INSIGHT_END/s)?.[1]?.trim();
          const title = match.match(/TITLE:\s*(.*?)(?=\s*REASON)/s)?.[1]?.trim();
          const reason = match.match(/REASON:\s*(.*?)$/s)?.[1]?.trim();

          if (insightText && insightText.length > 20) {
            const suggestion = {
              messageIndex,
              content: insightText,
              reason: reason || 'Contains specific insight',
              suggestedTitle: title || 'Extracted Insight',
              keyExcerpt:
                insightText.length > 100 ? `${insightText.substring(0, 100)}…` : insightText,
              type: 'selective',
              timestamp: Date.now() + index,
            };

            console.log(`💡 Smart extract created for message ${messageIndex}:`, {
              title: suggestion.suggestedTitle,
              contentLength: insightText.length,
              excerpt: suggestion.keyExcerpt
            });

            setInsightSuggestions((prev) => [...prev, suggestion]);
          } else {
            console.log(`❌ Smart extract rejected - too short: "${insightText}"`);
          }
        });
      } else {
        console.log(`❌ No insight matches found in AI response`);
      }
    } catch (error) {
      console.error('❌ Selective insight extraction error:', error);
    }
  };

  // Removed fallback method as it's redundant with Transfer Full Response button

  /* ──────────── public API ──────────── */

  const runInsightDetection = (messageContent, messageIndex) => {
    // Only run selective extraction (fallback method removed)
    setTimeout(() => {
      extractSelectiveInsights(messageContent, messageIndex);
    }, 500);
  };

  const handleCaptureInsight = (suggestion, onCaptureInsight) => {
    onCaptureInsight?.({
      content: suggestion.content,
      suggestedTitle: suggestion.suggestedTitle,
      source: suggestion.type === 'selective' ? 'chat_smart_selective' : 'chat_smart_full',
      timestamp: suggestion.timestamp,
    });
    setInsightSuggestions((prev) => prev.filter((s) => s.timestamp !== suggestion.timestamp));
  };

  const dismissInsightSuggestion = (timestamp) => {
    setInsightSuggestions((prev) => prev.filter((s) => s.timestamp !== timestamp));
  };

  return {
    insightSuggestions,
    runInsightDetection,
    handleCaptureInsight,
    dismissInsightSuggestion,
    clearInsightSuggestions,
  };
}
