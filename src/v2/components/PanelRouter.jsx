// src/v2/components/PanelRouter.jsx
import { useState } from 'react'
import { useNavigation } from '../contexts/NavigationContext'
import { useImport } from '../hooks/useImport'
import { useAI } from '../hooks/useAI'
import { useInsight } from '../hooks/useInsight'
import { DndContext } from '@dnd-kit/core'

// Import all panels
import CombinedImportPanel from './ui/CombinedImportPanel'
import TranscriptList from './ui/TranscriptList'
import TranscriptViewer from './ui/TranscriptViewer'
import SummaryPanel from './ui/SummaryPanel'
import ChatPanel from './ui/ChatPanel'
import PromptDeck from './ui/PromptDeck'
import SourceContextPanel from './ui/SourceContextPanel'
import InsightBuilder from './ui/InsightBuilder'
import InsightList from './ui/InsightList'
import InsightViewer from './ui/InsightViewer'
import DocumentsList from './ui/DocumentsList'
import DocumentView from './ui/DocumentView'
import DocumentGenerationWizard from './ui/DocumentGenerationWizard'
import SettingsPanel from './ui/SettingsPanel'
import YouTubeSearchPanel from './ui/YouTubeSearchPanel'
import QueuesPanel from './ui/QueuesPanel'
import TemplateLibrary from './ui/TemplateLibrary'
import AgenticDocumentsList from './ui/AgenticDocumentsList'
import AgenticDocumentWizard from './ui/AgenticDocumentWizard'
import AgenticDocumentView from './ui/AgenticDocumentView'

