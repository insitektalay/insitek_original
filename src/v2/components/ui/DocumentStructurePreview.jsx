// src/v2/components/ui/DocumentStructurePreview.jsx
import { ChevronDownIcon, ChevronRightIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'

export default function DocumentStructurePreview({ structure, onApprove, onBack }) {
  const [expandedSections, setExpandedSections] = useState(new Set([0])) // First section expanded by default

  const toggleSection = (index) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  const expandAll = () => {
    setExpandedSections(new Set(structure.sections.map((_, i) => i)))
  }

  const collapseAll = () => {
    setExpandedSections(new Set())
  }

  return (
    <div className="py-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start gap-4 mb-4">
          <DocumentTextIcon className="w-12 h-12 text-indigo-600 flex-shrink-0" />
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              {structure.title}
            </h2>
            <p className="text-lg text-gray-600 mb-4">
              {structure.description}
            </p>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <span className="font-medium">Estimated length:</span> {structure.estimatedLength}
              </span>
              <span className="flex items-center gap-1">
                <span className="font-medium">Sections:</span> {structure.sections.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-indigo-900">
          <span className="font-semibold">Review the structure below.</span> This outline will guide the document generation process.
          Proceeding will start generation (takes 5-10 minutes depending on content complexity).
        </p>
      </div>

      {/* Expand/Collapse Controls */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Document Outline</h3>
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="text-sm text-indigo-600 hover:text-indigo-700 px-3 py-1 rounded-md hover:bg-indigo-50 transition-colors"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="text-sm text-gray-600 hover:text-gray-700 px-3 py-1 rounded-md hover:bg-gray-100 transition-colors"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-3 mb-8">
        {structure.sections.map((section, index) => {
          const isExpanded = expandedSections.has(index)

          return (
            <div
              key={index}
              className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-sm transition-shadow"
            >
              {/* Section Header */}
              <button
                onClick={() => toggleSection(index)}
                className="w-full flex items-start gap-3 p-5 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex-shrink-0 mt-1">
                  {isExpanded ? (
                    <ChevronDownIcon className="w-5 h-5 text-gray-500" />
                  ) : (
                    <ChevronRightIcon className="w-5 h-5 text-gray-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-indigo-600">
                      Section {section.number}
                    </span>
                    <h4 className="text-lg font-semibold text-gray-900">
                      {section.title}
                    </h4>
                  </div>
                  {!isExpanded && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                      {section.description}
                    </p>
                  )}
                </div>
              </button>

              {/* Section Details (Expanded) */}
              {isExpanded && (
                <div className="px-5 pb-5 pt-2 border-t border-gray-100">
                  <p className="text-gray-700 mb-4 leading-relaxed">
                    {section.description}
                  </p>

                  {section.keyTopics && section.keyTopics.length > 0 && (
                    <div>
                      <h5 className="text-sm font-semibold text-gray-900 mb-2">
                        Key Topics Covered:
                      </h5>
                      <ul className="space-y-1.5">
                        {section.keyTopics.map((topic, topicIndex) => (
                          <li
                            key={topicIndex}
                            className="flex items-start gap-2 text-sm text-gray-600"
                          >
                            <span className="text-indigo-500 mt-1">•</span>
                            <span>{topic}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-6 border-t border-gray-200">
        <button
          onClick={onBack}
          className="px-6 py-2.5 border border-gray-300 rounded-md text-gray-700 font-medium hover:bg-gray-50 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onApprove}
          className="px-8 py-2.5 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 transition-colors shadow-sm"
        >
          Generate Document →
        </button>
      </div>

      {/* Footer Note */}
      <p className="text-xs text-gray-500 text-center mt-6">
        Generation will analyze {structure.sections.length} sections across your selected transcripts using AI synthesis
      </p>
    </div>
  )
}
