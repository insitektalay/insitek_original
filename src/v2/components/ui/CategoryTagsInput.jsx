/* src/v2/components/ui/CategoryTagsInput.jsx
   Tag-style category input with autocomplete
   --------------------------------------------------------------- */
import { useState, useRef, useEffect } from 'react';
import { X, Tag } from 'lucide-react';

export default function CategoryTagsInput({
  selectedCategories = [],
  availableCategories = [],
  onChange,
  placeholder = "Add categories..."
}) {
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        !inputRef.current.contains(event.target)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter suggestions based on input
  useEffect(() => {
    if (!inputValue.trim()) {
      setFilteredSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const input = inputValue.toLowerCase();
    const suggestions = availableCategories.filter(
      cat =>
        cat.toLowerCase().includes(input) &&
        !selectedCategories.includes(cat)
    );

    setFilteredSuggestions(suggestions);
    setShowDropdown(suggestions.length > 0);
  }, [inputValue, availableCategories, selectedCategories]);

  const addCategory = (category) => {
    const trimmed = category.trim();
    if (!trimmed) return;

    // Check if already selected
    if (selectedCategories.includes(trimmed)) {
      setInputValue('');
      setShowDropdown(false);
      return;
    }

    // Add the category
    onChange([...selectedCategories, trimmed]);
    setInputValue('');
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const removeCategory = (categoryToRemove) => {
    onChange(selectedCategories.filter(cat => cat !== categoryToRemove));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      // If there's a suggestion, use the first one
      if (filteredSuggestions.length > 0) {
        addCategory(filteredSuggestions[0]);
      } else if (inputValue.trim()) {
        // Create new category
        addCategory(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && selectedCategories.length > 0) {
      // Remove last category if input is empty
      removeCategory(selectedCategories[selectedCategories.length - 1]);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    addCategory(suggestion);
  };

  // Category badge colors
  const categoryColors = [
    'bg-blue-100 text-blue-800',
    'bg-green-100 text-green-800',
    'bg-purple-100 text-purple-800',
    'bg-pink-100 text-pink-800',
    'bg-yellow-100 text-yellow-800',
    'bg-indigo-100 text-indigo-800',
  ];

  const getCategoryColor = (index) => {
    return categoryColors[index % categoryColors.length];
  };

  return (
    <div className="relative">
      {/* Tags Display + Input */}
      <div className="min-h-[42px] p-2 border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 bg-white">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Selected Categories as Tags */}
          {selectedCategories.map((category, index) => (
            <span
              key={category}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium ${getCategoryColor(index)}`}
            >
              <Tag className="w-3 h-3" />
              {category}
              <button
                onClick={() => removeCategory(category)}
                className="ml-1 hover:opacity-70"
                type="button"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {/* Input Field */}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (inputValue && filteredSuggestions.length > 0) {
                setShowDropdown(true);
              }
            }}
            placeholder={selectedCategories.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[120px] outline-none bg-transparent text-sm"
          />
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      {showDropdown && filteredSuggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
        >
          {filteredSuggestions.map((suggestion) => (
            <div
              key={suggestion}
              onClick={() => handleSuggestionClick(suggestion)}
              className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm flex items-center gap-2"
            >
              <Tag className="w-4 h-4 text-gray-400" />
              {suggestion}
            </div>
          ))}
        </div>
      )}

      {/* Helper Text */}
      <p className="mt-1 text-xs text-gray-500">
        Type and press Enter to add categories. Use existing or create new.
      </p>
    </div>
  );
}
