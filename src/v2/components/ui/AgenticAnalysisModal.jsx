// src/v2/components/ui/AgenticAnalysisModal.jsx
import { useState, useEffect } from 'react'
import { XMarkIcon, ClipboardDocumentIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { BarChart3, Clock, Zap, FileText, TrendingUp } from 'lucide-react'

export default function AgenticAnalysisModal({ documentId, onClose }) {
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activityLog, setActivityLog] = useState([])
  const [copySuccess, setCopySuccess] = useState(false)

  useEffect(() => {
    fetchAnalysis()
    fetchActivityLog()
  }, [documentId])

  const fetchAnalysis = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
      const response = await fetch(`${API_URL}/api/agent-documents/${documentId}/analysis`)
      if (!response.ok) throw new Error('Failed to fetch analysis')
      const data = await response.json()
      setAnalysis(data)
    } catch (error) {
      console.error('Error fetching analysis:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchActivityLog = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
      const response = await fetch(`${API_URL}/api/agent-documents/${documentId}/activity-log`)
      if (!response.ok) throw new Error('Failed to fetch activity log')
      const data = await response.json()
      setActivityLog(data.toolCalls || [])
    } catch (error) {
      console.error('Error fetching activity log:', error)
    }
  }

  const formatTime = (seconds) => {
    if (!seconds) return '0s'
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const handleCopyActivityLog = async () => {
    try {
      // Format activity log as readable text
      const formattedText = activityLog.map((call) => {
        const time = new Date(call.calledAt).toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })

        const status = call.success ? '✅ SUCCESS' : '❌ FAILED'
        const duration = call.durationMs ? ` (${call.durationMs}ms)` : ''
        const toolName = call.toolName.toUpperCase()

        let details = `[${time}] 🔧 ${toolName}: ${status}${duration}`

        if (call.toolInput) {
          try {
            const args = typeof call.toolInput === 'string' ? JSON.parse(call.toolInput) : call.toolInput
            details += `\nInput: ${JSON.stringify(args, null, 2)}`
          } catch (e) {
            // Ignore parse errors
          }
        }

        if (!call.success && call.errorMessage) {
          details += `\nError: ${call.errorMessage}`
        }

        return details
      }).join('\n\n')

      // Copy to clipboard
      await navigator.clipboard.writeText(formattedText)

      // Show success feedback
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      console.error('Failed to copy activity log:', err)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="text-gray-500">Loading analysis...</div>
        </div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="text-gray-500">Analysis not available</div>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  const { generationMetrics, toolCallBreakdown, readingPattern, noteUtilization, sectionEvolution } = analysis

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-indigo-600" />
            <h2 className="text-xl font-semibold text-gray-900">Agent Behavior Analysis</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Generation Metrics */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              Generation Metrics
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Tool Calls</div>
                <div className="text-2xl font-bold text-gray-900">{generationMetrics?.totalToolCalls || 0}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Tokens</div>
                <div className="text-2xl font-bold text-gray-900">
                  {generationMetrics?.totalTokens?.toLocaleString() || 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Time</div>
                <div className="text-2xl font-bold text-gray-900">
                  {formatTime(generationMetrics?.generationTime)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Cost</div>
                <div className="text-2xl font-bold text-gray-900">
                  ${generationMetrics?.totalCost?.toFixed(4) || '0.0000'}
                </div>
              </div>
            </div>
          </div>

          {/* Tool Call Breakdown */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-600" />
              Tool Usage Breakdown
            </h3>
            <div className="space-y-3">
              {toolCallBreakdown && Object.entries(toolCallBreakdown).map(([tool, count]) => {
                const total = Object.values(toolCallBreakdown).reduce((sum, c) => sum + c, 0)
                const percentage = total > 0 ? (count / total) * 100 : 0

                return (
                  <div key={tool} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">{tool.replace(/_/g, ' ')}</span>
                      <span className="text-gray-600">{count} calls ({percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Reading Pattern */}
          {readingPattern && readingPattern.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Reading Pattern
              </h3>
              <div className="space-y-2">
                {readingPattern.map((item, index) => (
                  <div key={index} className="flex items-center gap-3 text-sm">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-medium">
                      {item.order}
                    </span>
                    <span className="flex-1 text-gray-700">
                      {item.transcriptId?.substring(0, 8)}...
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Note Utilization */}
          {noteUtilization && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
                Note Utilization
              </h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Total Notes</div>
                  <div className="text-xl font-bold text-gray-900">{noteUtilization.total || 0}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Used</div>
                  <div className="text-xl font-bold text-green-600">{noteUtilization.used || 0}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Utilization Rate</div>
                  <div className="text-xl font-bold text-indigo-600">
                    {((noteUtilization.utilizationRate || 0) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-indigo-600 to-green-600 h-3 rounded-full transition-all"
                  style={{ width: `${(noteUtilization.utilizationRate || 0) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Section Evolution */}
          {sectionEvolution && sectionEvolution.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Section Evolution</h3>
              <div className="space-y-3">
                {sectionEvolution.map((section, index) => (
                  <div key={index} className="border-l-4 border-indigo-600 pl-4 py-2">
                    <div className="font-medium text-gray-900">{section.title}</div>
                    <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                      <span>{section.finalWordCount || 0} words</span>
                      <span>•</span>
                      <span>{section.revisionCount || 1} revision{section.revisionCount !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generation Log */}
          {activityLog.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  Complete Generation Log
                </h3>
                <button
                  onClick={handleCopyActivityLog}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                    copySuccess
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  title={copySuccess ? 'Copied!' : 'Copy full activity log to clipboard'}
                >
                  {copySuccess ? (
                    <>
                      <CheckCircleIcon className="w-4 h-4" />
                      <span className="text-sm font-medium">Copied!</span>
                    </>
                  ) : (
                    <>
                      <ClipboardDocumentIcon className="w-4 h-4" />
                      <span className="text-sm font-medium">Copy Log</span>
                    </>
                  )}
                </button>
              </div>
              <div className="text-sm text-gray-600 mb-3">
                {activityLog.length} tool calls • {activityLog.filter(c => c.success).length} successful
              </div>
              <div className="max-h-96 overflow-y-auto bg-gray-50 rounded-lg p-4">
                <div className="space-y-2 font-mono text-xs">
                  {activityLog.map((call, index) => (
                    <div
                      key={index}
                      className={`p-2 rounded ${call.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-gray-500">
                          {new Date(call.calledAt).toLocaleTimeString('en-US', {
                            hour12: false,
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </span>
                        <span className={`font-semibold ${call.success ? 'text-green-700' : 'text-red-700'}`}>
                          {call.toolName}
                        </span>
                        <span className={`ml-auto text-xs ${call.success ? 'text-green-600' : 'text-red-600'}`}>
                          {call.success ? '✓' : '✗'} {call.durationMs}ms
                        </span>
                      </div>
                      {!call.success && call.errorMessage && (
                        <div className="text-red-700 text-xs mt-1 pl-2 border-l-2 border-red-300">
                          {call.errorMessage}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-500 italic">
                Click "Copy Log" to copy the complete generation log with all inputs and outputs
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
