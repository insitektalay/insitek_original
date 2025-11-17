import { useEffect, useRef, useState } from "react";

const API        = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const CHUNK_SIZE = 50;
const POLL_MS    = 3000;

/* small util */
const barCls = (s) =>
  s === "error" ? "bg-red-500"
  : s === "done" ? "bg-green-600"
  : s === "busy" ? "bg-blue-500 animate-pulse"
  : "bg-blue-200";

function Row({ n, url, pct, state, err }) {
  return (
    <div className="bg-white p-3 rounded border border-gray-200">
      <div className="text-sm font-medium text-gray-900 mb-1">
        <span className="font-mono text-indigo-600">#{n.toString().padStart(3, "0")}</span>{" "}
      </div>
      <div className="text-xs text-gray-600 truncate mb-2">{url}</div>
      <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-300 rounded-full ${barCls(state)}`} 
          style={{ width: `${pct}%` }} 
        />
      </div>
      {state === "error" && (
        <div className="text-red-600 text-xs mt-2 bg-red-50 p-2 rounded border border-red-200">
          <strong>Error:</strong> {err || "Import failed - check server logs for details"}
        </div>
      )}
      {state === "done" && err && (
        <div className="text-yellow-700 text-xs mt-2 bg-yellow-50 p-2 rounded border border-yellow-200">
          {err}
        </div>
      )}
    </div>
  );
}

/* main component */
export default function ChannelImportPanel() {
  const [channel, setChannel] = useState("");
  const [meta, setMeta]       = useState(null);
  const [checking, setChk]    = useState(false);
  const [batch, setBatch]     = useState(CHUNK_SIZE);

  const [rows, setRows] = useState([]);
  const timers = useRef({});

  const [cnt, setCnt] = useState({ PENDING: 0, PROCESSING: 0, DONE: 0, ERROR: 0 });
  const [cancelling, setCancelling] = useState(false);
  const [clearing, setClearing] = useState(false);

  /* poll counters and actual job details */
  useEffect(() => {
    console.log('[ChannelImport] Starting import progress polling');
    const id = setInterval(async () => {
      const r = await fetch(`${API}/api/import-progress`);
      if (r.ok) {
        const counters = await r.json();
        console.log('[ChannelImport] Poll update:', counters);
        setCnt(counters);

        // Fetch all active import jobs (PENDING + PROCESSING) to show progress
        // and ERROR jobs to show failure details
        try {
          const jobsResp = await fetch(`${API}/api/import-jobs`);
          if (jobsResp.ok) {
            const allJobs = await jobsResp.json();
            console.log('[ChannelImport] All import jobs:', allJobs);

            // Update rows with actual job data
            setRows((prev) => {
              // Create a map of existing rows by URL for reference
              const existingRowMap = new Map(prev.map(r => [r.url, r]));

              // Map jobs to rows, preserving numbering for existing entries
              const updatedRows = allJobs.map((job, i) => {
                const existingRow = existingRowMap.get(job.url);
                return {
                  id: job.id,
                  n: existingRow ? existingRow.n : i + 1,
                  url: job.url,
                  pct: job.progress || 0,
                  state: job.state === 'DONE' ? 'done'
                       : job.state === 'ERROR' ? 'error'
                       : job.state === 'PROCESSING' ? 'busy'
                       : 'pending',
                  err: job.error || null
                };
              });

              return updatedRows;
            });
          }
        } catch (error) {
          console.error('[ChannelImport] Failed to fetch job details:', error);
        }
      } else {
        console.error('[ChannelImport] Failed to fetch progress:', r.status, r.statusText);
      }
    }, POLL_MS);
    return () => {
      console.log('[ChannelImport] Stopping import progress polling');
      clearInterval(id);
    };
  }, []);

  /* ------------ handlers ------------------------------------- */
  async function checkChannel() {
    console.log('[ChannelImport] checkChannel called with URL:', channel);
    if (!channel) {
      console.warn('[ChannelImport] No channel URL provided');
      return;
    }
    setChk(true);
    console.log('[ChannelImport] Fetching channel info from:', `${API}/api/channel-info`);

    try {
      const r = await fetch(`${API}/api/channel-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: channel }),
      });

      console.log('[ChannelImport] Channel info response status:', r.status);

      if (r.ok) {
        const metadata = await r.json();
        console.log('[ChannelImport] Channel metadata received:', metadata);
        setMeta(metadata);
      } else {
        const errorText = await r.text();
        console.error('[ChannelImport] Failed to check channel:', r.status, errorText);
      }
    } catch (error) {
      console.error('[ChannelImport] Error checking channel:', error);
    } finally {
      setChk(false);
      console.log('[ChannelImport] checkChannel completed');
    }
  }

  async function importBatch() {
    console.log('[ChannelImport] ========================================');
    console.log('[ChannelImport] importBatch called');
    console.log('[ChannelImport] Channel URL:', channel);
    console.log('[ChannelImport] Batch size:', batch);

    if (!channel) {
      console.warn('[ChannelImport] No channel URL provided, aborting import');
      return;
    }

    try {
      // Step 1: Get videos from channel
      console.log('[ChannelImport] Step 1: Fetching last videos from channel');
      console.log('[ChannelImport] API endpoint:', `${API}/api/channel-last-videos`);
      console.log('[ChannelImport] Request body:', { url: channel, count: batch });

      const r = await fetch(`${API}/api/channel-last-videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: channel, count: batch }),
      });

      console.log('[ChannelImport] channel-last-videos response status:', r.status);

      if (!r.ok) {
        const errorText = await r.text();
        console.error('[ChannelImport] Failed to fetch videos:', r.status, errorText);
        alert(`Failed to fetch videos: ${r.status} ${errorText}`);
        return;
      }

      const videoData = await r.json();
      console.log('[ChannelImport] Videos received:', videoData);
      const { videos } = videoData;
      console.log('[ChannelImport] Total videos retrieved:', videos?.length);

      if (!videos || videos.length === 0) {
        console.warn('[ChannelImport] No videos found in channel response');
        alert('No videos found in channel');
        return;
      }

      const slice = videos.slice(0, CHUNK_SIZE);
      console.log('[ChannelImport] Videos after slicing to chunk size:', slice.length, slice);

      // Step 2: Send bulk import request
      console.log('[ChannelImport] Step 2: Sending bulk import request');
      console.log('[ChannelImport] API endpoint:', `${API}/api/bulk-import`);
      console.log('[ChannelImport] Videos to import:', slice);

      const resp = await fetch(`${API}/api/bulk-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videos: slice }),
      });

      console.log('[ChannelImport] bulk-import response status:', resp.status);

      if (!resp.ok) {
        const errorText = await resp.text();
        console.error('[ChannelImport] Bulk import failed:', resp.status, errorText);
        alert(`Bulk import failed: ${resp.status} ${errorText}`);
        return;
      }

      const bulkData = await resp.json();
      console.log('[ChannelImport] Bulk import response:', bulkData);
      const { skipped = [] } = bulkData;
      console.log('[ChannelImport] Skipped videos:', skipped);

      // Step 3: Create rows for UI
      console.log('[ChannelImport] Step 3: Creating UI rows');
      const list = slice.map((v, i) => ({
        id: Date.now() + i,
        n: i + 1,
        url: v,
        pct: skipped.includes(v) ? 100 : 0,
        state: skipped.includes(v) ? "done" : "busy",
      }));
      console.log('[ChannelImport] Created rows:', list);

      setRows(list);

      console.log('[ChannelImport] importBatch completed successfully - jobs will be processed by queue');
      console.log('[ChannelImport] ========================================');
    } catch (error) {
      console.error('[ChannelImport] Error in importBatch:', error);
      console.error('[ChannelImport] Error stack:', error.stack);
      alert(`Import error: ${error.message}`);
    }
  }

  async function cancelAllImports() {
    console.log('[ChannelImport] cancelAllImports called');
    const total = cnt.PENDING + cnt.PROCESSING;

    if (total === 0) {
      console.log('[ChannelImport] No imports to cancel');
      return;
    }

    const confirmed = window.confirm(
      `Cancel ${total} import${total > 1 ? 's' : ''}?\n\n` +
      `Pending: ${cnt.PENDING}\n` +
      `Processing: ${cnt.PROCESSING}\n\n` +
      `This will stop active imports and clear the queue.`
    );

    if (!confirmed) {
      console.log('[ChannelImport] Cancellation cancelled by user');
      return;
    }

    setCancelling(true);
    console.log('[ChannelImport] Sending cancel request to:', `${API}/api/cancel-all-imports`);

    try {
      const r = await fetch(`${API}/api/cancel-all-imports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      console.log('[ChannelImport] Cancel response status:', r.status);

      if (r.ok) {
        const result = await r.json();
        console.log('[ChannelImport] Cancel result:', result);
        alert(`Cancelled ${result.cancelled} imports\nKilled ${result.processesKilled} processes\nDeleted ${result.filesDeleted} files`);

        // Refresh counters immediately
        const refreshResp = await fetch(`${API}/api/import-progress`);
        if (refreshResp.ok) {
          const counters = await refreshResp.json();
          setCnt(counters);
        }

        // Clear rows
        setRows([]);
      } else {
        const errorText = await r.text();
        console.error('[ChannelImport] Failed to cancel imports:', r.status, errorText);
        alert(`Failed to cancel imports: ${errorText}`);
      }
    } catch (error) {
      console.error('[ChannelImport] Error cancelling imports:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setCancelling(false);
      console.log('[ChannelImport] cancelAllImports completed');
    }
  }

  async function clearCompletedJobs() {
    console.log('[ChannelImport] clearCompletedJobs called');
    const total = cnt.DONE + cnt.ERROR + (cnt.CANCELLED || 0);

    if (total === 0) {
      console.log('[ChannelImport] No completed jobs to clear');
      return;
    }

    const confirmed = window.confirm(
      `Clear ${total} completed import job${total > 1 ? 's' : ''}?\n\n` +
      `Completed: ${cnt.DONE}\n` +
      `Failed: ${cnt.ERROR}\n` +
      `Cancelled: ${cnt.CANCELLED || 0}\n\n` +
      `This will remove them from the queue history.`
    );

    if (!confirmed) {
      console.log('[ChannelImport] Clear cancelled by user');
      return;
    }

    setClearing(true);
    console.log('[ChannelImport] Sending clear request to:', `${API}/api/clear-completed-imports`);

    try {
      const r = await fetch(`${API}/api/clear-completed-imports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      console.log('[ChannelImport] Clear response status:', r.status);

      if (r.ok) {
        const result = await r.json();
        console.log('[ChannelImport] Clear result:', result);
        alert(`Cleared ${result.cleared} completed import jobs`);

        // Refresh counters immediately
        const refreshResp = await fetch(`${API}/api/import-progress`);
        if (refreshResp.ok) {
          const counters = await refreshResp.json();
          setCnt(counters);
        }
      } else {
        const errorText = await r.text();
        console.error('[ChannelImport] Failed to clear completed jobs:', r.status, errorText);
        alert(`Failed to clear completed jobs: ${errorText}`);
      }
    } catch (error) {
      console.error('[ChannelImport] Error clearing completed jobs:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setClearing(false);
      console.log('[ChannelImport] clearCompletedJobs completed');
    }
  }

  /* ------------ render --------------------------------------- */
  return (
    <div className="space-y-4">
      <input
        type="text"
        className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        placeholder="https://youtube.com/@channel/videos"
        value={channel}
        onChange={(e) => setChannel(e.target.value)}
      />

      {meta && (
        <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
          <strong>{meta.total} videos</strong> — first {meta.firstDate ?? "?"} / last {meta.lastDate ?? "?"}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={checkChannel}
          disabled={checking}
          className={`bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors ${
            checking ? "bg-gray-400 cursor-not-allowed" : ""
          }`}
        >
          {checking ? "Checking…" : "Check channel"}
        </button>

        <input
          type="number"
          min={1}
          className="w-16 p-2 border border-gray-300 rounded-md text-center focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          value={batch}
          onChange={(e) => setBatch(+e.target.value || 1)}
        />

        <button
          onClick={importBatch}
          className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 transition-colors"
        >
          Import
        </button>
      </div>

      {(cnt.PENDING > 0 || cnt.PROCESSING > 0 || cnt.DONE > 0 || cnt.ERROR > 0) && (
        <div className="bg-gray-50 p-3 rounded-md">
          <div className="text-sm text-gray-700 space-y-1">
            <div className="flex justify-between">
              <span>Pending:</span>
              <span className="font-medium">{cnt.PENDING}</span>
            </div>
            <div className="flex justify-between">
              <span>Processing:</span>
              <span className="font-medium text-blue-600">{cnt.PROCESSING}</span>
            </div>
            <div className="flex justify-between">
              <span>Completed:</span>
              <span className="font-medium text-green-600">{cnt.DONE}</span>
            </div>
            <div className="flex justify-between">
              <span>Failed:</span>
              <span className="font-medium text-red-600">{cnt.ERROR}</span>
            </div>
          </div>
          {(cnt.PENDING > 0 || cnt.PROCESSING > 0) && (
            <button
              onClick={cancelAllImports}
              disabled={cancelling}
              className={`mt-3 w-full bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors text-sm font-medium ${
                cancelling ? "bg-gray-400 cursor-not-allowed" : ""
              }`}
            >
              {cancelling ? "Cancelling..." : "Cancel All Imports"}
            </button>
          )}
        </div>
      )}

      {/* Always visible button to clear completed import jobs */}
      <button
        onClick={clearCompletedJobs}
        disabled={clearing}
        className={`w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors text-sm font-medium ${
          clearing ? "bg-gray-400 cursor-not-allowed" : ""
        }`}
      >
        {clearing ? "Clearing..." : "Clear Completed Jobs"}
      </button>

      {rows.length > 0 && (
        <div className="border-t border-gray-200 pt-4 space-y-2">
          <h4 className="font-medium text-gray-900">Import Progress</h4>
          <div className="max-h-[40vh] overflow-y-auto space-y-2 bg-gray-50 p-3 rounded-md">
            {rows.map((r) => (
              <Row key={r.id} {...r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}