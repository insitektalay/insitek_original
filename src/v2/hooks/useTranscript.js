// src/v2/hooks/useTranscript.js
import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export function useTranscript() {
  const [selected, setSelected] = useState(null)
  const [refreshKey, setRefresh] = useState(0)

  /* transcript load / selection (moved from layout.jsx) */
  const handleSelect = async (payload) => {
    if (!payload) return setSelected(null)
    const transcriptId = typeof payload === 'string' ? payload : payload.id
    if (payload && payload.text) return setSelected(payload)

    try {
      const res = await fetch(`${API_URL}/api/transcripts/${transcriptId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const full = await res.json()
      setSelected(full)
    } catch (e) {
      console.error('Fetch full transcript failed:', e)
      setSelected(null)
    }
  }

  /* delete transcript (moved from layout.jsx) */
  const handleDeleteTranscript = async (transcriptId) => {
    try {
      const res = await fetch(`${API_URL}/api/transcripts/${transcriptId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      
      setRefresh((k) => k + 1)
      
      if (selected?.id === transcriptId) {
        setSelected(null)
      }
      return true
    } catch (e) {
      console.error('Delete transcript failed:', e)
      alert(`❌ Failed to delete transcript: ${e.message}`)
      return false
    }
  }

  /* trigger refresh helper */
  const triggerRefresh = () => setRefresh((k) => k + 1)

  return {
    // State
    selected,
    setSelected,
    refreshKey,
    
    // Actions
    handleSelect,
    handleDeleteTranscript,
    triggerRefresh
  }
}