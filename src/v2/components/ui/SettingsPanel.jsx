/* src/v2/components/ui/SettingsPanel.jsx
   Settings panel for YouTube API key management - supports multiple keys with rotation
   --------------------------------------------------------------- */
import { useState, useEffect } from 'react';
import { Settings, CheckCircle, XCircle, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useYouTubeApiKey } from '../../hooks/useYouTubeApiKey';

const KEYS_STORAGE_KEY = 'youtube_api_keys';
const METADATA_STORAGE_KEY = 'youtube_api_keys_metadata';

export default function SettingsPanel() {
  const [newApiKey, setNewApiKey] = useState('');
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null
  const [isValidating, setIsValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { keyStatuses, refreshKeys } = useYouTubeApiKey();

  useEffect(() => {
    // Refresh keys on mount to ensure we have latest data
    refreshKeys();
  }, [refreshKeys]);

  const validateApiKey = async (key) => {
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&maxResults=1&key=${key}`
      );

      if (response.ok) {
        return { valid: true };
      } else {
        const data = await response.json();
        return {
          valid: false,
          error: data.error?.message || 'Invalid API key. Please check your key and try again.'
        };
      }
    } catch (err) {
      return {
        valid: false,
        error: 'Unable to validate API key. Please check your internet connection.'
      };
    }
  };

  const handleAddKey = async () => {
    if (!newApiKey.trim()) {
      setSaveStatus('error');
      setErrorMessage('Please enter an API key');
      return;
    }

    setIsValidating(true);
    setSaveStatus(null);
    setErrorMessage('');

    const result = await validateApiKey(newApiKey);

    if (result.valid) {
      // Load existing keys
      const keysJson = localStorage.getItem(KEYS_STORAGE_KEY);
      const keys = keysJson ? JSON.parse(keysJson) : [];

      // Check for duplicate
      if (keys.includes(newApiKey)) {
        setSaveStatus('error');
        setErrorMessage('This API key has already been added');
        setIsValidating(false);
        return;
      }

      // Add new key
      const newKeys = [...keys, newApiKey];
      localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(newKeys));

      // Initialize metadata for new key
      const metadataJson = localStorage.getItem(METADATA_STORAGE_KEY);
      const metadata = metadataJson ? JSON.parse(metadataJson) : {};
      metadata[keys.length] = { quotaExceeded: false, lastUsed: null };
      localStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(metadata));

      setSaveStatus('success');
      setErrorMessage('');
      setNewApiKey('');
      refreshKeys();
    } else {
      setSaveStatus('error');
      setErrorMessage(result.error);
    }

    setIsValidating(false);
  };

  const handleRemoveKey = (index) => {
    // Load existing keys
    const keysJson = localStorage.getItem(KEYS_STORAGE_KEY);
    const keys = keysJson ? JSON.parse(keysJson) : [];

    // Remove key at index
    const newKeys = keys.filter((_, i) => i !== index);
    localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(newKeys));

    // Update metadata (re-index)
    const metadataJson = localStorage.getItem(METADATA_STORAGE_KEY);
    const metadata = metadataJson ? JSON.parse(metadataJson) : {};
    const newMetadata = {};
    newKeys.forEach((_, newIndex) => {
      const oldIndex = keys.findIndex((k, oldIdx) => oldIdx > index ? oldIdx === newIndex + 1 : oldIdx === newIndex);
      if (metadata[oldIndex >= 0 ? oldIndex : newIndex]) {
        newMetadata[newIndex] = metadata[oldIndex >= 0 ? oldIndex : newIndex];
      }
    });
    localStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(newMetadata));

    setSaveStatus(null);
    setErrorMessage('');
    refreshKeys();
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-6 h-6 text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      </div>

      {/* YouTube Integration Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">YouTube Integration</h2>

        {/* Existing API Keys List */}
        {keyStatuses.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Your API Keys</h3>
            <div className="space-y-2">
              {keyStatuses.map((keyStatus, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-md"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-gray-900 truncate">
                      {keyStatus.key}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        keyStatus.status === 'Active'
                          ? 'bg-green-100 text-green-800'
                          : keyStatus.status === 'Quota exceeded'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {keyStatus.status}
                    </span>
                    <button
                      onClick={() => handleRemoveKey(idx)}
                      className="text-red-600 hover:text-red-800 transition-colors"
                      title="Remove this API key"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add New API Key Input */}
        <div className="mb-4">
          <label htmlFor="newApiKey" className="block text-sm font-medium text-gray-700 mb-2">
            {keyStatuses.length > 0 ? 'Add Another API Key' : 'YouTube Data API Key'}
          </label>
          <div className="flex gap-2">
            <input
              id="newApiKey"
              type="text"
              value={newApiKey}
              onChange={(e) => setNewApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddKey()}
              placeholder="AIzaSyC..."
              className="flex-1 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
            />
            <button
              onClick={handleAddKey}
              disabled={isValidating}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {isValidating ? 'Validating...' : 'Add Key'}
            </button>
          </div>
        </div>

        {/* Status Messages */}
        {saveStatus === 'success' && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">API key added successfully!</p>
              <p className="text-sm text-green-700 mt-1">
                Your API keys are stored locally in your browser and never sent to our servers.
              </p>
            </div>
          </div>
        )}

        {saveStatus === 'error' && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Error validating API key</p>
              <p className="text-sm text-red-700 mt-1">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="border-t border-gray-200 pt-4 mt-6">
          <p className="text-sm font-medium text-gray-900 mb-2">
            Don't have an API key? Get one free at:
          </p>
          <a
            href="https://console.cloud.google.com/apis"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            console.cloud.google.com/apis
            <ExternalLink className="w-4 h-4" />
          </a>

          <div className="mt-4 space-y-2 text-sm text-gray-600">
            <p className="font-medium text-gray-700">Instructions:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Go to Google Cloud Console</li>
              <li>Create a new project (or select existing)</li>
              <li>Enable "YouTube Data API v3"</li>
              <li>Create credentials → API Key</li>
              <li>Copy and paste the key above</li>
            </ol>
          </div>

          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>ℹ️ Privacy Note:</strong> Your API keys are stored locally in your browser
              and never sent to our servers. Each key gets 10,000 API units per day (≈100 searches)
              on the free tier.
            </p>
          </div>

          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-sm text-amber-900">
              <strong>💡 Pro Tip:</strong> Add multiple API keys to scale your quota! With 5 keys, you get
              50,000 units/day. The system automatically rotates to the next key when one reaches quota,
              and resets all keys daily at midnight Pacific Time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
