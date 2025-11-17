// src/v2/hooks/useImport.js
import { useState, useEffect, useCallback, useRef } from 'react'
import { createWebSocket } from '../utils/ws.js'
import { useImportContext } from '../contexts/ImportContext'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export function useImport() {
  const { activeJob, setActiveJob } = useImportContext()
  const [importing, setImporting] = useState(false)
  const wsRef = useRef(null)
  const pollRef = useRef(null)

  /* YouTube import (moved from layout.jsx) */
  const importYoutube = async (url, onSuccess) => {
    if (!url) return
    
    setImporting(true)
    try {
      const res = await fetch(`${API_URL}/api/transcribe-youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Import failed')
      
      alert(`✅ Imported: ${result.title}`)
      
      // Call the success callback if provided
      if (onSuccess) onSuccess()
      
      return result
    } catch (e) {
      alert(`❌ ${e.message}`)
      throw e
    } finally {
      setImporting(false)
    }
  }

  // Fetch active import jobs
  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/import-jobs?status=active`)
      if (!res.ok) throw new Error('Failed to fetch import jobs')
      const jobs = await res.json()
      setActiveJob(jobs.length ? jobs[0] : null)
    } catch (err) {
      console.error('refreshJobs error', err)
    }
  }, [])

  // Initial sync on mount
  useEffect(() => {
    refreshJobs()
  }, [refreshJobs])

  // Connect to WebSocket when activeJob changes
  useEffect(() => {
    if (!activeJob) return

    const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001'

    // Close previous socket
    wsRef.current?.close()

    wsRef.current = createWebSocket(WS_URL, {
      onOpen: () => {
        // Stop polling when connection is restored
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
        wsRef.current.send(
          JSON.stringify({ type: 'subscribe', importId: activeJob.id })
        )
      },
      onMessage: (ev) => {
        try {
          const data = JSON.parse(ev.data)
          if (data.type === 'progress' && data.importId === activeJob.id) {
            setActiveJob((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                stage: data.stage,
                progress: data.progress,
                state: deriveState(data.stage, data.progress),
              }
            })
          }
        } catch (err) {
          console.error('WS message parse error', err)
        }
      },
      onClose: () => {
        // Start polling every 10s while socket down
        if (!pollRef.current) {
          pollRef.current = setInterval(refreshJobs, 10000)
        }
      },
    })

    return () => {
      wsRef.current?.close()
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [activeJob, refreshJobs])

  // Helper to map stage/progress to high-level state label
  function deriveState(stage, progress) {
    if (stage === 'Completed' || progress === 100) return 'DONE'
    if (stage?.toLowerCase().startsWith('error')) return 'ERROR'
    return 'PROCESSING'
  }

  return {
    importing,
    activeJob,
    importYoutube,
    refreshJobs,
  }
}