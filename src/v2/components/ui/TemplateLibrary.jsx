import { useEffect, useMemo, useState } from "react";
import { usePromptTemplates } from '../../hooks/usePromptTemplates';
import {
  GridIcon,
  ListIcon,
  SearchIcon,
  EditIcon,
  TrashIcon,
  PlusIcon,
  FileTextIcon
} from 'lucide-react';
import TemplateEditor from './TemplateEditor';

export default function TemplateLibrary() {
  const {
    templates,
    loading,
    loadTemplates,
    deleteTemplate,
    getAllCategories
  } = usePromptTemplates();

  /* ─── State ─────────────────────────────────────────── */
  const [viewMode, setViewMode] = useState('grid');
  const [filterCategories, setFilterCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  const allCategories = getAllCategories();

  /* ─── Filter templates ─────────────────────────────────── */
  const filteredTemplates = useMemo(() => {
    let filtered = templates;

    // Filter by categories
    if (filterCategories.length > 0) {
      filtered = filtered.filter(template =>
        template.category?.some(cat => filterCategories.includes(cat))
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
  }, [templates, filterCategories, searchQuery]);

  /* ─── Handlers ─────────────────────────────────────────── */
  const toggleCategory = (category) =>
    setFilterCategories((prev) =>
      prev.includes(category) ? prev.filter((x) => x !== category) : [...prev, category]
    );

  const handleCreateNew = () => {
    setEditingTemplate(null);
    setShowEditor(true);
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setShowEditor(true);
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setEditingTemplate(null);
    loadTemplates(); // Refresh list
  };

  const confirmDelete = async (template) => {
    const ok = window.confirm(
      `Delete the custom instruction:\n"${template.name}"?`
    );
    if (!ok) return;

    try {
      await deleteTemplate(template.id);
    } catch (error) {
      alert('Failed to delete template: ' + error.message);
    }
  };

  /* ─── Components ───────────────────────────────────────── */

  // Header Component
  const Header = () => (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
      <h1 className="text-2xl font-bold text-indigo-700">Custom Instructions</h1>
      <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
        <div className="relative flex-1 sm:flex-initial sm:w-64">
          <input
            type="text"
            placeholder="Search instructions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <SearchIcon size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        </div>
        <div className="flex gap-2">
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
          <button
            onClick={handleCreateNew}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <PlusIcon size={20} />
            New Instruction
          </button>
        </div>
      </div>
    </div>
  );

  // Sidebar Component
  const Sidebar = () => (
    <aside className="w-64 p-5 bg-white rounded-lg shadow">
      <div className="mb-6">
        <h2 className="font-bold text-lg text-indigo-700 mb-6">Filters</h2>
        <div>
          <h3 className="font-medium text-gray-700 mb-3">Categories</h3>
          {allCategories.length === 0 ? (
            <p className="text-sm text-gray-500">No categories yet</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allCategories.map(category => (
                <button
                  key={category}
                  onClick={() => toggleCategory(category)}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    filterCategories.includes(category)
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );

  // Template Card Component
  const TemplateCard = ({ template }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
      <div
        className="bg-white rounded-lg shadow hover:shadow-md transition-all duration-200 hover:-translate-y-1 overflow-hidden"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ height: '260px' }}
      >
        <div className="h-2 bg-gradient-to-r from-indigo-600 to-purple-600"></div>
        <div className="p-4 flex flex-col" style={{ height: 'calc(100% - 8px)' }}>
          {/* Header with title and usage count */}
          <div className="flex justify-between items-start mb-3 flex-1">
            <h3 className="font-medium text-sm text-gray-800 pr-2 line-clamp-2" style={{ lineHeight: '1.3' }}>
              {template.name}
            </h3>
            {template.usageCount > 0 && (
              <div className="flex-shrink-0">
                <div className="px-2 py-0.5 rounded-full bg-green-100 flex items-center justify-center border border-green-200">
                  <span className="text-xs font-medium text-green-700">
                    {template.usageCount}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          {template.description && (
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              {template.description}
            </p>
          )}

          {/* Bottom section with date, categories, and icons */}
          <div className="flex justify-between items-end mt-auto">
            {/* Left side - Date and Categories */}
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">
                {template.lastUsedAt
                  ? `Used ${new Date(template.lastUsedAt).toLocaleDateString()}`
                  : `Created ${new Date(template.createdAt).toLocaleDateString()}`
                }
              </div>
              <div className="flex flex-wrap gap-1">
                {template.category?.map((cat, index) => (
                  <span
                    key={index}
                    className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>

            {/* Right side - Action icons */}
            <div className={`flex space-x-1.5 transition-opacity duration-200 ml-3 ${isHovered ? 'opacity-100' : 'opacity-50'}`}>
              <div className="relative group">
                <EditIcon
                  size={16}
                  className="text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  onClick={() => handleEdit(template)}
                />
                <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-50">
                  Edit
                </div>
              </div>
              <div className="relative group">
                <TrashIcon
                  size={16}
                  className="text-indigo-600 hover:text-red-600 cursor-pointer"
                  onClick={() => confirmDelete(template)}
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
  const TemplateListItem = ({ template }) => (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200">
      <div className="flex justify-between items-start">
        <div className="flex-1 cursor-pointer" onClick={() => handleEdit(template)}>
          <div className="flex items-center gap-2 mb-1">
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
          <div className="text-sm text-gray-500 mb-2">
            {template.lastUsedAt
              ? `Last used: ${new Date(template.lastUsedAt).toLocaleDateString()}`
              : `Created: ${new Date(template.createdAt).toLocaleDateString()}`
            }
          </div>
          <div className="flex flex-wrap gap-1">
            {template.category?.map((cat, index) => (
              <span
                key={index}
                className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
        <div className="flex space-x-2 ml-4">
          <EditIcon
            size={18}
            className="text-indigo-600 hover:text-indigo-800 cursor-pointer"
            onClick={() => handleEdit(template)}
          />
          <TrashIcon
            size={18}
            className="text-indigo-600 hover:text-red-600 cursor-pointer"
            onClick={() => confirmDelete(template)}
          />
        </div>
      </div>
    </div>
  );

  /* ─── Main UI ───────────────────────────────────────── */
  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          <Header />
          <div className="flex gap-6">
            <Sidebar />
            <main className="flex-1">
              {loading ? (
                <div className="text-center text-gray-500 mt-12">
                  <p className="text-lg">Loading custom instructions...</p>
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="text-center text-gray-500 mt-12">
                  <FileTextIcon size={48} className="mx-auto mb-4 text-gray-400" />
                  <p className="text-lg">No custom instructions found.</p>
                  <p className="text-sm mt-2">
                    {templates.length === 0
                      ? "Get started by creating your first instruction template."
                      : "Try adjusting your filters or search terms."
                    }
                  </p>
                  {templates.length === 0 && (
                    <button
                      onClick={handleCreateNew}
                      className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors inline-flex items-center gap-2"
                    >
                      <PlusIcon size={20} />
                      Create First Instruction
                    </button>
                  )}
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredTemplates.map((template) => (
                    <TemplateCard key={template.id} template={template} />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredTemplates.map((template) => (
                    <TemplateListItem key={template.id} template={template} />
                  ))}
                </div>
              )}
            </main>
          </div>
        </div>
      </div>

      {/* Template Editor Modal */}
      {showEditor && (
        <TemplateEditor
          template={editingTemplate}
          onClose={handleCloseEditor}
        />
      )}
    </>
  );
}
