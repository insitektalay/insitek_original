/* src/v2/components/ui/ImportProgressSection.jsx
   Real-time import progress tracking for queue videos
   --------------------------------------------------------------- */
import { CheckCircle, Clock, Loader, XCircle, AlertTriangle } from 'lucide-react';

export default function ImportProgressSection({ importStatus }) {
  if (!importStatus) return null;

  const { importing, videos, completed, pending, processing, failed } = importStatus;

  // Group videos by status
  const processingVideos = videos.filter(v => v.status === 'PROCESSING');
  const pendingVideos = videos.filter(v => v.status === 'PENDING' && !v.error);
  const completedVideos = videos.filter(v => v.status === 'COMPLETED');
  const failedVideos = videos.filter(v => v.status === 'ERROR' || v.error);

  const getStatusIcon = (status, error) => {
    if (error) return <XCircle className="w-5 h-5 text-red-600" />;

    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'PROCESSING':
        return <Loader className="w-5 h-5 text-indigo-600 animate-spin" />;
      case 'ERROR':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status, error) => {
    if (error) return 'bg-red-50 border-red-200';

    switch (status) {
      case 'COMPLETED':
        return 'bg-green-50 border-green-200';
      case 'PROCESSING':
        return 'bg-indigo-50 border-indigo-200';
      case 'ERROR':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="mb-8">
      {/* Header Summary */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {importing ? (
              <Loader className="w-6 h-6 text-indigo-600 animate-spin" />
            ) : (
              <CheckCircle className="w-6 h-6 text-green-600" />
            )}
            <div>
              <h3 className="font-semibold text-gray-900">
                {importing ? 'Import in Progress' : 'Import Complete'}
              </h3>
              <p className="text-sm text-gray-600">
                {completed} of {videos.length} videos completed
                {processing > 0 && ` • ${processing} processing`}
                {pending > 0 && ` • ${pending} pending`}
                {failed > 0 && ` • ${failed} failed`}
              </p>
            </div>
          </div>

          {/* Overall Progress Bar */}
          <div className="w-48">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span>Overall Progress</span>
              <span>{Math.round((completed / videos.length) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(completed / videos.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Processing Videos */}
      {processingVideos.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Loader className="w-4 h-4 text-indigo-600 animate-spin" />
            Currently Processing ({processingVideos.length})
          </h4>
          <div className="space-y-2">
            {processingVideos.map((video) => (
              <div
                key={video.id}
                className={`border rounded-lg p-3 ${getStatusColor(video.status, video.error)}`}
              >
                <div className="flex items-start gap-3">
                  {getStatusIcon(video.status, video.error)}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-gray-900 truncate pr-2">
                        {video.title}
                      </p>
                      <span className="text-sm text-gray-600 flex-shrink-0">
                        {video.progress}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-white bg-opacity-50 rounded-full h-1.5 mb-1">
                      <div
                        className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${video.progress}%` }}
                      />
                    </div>

                    <p className="text-xs text-gray-600">{video.stage}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Videos (Collapsed by default if many) */}
      {pendingVideos.length > 0 && (
        <details className="mb-4" open={pendingVideos.length <= 5}>
          <summary className="cursor-pointer text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            Waiting in Queue ({pendingVideos.length})
          </summary>
          <div className="space-y-2 mt-2">
            {pendingVideos.map((video) => (
              <div
                key={video.id}
                className={`border rounded-lg p-3 ${getStatusColor(video.status, video.error)}`}
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(video.status, video.error)}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {video.title}
                    </p>
                    <p className="text-xs text-gray-600">{video.stage}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Failed Videos */}
      {failedVideos.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-600" />
            Failed ({failedVideos.length})
          </h4>
          <div className="space-y-2">
            {failedVideos.map((video) => (
              <div
                key={video.id}
                className="border border-red-200 rounded-lg p-3 bg-red-50"
              >
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 mb-1">
                      {video.title}
                    </p>
                    {video.error && (
                      <div className="bg-white bg-opacity-50 rounded p-2 mb-2">
                        <p className="text-xs text-red-800 font-mono">
                          {video.error}
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-gray-600">
                      This video failed to import. You may need to try importing it manually.
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Videos (Collapsed) */}
      {completedVideos.length > 0 && (
        <details className="mb-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            Completed ({completedVideos.length})
          </summary>
          <div className="space-y-2 mt-2">
            {completedVideos.slice(0, 10).map((video) => (
              <div
                key={video.id}
                className="border border-green-200 rounded-lg p-3 bg-green-50"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {video.title}
                    </p>
                    <p className="text-xs text-green-700">Successfully imported</p>
                  </div>
                </div>
              </div>
            ))}
            {completedVideos.length > 10 && (
              <p className="text-xs text-gray-500 text-center py-2">
                ... and {completedVideos.length - 10} more
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
