// src/v2/components/ui/InsightSuggestions.jsx
import { LightBulbIcon } from '@heroicons/react/24/outline'

export default function InsightSuggestions({ 
    messageIndex, 
    insightSuggestions, 
    onCaptureInsight, 
    onDismissSuggestion 
  }) {
    const relevantSuggestions = insightSuggestions.filter(
      suggestion => suggestion.messageIndex === messageIndex
    );
  
    // Always show 3 lightbulb slots
    const slots = Array.from({ length: 3 }, (_, index) => {
      const suggestion = relevantSuggestions[index];
      const isEmpty = !suggestion;
      
      return (
        <button
          key={`slot-${messageIndex}-${index}`}
          onClick={isEmpty ? undefined : () => onCaptureInsight(suggestion)}
          disabled={isEmpty}
          className={`flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
            isEmpty 
              ? 'bg-gray-100 text-gray-300 cursor-not-allowed' 
              : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-600 cursor-pointer'
          }`}
          title={
            isEmpty 
              ? 'Smart extract slot (empty)' 
              : `Smart Extract: ${suggestion.reason || suggestion.description || 'Click to capture insight'}`
          }
        >
          <LightBulbIcon className="w-3 h-3" />
        </button>
      );
    });
  
    return (
      <div className="flex gap-1 justify-end mt-1">
        {slots}
      </div>
    );
  }