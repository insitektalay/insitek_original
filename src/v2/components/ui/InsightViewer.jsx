// Removed Card components for minimal layout

export default function InsightViewer({ onClose, insight, onEdit }) {
  if (!insight) {
    return (
      <div className="p-4 h-full flex flex-col text-xs text-gray-500">
        Select an insight from the list to view it.
      </div>
    );
  }

  return (
    <div className="p-4 h-full flex flex-col text-xs overflow-auto">
      {/* Header with back and edit buttons */}
      <div className="flex justify-between items-center mb-4 pb-2 border-b">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
        >
          ← Back to Insights
        </button>
        <button
          onClick={() => onEdit(insight)}
          className="bg-blue-500 text-white text-xs rounded px-3 py-1 hover:bg-blue-600"
        >
          Edit
        </button>
      </div>

      {/* Insight title */}
      <h2 className="text-lg font-bold mb-3 text-gray-800">{insight.title}</h2>

      {/* Insight content */}
      <div className="text-gray-700 leading-relaxed mb-4 flex-1">
        <div dangerouslySetInnerHTML={{ __html: insight.content }} />
      </div>

      {/* Tags and metadata */}
      <div className="border-t pt-3 mt-auto">
        <div className="text-gray-400 text-[10px] mb-2">
          Created: {new Date(insight.createdAt).toLocaleString()}
        </div>
        <div className="flex flex-wrap gap-1">
          <span className="bg-green-100 text-green-600 text-[10px] px-2 py-[2px] rounded-full">
            {insight.channel}
          </span>
          {insight.tags.map((t) => (
            <span key={t} className="bg-blue-100 text-blue-600 text-[10px] px-2 py-[2px] rounded-full">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
