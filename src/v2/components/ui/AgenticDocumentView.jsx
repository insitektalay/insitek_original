// src/v2/components/ui/AgenticDocumentView.jsx
import { useState, useEffect } from 'react'
import { ArrowLeftIcon, ChartBarIcon, TrashIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { Zap } from 'lucide-react'
import MarkdownMessage from './MarkdownMessage'
import AgenticAnalysisModal from './AgenticAnalysisModal'

export default function AgenticDocumentView({ documentId, onClose }) {
  const [document, setDocument] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAnalysis, setShowAnalysis] = useState(false)

  useEffect(() => {
    fetchDocument()
  }, [documentId])

  const fetchDocument = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
      const response = await fetch(`${API_URL}/api/agent-documents/${documentId}`)
      if (!response.ok) throw new Error('Failed to fetch document')
      const data = await response.json()
      setDocument(data)
    } catch (error) {
      console.error('Error fetching document:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this AI document?')) return

    try {
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
      const response = await fetch(`${API_URL}/api/agent-documents/${documentId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Delete failed')
      }

      onClose()
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete document')
    }
  }

  const formatGenerationTime = (seconds) => {
    if (!seconds) return 'Unknown'
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-gray-500">
          <SparklesIcon className="w-5 h-5 animate-pulse" />
          <span>Loading document...</span>
        </div>
      </div>
    )
  }

  if (!document) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Document not found</div>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col h-full bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-x-4">
            <button
              onClick={onClose}
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-semibold text-gray-900">
                  {document.title || document.documentType}
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full">
                  <Zap className="w-3 h-3" />
                  AI Agent
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>Created {new Date(document.createdAt).toLocaleDateString()}</span>
                <span>•</span>
                <span>{document.wordCount?.toLocaleString() || 0} words</span>
                {document.generationTime && (
                  <>
                    <span>•</span>
                    <span>⚡ {formatGenerationTime(document.generationTime)}</span>
                  </>
                )}
                {document.toolCallCount && (
                  <>
                    <span>•</span>
                    <span>{document.toolCallCount} actions</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAnalysis(true)}
                className="inline-flex items-center gap-2 px-3 py-2 border border-indigo-300 bg-indigo-50 rounded-md text-sm text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                <ChartBarIcon className="h-4 w-4" />
                View Analysis
              </button>
              <button
                onClick={handleDelete}
                className="inline-flex items-center gap-2 px-3 py-2 border border-red-300 rounded-md text-sm text-red-700 hover:bg-red-50 transition-colors"
              >
                <TrashIcon className="h-4 w-4" />
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Generation Stats */}
          <div className="max-w-4xl mx-auto mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-xs text-gray-500 mb-1">Sections</div>
              <div className="text-2xl font-bold text-gray-900">
                {document.sections?.length || 0}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-xs text-gray-500 mb-1">Actions</div>
              <div className="text-2xl font-bold text-gray-900">
                {document.toolCallCount || 0}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-xs text-gray-500 mb-1">Notes</div>
              <div className="text-2xl font-bold text-gray-900">
                {document.notes?.length || 0}
              </div>
            </div>
            {document.totalCost > 0 && (
              <div className="bg-white rounded-lg shadow p-4">
                <div className="text-xs text-gray-500 mb-1">Cost</div>
                <div className="text-2xl font-bold text-gray-900">
                  ${document.totalCost.toFixed(3)}
                </div>
              </div>
            )}
          </div>

          {/* Document Content */}
          <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-8">
            <MarkdownMessage content={document.content || 'No content generated.'} />
          </div>

          {/* Source Transcripts */}
          {document.transcripts && document.transcripts.length > 0 && (
            <div className="max-w-4xl mx-auto mt-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Source Transcripts ({document.transcripts.length})
              </h2>
              <ul className="space-y-2">
                {document.transcripts.map((transcript) => (
                  <li key={transcript.id} className="text-sm text-indigo-600 hover:text-indigo-800">
                    • {transcript.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sections Preview */}
          {document.sections && document.sections.length > 0 && (
            <div className="max-w-4xl mx-auto mt-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Section Structure
              </h2>
              <div className="space-y-2">
                {document.sections.map((section) => (
                  <div key={section.id} className="bg-white rounded-lg shadow p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{section.title}</div>
                        {section.description && (
                          <div className="text-sm text-gray-500 mt-1">{section.description}</div>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 flex items-center gap-2">
                        <span>{section.wordCount || 0} words</span>
                        {section.revisionCount > 1 && (
                          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded">
                            {section.revisionCount} revisions
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Analysis Modal */}
      {showAnalysis && (
        <AgenticAnalysisModal
          documentId={documentId}
          onClose={() => setShowAnalysis(false)}
        />
      )}
    </>
  )
}
