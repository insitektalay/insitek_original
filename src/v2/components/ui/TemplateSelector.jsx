import { useState, useMemo } from 'react';
import { X, SearchIcon, FileTextIcon, Clock } from 'lucide-react';
import { usePromptTemplates } from '../../hooks/usePromptTemplates';

export default function TemplateSelector({ onSelect, onClose }) {
  const {
    templates,
    recentTemplates,
    loading,
    getAllCategories
  } = usePromptTemplates();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [previewTemplate, setPreviewTemplate] = useState(null);

  const allCategories = getAllCategories();

  /* ─── Filter templates ─────────────────────────────────── */
  const filteredTemplates = useMemo(() => {
    let filtered = templates;

    // Filter by categories
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(template =>
        template.category?.some(cat => selectedCategories.includes(cat))
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const needle = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(template =>
        template.name.toLowerCase().includes(needle) ||
        template.description?.toLowerCase().includes(needle)
      );
    }

    return filtered;
  }, [templates, selectedCategories, searchQuery]);

  /* ─── Handlers ─────────────────────────────────────────── */
  const toggleCategory = (category) => {
    setSelectedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  const handleSelectTemplate = (template) => {
    onSelect(template);
  };

  /* ─── Components ───────────────────────────────────────── */

  // Template Item Component
  const TemplateItem = ({ template, showCategories = true }) => {
    const isPreview = previewTemplate?.id === template.id;

    return (
      <div
        className={`border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer ${
          isPreview ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white'
        }`}
        onMouseEnter={() => setPreviewTemplate(template)}
        onMouseLeave={() => setPreviewTemplate(null)}
        onClick={() => handleSelectTemplate(template)}
      >
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-medium text-gray-900">{template.name}</h3>
          {template.usageCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
              {template.usageCount} uses
            </span>
          )}
        </div>

        {template.description && (
          <p className="text-sm text-gray-600 mb-2 line-clamp-2">{template.description}</p>
        )}

        {showCategories && template.category?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {template.category.map((cat, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full"
              >
                {cat}
              </span>
            ))}
          </div>
        )}

        <div className="text-xs text-gray-500">
          {template.lastUsedAt
            ? `Last used ${new Date(template.lastUsedAt).toLocaleDateString()}`
            : `Created ${new Date(template.createdAt).toLocaleDateString()}`
          }
        </div>

        {isPreview && (
          <div className="mt-3 pt-3 border-t border-indigo-200">
            <p className="text-xs font-medium text-indigo-700 mb-1">Preview:</p>
            <p className="text-xs text-gray-700 line-clamp-3 bg-white p-2 rounded border border-indigo-100 font-mono">
              {template.promptText}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-indigo-600 text-white p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold">Load Custom Instruction</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Search and Filters */}
        <div className="p-6 border-b bg-gray-50">
          <div className="relative mb-4">
            <input
              type="text"
              placeholder="Search instructions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              autoFocus
            />
            <SearchIcon size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>

          {/* Category Filters */}
          {allCategories.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Filter by category:</p>
              <div className="flex flex-wrap gap-2">
                {allCategories.map(category => (
                  <button
                    key={category}
                    onClick={() => toggleCategory(category)}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${
                      selectedCategories.includes(category)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 240px)' }}>
          {loading ? (
            <div className="text-center text-gray-500 py-8">
              <p>Loading instructions...</p>
            </div>
          ) : (
            <>
              {/* Recently Used Section */}
              {recentTemplates.length > 0 && !searchQuery && selectedCategories.length === 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock size={18} className="text-indigo-600" />
                    <h3 className="font-semibold text-gray-900">Recently Used</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {recentTemplates.slice(0, 4).map(template => (
                      <TemplateItem key={template.id} template={template} showCategories={false} />
                    ))}
                  </div>
                </div>
              )}

              {/* All Instructions Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileTextIcon size={18} className="text-indigo-600" />
                  <h3 className="font-semibold text-gray-900">
                    {searchQuery || selectedCategories.length > 0 ? 'Filtered Results' : 'All Instructions'}
                  </h3>
                  <span className="text-sm text-gray-500">({filteredTemplates.length})</span>
                </div>

                {filteredTemplates.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <FileTextIcon size={48} className="mx-auto mb-4 text-gray-400" />
                    <p className="text-lg">No instructions found.</p>
                    <p className="text-sm mt-2">
                      {templates.length === 0
                        ? "Create your first custom instruction to get started."
                        : "Try adjusting your search or filters."
                      }
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredTemplates.map(template => (
                      <TemplateItem key={template.id} template={template} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
