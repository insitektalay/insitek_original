// src/v2/components/ui/AgenticDocumentsList.jsx
import { useState, useEffect } from 'react'
import { PlusIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { Trash, Zap } from 'lucide-react'

export default function AgenticDocumentsList({ onSelectDocument, onNewDocument }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDocuments()
  }, [])

  const fetchDocuments = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
      const response = await fetch(`${API_URL}/api/agent-documents`)
      if (!response.ok) throw new Error('Failed to fetch agent documents')
      const data = await response.json()
      setDocuments(data.documents || [])
    } catch (error) {
      console.error('Error fetching agent documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteDocument = async (documentId, e) => {
    // Stop event propagation to prevent card click
    e.stopPropagation()

    if (!window.confirm('Are you sure you want to delete this AI document?')) return

    try {
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
      const response = await fetch(`${API_URL}/api/agent-documents/${documentId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete document')
      }

      // Remove document from state
      setDocuments(docs => docs.filter(doc => doc.id !== documentId))
    } catch (error) {
      console.error('Error deleting document:', error)
      alert('Failed to delete document. Please try again.')
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
          <span>Loading AI documents...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SparklesIcon className="w-7 h-7 text-indigo-600" />
            <h1 className="text-2xl font-semibold text-gray-900">AI Documents</h1>
          </div>
          <button
            onClick={onNewDocument}
            className="inline-flex items-center gap-x-2 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
            New AI Document
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          Documents generated autonomously by AI agents
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {documents.length === 0 ? (
          <div className="text-center py-12">
            <SparklesIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <div className="text-gray-500 mb-2">No AI documents yet</div>
            <p className="text-sm text-gray-400 mb-6">
              Create your first AI-generated document using autonomous agents
            </p>
            <button
              onClick={onNewDocument}
              className="inline-flex items-center gap-x-2 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
            >
              <PlusIcon className="h-5 w-5" />
              Get Started
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer relative border-l-4 border-indigo-500"
                onClick={() => onSelectDocument?.(doc)}
              >
                {/* AI Badge */}
                <div className="absolute top-4 right-12 inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full">
                  <Zap className="w-3 h-3" />
                  AI Agent
                </div>

                {/* Delete Button */}
                <button
                  onClick={(e) => handleDeleteDocument(doc.id, e)}
                  className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  aria-label="Delete document"
                >
                  <Trash className="w-4 h-4" />
                </button>

                {/* Content */}
                <div className="pr-24 mb-3">
                  <h3 className="text-lg font-medium text-gray-900 line-clamp-2">
                    {doc.title || doc.documentType}
                  </h3>
                </div>

                {/* Metadata */}
                <div className="text-sm text-gray-500 space-y-1">
                  <div className="flex items-center gap-2">
                    <span>Created: {new Date(doc.createdAt).toLocaleDateString()}</span>
                    {doc.status === 'COMPLETE' && (
                      <span className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                        Complete
                      </span>
                    )}
                    {doc.status === 'FAILED' && (
                      <span className="inline-flex items-center px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded">
                        Failed
                      </span>
                    )}
                    {doc.status && !['COMPLETE', 'FAILED'].includes(doc.status) && (
                      <span className="inline-flex items-center px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded">
                        {doc.status}
                      </span>
                    )}
                  </div>
                  <div>{doc.wordCount?.toLocaleString() || 0} words</div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{doc.toolCallCount || 0} actions</span>
                    {doc.generationTime && (
                      <span>⚡ {formatGenerationTime(doc.generationTime)}</span>
                    )}
                    {doc.totalCost > 0 && (
                      <span>${doc.totalCost.toFixed(3)}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