export default function PanelRouter() {
  const {
    page,
    tab,
    setPage,
    setTab,
    navigateTo,
    selectedInsight,
    setSelectedInsight,
    selectedTranscript,
    handleSelectTranscript,
    handleDeleteTranscript,
    wizardTranscriptIds,
    setWizardTranscriptIds,
    triggerRefresh,
    refreshKey
  } = useNavigation()
  const [editingInsightForChat, setEditingInsightForChat] = useState(null)
  const [viewMode, setViewMode] = useState('transcript') // 'transcript' or 'summary'
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [selectedAgentDocument, setSelectedAgentDocument] = useState(null)
  const [agentWizardTranscriptIds, setAgentWizardTranscriptIds] = useState([])
  const { importing, importYoutube } = useImport()
  const { aiSuggestions, generateAISuggestions } = useAI()
  const { 
    selectedSuggestion, 
    autoCapturedContent, 
    handleShowSource, 
    handleCaptureInsight,
    clearAutoCapturedContent 
  } = useInsight()

  /* Navigation handlers */
  const handleOpenViewer = async (transcriptId) => {
    await handleSelectTranscript(transcriptId)
    setViewMode('transcript')
    setPage('Transcripts')
    setTab('viewer') // Set tab to indicate we're in viewer mode
  }

  const handleOpenSummary = async (transcriptId) => {
    await handleSelectTranscript(transcriptId)
    setViewMode('summary')
    setPage('Transcripts')
    setTab('viewer') // Set tab to indicate we're in viewer mode
  }

  const handleOpenChat = async (transcriptId) => {
    await handleSelectTranscript(transcriptId)
    setPage('Chat')
  }

  /* Wrapper functions */
  const handleImportYoutube = async (url) => {
    await importYoutube(url, triggerRefresh)
  }

  const handleGenerateAISuggestions = async (chatSoFar) => {
    await generateAISuggestions(chatSoFar, selectedTranscript)
  }

  const handleShowSourceWithNav = (suggestion) => {
    handleShowSource(suggestion, navigateTo)
  }

  const handleCaptureInsightWithNav = (content) => {
    // If we're on the Chat page, don't navigate - just capture the content
    if (page === 'Chat') {
      handleCaptureInsight(content, null) // Pass null to prevent navigation
    } else {
      handleCaptureInsight(content, navigateTo) // Navigate to Insights page from other pages
    }
  }

  /* Component router */
  // Clear editing insight when not on Chat page
  if (page !== 'Chat' && editingInsightForChat) {
    setEditingInsightForChat(null)
  }
  
  // Handle pages without tabs (Import, Transcripts)
  if (page === 'Import') {
    return (
      <CombinedImportPanel
        onDone={triggerRefresh}
        isImporting={importing}
        importYoutube={handleImportYoutube}
      />
    )
  }

  if (page === 'YouTube Search') {
    return <YouTubeSearchPanel />
  }

  if (page === 'Queues') {
    return <QueuesPanel />
  }

  if (page === 'Transcripts') {
    // Show TranscriptViewer if a transcript is selected AND we came from within the transcript flow
    // But always show TranscriptList when directly navigating to Transcripts page
    if (selectedTranscript?.id && tab === 'viewer') {
      return (
        <TranscriptViewer
          transcriptId={selectedTranscript.id}
          initialViewMode={viewMode}
          onClose={() => {
            handleSelectTranscript(null)
            setTab(null) // Clear the tab to return to list view
          }}
        />
      )
    } else {
      // Always show TranscriptList when not in viewer mode
      return (
        <TranscriptList
          key={refreshKey}
          onOpenViewer={handleOpenViewer}
          onOpenSummary={handleOpenSummary}
          onChat={handleOpenChat}
          onDelete={handleDeleteTranscript}
        />
      )
    }
  }

  if (page === 'Insights') {
    // Show InsightViewer if an insight is selected, otherwise show InsightList
    if (selectedInsight?.id) {
      return (
        <InsightViewer
          insight={selectedInsight}
          onClose={() => setSelectedInsight(null)}
          onEdit={async (insight) => {
            // Navigate to Chat and load the insight for editing
            try {
              // Try to find a transcript that matches this insight's channel
              const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
              const transcripts = await fetch(`${API_URL}/api/transcripts`).then(r => r.json())
              const matchingTranscript = transcripts.find(t => t.channel === insight.channel)
              
              if (matchingTranscript) {
                // Load the matching transcript
                await handleSelectTranscript(matchingTranscript.id)
              }
              
              // Clear insight selection and navigate to Chat
              setSelectedInsight(null)
              navigateTo('Chat')
              
              // Load the insight for editing by setting it as the editing insight
              // We'll need to modify the InsightBuilder call to handle this
              setEditingInsightForChat(insight)
            } catch (error) {
              console.error('Failed to load transcript for editing:', error)
              // Even if transcript loading fails, still navigate to Chat for editing
              setSelectedInsight(null)
              navigateTo('Chat')
              setEditingInsightForChat(insight)
            }
          }}
        />
      )
    } else {
      return (
        <InsightList
          onSelectInsight={(insight) => setSelectedInsight(insight)}
          onClose={() => {}}
        />
      )
    }
  }

  if (page === 'Chat') {
    // Drag handler for text transfer from Chat to InsightBuilder
    const handleDragEnd = (event) => {
      const { active, over } = event
      console.log('🎯 handleDragEnd called!')
      console.log('🎯 active:', active)
      console.log('🎯 over:', over)
      console.log('🎯 over?.id:', over?.id)

      // Check if dropped over the insight editor
      if (over?.id === 'insight-editor-dropzone' && active?.data?.current?.text) {
        const droppedText = active.data.current.text
        console.log('Text dropped on insight editor:', droppedText)
        console.log('🔍 selectedTranscript:', selectedTranscript)

        // Use the existing insight capture mechanism to transfer the text
        const captureData = {
          content: droppedText,
          source: 'chat_drag_drop',
          timestamp: Date.now(),
          transcript: selectedTranscript
        }
        console.log('🔍 Calling handleCaptureInsightWithNav with:', captureData)
        handleCaptureInsightWithNav(captureData)
      }
    }

    // Show Chat panel directly - no tabs
    return (
      <DndContext onDragEnd={handleDragEnd}>
      <div 
        style={{ 
          display: 'flex', 
          height: '100%', // Take full available height from parent
          width: '100%', 
          overflow: 'hidden' // Prevent container from growing
        }}
      >
        {/* Left Column - Chat Panel */}
        <div style={{ 
          width: '50%', 
          borderRight: '1px solid #e5e7eb', 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100%',
          overflow: 'hidden' // Prevent this column from expanding
        }}>
          {/* Fixed PromptDeck at top */}
          <div style={{ flexShrink: 0, borderBottom: '1px solid #e5e7eb', width: '100%' }}>
            <PromptDeck
              transcript={selectedTranscript}
              aiSuggestions={aiSuggestions}
              onShowSource={handleShowSourceWithNav}
              onClose={() => {}}
            />
          </div>
          
          {/* Scrollable ChatPanel in middle - constrained height */}
          <div style={{ 
            flex: 1, 
            width: '100%', 
            height: 0, // Force flexbox to respect flex: 1
            overflow: 'hidden' // Let ChatPanel handle its own scrolling
          }}>
            <ChatPanel
              transcript={selectedTranscript}
              onClose={() => {}}
              onSuggestPrompts={handleGenerateAISuggestions}
              onCaptureInsight={handleCaptureInsightWithNav}
              aiSuggestions={aiSuggestions}
            />
          </div>
        </div>
        
        {/* Right Column - Insight Builder */}
        <div style={{ 
          width: '50%', 
          height: '100%',
        }}>
          <InsightBuilder
            key="chat-insight-builder"
            transcript={selectedTranscript}
            autoCapturedContent={autoCapturedContent}
            editingInsight={editingInsightForChat}
            onClose={() => {
              clearAutoCapturedContent()
              setEditingInsightForChat(null)
            }}
            onSaved={() => {
              setEditingInsightForChat(null)
            }}
          />
        </div>
      </div>
      </DndContext>
    )
  }

  if (page === 'Custom Instructions') {
    return <TemplateLibrary />
  }

  if (page === 'Settings') {
    return <SettingsPanel />
  }

  if (page === 'Documents') {
    // Show wizard if tab is 'wizard' and we have transcript IDs
    if (tab === 'wizard' && wizardTranscriptIds.length > 0) {
      return (
        <DocumentGenerationWizard
          transcriptIds={wizardTranscriptIds}
          onClose={() => {
            setWizardTranscriptIds([])
            setTab(null)
          }}
        />
      )
    }

    // Show DocumentView if a document is selected, otherwise show DocumentsList
    if (selectedDocument?.id) {
      return (
        <DocumentView
          documentId={selectedDocument.id}
          onClose={() => setSelectedDocument(null)}
        />
      )
    } else {
      return (
        <DocumentsList
          key={refreshKey}
          onSelectDocument={(doc) => setSelectedDocument(doc)}
        />
      )
    }
  }

  if (page === 'AI Documents') {
    // Show wizard if tab is 'wizard'
    if (tab === 'wizard') {
      return (
        <AgenticDocumentWizard
          transcriptIds={agentWizardTranscriptIds}
          onClose={() => {
            setAgentWizardTranscriptIds([])
            setTab(null)
          }}
          onComplete={(documentId) => {
            setAgentWizardTranscriptIds([])
            setTab(null)
            setSelectedAgentDocument({ id: documentId })
          }}
        />
      )
    }

    // Show AgenticDocumentView if a document is selected, otherwise show AgenticDocumentsList
    if (selectedAgentDocument?.id) {
      return (
        <AgenticDocumentView
          documentId={selectedAgentDocument.id}
          onClose={() => setSelectedAgentDocument(null)}
        />
      )
    } else {
      return (
        <AgenticDocumentsList
          key={refreshKey}
          onSelectDocument={(doc) => setSelectedAgentDocument(doc)}
          onNewDocument={() => {
            setTab('wizard')
          }}
        />
      )
    }
  }

  // No more tab-based routing needed for Insights
  return <div className="text-sm text-gray-500">Page not found</div>
}