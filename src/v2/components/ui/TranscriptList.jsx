/*  src/v2/components/ui/TranscriptList.jsx
    --------------------------------------------------------------
    Row click (or right-arrow click) → onOpenViewer(id)
    Chat button                    → onChat(id)
    3-dot menu                     → onDelete(id)
*/

import { useEffect, useState, useMemo } from 'react'
import { YoutubeIcon, RssIcon, ImageIcon, MessageSquareIcon, FileTextIcon, ScrollTextIcon, TrashIcon, FileStack } from 'lucide-react'
import { Label, Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { ChevronUpDownIcon } from '@heroicons/react/16/solid'
import { CheckIcon } from '@heroicons/react/20/solid'
import { useNavigation } from '../../contexts/NavigationContext'
import { useChannelAvatars } from '../../hooks/useChannelAvatars'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export default function TranscriptList({
  onOpenViewer,   // (id) => parent sets selected + jumps to viewer tab
  onOpenSummary = () => {},  // (id) => parent sets selected + jumps to viewer tab in summary mode
  onChat = () => {},
  onDelete = () => {},
}) {
  const { navigateTo, setWizardTranscriptIds, setTab } = useNavigation()
  const [rows, setRows] = useState([])
  const [selectedChannelId, setSelectedChannelId] = useState('all')
  const [selectedSourceId, setSelectedSourceId] = useState('all')
  const [selectedIds, setSelectedIds] = useState([])
  const [showSelectionWarning, setShowSelectionWarning] = useState(false)
  const [avatarUrls, setAvatarUrls] = useState({}) // Map transcriptId -> avatarUrl
  const { fetchChannelAvatars, updateTranscriptAvatar } = useChannelAvatars()

  // Get unique channels and sources from data
  const channelOptions = useMemo(() => {
    const allOption = { id: 'all', name: 'All Channels', count: rows.length }
    const uniqueChannels = [...new Set(rows.map(r => r.channel))]
      .filter(Boolean)
      .sort()
      .map(channel => ({
        id: channel,
        name: channel,
        count: rows.filter(r => r.channel === channel).length
      }))
    return [allOption, ...uniqueChannels]
  }, [rows])

  const sourceOptions = useMemo(() => {
    const allOption = { id: 'all', name: 'All Sources' }
    const uniqueSources = [...new Set(rows.map(r => r.source))]
      .filter(Boolean)
      .sort()
      .map(source => ({ id: source, name: source }))
    return [allOption, ...uniqueSources]
  }, [rows])

  // Get currently selected option objects
  const selectedChannel = useMemo(() => {
    return channelOptions.find(option => option.id === selectedChannelId) || channelOptions[0]
  }, [channelOptions, selectedChannelId])

  const selectedSource = useMemo(() => {
    return sourceOptions.find(option => option.id === selectedSourceId) || sourceOptions[0]
  }, [sourceOptions, selectedSourceId])

  // Filter rows based on selected filters
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      const channelMatch = selectedChannelId === 'all' || row.channel === selectedChannelId
      const sourceMatch = selectedSourceId === 'all' || row.source === selectedSourceId
      return channelMatch && sourceMatch
    })
  }, [rows, selectedChannelId, selectedSourceId])

  /* fetch once */
  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch(`${API_URL}/api/transcripts`)
        if (!r.ok) throw new Error(r.statusText)
        const data = await r.json()
        setRows(data)
      } catch (e) {
        console.error('load transcripts', e)
        setRows([])
      }
    })()
  }, [])

  /* Fetch missing channel avatars */
  useEffect(() => {
    if (rows.length === 0) return

    ;(async () => {
      // Find transcripts that have channelId but no channelAvatarUrl
      const transcriptsNeedingAvatars = rows.filter(
        (t) => t.channelId && !t.channelAvatarUrl
      )

      if (transcriptsNeedingAvatars.length === 0) {
        // Still populate avatarUrls from existing data
        const existingAvatars = {}
        rows.forEach((t) => {
          if (t.channelAvatarUrl) {
            existingAvatars[t.id] = t.channelAvatarUrl
          }
        })
        setAvatarUrls(existingAvatars)
        return
      }

      // Get unique channel IDs
      const channelIds = [...new Set(transcriptsNeedingAvatars.map((t) => t.channelId))]

      console.log(`[TranscriptList] Fetching avatars for ${channelIds.length} channels...`)

      // Fetch avatars from YouTube API
      const avatarMap = await fetchChannelAvatars(channelIds)

      if (avatarMap.size === 0) {
        console.log('[TranscriptList] No avatars fetched (API key may be missing)')
        return
      }

      // Update transcripts in database and local state
      const newAvatarUrls = { ...avatarUrls }

      for (const transcript of transcriptsNeedingAvatars) {
        const avatarUrl = avatarMap.get(transcript.channelId)
        if (avatarUrl) {
          // Update in database
          await updateTranscriptAvatar(transcript.id, avatarUrl)

          // Update local state for immediate display
          newAvatarUrls[transcript.id] = avatarUrl
        }
      }

      // Also add existing avatars from database
      rows.forEach((t) => {
        if (t.channelAvatarUrl) {
          newAvatarUrls[t.id] = t.channelAvatarUrl
        }
      })

      setAvatarUrls(newAvatarUrls)
      console.log(`[TranscriptList] Updated ${Object.keys(newAvatarUrls).length} avatar URLs`)
    })()
  }, [rows])

  const handleViewClick = (e, transcriptId) => {
    e.stopPropagation()
    onOpenViewer(transcriptId)
  }

  const handleSummaryClick = (e, transcriptId) => {
    e.stopPropagation()
    onOpenSummary(transcriptId)
  }

  const handleChatClick = (e, transcriptId) => {
    e.stopPropagation()
    onChat(transcriptId)
  }

  const handleDeleteClick = (e, transcriptId) => {
    e.stopPropagation()
    onDelete(transcriptId)
  }

  const handleSourceClick = (e, sourceUrl) => {
    e.stopPropagation()
    if (sourceUrl) {
      window.open(sourceUrl, '_blank', 'noopener,noreferrer')
    }
  }

  // Selection handlers
  const handleToggleSelect = (e, transcriptId) => {
    e.stopPropagation()
    setSelectedIds(prev => {
      if (prev.includes(transcriptId)) {
        return prev.filter(id => id !== transcriptId)
      } else {
        // Check if adding this would exceed 20
        if (prev.length >= 20) {
          setShowSelectionWarning(true)
          setTimeout(() => setShowSelectionWarning(false), 3000)
          return prev
        }
        return [...prev, transcriptId]
      }
    })
  }

  const handleSelectAll = (e) => {
    e.stopPropagation()
    if (selectedIds.length === filteredRows.length) {
      // Deselect all
      setSelectedIds([])
    } else {
      // Select all (up to 20)
      const idsToSelect = filteredRows.slice(0, 20).map(r => r.id)
      setSelectedIds(idsToSelect)
      if (filteredRows.length > 20) {
        setShowSelectionWarning(true)
        setTimeout(() => setShowSelectionWarning(false), 3000)
      }
    }
  }

  const handleGenerateDocument = () => {
    // Navigate to Documents wizard with selected IDs
    setWizardTranscriptIds(selectedIds)
    setTab('wizard')
    navigateTo('Documents', 'wizard')
  }

  // Generate placeholder avatar based on channel name
  const getAvatarPlaceholder = (channelName) => {
    if (!channelName) return ''
    const initials = channelName
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
    return initials
  }

  return (
    <div className="min-h-screen bg-gray-50 font-inter text-gray-900">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-indigo-700 mb-6">
          Transcripts
        </h1>

        {/* Filter Controls */}
        <div className="mb-6 flex gap-4">
          {/* Channel Filter */}
          <div className="w-64">
            <Listbox value={selectedChannel} onChange={(option) => setSelectedChannelId(option.id)} by="id">
              <div className="relative">
                <ListboxButton className="grid w-full cursor-default grid-cols-1 rounded-md bg-white py-1.5 pr-2 pl-3 text-left text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
                  <span className="col-start-1 row-start-1 truncate pr-6">{selectedChannel.name}</span>
                  <ChevronUpDownIcon
                    aria-hidden="true"
                    className="col-start-1 row-start-1 size-5 self-center justify-self-end text-gray-500 sm:size-4"
                  />
                </ListboxButton>

                <ListboxOptions
                  transition
                  className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-hidden data-leave:transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0 sm:text-sm"
                >
                  {channelOptions.map((option) => (
                    <ListboxOption
                      key={option.id}
                      value={option}
                      className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-indigo-600 data-focus:text-white data-focus:outline-hidden"
                    >
                      {({ selected }) => (
                        <>
                          <div className="flex justify-between items-center">
                            <span className={`block truncate ${selected ? 'font-semibold' : 'font-normal'}`}>
                              {option.name}
                            </span>
                            <span className={`ml-2 text-xs ${selected ? 'font-semibold' : 'font-normal'} text-gray-500 group-data-focus:text-white`}>
                              {option.count}
                            </span>
                          </div>
                          {selected && (
                            <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-indigo-600 group-data-focus:text-white">
                              <CheckIcon aria-hidden="true" className="size-5" />
                            </span>
                          )}
                        </>
                      )}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </div>
            </Listbox>
          </div>

          {/* Source Filter */}
          <div className="w-64">
            <Listbox value={selectedSource} onChange={(option) => setSelectedSourceId(option.id)} by="id">
              <div className="relative">
                <ListboxButton className="grid w-full cursor-default grid-cols-1 rounded-md bg-white py-1.5 pr-2 pl-3 text-left text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
                  <span className="col-start-1 row-start-1 truncate pr-6">{selectedSource.name}</span>
                  <ChevronUpDownIcon
                    aria-hidden="true"
                    className="col-start-1 row-start-1 size-5 self-center justify-self-end text-gray-500 sm:size-4"
                  />
                </ListboxButton>

                <ListboxOptions
                  transition
                  className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-hidden data-leave:transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0 sm:text-sm"
                >
                  {sourceOptions.map((option) => (
                    <ListboxOption
                      key={option.id}
                      value={option}
                      className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-indigo-600 data-focus:text-white data-focus:outline-hidden"
                    >
                      {({ selected }) => (
                        <>
                          <span className={`block truncate ${selected ? 'font-semibold' : 'font-normal'}`}>
                            {option.name}
                          </span>
                          {selected && (
                            <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-indigo-600 group-data-focus:text-white">
                              <CheckIcon aria-hidden="true" className="size-5" />
                            </span>
                          )}
                        </>
                      )}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </div>
            </Listbox>
          </div>
        </div>

        {/* Selection Warning */}
        {showSelectionWarning && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-800 text-sm">
            ⚠️ Maximum 20 transcripts can be selected for document generation
          </div>
        )}

        {/* Transcript List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 bg-gray-100 p-4 font-medium text-gray-700 border-b border-gray-200">
            <div className="col-span-1 flex items-center">
              <input
                type="checkbox"
                checked={selectedIds.length === filteredRows.length && filteredRows.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                title="Select all"
              />
            </div>
            <div className="col-span-4 sm:col-span-5">Title</div>
            <div className="col-span-3 sm:col-span-3">Channel</div>
            <div className="col-span-2 sm:col-span-2">Date</div>
            <div className="col-span-2 sm:col-span-1 text-right">Actions</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-gray-200">
            {filteredRows.map((transcript) => (
              <div
                key={transcript.id}
                className="grid grid-cols-12 p-4 hover:bg-gray-50 transition-colors items-center cursor-pointer"
                onClick={() => handleViewClick(null, transcript.id)}
              >
                {/* Checkbox */}
                <div className="col-span-1 flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(transcript.id)}
                    onChange={(e) => handleToggleSelect(e, transcript.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                  />
                </div>

                {/* Title */}
                <div className="col-span-4 sm:col-span-5 font-medium truncate pr-2">
                  {transcript.title}
                </div>

                {/* Channel with Avatar */}
                <div className="col-span-3 sm:col-span-3 flex items-center space-x-2">
                  {avatarUrls[transcript.id] || transcript.channelAvatarUrl ? (
                    <img
                      src={avatarUrls[transcript.id] || transcript.channelAvatarUrl}
                      alt={transcript.channel}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      onError={(e) => {
                        // Fallback to initials if image fails to load
                        e.target.style.display = 'none'
                        const placeholder = e.target.nextElementSibling
                        if (placeholder) placeholder.style.display = 'flex'
                      }}
                    />
                  ) : null}
                  <div
                    className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0"
                    style={{ display: (avatarUrls[transcript.id] || transcript.channelAvatarUrl) ? 'none' : 'flex' }}
                  >
                    <span className="text-xs font-medium text-indigo-700">
                      {getAvatarPlaceholder(transcript.channel)}
                    </span>
                  </div>
                  <span className="text-sm truncate">
                    {transcript.channel}
                  </span>
                </div>

                {/* Date */}
                <div className="col-span-2 sm:col-span-2 text-sm text-gray-500">
                  {fmt(transcript.publishDate || transcript.uploadDate)}
                </div>

                {/* Action Icons */}
                <div className="col-span-2 sm:col-span-1 flex justify-end space-x-1">
                  {/* Source Icon */}
                  <div title={
                    transcript.source === 'YOUTUBE' ? 'Open on YouTube' :
                    transcript.source === 'IMAGE' ? `Image: ${transcript.imageFilename || 'Uploaded'}` :
                    'Open Podcast'
                  }>
                    {transcript.source === 'YOUTUBE' ? (
                      <YoutubeIcon
                        size={18}
                        className="text-gray-400 hover:text-red-600 cursor-pointer"
                        onClick={(e) => handleSourceClick(e, transcript.sourceUrl)}
                      />
                    ) : transcript.source === 'IMAGE' ? (
                      <ImageIcon
                        size={18}
                        className="text-gray-400 hover:text-purple-600 cursor-pointer"
                        title={transcript.imageFilename || 'Image Upload'}
                      />
                    ) : (
                      <RssIcon
                        size={18}
                        className="text-gray-400 hover:text-orange-600 cursor-pointer"
                        onClick={(e) => handleSourceClick(e, transcript.sourceUrl)}
                      />
                    )}
                  </div>

                  {/* Chat Icon */}
                  <div title="Open in Chat">
                    <MessageSquareIcon
                      size={18}
                      className="text-gray-400 hover:text-indigo-700 cursor-pointer"
                      onClick={(e) => handleChatClick(e, transcript.id)}
                    />
                  </div>

                  {/* View Icon */}
                  <div title="View Transcript">
                    <FileTextIcon
                      size={18}
                      className="text-gray-400 hover:text-indigo-700 cursor-pointer"
                      onClick={(e) => handleViewClick(e, transcript.id)}
                    />
                  </div>

                  {/* Summary Icon - Always show, grayed out if no summary yet */}
                  <div title={transcript.summary ? "View AI Summary" : "Summary not yet generated"}>
                    <ScrollTextIcon
                      size={18}
                      className={transcript.summary
                        ? "text-gray-400 hover:text-green-600 cursor-pointer"
                        : "text-gray-300 cursor-not-allowed"}
                      onClick={(e) => transcript.summary && handleSummaryClick(e, transcript.id)}
                    />
                  </div>

                  {/* Delete Icon */}
                  <div title="Delete Transcript">
                    <TrashIcon
                      size={18}
                      className="text-gray-400 hover:text-red-600 cursor-pointer"
                      onClick={(e) => handleDeleteClick(e, transcript.id)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Floating Action Button */}
        {selectedIds.length > 0 && (
          <div className="fixed bottom-8 right-8 z-50">
            <button
              onClick={handleGenerateDocument}
              className="flex items-center gap-3 bg-indigo-600 text-white px-6 py-4 rounded-lg shadow-lg hover:bg-indigo-700 transition-all hover:scale-105 active:scale-95 font-medium"
            >
              <FileStack size={20} />
              <span>Generate Document ({selectedIds.length} selected)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


/* date formatter */
function fmt(iso) {
  if (!iso) return ''
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return ''
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ts))
}