// src/v2/contexts/NavigationContext.jsx
import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

const NavigationContext = createContext()

export const useNavigation = () => {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider')
  }
  return context
}

const pageTabs = {
  Import: [], // No tabs for Import - single combined page
  Transcripts: [], // No tabs for Transcripts - handled by router
  Chat: [], // No tabs for Chat - direct to chat panel
  Insights: [], // No tabs for Insights - handled by router like Transcripts
  Documents: [], // No tabs for Documents - handled by router
}

export function NavigationProvider({ children}) {
  const [collapsed, setCollapsed] = useState(false)
  const [page, setPage] = useState('Import')
  const [tab, setTab] = useState(pageTabs.Import[0] || null) // default first tab or null
  const [selectedInsight, setSelectedInsight] = useState(null) // For insight navigation
  const [selectedTranscript, setSelectedTranscript] = useState(null) // For transcript navigation
  const [wizardTranscriptIds, setWizardTranscriptIds] = useState([]) // For document wizard
  const [refreshKey, setRefreshKey] = useState(0)

  const navigateTo = useCallback((newPage, newTab = null) => {
    setPage(newPage)
    setTab(newTab ?? (pageTabs[newPage][0] || null))
  }, [])

  /* transcript load / selection */
  const handleSelectTranscript = useCallback(async (payload) => {
    if (!payload) return setSelectedTranscript(null)
    const transcriptId = typeof payload === 'string' ? payload : payload.id
    if (payload && payload.text) return setSelectedTranscript(payload)

    try {
      const res = await fetch(`${API_URL}/api/transcripts/${transcriptId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const full = await res.json()
      setSelectedTranscript(full)
    } catch (e) {
      console.error('Fetch full transcript failed:', e)
      setSelectedTranscript(null)
    }
  }, [])

  /* delete transcript */
  const handleDeleteTranscript = useCallback(async (transcriptId) => {
    try {
      const res = await fetch(`${API_URL}/api/transcripts/${transcriptId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      
      setRefreshKey((k) => k + 1)
      
      if (selectedTranscript?.id === transcriptId) {
        setSelectedTranscript(null)
      }
      return true
    } catch (e) {
      console.error('Delete transcript failed:', e)
      alert(`❌ Failed to delete transcript: ${e.message}`)
      return false
    }
  }, [selectedTranscript])

  /* trigger refresh helper */
  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const value = useMemo(() => ({
    collapsed,
    setCollapsed,
    page,
    setPage,
    tab,
    setTab,
    navigateTo,
    pageTabs,
    selectedInsight,
    setSelectedInsight,
    selectedTranscript,
    setSelectedTranscript,
    handleSelectTranscript,
    handleDeleteTranscript,
    wizardTranscriptIds,
    setWizardTranscriptIds,
    triggerRefresh,
    refreshKey
  }), [collapsed, page, tab, navigateTo, selectedInsight, selectedTranscript, handleSelectTranscript, handleDeleteTranscript, wizardTranscriptIds, triggerRefresh, refreshKey]);
  
  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}