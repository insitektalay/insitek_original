// src/v2/hooks/useInsight.js
import { useState } from 'react'

export function useInsight() {
  const [selectedSuggestion, setSelectedSuggestion] = useState(null)
  const [autoCapturedContent, setAutoCapturedContent] = useState(null)

  /* Handle showing source context (moved from layout.jsx) */
  const handleShowSource = (suggestion, navigateTo) => {
    setSelectedSuggestion(suggestion)
    navigateTo('Chat', 'Source context')
  }

  /* Handle capturing insight content (moved from layout.jsx) */
  const handleCaptureInsight = (content, navigateTo) => {
    setAutoCapturedContent(content)
    // Only navigate if navigateTo function is provided and not null
    if (navigateTo && typeof navigateTo === 'function') {
      navigateTo('Insights', 'Insight editor')
    }
  }

  /* Clear captured content */
  const clearAutoCapturedContent = () => {
    setAutoCapturedContent(null)
  }

  /* Clear selected suggestion */
  const clearSelectedSuggestion = () => {
    setSelectedSuggestion(null)
  }

  return {
    // State
    selectedSuggestion,
    autoCapturedContent,
    
    // Actions
    handleShowSource,
    handleCaptureInsight,
    clearAutoCapturedContent,
    clearSelectedSuggestion,
    
    // Direct setters (for backward compatibility)
    setSelectedSuggestion,
    setAutoCapturedContent
  }
}