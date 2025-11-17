// src/v2/components/ui/AgenticDocumentWizard.jsx
import { useState, useEffect } from 'react'
import { ArrowLeftIcon, SparklesIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import AgenticProgressMonitor from './AgenticProgressMonitor'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export default function AgenticDocumentWizard({ transcriptIds = [], onClose, onComplete }) {
  const [stage, setStage] = useState('configure') // configure, generating, complete, error
  const [documentId, setDocumentId] = useState(null)
  const [error, setError] = useState(null)

  // Configuration state
  const [selectedTranscripts, setSelectedTranscripts] = useState([])
  const [availableTranscripts, setAvailableTranscripts] = useState([])
  const [documentType, setDocumentType] = useState('')
  const [customInstructions, setCustomInstructions] = useState('')
  const [tone, setTone] = useState('professional')
  const [depth, setDepth] = useState('detailed')
  const [audience, setAudience] = useState('')
  const [variantId, setVariantId] = useState('scalable')
  const [availableVariants, setAvailableVariants] = useState([])
  const [recommendedVariant, setRecommendedVariant] = useState(null)

  // Filtering state
  const [channelFilter, setChannelFilter] = useState(null) // null = show all channels

  // Load transcripts if not provided via props
  useEffect(() => {
    if (transcriptIds && transcriptIds.length > 0) {
      // Transcripts selected from outside (e.g., TranscriptList)
      fetchTranscriptDetails(transcriptIds)
    } else {
      // Load all available transcripts for selection
      fetchAllTranscripts()
    }

    // Load available variants
    fetchVariants()
  }, [transcriptIds])

  // Update recommended variant when transcript count changes
  useEffect(() => {
    if (selectedTranscripts.length > 0 && availableVariants.length > 0) {
      fetchVariants(selectedTranscripts.length)
    }
  }, [selectedTranscripts.length])

  const fetchTranscriptDetails = async (ids) => {
    try {
      const response = await fetch(`${API_URL}/api/transcripts`)
      if (!response.ok) throw new Error('Failed to fetch transcripts')
      const allTranscripts = await response.json()
      const selected = allTranscripts.filter(t => ids.includes(t.id))
      setSelectedTranscripts(selected)
      setAvailableTranscripts(allTranscripts)
    } catch (err) {
      console.error('Error fetching transcript details:', err)
      setError('Failed to load transcripts')
    }
  }

  const fetchAllTranscripts = async () => {
    try {
      const response = await fetch(`${API_URL}/api/transcripts`)
      if (!response.ok) throw new Error('Failed to fetch transcripts')
      const transcripts = await response.json()
      setAvailableTranscripts(transcripts)
    } catch (err) {
      console.error('Error fetching transcripts:', err)
      setError('Failed to load transcripts')
    }
  }

  const fetchVariants = async (transcriptCount = null) => {
    try {
      const url = transcriptCount
        ? `${API_URL}/api/agent-documents/variants?transcriptCount=${transcriptCount}`
        : `${API_URL}/api/agent-documents/variants`

      const response = await fetch(url)
      if (!response.ok) throw new Error('Failed to fetch variants')

      const data = await response.json()
      setAvailableVariants(data.variants)

      if (data.recommendation) {
        setRecommendedVariant(data.recommendation)
      }
    } catch (err) {
      console.error('Error fetching variants:', err)
      // Don't show error to user - variant selection is optional
    }
  }

  const handleToggleTranscript = (transcript) => {
    if (selectedTranscripts.find(t => t.id === transcript.id)) {
      setSelectedTranscripts(selectedTranscripts.filter(t => t.id !== transcript.id))
    } else {
      // Get max transcripts for selected variant
      const selectedVariant = availableVariants.find(v => v.id === variantId)
      const maxTranscripts = selectedVariant?.maxTranscripts || 50

      if (selectedTranscripts.length >= maxTranscripts) {
        alert(`Maximum ${maxTranscripts} transcripts allowed for ${selectedVariant?.name || 'selected variant'}`)
        return
      }
      setSelectedTranscripts([...selectedTranscripts, transcript])
    }
  }

  // Get unique channels from available transcripts
  const getUniqueChannels = () => {
    const channels = [...new Set(availableTranscripts.map(t => t.channel).filter(Boolean))]
    return channels.sort()
  }

  // Get filtered transcripts based on channel filter
  const getFilteredTranscripts = () => {
    if (!channelFilter) return availableTranscripts
    return availableTranscripts.filter(t => t.channel === channelFilter)
  }

  // Select all filtered transcripts (up to variant limit)
  const handleSelectAll = () => {
    const selectedVariant = availableVariants.find(v => v.id === variantId)
    const maxTranscripts = selectedVariant?.maxTranscripts || 50

    const filteredTranscripts = getFilteredTranscripts()
    const unselectedFiltered = filteredTranscripts.filter(
      t => !selectedTranscripts.find(st => st.id === t.id)
    )

    const availableSlots = maxTranscripts - selectedTranscripts.length

    if (availableSlots <= 0) {
      alert(`Already at maximum ${maxTranscripts} transcripts for ${selectedVariant?.name || 'selected variant'}`)
      return
    }

    const toSelect = unselectedFiltered.slice(0, availableSlots)

    if (toSelect.length < unselectedFiltered.length) {
      alert(`Selected ${toSelect.length} transcripts. Maximum limit is ${maxTranscripts}. ${unselectedFiltered.length - toSelect.length} transcripts were not selected.`)
    }

    setSelectedTranscripts([...selectedTranscripts, ...toSelect])
  }

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedTranscripts([])
  }

  const handleStartGeneration = async () => {
    if (selectedTranscripts.length === 0) {
      alert('Please select at least one transcript')
      return
    }

    if (!documentType.trim()) {
      alert('Please enter a document type')
      return
    }

    try {
      setStage('generating')
      setError(null)

      const preferences = {
        tone,
        depth,
        ...(audience.trim() && { audience: audience.trim() }),
        ...(customInstructions.trim() && { customInstructions: customInstructions.trim() })
      }

      const response = await fetch(`${API_URL}/api/agent-documents/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcriptIds: selectedTranscripts.map(t => t.id),
          documentType: documentType.trim(),
          preferences,
          variantId
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to start generation' }))
        throw new Error(errorData.error || 'Failed to start generation')
      }

      const data = await response.json()
      setDocumentId(data.documentId)
    } catch (err) {
      console.error('Generation error:', err)
      setError(err.message)
      setStage('error')
    }
  }

  const handleGenerationComplete = () => {
    setStage('complete')
  }

  const handleGenerationError = (errorMessage) => {
    setError(errorMessage)
    setStage('error')
  }

  const renderConfigure = () => (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
          </button>
          <SparklesIcon className="w-7 h-7 text-indigo-600" />
          <h1 className="text-2xl font-semibold text-gray-900">AI Document Generation</h1>
        </div>
        <p className="mt-2 ml-14 text-sm text-gray-600">
          The AI agent will autonomously generate a document from your selected transcripts
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Transcript Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Select Transcripts ({selectedTranscripts.length}/{availableVariants.find(v => v.id === variantId)?.maxTranscripts || 50})
            </h2>

            {availableTranscripts.length === 0 ? (
              <div className="text-sm text-gray-500">No transcripts available</div>
            ) : (
              <>
                {/* Filter Bar */}
                <div className="mb-4 space-y-3">
                  {/* Channel Filter & Actions */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Channel Dropdown */}
                    <div className="flex-1 min-w-[200px]">
                      <select
                        value={channelFilter || ''}
                        onChange={(e) => setChannelFilter(e.target.value || null)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                      >
                        <option value="">All Channels</option>
                        {getUniqueChannels().map(channel => (
                          <option key={channel} value={channel}>
                            {channel}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleSelectAll}
                        className="px-3 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors"
                      >
                        Select All
                      </button>
                      <button
                        onClick={handleClearSelection}
                        disabled={selectedTranscripts.length === 0}
                        className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Filter Stats */}
                  <div className="text-xs text-gray-500">
                    {availableTranscripts.length} transcripts available
                    {channelFilter && ` • ${getFilteredTranscripts().length} matching "${channelFilter}"`}
                    {selectedTranscripts.length > 0 && ` • ${selectedTranscripts.length} selected`}
                  </div>
                </div>

                {/* Transcript List */}
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {getFilteredTranscripts().length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-4">
                      No transcripts from {channelFilter}
                    </div>
                  ) : (
                    getFilteredTranscripts().map(transcript => (
                      <label
                        key={transcript.id}
                        className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTranscripts.find(t => t.id === transcript.id) !== undefined}
                          onChange={() => handleToggleTranscript(transcript)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">{transcript.title}</div>
                          <div className="text-xs text-gray-500">{transcript.channel}</div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Document Configuration */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Document Configuration</h2>

            {/* Document Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Document Type *
              </label>
              <input
                type="text"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                placeholder="e.g., Meal Planner, Investment Guide, Recipe Collection..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                A short name for this document type
              </p>
            </div>

            {/* Custom Instructions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Custom Instructions (optional)
              </label>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                rows={8}
                placeholder="Provide specific requirements for your document structure, sections, tone, or format...

Example:
- Create a weekly meal plan
- Include breakfast, lunch, dinner, and snacks
- Provide shopping list organized by category
- Include prep time and serving sizes"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Detailed guidance for the AI agent - specify structure, sections, format, or any special requirements
              </p>
            </div>

            {/* Tone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tone
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="casual">Casual</option>
                <option value="professional">Professional</option>
                <option value="academic">Academic</option>
                <option value="conversational">Conversational</option>
              </select>
            </div>

            {/* Depth */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Depth
              </label>
              <select
                value={depth}
                onChange={(e) => setDepth(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="concise">Concise</option>
                <option value="detailed">Detailed</option>
                <option value="comprehensive">Comprehensive</option>
              </select>
            </div>

            {/* Audience */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Audience (optional)
              </label>
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g., beginners, practitioners, experts..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Variant Selection (A/B Testing) */}
            {availableVariants.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Generation Strategy
                  {recommendedVariant && (
                    <span className="ml-2 text-xs text-indigo-600 font-normal">
                      (Recommended: {availableVariants.find(v => v.id === recommendedVariant)?.name})
                    </span>
                  )}
                </label>
                <select
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {availableVariants.map(variant => (
                    <option key={variant.id} value={variant.id}>
                      {variant.name} (max {variant.maxTranscripts} transcripts)
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {availableVariants.find(v => v.id === variantId)?.description}
                </p>
              </div>
            )}
          </div>

          {/* Generate Button */}
          <button
            onClick={handleStartGeneration}
            disabled={selectedTranscripts.length === 0 || !documentType.trim()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <SparklesIcon className="w-5 h-5" />
            Generate with AI Agent
          </button>
        </div>
      </div>
    </div>
  )

  const renderComplete = () => (
    <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-6">
      <div className="max-w-md text-center space-y-6">
        <CheckCircleIcon className="w-20 h-20 text-green-500 mx-auto" />
        <h2 className="text-2xl font-bold text-gray-900">Document Generated!</h2>
        <p className="text-gray-600">
          Your AI agent has successfully generated the document.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => onComplete?.(documentId)}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
          >
            View Document
          </button>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )

  const renderError = () => (
    <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-6">
      <div className="max-w-md text-center space-y-6">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <span className="text-4xl">⚠️</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Generation Failed</h2>
        <p className="text-gray-600">{error}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => setStage('configure')}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )

  if (stage === 'configure') return renderConfigure()
  if (stage === 'generating') return (
    <AgenticProgressMonitor
      documentId={documentId}
      onComplete={handleGenerationComplete}
      onError={handleGenerationError}
      onClose={onClose}
    />
  )
  if (stage === 'complete') return renderComplete()
  if (stage === 'error') return renderError()

  return null
}
