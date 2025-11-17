import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for managing prompt templates (Custom Instructions)
 * Provides CRUD operations and filtering capabilities
 */
export function usePromptTemplates() {
  const [templates, setTemplates] = useState([]);
  const [recentTemplates, setRecentTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Load all templates with optional filters
   * @param {Object} filters - Optional filters { category: string[], search: string }
   */
  const loadTemplates = useCallback(async (filters = {}) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.category?.length > 0) {
        params.append('category', filters.category.join(','));
      }
      if (filters.search) {
        params.append('search', filters.search);
      }

      const response = await fetch(`/api/prompt-templates?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }

      const data = await response.json();
      setTemplates(data);
    } catch (err) {
      console.error('Error loading templates:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load recently used templates
   * @param {number} limit - Number of recent templates to fetch (default: 5)
   */
  const loadRecentTemplates = useCallback(async (limit = 5) => {
    try {
      const response = await fetch(`/api/prompt-templates/recent?limit=${limit}`);
      if (!response.ok) {
        throw new Error('Failed to fetch recent templates');
      }

      const data = await response.json();
      setRecentTemplates(data);
    } catch (err) {
      console.error('Error loading recent templates:', err);
    }
  }, []);

  /**
   * Get a single template by ID
   * @param {string} id - Template ID
   * @returns {Promise<Object>} Template object
   */
  const getTemplate = useCallback(async (id) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/prompt-templates/${id}`);
      if (!response.ok) {
        throw new Error('Template not found');
      }

      return await response.json();
    } catch (err) {
      console.error('Error fetching template:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Create a new template
   * @param {Object} data - Template data { name, description, promptText, category }
   * @returns {Promise<Object>} Created template
   */
  const createTemplate = useCallback(async (data) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/prompt-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create template');
      }

      const newTemplate = await response.json();
      setTemplates(prev => [newTemplate, ...prev]);
      return newTemplate;
    } catch (err) {
      console.error('Error creating template:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update an existing template
   * @param {string} id - Template ID
   * @param {Object} data - Updated data { name, description, promptText, category }
   * @returns {Promise<Object>} Updated template
   */
  const updateTemplate = useCallback(async (id, data) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/prompt-templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update template');
      }

      const updatedTemplate = await response.json();
      setTemplates(prev => prev.map(t => t.id === id ? updatedTemplate : t));
      return updatedTemplate;
    } catch (err) {
      console.error('Error updating template:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Delete a template
   * @param {string} id - Template ID
   */
  const deleteTemplate = useCallback(async (id) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/prompt-templates/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete template');
      }

      setTemplates(prev => prev.filter(t => t.id !== id));
      setRecentTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('Error deleting template:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Mark a template as used (increments usage count and updates lastUsedAt)
   * @param {string} id - Template ID
   * @returns {Promise<Object>} Updated template
   */
  const markTemplateUsed = useCallback(async (id) => {
    try {
      const response = await fetch(`/api/prompt-templates/${id}/use`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to mark template as used');
      }

      const updatedTemplate = await response.json();

      // Update templates list
      setTemplates(prev => prev.map(t => t.id === id ? updatedTemplate : t));

      // Refresh recent templates
      loadRecentTemplates();

      return updatedTemplate;
    } catch (err) {
      console.error('Error marking template as used:', err);
      throw err;
    }
  }, [loadRecentTemplates]);

  /**
   * Get all unique categories from templates
   * @returns {string[]} Array of unique category names
   */
  const getAllCategories = useCallback(() => {
    const categoriesSet = new Set();
    templates.forEach(template => {
      template.category?.forEach(cat => categoriesSet.add(cat));
    });
    return Array.from(categoriesSet).sort();
  }, [templates]);

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
    loadRecentTemplates();
  }, [loadTemplates, loadRecentTemplates]);

  return {
    templates,
    recentTemplates,
    loading,
    error,
    loadTemplates,
    loadRecentTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    markTemplateUsed,
    getAllCategories
  };
}
