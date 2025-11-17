// src/v2/components/ui/DocumentGenerationWizard.jsx
import { useState, useEffect, useRef } from 'react'
import { ArrowLeftIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { useNavigation } from '../../contexts/NavigationContext'
import DocumentStructurePreview from './DocumentStructurePreview'
import TemplateSelector from './TemplateSelector'
import TemplateEditor from './TemplateEditor'
import { usePromptTemplates } from '../../hooks/usePromptTemplates'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export default function DocumentGenerationWizard({ transcriptIds, onClose }) {
  const { navigateTo, triggerRefresh } = useNavigation()

  // State
  const [stage, setStage] = useState('analyzing') // analyzing, proposals, question, preview, generating, complete, error
  const [documentId, setDocumentId] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [selectedDocType, setSelectedDocType] = useState(null)
  const [conversationHistory, setConversationHistory] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [customAnswer, setCustomAnswer] = useState('')
  const [structurePreview, setStructurePreview] = useState(null)
  const [generationStatus, setGenerationStatus] = useState(null)
  const [error, setError] = useState(null)

  // New state for custom instructions and page length
  const [customInstructions, setCustomInstructions] = useState('')
  const [pageLength, setPageLength] = useState(0) // 0 = auto, 1-10 = pages
  const [isUpdatingSuggestions, setIsUpdatingSuggestions] = useState(false)
  const [isRefiningInstructions, setIsRefiningInstructions] = useState(false)

  // Template state
  const [showTemplateSelector, setShowTemplateSelector] = useState(false)
  const [showTemplateSaveDialog, setShowTemplateSaveDialog] = useState(false)
  const { markTemplateUsed } = usePromptTemplates()

  const pollingIntervalRef = useRef(null)

  // Stage 0: Analyze transcripts on mount
  useEffect(() => {
    analyzeTranscripts()
  }, [])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [])

  const analyzeTranscripts = async () => {
    try {
      setStage('analyzing')
      setError(null)

      const response = await fetch(`${API_URL}/api/documents/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcriptIds })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to analyze transcripts' }))
        throw new Error(errorData.error || 'Failed to analyze transcripts')
      }

      const data = await response.json()
      setAnalysis(data)
      setDocumentId(data.documentId) // NEW: Store document ID
      setStage('proposals')
    } catch (err) {
      console.error('Analysis error:', err)
      setError(err.message)
      setStage('error')
    }
  }

  // Handle updating suggestions with custom instructions
  const handleUpdateSuggestions = async () => {
    try {
      setIsUpdatingSuggestions(true)
      setError(null)

      const response = await fetch(`${API_URL}/api/documents/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcriptIds,
          customInstructions: customInstructions.trim(),
          documentId // Pass existing documentId to update instead of creating new
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to update suggestions' }))
        throw new Error(errorData.error || 'Failed to update suggestions')
      }

      const data = await response.json()
      // Update analysis with new proposals, keeping same documentId
      setAnalysis(data)
      // Keep pageLength and customInstructions state as is
    } catch (err) {
      console.error('Update suggestions error:', err)
      setError(err.message)
    } finally {
      setIsUpdatingSuggestions(false)
    }
  }

  const handleRefineInstructions = async () => {
    try {
      setIsRefiningInstructions(true)
      setError(null)

      const response = await fetch(`${API_URL}/api/documents/refine-instructions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customInstructions: customInstructions.trim()
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Couldn\'t refine, please try again' }))
        throw new Error(errorData.error || 'Couldn\'t refine, please try again')
      }

      const data = await response.json()
      // Update custom instructions with refined version
      setCustomInstructions(data.refinedInstructions)
    } catch (err) {
      console.error('Refine instructions error:', err)
      setError(err.message)
    } finally {
      setIsRefiningInstructions(false)
    }
  }

  // Template handlers
  const handleLoadTemplate = async (template) => {
    setCustomInstructions(template.promptText)
    setShowTemplateSelector(false)

    // Mark template as used
    try {
      await markTemplateUsed(template.id)
    } catch (err) {
      console.error('Failed to mark template as used:', err)
    }
  }

  const handleSaveAsTemplate = () => {
    if (!customInstructions.trim()) {
      alert('Please enter some custom instructions first')
      return
    }
    setShowTemplateSaveDialog(true)
  }

  // Stage 0.5: Handle document type selection and get first question
  const handleSelectDocType = async (docType) => {
    try {
      setSelectedDocType(docType)
      setStage('loading-question')
      await getNextQuestion(docType.type, [])
    } catch (err) {
      console.error('Question error:', err)
      setError(err.message)
      setStage('error')
    }
  }

  // NEW: Get next question iteratively
  const getNextQuestion = async (documentType, history) => {
    try {
      const response = await fetch(`${API_URL}/api/documents/question-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          documentType: documentType || selectedDocType.type,
          conversationHistory: history
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to generate question' }))
        throw new Error(errorData.error || 'Failed to generate question')
      }

      const data = await response.json()

      if (data.isLastQuestion) {
        // No more questions, move to preview
        generateStructurePreview()
      } else {
        // Show this question
        setCurrentQuestion(data)
        setCurrentAnswer('')
        setCustomAnswer('')
        setStage('question')
      }
    } catch (err) {
      console.error('Question error:', err)
      setError(err.message)
      setStage('error')
    }
  }

  // Handle answering current question
  const handleAnswerQuestion = async () => {
    const finalAnswer = currentAnswer === 'Other' ? customAnswer : currentAnswer

    if (!finalAnswer) return

    const newHistory = [
      ...conversationHistory,
      {
        question: currentQuestion.question,
        answer: finalAnswer
      }
    ]

    setConversationHistory(newHistory)
    setStage('loading-question')

    // Get next question
    await getNextQuestion(null, newHistory)
  }

  // Stage 0.75: Generate structure preview
  const generateStructurePreview = async () => {
    try {
      setStage('loading-preview')

      const response = await fetch(`${API_URL}/api/documents/preview-structure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          pageLength,
          customInstructions: customInstructions.trim()
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to generate preview' }))
        throw new Error(errorData.error || 'Failed to generate preview')
      }

      const data = await response.json()
      setStructurePreview(data)
      setStage('preview')
    } catch (err) {
      console.error('Preview error:', err)
      setError(err.message)
      setStage('error')
    }
  }

  // Stage 1-4: Start generation and poll for progress
  const startGeneration = async () => {
    try {
      setStage('generating')
      setGenerationStatus({ status: 'GENERATING_OUTLINE', progress: 0, currentStage: 'Starting...' })

      const response = await fetch(`${API_URL}/api/documents/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId })
      })

      if (!response.ok) {
        throw new Error('Failed to start generation')
      }

      // Start polling for status
      startPolling()
    } catch (err) {
      console.error('Generation error:', err)
      setError(err.message)
      setStage('error')
    }
  }

  // Poll for generation status
  const startPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/api/documents/${documentId}/status`)

        if (!response.ok) {
          console.error('Failed to fetch status')
          return
        }

        const status = await response.json()
        setGenerationStatus(status)

        if (status.status === 'COMPLETE') {
          clearInterval(pollingIntervalRef.current)
          setStage('complete')

          // Refresh and close wizard after a short delay
          setTimeout(() => {
            triggerRefresh()
            onClose() // Close wizard and return to Documents page
          }, 1500)
        } else if (status.status === 'FAILED') {
          clearInterval(pollingIntervalRef.current)
          setError(status.errorMessage || 'Generation failed')
          setStage('error')
        }
      } catch (err) {
        console.error('Polling error:', err)
      }
    }, 2000) // Poll every 2 seconds
  }

  // Helper to format stage message
  const getStageMessage = (status) => {
    if (!status) return 'Initializing...'

    const { currentStage, progress } = status

    if (currentStage === 'generating_outline') {
      return 'Creating document outline...'
    } else if (currentStage?.startsWith('extracting_transcript_')) {
      const match = currentStage.match(/extracting_transcript_(\d+)_of_(\d+)/)
      if (match) {
        return `Extracting content from transcript ${match[1]} of ${match[2]}...`
      }
      return 'Extracting content from transcripts...'
    } else if (currentStage?.startsWith('synthesizing_section_')) {
      const match = currentStage.match(/synthesizing_section_(\d+)_of_(\d+)/)
      if (match) {
        return `Writing section ${match[1]} of ${match[2]}...`
      }
      return 'Synthesizing sections...'
    } else if (currentStage === 'polishing_document') {
      return 'Polishing final document...'
    } else if (currentStage === 'complete') {
      return 'Document complete!'
    }

    return currentStage || 'Processing...'
  }

  // Render functions for each stage
  const renderAnalyzing = () => (
    <div className="flex flex-col items-center justify-center h-full py-20">
      <SparklesIcon className="w-16 h-16 text-indigo-600 animate-pulse mb-6" />
      <h2 className="text-2xl font-semibold text-gray-900 mb-2">Analyzing your transcripts...</h2>
      <p className="text-gray-500">This will take a moment</p>
    </div>
  )

  const renderProposals = () => {
    if (!analysis) return null

    const pageLengthLabel = pageLength === 0
      ? 'Target Length: Off'
      : `Target Length: ${pageLength} page${pageLength > 1 ? 's' : ''} (~${pageLength * 600} words)`

    return (
      <div className="py-8">
        {/* Transcript Analysis Summary */}
        <p className="text-gray-600 mb-6">{analysis.analysis_summary}</p>

        {/* Custom Instructions Textarea */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="customInstructions" className="block text-sm font-medium text-gray-700">
              Custom Instructions (optional)
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setShowTemplateSelector(true)}
                className="text-sm px-4 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-1"
              >
                <span>📋</span>
                Load Instruction
              </button>
              <button
                onClick={handleSaveAsTemplate}
                disabled={!customInstructions.trim()}
                className="text-sm px-4 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
              >
                <span>💾</span>
                Save as Instruction
              </button>
              <button
                onClick={handleRefineInstructions}
                disabled={!customInstructions.trim() || isRefiningInstructions}
                className="text-sm px-4 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
              >
                <span>✨</span>
                {isRefiningInstructions ? 'Refining...' : 'Refine Instructions'}
              </button>
            </div>
          </div>
          <textarea
            id="customInstructions"
            rows={4}
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            placeholder="Describe the document you want to create... (e.g., 'I want a trader's handbook focused on yield curve indicators')"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
          />
          <button
            onClick={handleUpdateSuggestions}
            disabled={!customInstructions.trim() || isUpdatingSuggestions}
            className="mt-3 px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isUpdatingSuggestions ? 'Updating...' : 'Update Suggestions'}
          </button>
        </div>

        {/* Page Length Slider */}
        <div className="mb-8 bg-gray-50 border border-gray-200 rounded-lg p-5">
          <label htmlFor="pageLength" className="block text-sm font-medium text-gray-700 mb-3">
            {pageLengthLabel}
          </label>
          <input
            id="pageLength"
            type="range"
            min="0"
            max="10"
            value={pageLength}
            onChange={(e) => setPageLength(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>Auto</span>
            <span>1</span>
            <span>2</span>
            <span>3</span>
            <span>4</span>
            <span>5</span>
            <span>6</span>
            <span>7</span>
            <span>8</span>
            <span>9</span>
            <span>10</span>
          </div>
        </div>

        {/* Document Type Selection */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Choose a Document Type
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {analysis.proposed_documents?.map((doc, index) => (
            <div
              key={index}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer"
              onClick={() => handleSelectDocType(doc)}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-xl font-semibold text-gray-900">{doc.type}</h3>
                <button
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSelectDocType(doc)
                  }}
                >
                  Select This Type
                </button>
              </div>
              <p className="text-gray-700 mb-3">{doc.description}</p>
              <div className="pt-3 border-t border-gray-100">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Why this works:</span> {doc.rationale}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderQuestion = () => {
    if (!currentQuestion) return null

    const hasAnswered = currentAnswer !== ''

    return (
      <div className="py-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            {selectedDocType.type}
          </h2>
          <p className="text-gray-600">Let's customize your document</p>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Question {conversationHistory.length + 1}</span>
            <span>{conversationHistory.length > 0 && `${conversationHistory.length} answered`}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min((conversationHistory.length + 1) * 25, 100)}%` }}
            />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-8 mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-6">
            {currentQuestion.question}
          </h3>

          <div className="space-y-3">
            {currentQuestion.options?.map((option, index) => (
              <label
                key={index}
                className="flex items-start p-4 border border-gray-200 rounded-md hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <input
                  type="radio"
                  name="current-question"
                  value={option}
                  checked={currentAnswer === option}
                  onChange={(e) => setCurrentAnswer(e.target.value)}
                  className="mt-1 w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                />
                <span className="ml-3 text-gray-700">{option}</span>
              </label>
            ))}
          </div>

          {currentAnswer === 'Other' && (
            <div className="mt-4">
              <input
                type="text"
                placeholder="Please specify..."
                value={customAnswer}
                onChange={(e) => setCustomAnswer(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          )}
        </div>

        <div className="flex justify-between items-center">
          <button
            onClick={() => setStage('proposals')}
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Back
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setStage('loading-preview')
                generateStructurePreview()
              }}
              className="px-6 py-2 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Skip to Preview →
            </button>
            <button
              onClick={handleAnswerQuestion}
              disabled={!hasAnswered || (currentAnswer === 'Other' && !customAnswer)}
              className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderGenerating = () => {
    const progress = generationStatus?.progress || 0
    const message = getStageMessage(generationStatus)

    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <div className="w-full max-w-md">
          {/* Progress Circle */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  className="text-gray-200"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 56}`}
                  strokeDashoffset={`${2 * Math.PI * 56 * (1 - progress / 100)}`}
                  className="text-indigo-600 transition-all duration-500"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-gray-900">{progress}%</span>
              </div>
            </div>
          </div>

          {/* Status Message */}
          <h2 className="text-2xl font-semibold text-gray-900 mb-2 text-center">
            Generating your document...
          </h2>
          <p className="text-gray-500 text-center mb-6">{message}</p>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="text-sm text-gray-400 text-center">
            This may take 5-10 minutes depending on content complexity
          </div>
        </div>
      </div>
    )
  }

  const renderComplete = () => (
    <div className="flex flex-col items-center justify-center h-full py-20">
      <div className="text-green-600 text-6xl mb-6">✓</div>
      <h2 className="text-2xl font-semibold text-gray-900 mb-2">Document Complete!</h2>
      <p className="text-gray-500 mb-4">Redirecting you to the document...</p>
    </div>
  )

  const renderError = () => {
    // Determine specific error message based on stage and generation status
    let errorTitle = 'Document Generation Failed'
    let errorExplanation = error
    let canRetry = true

    if (stage === 'error' && generationStatus) {
      const status = generationStatus.status

      if (status === 'FAILED' || generationStatus.currentStage) {
        const currentStage = generationStatus.currentStage || 'unknown'

        if (currentStage.includes('generating_outline')) {
          errorTitle = 'Outline Generation Failed'
          errorExplanation = 'The AI was unable to create a valid document outline. This usually happens when the transcript content is unclear or the response format was invalid.'
        } else if (currentStage.includes('extracting')) {
          errorTitle = 'Content Extraction Failed'
          errorExplanation = 'The AI encountered an error while extracting relevant content from your transcripts.'
        } else if (currentStage.includes('synthesizing')) {
          errorTitle = 'Section Synthesis Failed'
          errorExplanation = 'The AI had trouble writing one of the document sections. This may be due to insufficient extracted content or complexity.'
        } else if (currentStage.includes('polishing')) {
          errorTitle = 'Document Polishing Failed'
          errorExplanation = 'The AI encountered an error during the final polish stage.'
        }
      }
    } else if (stage === 'error' && !generationStatus) {
      // Error occurred before generation started
      if (error?.includes('analyze')) {
        errorTitle = 'Analysis Failed'
        errorExplanation = 'Unable to analyze your transcripts. Please check that the transcripts contain valid content.'
      } else if (error?.includes('question')) {
        errorTitle = 'Question Generation Failed'
        errorExplanation = 'The AI was unable to generate the next question for customization.'
      } else if (error?.includes('preview')) {
        errorTitle = 'Preview Generation Failed'
        errorExplanation = 'The AI was unable to generate a structure preview. This may indicate an issue with your answers or transcript content.'
      }
    }

    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <div className="text-red-600 text-6xl mb-6">⚠️</div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-3">{errorTitle}</h2>
        <p className="text-gray-700 mb-2 max-w-lg text-center">{errorExplanation}</p>

        {/* Show technical error if available */}
        {error && (
          <div className="mt-4 mb-6 max-w-2xl">
            <details className="bg-red-50 border border-red-200 rounded-md p-4">
              <summary className="text-sm font-medium text-red-900 cursor-pointer hover:text-red-700">
                Technical Details
              </summary>
              <p className="text-xs text-red-800 mt-2 font-mono break-words">{error}</p>
            </details>
          </div>
        )}

        <div className="flex gap-4 mt-4">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Go Back
          </button>
          {canRetry && (
            <button
              onClick={() => {
                setError(null)
                setGenerationStatus(null)
                analyzeTranscripts()
              }}
              className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
            >
              Try Again
            </button>
          )}
        </div>

        {/* Helpful suggestions */}
        <div className="mt-8 max-w-lg bg-blue-50 border border-blue-200 rounded-md p-4">
          <p className="text-sm text-blue-900">
            <span className="font-semibold">Suggestions:</span>
          </p>
          <ul className="text-sm text-blue-800 mt-2 space-y-1 list-disc list-inside">
            <li>Ensure your transcripts contain substantial content</li>
            <li>Try selecting different transcripts or fewer at once</li>
            <li>If the issue persists, try a different document type</li>
          </ul>
        </div>
      </div>
    )
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
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Generate Document from {transcriptIds.length} Transcripts
            </h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6">
        <div className="max-w-5xl mx-auto">
          {stage === 'analyzing' && renderAnalyzing()}
          {stage === 'proposals' && renderProposals()}
          {stage === 'loading-question' && renderAnalyzing()}
          {stage === 'question' && renderQuestion()}
          {stage === 'loading-preview' && renderAnalyzing()}
          {stage === 'preview' && structurePreview && (
            <DocumentStructurePreview
              structure={structurePreview}
              onApprove={startGeneration}
              onBack={() => setStage('question')}
            />
          )}
          {stage === 'generating' && renderGenerating()}
          {stage === 'complete' && renderComplete()}
          {stage === 'error' && renderError()}
        </div>
      </div>

      {/* Template Selector Modal */}
      {showTemplateSelector && (
        <TemplateSelector
          onSelect={handleLoadTemplate}
          onClose={() => setShowTemplateSelector(false)}
        />
      )}

      {/* Template Save Dialog */}
      {showTemplateSaveDialog && (
        <TemplateEditor
          template={{
            name: '',
            description: '',
            promptText: customInstructions,
            category: []
          }}
          onClose={() => setShowTemplateSaveDialog(false)}
        />
      )}
    </div>
  )
}
