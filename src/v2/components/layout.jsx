'use client'

/* ─────────────────────────────────────────────────────
   Layout with persistent chat context
   ──────────────────────────────────────────────────── */

import { NavigationProvider } from '../contexts/NavigationContext'
import { ChatProvider } from '../contexts/ChatContext'
import { ImportProvider } from '../contexts/ImportContext'
import Sidebar from './Sidebar'
import MainContent from './MainContent'

export default function LayoutV2() {
  return (
    <NavigationProvider>
      <ChatProvider>
        <ImportProvider>
          <div style={{ height: '100vh', width: '100vw', margin: 0, padding: 0, position: 'relative' }}>
            <Sidebar />
            <MainContent />
          </div>
        </ImportProvider>
      </ChatProvider>
    </NavigationProvider>
  )
}