// src/v2/components/ui/DocumentView.jsx
import { useState, useEffect } from 'react'
import { ArrowLeftIcon, ArrowDownTrayIcon, ArrowPathIcon, TrashIcon } from '@heroicons/react/24/outline'
import MarkdownMessage from './MarkdownMessage'

export default function DocumentView({ documentId, onClose }) {
  const [document, setDocument] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDocument()
  }, [documentId])

  const fetchDocument = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
      const response = await fetch(`${API_URL}/api/documents/${documentId}`)
      if (!response.ok) throw new Error('Failed to fetch document')
      const data = await response.json()
      setDocument(data)
    } catch (error) {
      console.error('Error fetching document:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading document...</div>
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

  const handleDownload = async (format) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
      const response = await fetch(`${API_URL}/api/documents/${documentId}/download/${format}`)

      if (!response.ok) {
        throw new Error('Download failed')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${document.title.replace(/[^a-z0-9]/gi, '_')}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Download error:', error)
      alert('Failed to download document')
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this document?')) return

    try {
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
      const response = await fetch(`${API_URL}/api/documents/${documentId}`, {
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

  const handleRegenerate = async () => {
    if (!confirm('This will regenerate the document with the same settings. Continue?')) return

    try {
      setLoading(true)
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
      const response = await fetch(`${API_URL}/api/documents/${documentId}/regenerate`, {
        method: 'PUT'
      })

      if (!response.ok) {
        throw new Error('Regenerate failed')
      }

      const updated = await response.json()
      setDocument(updated)
      setLoading(false)
    } catch (error) {
      console.error('Regenerate error:', error)
      alert('Failed to regenerate document')
      setLoading(false)
    }
  }

  return (
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
            <h1 className="text-xl font-semibold text-gray-900">{document.title}</h1>
            <p className="text-sm text-gray-500">
              Created {new Date(document.createdAt).toLocaleDateString()} • {document.wordCount?.toLocaleString() || 0} words
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDownload('md')}
              className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              Download
            </button>
            <button
              onClick={handleRegenerate}
              className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Regenerate
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
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-8">
          <MarkdownMessage content={document.content} />
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
      </div>
    </div>
  )
}
