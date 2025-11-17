// src/v2/components/ui/DocumentsList.jsx
import { useState, useEffect } from 'react'
import { useNavigation } from '../../contexts/NavigationContext'
import { PlusIcon } from '@heroicons/react/24/outline'
import { Trash } from 'lucide-react'

export default function DocumentsList({ onSelectDocument }) {
  const { navigateTo } = useNavigation()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDocuments()
  }, [])

  const fetchDocuments = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
      const response = await fetch(`${API_URL}/api/documents`)
      if (!response.ok) throw new Error('Failed to fetch documents')
      const data = await response.json()
      setDocuments(data)
    } catch (error) {
      console.error('Error fetching documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteDocument = async (documentId, e) => {
    // Stop event propagation to prevent card click
    e.stopPropagation()

    if (!window.confirm('Are you sure you want to delete this document?')) return

    try {
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
      const response = await fetch(`${API_URL}/api/documents/${documentId}`, {
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

  const handleNewDocument = () => {
    // Redirect to Transcripts page
    navigateTo('Transcripts')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading documents...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Documents</h1>
          <button
            onClick={handleNewDocument}
            className="inline-flex items-center gap-x-2 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
            New Document
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {documents.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-500 mb-4">No documents yet</div>
            <p className="text-sm text-gray-400 mb-4">
              Create your first document by selecting transcripts
            </p>
            <button
              onClick={handleNewDocument}
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
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer relative"
                onClick={() => onSelectDocument?.(doc)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-medium text-gray-900 pr-8">
                    {doc.title}
                  </h3>
                  <button
                    onClick={(e) => handleDeleteDocument(doc.id, e)}
                    className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    aria-label="Delete document"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-sm text-gray-500 space-y-1">
                  <div>Created: {new Date(doc.createdAt).toLocaleDateString()}</div>
                  <div>{doc.wordCount?.toLocaleString() || 0} words • From {doc.transcriptCount || 0} transcripts</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
