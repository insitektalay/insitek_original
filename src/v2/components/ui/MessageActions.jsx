// src/v2/components/ui/MessageActions.jsx
// ChatGPT-style action icons for each AI response

import { 
    DocumentDuplicateIcon, 
    CursorArrowRaysIcon, 
    Bars4Icon, 
    Bars3Icon, 
    Bars2Icon 
  } from '@heroicons/react/24/outline'
  
  export default function MessageActions({ 
    message, 
    onTransferFullResponse,
    onTransferSelectedText,
    onTransferCondensedResponse 
  }) {
    if (!message || message.role !== 'assistant') return null;
  
    const handleTransferFull = () => {
      onTransferFullResponse(message);
    };
  
    const handleTransferSelected = () => {
      onTransferSelectedText();
    };
  
    const handleTransferCondensed = (level) => {
      console.log("🔘 handleTransferCondensed clicked!", { level });
      onTransferCondensedResponse(message, level);
    };
  
    return (
      <div className="flex items-center gap-1 mt-2 transition-opacity">
        {/* Transfer Full Response */}
        <button
          onClick={handleTransferFull}
          className="p-1 rounded hover:bg-gray-100 text-gray-600 hover:text-indigo-600 transition-colors"
          title="Transfer Full Response"
        >
          <DocumentDuplicateIcon className="w-4 h-4 stroke-2" />
        </button>
  
        {/* Transfer Selected Text */}
        <button
          onClick={handleTransferSelected}
          className="p-1 rounded hover:bg-gray-100 text-gray-600 hover:text-indigo-600 transition-colors"
          title="Transfer Selected Text"
        >
          <CursorArrowRaysIcon className="w-4 h-4 stroke-2" />
        </button>
  
        {/* 75% Condensed */}
        <button
          onClick={() => handleTransferCondensed(0.75)}
          className="p-1 rounded hover:bg-gray-100 text-gray-600 hover:text-indigo-600 transition-colors"
          title="75% Condensed"
        >
          <Bars4Icon className="w-4 h-4 stroke-2" />
        </button>
  
        {/* 50% Condensed */}
        <button
          onClick={() => handleTransferCondensed(0.5)}
          className="p-1 rounded hover:bg-gray-100 text-gray-600 hover:text-indigo-600 transition-colors"
          title="50% Condensed"
        >
          <Bars3Icon className="w-4 h-4 stroke-2" />
        </button>
  
        {/* 25% Condensed */}
        <button
          onClick={() => handleTransferCondensed(0.25)}
          className="p-1 rounded hover:bg-gray-100 text-gray-600 hover:text-indigo-600 transition-colors"
          title="25% Condensed"
        >
          <Bars2Icon className="w-4 h-4 stroke-2" />
        </button>
      </div>
    );
  }