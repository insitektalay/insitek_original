// src/v2/hooks/useAI.js
import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export function useAI() {
  const [aiSuggestions, setAISuggestions] = useState([])

  /* AI suggestions generation (moved from layout.jsx) */
  const generateAISuggestions = async (chatSoFar, selectedTranscript) => {
    if (!selectedTranscript?.text) return

    try {
      const systemPrompt = `Here is the original transcript being discussed:

TRANSCRIPT START:
${selectedTranscript.text}
TRANSCRIPT END:

And here is the chat conversation about this transcript so far:

CONVERSATION START:
${chatSoFar}
CONVERSATION END:

Now, generate 3 to 5 short, relevant follow-up questions or prompts based on BOTH the transcript content and the conversation so far.

Suggestions:
1.`

      const response = await fetch(`${API_URL}/api/chat/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: systemPrompt,
          temperature: 0.7,
          n_predict: 400,
          stop: ['User:', 'AI:', 'TRANSCRIPT', 'CONVERSATION'],
        }),
      })
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      
      const data = await response.json()
      const suggestions = (data.content || data.completion || '')
        .split('\n')
        .map((l) => l.replace(/^\d+[\).]?\s*/, '').trim())
        .filter((l) => l.length > 10 && l.length < 200)
        .filter((l) => !l.toLowerCase().includes('i suggest'))
        .filter((l) => !l.toLowerCase().startsWith('final'))
        .filter((l) => l.includes('?') || /(analyze|explain|discuss)/i.test(l))
        .slice(0, 5)
        
      setAISuggestions(suggestions)
      return suggestions
    } catch (e) {
      console.error('AI suggestions failed:', e)
      setAISuggestions([])
      return []
    }
  }

  /* Clear suggestions helper */
  const clearAISuggestions = () => setAISuggestions([])

  return {
    aiSuggestions,
    generateAISuggestions,
    clearAISuggestions
  }
}