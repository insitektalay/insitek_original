/* ────────────────────────────────────────────────
   src/v2/components/ui/ChatPanel.jsx
   ─ persistent chat panel with PromptDeck integration
   ──────────────────────────────────────────────── */
   import { useCallback, useEffect, useRef, useState } from 'react'
   import { useChat } from '../../contexts/ChatContext'
   import { useInsightExtraction } from '../../hooks/useInsightExtraction'
   import { useTransferFunctions } from '../../hooks/useTransferFunctions'
   import InsightSuggestions from './InsightSuggestions'
   import MessageActions from './MessageActions'
   import MarkdownMessage from './MarkdownMessage'
   import { PaperAirplaneIcon, BoltIcon, SparklesIcon } from '@heroicons/react/24/solid'
   import { useDraggable } from '@dnd-kit/core'

   const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

   /* ───────── Draggable AI Message Component ───────── */
   function DraggableAIMessage({ messageId, children, onDragStart }) {
     const [selectedText, setSelectedText] = useState('')

     const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
       id: messageId,
       data: {
         text: selectedText,
         timestamp: Date.now()
       }
     })

     // Capture selection before drag starts
     const handlePointerDown = (e) => {
       const selection = window.getSelection()
       const text = selection?.toString().trim()
       if (text && text.length > 0) {
         setSelectedText(text)
         onDragStart?.(text)
       }
     }

     return (
       <div
         ref={setNodeRef}
         {...listeners}
         {...attributes}
         onPointerDown={handlePointerDown}
         style={{
           cursor: isDragging ? 'grabbing' : 'grab',
           opacity: isDragging ? 0.5 : 1,
           userSelect: 'text' // Allow text selection
         }}
       >
         {children}
       </div>
     )
   }

   export default function ChatPanel ({
     onClose,
     transcript,
     onSuggestPrompts,
     onCaptureInsight,
     aiSuggestions = [],
   }) {
     /* ───────── context ───────── */
     const {
       getChatSession,
       updateChatSession,
       addMessage,
       setLoading,
     } = useChat()
   
     /* ───────── hydrate ───────── */
     const initial = getChatSession(transcript?.id)
     const [messages, setMessages] = useState(initial.messages)
     const [input, setInput]       = useState(initial.input)
     const [thinking, setThinking] = useState(initial.isLoading)
     const [selectedPromptType, setSelectedPromptType] = useState(null) // 'quick' | 'intelligent' | null
     const [showQuickPromptsDropdown, setShowQuickPromptsDropdown] = useState(false)
     const [showIntelligentPromptsDropdown, setShowIntelligentPromptsDropdown] = useState(false)
     
     // Quick prompts list (from PromptDeck)
     const quickPrompts = [
       "Summarize the text",
       "What percentage of this transcript is rhetoric, opinion, or fact?",
       "Identify and rank the key insights in this transcript by importance.",
       "What's the actual subject of this video based solely on the transcript?",
       "Rate the quality of information presented and explain your rating.",
       "What is the direct answer to the question posed in the video title, without any fluff?"
     ]
     
     // Intelligent prompts list (AI-generated suggestions)
     // Apply same filtering logic as PromptDeck
     const intelligentPrompts = (aiSuggestions || [])
       .filter(s => s.trim() && s.length < 220 && !s.toLowerCase().includes("i suggest") && !s.toLowerCase().startsWith("final"))
     
     // Handle quick prompt selection
     const handleQuickPromptSelect = (prompt) => {
       setShowQuickPromptsDropdown(false)
       setSelectedPromptType(null)
       // Send the prompt directly to AI
       send(prompt)
     }
     
     // Handle intelligent prompt selection
     const handleIntelligentPromptSelect = (prompt) => {
       setShowIntelligentPromptsDropdown(false)
       setSelectedPromptType(null)
       // Send the prompt directly to AI
       send(prompt)
     }

     // Get current prompt text for sending
     const getCurrentPromptText = () => {
       return input.trim()
     }
   
     /* ───────── hooks ───────── */
     const {
       insightSuggestions = [],         // ← default so .length is safe
       runInsightDetection,
       handleCaptureInsight,
       dismissInsightSuggestion,
       clearInsightSuggestions,
     } = useInsightExtraction()
   
     const {
       transferLastResponse,
       transferSelectedText,
       transferCondensedResponse,
     } = useTransferFunctions()

     // Wrapper functions for message actions
     const handleTransferFullResponse = (message) => {
       transferLastResponse([message], onCaptureInsight, transcript)
     }

     const handleTransferSelectedText = () => {
       transferSelectedText(onCaptureInsight, transcript)
     }

     const handleTransferCondensedResponse = (message, level) => {
       transferCondensedResponse([message], level, onCaptureInsight, transcript)
     }
   
     const listRef = useRef(null)
     const lastTriggerRef = useRef(null)
     const dropdownRef = useRef(null)
     const userScrolledUpRef = useRef(false)
     const lastScrollTopRef = useRef(0)

     // Detect user scrolling
     const handleScroll = useCallback(() => {
       if (!listRef.current) return

       const { scrollTop, scrollHeight, clientHeight } = listRef.current
       const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10

       // User scrolled up if not at bottom and scrollTop decreased
       if (!isAtBottom && scrollTop < lastScrollTopRef.current) {
         userScrolledUpRef.current = true
       }
       // User scrolled back to bottom
       else if (isAtBottom) {
         userScrolledUpRef.current = false
       }

       lastScrollTopRef.current = scrollTop
     }, [])

     // Click outside handler for dropdowns
     useEffect(() => {
       function handleClickOutside(event) {
         if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
           setShowQuickPromptsDropdown(false)
           setShowIntelligentPromptsDropdown(false)
         }
       }

       if (showQuickPromptsDropdown || showIntelligentPromptsDropdown) {
         document.addEventListener('mousedown', handleClickOutside)
       }

       return () => {
         document.removeEventListener('mousedown', handleClickOutside)
       }
     }, [showQuickPromptsDropdown, showIntelligentPromptsDropdown])
   
     /* ───────── re-hydrate on transcript change ───────── */
     useEffect(() => {
       if (!transcript?.id) return
       const s = getChatSession(transcript.id)
       setMessages(s.messages)
       setInput(s.input)
       setThinking(s.isLoading)
   
       clearInsightSuggestions()
       ;(s.insightSuggestions || []).forEach((i) =>
         runInsightDetection(i.text, i.messageIndex),
       )
     }, [transcript?.id])
   
     /* ───────── listen for trigger send from PromptDeck ───────── */
     useEffect(() => {
       if (!transcript?.id) return
       const session = getChatSession(transcript.id)
       if (session.triggerSend && session.triggerSend !== lastTriggerRef.current) {
         lastTriggerRef.current = session.triggerSend
         if (session.input?.trim()) {
           send(session.input)
           // Clear the trigger and input after sending
           updateChatSession(transcript.id, { triggerSend: null, input: '' })
         }
       }
     }, [getChatSession(transcript?.id)?.triggerSend])
   
     /* ───────── persist every change ───────── */
     useEffect(() => {
       if (!transcript?.id) return
       updateChatSession(transcript.id, {
         messages,
         input,
         isLoading: thinking,
         insightSuggestions,
       })
     }, [messages, input, thinking, insightSuggestions, transcript?.id])
   
     /* ───────── auto-scroll ───────── */
     useEffect(() => {
       // Only auto-scroll if user hasn't manually scrolled up
       if (listRef.current && !userScrolledUpRef.current) {
         const element = listRef.current;
         // Scroll to bottom with smooth behavior
         element.scrollTo({
           top: element.scrollHeight,
           behavior: 'smooth'
         });
       }
     }, [messages, thinking])
     
     // Also scroll when new content is being streamed
     useEffect(() => {
       if (listRef.current && thinking) {
         const element = listRef.current;
         // Keep scrolling to bottom during streaming, but only if user hasn't scrolled up
         const scrollInterval = setInterval(() => {
           if (!userScrolledUpRef.current) {
             element.scrollTo({
               top: element.scrollHeight,
               behavior: 'auto'
             });
           }
         }, 100);

         return () => clearInterval(scrollInterval);
       }
     }, [thinking])
   
     /* ───────── send / stream ───────── */
     const send = useCallback(async (forcedText = null) => {
       console.log("🚀 Send function called");
       if (!transcript?.id) return
       const text = forcedText ?? getCurrentPromptText()
       if (!text) return
   
       console.log("📝 Adding user message:", text);
       const userMsg = { role: 'user', content: text }
       addMessage(transcript.id, userMsg)
       setMessages((m) => {
         const newMessages = [...m, userMsg];
         console.log("📊 Messages after user add:", newMessages.length);
         return newMessages;
       })
       runInsightDetection(text, messages.length)
   
       setInput('')
       setThinking(true)
       setLoading(transcript.id, true)

       // Reset scroll flag so auto-scroll resumes for new responses
       userScrolledUpRef.current = false

       console.log("🤖 Starting AI response...");
   
       /* ---- stream assistant reply ---- */
       const res = await fetch(`${API_URL}/api/chat/completion`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           prompt: `You are an expert assistant analyzing transcripts. Format your responses using Markdown for clear, structured communication:

**Formatting Guidelines:**
- Use ### for main sections, #### for subsections
- Use **bold** for key concepts, important terms, and emphasis
- Use *italic* for subtle emphasis or nuanced points
- Use bullet lists (- ) for multiple points, with 2-space indent for nested items
- Use numbered lists (1. 2. 3.) for sequential steps or rankings
- Use > blockquotes for direct quotes from the transcript or key takeaways
- Include relevant emojis naturally when they add clarity or context

**Your Task:**
Analyze this transcript and respond to the user's question with well-structured, insightful analysis.

**Transcript:**
${transcript.text}

**Conversation:**
User: ${text}
AI:`,
           temperature: 0.7,
           stop: ['User:', 'AI:'],
           n_predict: 5000,
           stream: true,
         }),
       })
       
       console.log("🌐 Response received, status:", res.status, "ok:", res.ok)
       console.log("🔍 Response headers:", [...res.headers.entries()])
       
       if (!res.ok) {
         console.error("❌ Response not OK:", res.status)
         setThinking(false)
         setLoading(transcript.id, false)
         return alert('AI request failed')
       }

       console.log("✅ Response OK, creating assistant message shell")
       /* create assistant shell message */
       setMessages((m) => [...m, { role: 'assistant', content: '' }])

       // Check if response has body (streaming) or handle as text
       console.log("🔄 Checking response type, has body:", !!res.body, "has getReader:", !!(res.body?.getReader))
       console.log("🔍 Response content-type:", res.headers.get('content-type'))
       
       // Check if this is a streaming response
       const isStreamingResponse = res.headers.get('content-type')?.includes('text/plain')
       console.log("🌊 Is streaming response:", isStreamingResponse)
       
      let full = '' // Declare at function scope for later use
       if (res.body && res.body.getReader && isStreamingResponse) {
         // Handle streaming response
         console.log("🌊 Starting streaming response processing")
         const reader  = res.body.getReader()
         const decoder = new TextDecoder('utf-8')
         let   buffer  = ''

   
         while (true) {
           const { value, done } = await reader.read()
           if (done) {
             console.log("🏁 Streaming completed")
             break
           }
           buffer += decoder.decode(value, { stream: true })
           const lines = buffer.split('\n')
           buffer = lines.pop()
   
           for (const line of lines) {
             if (!line.startsWith('data: ')) continue
             const payload = line.slice(6).trim()
             if (payload === '[DONE]') {
               console.log("🎯 Received [DONE] marker")
               break
             }
             try {
               const { content } = JSON.parse(payload)
               if (content) {
                 full += content
                 console.log("📝 Adding character:", content, "Total length:", full.length)
                 setMessages((m) => {
                   const nxt = [...m]
                   nxt[nxt.length - 1] = { role: 'assistant', content: full }
                   return nxt
                 })
               }
             } catch (err) {
               console.warn("⚠️ Failed to parse chunk:", payload, err)
             }
           }
         }
         
         // For streaming responses, get the final content
         setMessages((currentMessages) => {
           const lastMessage = currentMessages[currentMessages.length - 1];
           if (lastMessage && lastMessage.role === 'assistant') {
             full = lastMessage.content; // Update full with the final content
           }
           return currentMessages;
         });
         
       } else {
         // Handle non-streaming response as fallback
         try {
           const data = await res.json()
           console.log("📦 Received data from server:", data)
           
           if (data.content) {
             console.log("✅ Setting AI response:", data.content.substring(0, 100) + "...")
             full = data.content; // Set full content for cleanup code
             setMessages((m) => {
               const nxt = [...m]
               nxt[nxt.length - 1] = { role: 'assistant', content: data.content }
               console.log("📝 Updated messages array, length:", nxt.length)
               return nxt
             })
           } else {
             console.error("❌ No content field in response:", data)
           }
         } catch (err) {
           console.error('Failed to parse response:', err)
           setThinking(false)
           setLoading(transcript.id, false)
           return alert('Failed to parse AI response')
         }
       }
   
       /* prompt-deck suggestions & insight detection */
       if (onSuggestPrompts && full) {
         const chatText = [
           ...messages,
           userMsg,
           { role: 'assistant', content: full },
         ].map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n')
         onSuggestPrompts(chatText)
       }
       
       if (full) {
         runInsightDetection(full, messages.length + 1)
       }
   
       setThinking(false)
       setLoading(transcript.id, false)
     }, [
       transcript?.id,
       input,
       messages.length,
       addMessage,
       setLoading,
       runInsightDetection,
       onSuggestPrompts,
       getCurrentPromptText,
     ])

     /* ───────── UI ───────── */
     return (
       <div 
         className="w-full flex flex-col text-xs"
         style={{ 
           height: '100%',
           maxHeight: '100%',
           overflow: 'hidden'
         }}
       >
         {/* Scrollable messages area - takes remaining space between fixed elements */}
         <div
           ref={listRef}
           onScroll={handleScroll}
           className="flex-1 overflow-y-auto p-4 scroll-smooth"
           style={{
             scrollBehavior: 'smooth',
             overflowAnchor: 'none' // Prevents scroll anchor from interfering
           }}
         >
           <div className="space-y-4">
             {!transcript ? (
               <div className="bg-gray-100 p-2 italic rounded">
                 No transcript selected.
               </div>
             ) : (
               <>
                 {messages.map((m, i) => (
                   <div key={i} className="relative">
                     {m.role === 'assistant' ? (
                       <DraggableAIMessage
                         messageId={`ai-message-${i}`}
                         onDragStart={(text) => console.log('Dragging text:', text)}
                       >
                         <div className="text-gray-700">
                           <strong>AI: </strong>
                           <MarkdownMessage content={m.content} isStreaming={thinking && i === messages.length - 1} />
                         </div>
                       </DraggableAIMessage>
                     ) : (
                       <div className="text-indigo-600">
                         <strong>You: </strong>
                         {m.content}
                       </div>
                     )}
   
                     {m.role === 'assistant' && (
                       <div className="flex justify-between items-start mt-2">
                         {/* Left side - Message Actions */}
                         <MessageActions
                           message={m}
                           onTransferFullResponse={handleTransferFullResponse}
                           onTransferSelectedText={handleTransferSelectedText}
                           onTransferCondensedResponse={handleTransferCondensedResponse}
                         />
                         
                         {/* Right side - Always show 3 Smart Extract slots */}
                         <InsightSuggestions
                           messageIndex={i}
                           insightSuggestions={insightSuggestions}
                           onCaptureInsight={(s) => handleCaptureInsight(s, onCaptureInsight)}
                           onDismissSuggestion={dismissInsightSuggestion}
                         />
                       </div>
                     )}
                   </div>
                 ))}
   
                 {thinking && <div className="italic text-gray-400">AI is thinking…</div>}
               </>
             )}
           </div>
         </div>
   
         {/* Fixed input at bottom */}
         <div className="flex-shrink-0 bg-white border-t border-gray-200 p-4">
           <div className="relative">
             {/* Regular Textarea */}
             <textarea
               className="w-full rounded-lg px-4 py-3 pr-36 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
               style={{
                 height: '98px',
                 border: '0.5px solid rgba(31, 30, 29, 0.15)',
                 verticalAlign: 'top',
                 textAlign: 'left',
                 backgroundColor: '#f8fafc'
               }}
               placeholder="Type your question…"
               value={input}
               onChange={(e) => setInput(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
               disabled={!transcript}
             />

             {/* Quick Prompts Dropdown */}
             {showQuickPromptsDropdown && (
               <div 
                 ref={dropdownRef}
                 className="absolute bottom-20 left-0 right-36 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"
               >
                 {quickPrompts.map((prompt, index) => (
                   <div
                     key={index}
                     className="px-4 py-2 text-xs hover:bg-indigo-50 hover:text-indigo-600 cursor-pointer border-b border-gray-100 last:border-b-0"
                     onClick={() => handleQuickPromptSelect(prompt)}
                   >
                     {prompt}
                   </div>
                 ))}
               </div>
             )}

             {/* Intelligent Prompts Dropdown */}
             {showIntelligentPromptsDropdown && (
               <div 
                 ref={dropdownRef}
                 className="absolute bottom-20 left-0 right-36 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"
               >
                 {intelligentPrompts.length > 0 ? (
                   intelligentPrompts.map((suggestion, index) => (
                     <div
                       key={index}
                       className="px-4 py-2 text-xs hover:bg-indigo-50 hover:text-indigo-600 cursor-pointer border-b border-gray-100 last:border-b-0"
                       onClick={() => handleIntelligentPromptSelect(suggestion)}
                     >
                       {suggestion}
                     </div>
                   ))
                 ) : (
                   <div className="px-4 py-2 text-xs text-gray-500 italic">
                     No intelligent prompts available yet. Continue chatting to generate suggestions.
                   </div>
                 )}
               </div>
             )}
             
             {/* Button group in bottom right */}
             <div className="absolute right-2 bottom-2 flex gap-2 items-center">
               {/* Quick Prompts Button */}
               <button
                 onClick={() => {
                   setShowQuickPromptsDropdown(!showQuickPromptsDropdown)
                   setSelectedPromptType(showQuickPromptsDropdown ? null : 'quick')
                 }}
                 disabled={!transcript}
                 className="rounded-full transition-colors"
                 style={{
                   padding: '6px',
                   backgroundColor: showQuickPromptsDropdown ? '#4f46e5' : '#ffffff',
                   color: showQuickPromptsDropdown ? '#ffffff' : '#4f46e5',
                   border: '1px solid #4f46e5'
                 }}
                 title={`Quick Prompts (${showQuickPromptsDropdown ? 'OPEN' : 'closed'})`}
               >
                 <BoltIcon className="w-3 h-3" />
               </button>
               
               {/* Intelligent Prompts Button */}
               <button
                 onClick={() => {
                   setShowIntelligentPromptsDropdown(!showIntelligentPromptsDropdown)
                   setSelectedPromptType(showIntelligentPromptsDropdown ? null : 'intelligent')
                 }}
                 disabled={!transcript}
                 className="rounded-full transition-colors"
                 style={{
                   padding: '6px',
                   backgroundColor: showIntelligentPromptsDropdown ? '#4f46e5' : '#ffffff',
                   color: showIntelligentPromptsDropdown ? '#ffffff' : '#4f46e5',
                   border: '1px solid #4f46e5'
                 }}
                 title={`Intelligent Prompts (${showIntelligentPromptsDropdown ? 'OPEN' : 'closed'}) - ${intelligentPrompts.length} available`}
               >
                 <SparklesIcon className="w-3 h-3" />
               </button>
               
               {/* Send Button */}
               <button
                 onClick={() => send()}
                 disabled={!transcript || thinking}
                 className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 rounded-full p-2 transition-colors"
               >
                 <PaperAirplaneIcon className="w-4 h-4 text-white" />
               </button>
             </div>
           </div>
         </div>
       </div>
     )
   }