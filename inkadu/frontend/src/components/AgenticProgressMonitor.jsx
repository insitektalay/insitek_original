// src/v2/components/ui/AgenticProgressMonitor.jsx
import { useState, useEffect, useRef } from 'react'
import { ArrowLeftIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { Activity, Zap, FileText, Pencil, TrendingUp, CheckCircle } from 'lucide-react'
import AgentProgressStream from './AgentProgressStream'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

const STATUS_LABELS = {
  INITIALIZING: 'Initializing...',
  READING: 'Reading transcripts',
  PLANNING: 'Planning structure',
  WRITING: 'Writing content',
  POLISHING: 'Polishing document',
  COMPLETE: 'Complete',
  FAILED: 'Failed'
}

const STATUS_ICONS = {
  INITIALIZING: Activity,
  READING: FileText,
  PLANNING: TrendingUp,
  WRITING: Pencil,
  POLISHING: SparklesIcon,
  COMPLETE: CheckCircle,
  FAILED: Activity
}

export default function AgenticProgressMonitor({ documentId, onComplete, onError, onClose }) {
  const [status, setStatus] = useState({
    status: 'INITIALIZING',
    stats: {
      toolCallCount: 0,
      sectionsCreated: 0,
      sectionsWithContent: 0,
      notesCollected: 0,
      totalCost: 0,
      totalTokens: 0
    },
    progress: 0,
    currentStage: 'Starting AI agent...'
  })
  const [activityLog, setActivityLog] = useState([])
  const pollingIntervalRef = useRef(null)
  const activityContainerRef = useRef(null)
  const lastToolCallCountRef = useRef(0)

  useEffect(() => {
    if (!documentId) return

    // Start polling
    fetchStatus()
    pollingIntervalRef.current = setInterval(fetchStatus, 2000) // Poll every 2 seconds

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [documentId])

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/api/agent-documents/${documentId}/status`)
      if (!response.ok) throw new Error('Failed to fetch status')

      const data = await response.json()
      setStatus(data)

      // Add to activity log if tool call count increased
      if (data.stats?.toolCallCount > lastToolCallCountRef.current) {
        addActivityLogEntry(data)
        lastToolCallCountRef.current = data.stats.toolCallCount
      }

      // Handle completion
      if (data.status === 'COMPLETE') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
        }
        setTimeout(() => {
          onComplete?.()
        }, 1000)
      }

      // Handle failure
      if (data.status === 'FAILED') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
        }
        onError?.(data.errorMessage || 'Generation failed')
      }
    } catch (err) {
      console.error('Error fetching status:', err)
      // Don't call onError for temporary network issues, keep polling
    }
  }

  const addActivityLogEntry = (data) => {
    const timestamp = new Date()
    const entry = {
      timestamp,
      message: data.currentStage || 'Working...',
      toolCount: data.stats?.toolCallCount || 0,
      status: data.status
    }

    setActivityLog(prev => {
      const newLog = [entry, ...prev].slice(0, 20) // Keep last 20 entries
      return newLog
    })

    // Auto-scroll to latest activity
    if (activityContainerRef.current) {
      activityContainerRef.current.scrollTop = 0
    }
  }

  const formatTimeAgo = (timestamp) => {
    const seconds = Math.floor((Date.now() - timestamp.getTime()) / 1000)
    if (seconds < 10) return 'just now'
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  const getStatusIcon = (statusName) => {
    const Icon = STATUS_ICONS[statusName] || Activity
    return Icon
  }

  const getStatusColor = (statusName) => {
    switch (statusName) {
      case 'INITIALIZING': return 'text-gray-500'
      case 'READING': return 'text-blue-500'
      case 'PLANNING': return 'text-purple-500'
      case 'WRITING': return 'text-indigo-500'
      case 'POLISHING': return 'text-green-500'
      case 'COMPLETE': return 'text-green-600'
      case 'FAILED': return 'text-red-500'
      default: return 'text-gray-500'
    }
  }

  const StatusIcon = getStatusIcon(status.status)
  const statusColor = getStatusColor(status.status)

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close (generation will continue in background)"
            >
              <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
            </button>
            <SparklesIcon className="w-7 h-7 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">AI Agent Working</h1>
              <p className="text-sm text-gray-500">
                {STATUS_LABELS[status.status] || 'Processing...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusIcon className={`w-6 h-6 ${statusColor} ${status.status !== 'COMPLETE' && status.status !== 'FAILED' ? 'animate-pulse' : ''}`} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden px-6 py-6">
        <div className="max-w-4xl mx-auto h-full flex flex-col gap-6">
          {/* Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Tool Calls */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-medium text-gray-500">Actions</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {status.stats?.toolCallCount || 0}
                <span className="text-sm text-gray-400 font-normal">/200</span>
              </div>
            </div>

            {/* Sections */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-medium text-gray-500">Sections</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {status.stats?.sectionsWithContent || 0}
                <span className="text-sm text-gray-400 font-normal">/{status.stats?.sectionsCreated || 0}</span>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2 mb-2">
                <Pencil className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-medium text-gray-500">Notes</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {status.stats?.notesCollected || 0}
              </div>
            </div>

            {/* Progress */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-medium text-gray-500">Progress</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {status.progress || 0}%
              </div>
            </div>
          </div>

          {/* Current Stage */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <div className={`w-12 h-12 rounded-full bg-white flex items-center justify-center ${status.status !== 'COMPLETE' && status.status !== 'FAILED' ? 'animate-pulse' : ''}`}>
                  <StatusIcon className={`w-6 h-6 ${statusColor}`} />
                </div>
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-indigo-900">Current Stage</div>
                <div className="text-indigo-700">{status.currentStage || 'Working...'}</div>
              </div>
            </div>
          </div>

          {/* Real-Time Agent Stream */}
          <div className="flex-1 overflow-hidden">
            <AgentProgressStream documentId={documentId} />
          </div>

          {/* Cost/Token Info */}
          {status.stats?.totalCost > 0 && (
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Estimated Cost:</span>
                <span className="font-medium text-gray-900">${status.stats.totalCost.toFixed(4)}</span>
              </div>
              {status.stats?.totalTokens > 0 && (
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-gray-600">Tokens Used:</span>
                  <span className="font-medium text-gray-900">{status.stats.totalTokens.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
