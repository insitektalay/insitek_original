/* ────────────────────────────────────────────────
   src/v2/contexts/ChatContext.jsx
   ─ added sendMessage function for PromptDeck integration
   ──────────────────────────────────────────────── */
   import { createContext, useContext, useState } from 'react'

   const ChatContext = createContext()
   
   export const useChat = () => {
     const ctx = useContext(ChatContext)
     if (!ctx) throw new Error('useChat must be used inside <ChatProvider>')
     return ctx
   }
   
   export function ChatProvider ({ children }) {
     const [chatSessions, setChatSessions] = useState({})
   
     const blank = {
       transcriptId: null,
       messages: [],
       input: '',
       insightSuggestions: [],
       isLoading: false,
     }
   
     const getChatSession = (id) =>
       id ? chatSessions[id] ?? { ...blank, transcriptId: id } : { ...blank }
   
     const updateChatSession = (id, patch) => {
       if (!id) return
       setChatSessions(prev => ({
         ...prev,
         [id]: {
           ...getChatSession(id),
           ...patch,
         },
       }))
     }
   
     /* Trigger message send - sets input and triggers send */
     const triggerSend = (id, messageText) => {
       if (!id || !messageText?.trim()) return
       updateChatSession(id, { 
         input: messageText.trim(),
         triggerSend: Date.now() // timestamp to trigger useEffect in ChatPanel
       })
     }
   
     /* convenience helpers */
     const addMessage          = (id, msg)         =>
       updateChatSession(id, { messages: [...getChatSession(id).messages, msg] })
     const setLoading          = (id, isLoading)   =>
       updateChatSession(id, { isLoading })
     const setInput            = (id, input)       =>
       updateChatSession(id, { input })
     const setInsightSuggestions = (id, list)      =>
       updateChatSession(id, { insightSuggestions: list })
     const clearChatSession    = (id)              =>
       setChatSessions(prev => { const n = { ...prev }; delete n[id]; return n })
     const clearAllChats       = ()                => setChatSessions({})
   
     return (
       <ChatContext.Provider value={{
         chatSessions,
         getChatSession,
         updateChatSession,
         addMessage,
         setLoading,
         setInput,
         setInsightSuggestions,
         clearChatSession,
         clearAllChats,
         triggerSend, // Export for PromptDeck
       }}>
         {children}
       </ChatContext.Provider>
     )
   }