// src/v2/components/MainContent.jsx
import { useNavigation } from '../contexts/NavigationContext'
import PanelRouter from './PanelRouter'

const cn = (...c) => c.filter(Boolean).join(' ')

export default function MainContent() {
  const { page, tab, collapsed, setTab, pageTabs } = useNavigation()
  const tabs = pageTabs[page]

  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column', 
      height: '100vh',
      marginLeft: collapsed ? '4rem' : '18rem',
      width: collapsed ? 'calc(100vw - 4rem)' : 'calc(100vw - 18rem)'
    }}>
      {/* Fixed header with tabs - only show if there are tabs */}
      {tabs && tabs.length > 0 && (
        <div className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm">
          <div className="px-4 sm:px-6 lg:px-8 pt-4 pb-0">
            {/* tabs */}
            <nav className="-mb-px flex space-x-8 overflow-x-auto">
              {tabs.map((label) => (
                <a
                  key={label}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setTab(label)
                  }}
                  className={cn(
                    label === tab
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                    'whitespace-nowrap border-b-2 px-1 pb-4 text-sm font-medium'
                  )}
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Content area - takes remaining height */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <PanelRouter />
      </div>
    </main>
  )
}