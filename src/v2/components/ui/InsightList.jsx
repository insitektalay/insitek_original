/*  src/components/ui/InsightList.jsx
    -------------------------------------------------------------- */
    import { useEffect, useMemo, useState } from "react";
    import { useNavigation } from '../../contexts/NavigationContext';
    import {
      GridIcon,
      ListIcon,
      SearchIcon,
      MessageCircleIcon,
      FileTextIcon,
      TrashIcon
    } from 'lucide-react';
    
    const API_URL =
      import.meta.env.VITE_API_URL ?? "http://localhost:3001";
    
    export default function InsightList({
      onClose,
      onSelectInsight,
    }) {
      const { handleSelectTranscript, navigateTo } = useNavigation();
      /* ─── state ─────────────────────────────────────────── */
      const [rows, setRows]           = useState([]);
      const [allTags, setAllTags]     = useState([]);
      const [filterTags, setFilterTags]   = useState([]);
      const [tagSearch, setTagSearch] = useState("");

      // New state for view mode and UI
      const [viewMode, setViewMode] = useState('grid');
    
      /* ─── load rows from API ────────────────────────────── */
      const load = async () => {
        const qs = [
          filterTags.length &&
            `tags=${encodeURIComponent(filterTags.join(","))}`,
        ]
          .filter(Boolean)
          .join("&");

        const data = await fetch(
          `${API_URL}/api/insights${qs ? "?" + qs : ""}`
        ).then((r) => r.json());

        setRows(data);

        /* collect unique tags */
        const tSet = new Set();
        data.forEach((i) => {
          i.tags.forEach((t) => tSet.add(t));
        });
        setAllTags([...tSet].sort());
      };

      useEffect(() => { load(); }, [filterTags]);
    
      /* ─── delete with confirmation ─────────────────────── */
      const confirmDelete = async (insight) => {
        const ok = window.confirm(
          `Delete the insight:\n"${insight.insightName}" ?`
        );
        if (!ok) return;
    
        await fetch(`${API_URL}/api/insights/${insight.id}`, {
          method: "DELETE",
        });
        load(); // refresh list
      };
    
      /* ─── tag helpers ──────────────────────────────────── */
      const toggleTag = (t) =>
        setFilterTags((prev) =>
          prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
        );
    
      const filteredRows = useMemo(() => {
        if (!tagSearch.trim()) return rows;
        const needle = tagSearch.trim().toLowerCase();
        return rows.filter((r) =>
          r.tags.some((t) => t.toLowerCase().includes(needle))
        );
      }, [rows, tagSearch]);

      // Handle edit insight functionality
      const handleEditInsight = async (insight) => {
        try {
          // Use the first source's transcript if available
          if (insight.sources && insight.sources.length > 0) {
            const firstTranscriptId = insight.sources[0].transcriptId;
            await handleSelectTranscript(firstTranscriptId);
          }

          // Navigate to Chat page
          navigateTo('Chat')

          // Note: The insight loading for editing would need to be handled by the parent component
          // For now, we'll just navigate to Chat with the transcript loaded
        } catch (error) {
          console.error('Failed to load transcript for editing:', error)
          // Even if transcript loading fails, still navigate to Chat
          navigateTo('Chat')
        }
      };
    
      /* ─── Components ───────────────────────────────────── */
      // Header Component
      const Header = () => (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h1 className="text-2xl font-bold text-indigo-700">Insight Library</h1>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial sm:w-64">
              <input 
                type="text" 
                placeholder="Search tags..." 
                value={tagSearch} 
                onChange={(e) => setTagSearch(e.target.value)} 
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
              />
              <SearchIcon size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            </div>
            <div className="flex rounded-lg overflow-hidden border border-gray-300">
              <button 
                onClick={() => setViewMode('grid')} 
                className={`p-2 ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                <GridIcon size={20} />
              </button>
              <button 
                onClick={() => setViewMode('list')} 
                className={`p-2 ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                <ListIcon size={20} />
              </button>
            </div>
          </div>
        </div>
      );

      // Sidebar Component
      const Sidebar = () => (
        <aside className="w-64 p-5 bg-white">
          <div className="mb-6">
            <h2 className="font-bold text-lg text-indigo-700 mb-6">Filters</h2>
            <div>
              <h3 className="font-medium text-gray-700 mb-3">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {allTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${
                      filterTags.includes(tag)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>
      );

      // Card Component
      const InsightCard = ({ insight }) => {
        const [isHovered, setIsHovered] = useState(false);
        
        return (
          <div 
            className="bg-white rounded-lg shadow hover:shadow-md transition-all duration-200 hover:-translate-y-1 overflow-hidden" 
            onMouseEnter={() => setIsHovered(true)} 
            onMouseLeave={() => setIsHovered(false)}
            style={{ height: '260px' }} // Reduced height
          >
            <div className="h-2 bg-gradient-to-r from-indigo-600 to-purple-600"></div>
            <div className="p-4 flex flex-col" style={{ height: 'calc(100% - 8px)' }}> {/* Reduced padding */}
              {/* Header with title and source count - now with more space */}
              <div className="flex justify-between items-start mb-3 flex-1"> {/* Reduced margin */}
                <h3 className="font-medium text-sm text-gray-800 pr-2" style={{ lineHeight: '1.3' }}> {/* Reduced font size and line height */}
                  {insight.insightName}
                </h3>
                {insight.sourceCount > 0 && (
                  <div className="flex-shrink-0">
                    <div className="px-2 py-0.5 rounded-full bg-indigo-100 flex items-center justify-center border border-gray-200"> {/* Source count badge */}
                      <span className="text-xs font-medium text-indigo-700">
                        {insight.sourceCount}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Bottom section with date, tags, and icons */}
              <div className="flex justify-between items-end">
                {/* Left side - Date and Tags */}
                <div className="flex-1">
                  <div className="text-xs text-gray-500 mb-1"> {/* Smaller font and margin */}
                    {new Date(insight.createdAt).toLocaleDateString()}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {insight.tags.map((tag, index) => (
                      <span 
                        key={index} 
                        className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full" /* Reduced padding */
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                
                {/* Right side - Action icons */}
                <div className={`flex space-x-1.5 transition-opacity duration-200 ml-3 ${isHovered ? 'opacity-100' : 'opacity-50'}`}> {/* Reduced spacing */}
                  <div className="relative group">
                    <FileTextIcon 
                      size={16} /* Smaller icons */
                      className="text-indigo-600 hover:text-indigo-800 cursor-pointer" 
                      onClick={() => onSelectInsight(insight)}
                    />
                    <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-50">
                      View
                    </div>
                  </div>
                  <div className="relative group">
                    <MessageCircleIcon 
                      size={16} /* Smaller icons */
                      className="text-indigo-600 hover:text-indigo-800 cursor-pointer" 
                      onClick={() => handleEditInsight(insight)}
                    />
                    <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-50">
                      Edit
                    </div>
                  </div>
                  <div className="relative group">
                    <TrashIcon 
                      size={16} /* Smaller icons */
                      className="text-indigo-600 hover:text-red-600 cursor-pointer" 
                      onClick={() => confirmDelete(insight)}
                    />
                    <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-50">
                      Delete
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      };

      // List Item Component
      const InsightListItem = ({ insight }) => (
        <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200">
          <div className="flex justify-between items-start">
            <div className="flex-1 cursor-pointer" onClick={() => onSelectInsight(insight)}>
              <h3 className="font-medium text-gray-900 mb-1">{insight.insightName}</h3>
              <div className="text-sm text-gray-500 mb-2">
                {new Date(insight.createdAt).toLocaleDateString()}
                {insight.sourceCount > 0 && ` • ${insight.sourceCount} source${insight.sourceCount !== 1 ? 's' : ''}`}
              </div>
              <div className="flex flex-wrap gap-1">
                {insight.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex space-x-2 ml-4">
              <FileTextIcon 
                size={18} 
                className="text-indigo-600 hover:text-indigo-800 cursor-pointer" 
                onClick={() => onSelectInsight(insight)}
              />
              <MessageCircleIcon 
                size={18} 
                className="text-indigo-600 hover:text-indigo-800 cursor-pointer" 
                onClick={() => handleEditInsight(insight)}
              />
              <TrashIcon 
                size={18} 
                className="text-indigo-600 hover:text-red-600 cursor-pointer" 
                onClick={() => confirmDelete(insight)}
              />
            </div>
          </div>
        </div>
      );

      /* ─── Main UI ───────────────────────────────────────── */
      return (
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            <Header />
            <div className="flex gap-6">
              <Sidebar />
              <main className="flex-1">
                {filteredRows.length === 0 ? (
                  <div className="text-center text-gray-500 mt-12">
                    <p className="text-lg">No insights found.</p>
                    <p className="text-sm mt-2">Try adjusting your filters or search terms.</p>
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredRows.map((insight) => (
                      <InsightCard key={insight.id} insight={insight} />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredRows.map((insight) => (
                      <InsightListItem key={insight.id} insight={insight} />
                    ))}
                  </div>
                )}
              </main>
            </div>
          </div>
        </div>
      );
    }
    