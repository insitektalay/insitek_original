import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { usePromptTemplates } from '../../hooks/usePromptTemplates';
import CategoryTagsInput from './CategoryTagsInput';

export default function TemplateEditor({ template, onClose }) {
  const { createTemplate, updateTemplate, getAllCategories } = usePromptTemplates();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    promptText: '',
    category: []
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const availableCategories = getAllCategories();
  const isEditMode = !!template;

  // Initialize form data when template changes
  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name || '',
        description: template.description || '',
        promptText: template.promptText || '',
        category: template.category || []
      });
    } else {
      setFormData({
        name: '',
        description: '',
        promptText: '',
        category: []
      });
    }
  }, [template]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    if (!formData.promptText.trim()) {
      setError('Instruction text is required');
      return;
    }

    setSaving(true);

    try {
      if (isEditMode) {
        await updateTemplate(template.id, formData);
      } else {
        await createTemplate(formData);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-indigo-600 text-white p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold">
            {isEditMode ? 'Edit Custom Instruction' : 'New Custom Instruction'}
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {/* Name Field */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g., Executive Summary Template"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Description Field */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description <span className="text-gray-400 text-xs">(optional)</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Brief description of when to use this instruction..."
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Instruction Text Field */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Instruction Text <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.promptText}
              onChange={(e) => handleChange('promptText', e.target.value)}
              placeholder="Enter your custom instruction template here..."
              rows={12}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              {formData.promptText.length} characters
            </p>
          </div>

          {/* Categories Field */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Categories <span className="text-gray-400 text-xs">(optional)</span>
            </label>
            <CategoryTagsInput
              selectedCategories={formData.category}
              availableCategories={availableCategories}
              onChange={(categories) => handleChange('category', categories)}
              placeholder="Add categories..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Press Enter to add a category. Categories help organize and filter your instructions.
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            disabled={saving}
          >
            {saving ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Create Instruction')}
          </button>
        </div>
      </div>
    </div>
  );
}
