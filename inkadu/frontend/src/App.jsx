import { useState } from 'react'
import AgenticDocumentsList from './components/AgenticDocumentsList'
import AgenticDocumentWizard from './components/AgenticDocumentWizard'
import AgenticProgressMonitor from './components/AgenticProgressMonitor'
import AgenticDocumentView from './components/AgenticDocumentView'

function App() {
  const [view, setView] = useState('list') // list, wizard, progress, view
  const [selectedDocumentId, setSelectedDocumentId] = useState(null)
  const [selectedTranscriptIds, setSelectedTranscriptIds] = useState([])

  const handleStartGeneration = (transcriptIds) => {
    setSelectedTranscriptIds(transcriptIds)
    setView('wizard')
  }

  const handleGenerationStarted = (documentId) => {
    setSelectedDocumentId(documentId)
    setView('progress')
  }

  const handleViewDocument = (documentId) => {
    setSelectedDocumentId(documentId)
    setView('view')
  }

  const handleBackToList = () => {
    setView('list')
    setSelectedDocumentId(null)
    setSelectedTranscriptIds([])
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-3xl font-bold text-indigo-600">
            Inkadu
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Agentic Document Generation
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {view === 'list' && (
          <AgenticDocumentsList
            onStartGeneration={handleStartGeneration}
            onViewDocument={handleViewDocument}
          />
        )}

        {view === 'wizard' && (
          <AgenticDocumentWizard
            transcriptIds={selectedTranscriptIds}
            onClose={handleBackToList}
            onComplete={handleGenerationStarted}
          />
        )}

        {view === 'progress' && selectedDocumentId && (
          <AgenticProgressMonitor
            documentId={selectedDocumentId}
            onBack={handleBackToList}
            onComplete={() => handleViewDocument(selectedDocumentId)}
          />
        )}

        {view === 'view' && selectedDocumentId && (
          <AgenticDocumentView
            documentId={selectedDocumentId}
            onBack={handleBackToList}
          />
        )}
      </main>
    </div>
  )
}

export default App
