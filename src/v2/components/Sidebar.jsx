// src/v2/components/Sidebar.jsx
import { useNavigation } from '../contexts/NavigationContext'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowDownTrayIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  LightBulbIcon,
  DocumentDuplicateIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  QueueListIcon,
  RectangleStackIcon,
  SparklesIcon
} from '@heroicons/react/24/outline'
import {
  ArrowDownTrayIcon as ArrowDownTrayIconSolid,
  DocumentTextIcon as DocumentTextIconSolid,
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid,
  LightBulbIcon as LightBulbIconSolid,
  DocumentDuplicateIcon as DocumentDuplicateIconSolid,
  Cog6ToothIcon as Cog6ToothIconSolid,
  MagnifyingGlassIcon as MagnifyingGlassIconSolid,
  QueueListIcon as QueueListIconSolid,
  RectangleStackIcon as RectangleStackIconSolid,
  SparklesIcon as SparklesIconSolid
} from '@heroicons/react/24/solid'

const navigation = [
  { name: 'Import', icon: ArrowDownTrayIconSolid, iconInactive: ArrowDownTrayIcon },
  { name: 'YouTube Search', icon: MagnifyingGlassIconSolid, iconInactive: MagnifyingGlassIcon },
  { name: 'Queues', icon: QueueListIconSolid, iconInactive: QueueListIcon },
  { name: 'Transcripts', icon: DocumentTextIconSolid, iconInactive: DocumentTextIcon },
  { name: 'Chat', icon: ChatBubbleLeftRightIconSolid, iconInactive: ChatBubbleLeftRightIcon },
  { name: 'Insights', icon: LightBulbIconSolid, iconInactive: LightBulbIcon },
  { name: 'Documents', icon: DocumentDuplicateIconSolid, iconInactive: DocumentDuplicateIcon },
  { name: 'AI Documents', icon: SparklesIconSolid, iconInactive: SparklesIcon },
  { name: 'Custom Instructions', icon: RectangleStackIconSolid, iconInactive: RectangleStackIcon },
  { name: 'Settings', icon: Cog6ToothIconSolid, iconInactive: Cog6ToothIcon },
]

const cn = (...c) => c.filter(Boolean).join(' ')

export default function Sidebar() {
  const { 
    page, 
    collapsed, 
    setCollapsed, 
    setPage, 
    setTab, 
    pageTabs, 
    setSelectedInsight,
    handleSelectTranscript
  } = useNavigation()

  return (
    <aside className={cn(
      'fixed inset-y-0 z-50 flex flex-col bg-indigo-600 transition-all duration-300',
      collapsed ? 'w-16' : 'w-72'
    )}>
      <div className={cn(
        'flex grow flex-col overflow-y-auto transition-all duration-300',
        collapsed ? 'gap-y-4 px-1' : 'gap-y-5 px-6'
      )}>
        {/* logo + toggle */}
        <div className="relative flex h-16 shrink-0 items-center">
          {!collapsed && (
            <img
              src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=white"
              alt="logo"
              className="h-8 w-auto"
            />
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute right-0 rounded p-1 text-indigo-200 hover:bg-indigo-700 hover:text-white"
          >
            {collapsed ? (
              <ChevronRightIcon className="size-5" />
            ) : (
              <ChevronLeftIcon className="size-5" />
            )}
          </button>
        </div>

        {/* nav */}
        <nav className="flex flex-1 flex-col">
          <ul role="list" className="flex flex-1 flex-col gap-y-7">
            <li>
              <ul role="list" className="-mx-2 space-y-1">
                {navigation.map((n) => {
                  const active = n.name === page
                  const Icon = active ? n.icon : n.iconInactive
                  return (
                    <li key={n.name}>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault()
                          
                          // Clear selected transcript when navigating to Transcripts
                          if (n.name === 'Transcripts') {
                            handleSelectTranscript(null)
                            setTab(null) // Also clear tab to ensure we show list view
                          }
                          
                          // Clear selected insight when navigating to any page except Insights
                          if (n.name !== 'Insights') {
                            setSelectedInsight(null)
                          }
                          
                          setPage(n.name)
                          const firstTab = pageTabs[n.name]?.[0]
                          if (firstTab) {
                            setTab(firstTab)
                          }
                        }}
                        className={cn(
                          active
                            ? 'bg-indigo-700 text-white'
                            : 'text-indigo-200 hover:bg-indigo-700 hover:text-white',
                          'group flex rounded-md p-2 text-sm/6 font-semibold',
                          collapsed ? 'justify-center' : 'gap-x-3'
                        )}
                      >
                        <Icon className="size-6 shrink-0" />
                        <span className={collapsed ? 'sr-only' : ''}>
                          {n.name}
                        </span>
                      </a>
                    </li>
                  )
                })}
              </ul>
            </li>
          </ul>
        </nav>
      </div>
    </aside>
  )
}