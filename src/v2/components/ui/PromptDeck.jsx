// src/components/ui/PromptDeck.jsx
// Updated with simple dropdown implementation

import { useState, useRef, useEffect } from 'react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import { useChat } from '../../contexts/ChatContext'

const defaultPrompts = [
  "Summarize the text",
  "What percentage of this transcript is rhetoric, opinion, or fact?",
  "Identify and rank the key insights in this transcript by importance.",
  "What's the actual subject of this video based solely on the transcript?",
  "Rate the quality of information presented and explain your rating.",
  "What is the direct answer to the question posed in the video title, without any fluff?",
];

export default function PromptDeck({ onClose, onPromptClick, aiSuggestions = [], onShowSource, transcript }) {
  return (
    <div className="p-4 h-full flex flex-col text-xs relative">
      <div className="flex-1 overflow-auto">
        {/* Transcript Header Info */}
        {!transcript ? (
          <div className="bg-gray-100 p-3 italic rounded text-center">
            No transcript selected.
          </div>
        ) : (
          <div className="bg-white rounded text-[11px] flex flex-wrap items-center gap-2">
            <strong className="text-indigo-600 text-sm">{transcript.title}</strong>
            <span className="bg-white text-indigo-600 border border-indigo-600 px-2 py-[2px] rounded-full text-xs whitespace-nowrap">
              {transcript.channel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}