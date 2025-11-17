// src/v2/components/ui/ManualCaptureControls.jsx

export default function ManualCaptureControls({ 
    messages,
    onTransferLastResponse,
    onTransferSelectedText,
    onTransferCondensedResponse 
  }) {
    const lastAIMessage = [...messages].reverse().find(m => m.role === 'assistant');
  
    if (!lastAIMessage) return null;
  
    return (
      <div className="border-t pt-3 mt-4">
        <div className="text-[10px] text-gray-600 mb-2 font-bold">📝 MANUAL CAPTURE:</div>
        
        {/* Primary transfer options */}
        <div className="flex gap-2 mb-2">
          <button
            onClick={onTransferLastResponse}
            className="bg-green-500 hover:bg-green-600 text-white text-[10px] px-3 py-1.5 rounded flex items-center gap-1"
          >
            📄 Transfer Full Response
          </button>
          <button
            onClick={onTransferSelectedText}
            className="bg-purple-500 hover:bg-purple-600 text-white text-[10px] px-3 py-1.5 rounded flex items-center gap-1"
          >
            ✂️ Transfer Selected Text
          </button>
        </div>
        
        {/* Condensed transfer options */}
        <div className="mb-1">
          <div className="text-[9px] text-gray-600 mb-1 font-bold">🗜️ CONDENSED VERSIONS:</div>
          <div className="flex gap-1">
            <button
              onClick={() => onTransferCondensedResponse(0.75)}
              className="bg-blue-400 hover:bg-blue-500 text-white text-[9px] px-2 py-1 rounded"
            >
              75%
            </button>
            <button
              onClick={() => onTransferCondensedResponse(0.5)}
              className="bg-blue-500 hover:bg-blue-600 text-white text-[9px] px-2 py-1 rounded"
            >
              50%
            </button>
            <button
              onClick={() => onTransferCondensedResponse(0.25)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-[9px] px-2 py-1 rounded"
            >
              25%
            </button>
          </div>
        </div>
        
        <div className="text-[8px] text-gray-500">
          Manual: Select text + "Selected", "Full" for complete response, or "75%/50%/25%" for AI-condensed versions
        </div>
      </div>
    );
  }