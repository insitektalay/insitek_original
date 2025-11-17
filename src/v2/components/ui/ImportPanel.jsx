/* src/components/ui/ImportPanel.jsx
   Updated with real-time progress tracking via WebSocket
   --------------------------------------------------------------- */
   import { useState, useRef, useMemo, useEffect } from "react";
   import { CheckIcon } from '@heroicons/react/20/solid';
   import { PlusIcon, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
   import { useImportContext } from '../../contexts/ImportContext.jsx';

   const MAX_ITEMS = 20;
   const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
   const WS_URL = API_URL.replace('http', 'ws');
   const STALE_THRESHOLD_MS = 15000; // 15 seconds without update = stale
   
   /* ----------------------------------------------------------------- */
   export default function ImportPanel({ onDone, isImporting, importYoutube }) {
     /* ----- persistent banner via context ----------------------------- */
     const { activeJob } = useImportContext();
     /* rows ----------------------------------------------------------- */
     const [items, setItems] = useState([
       { id: Date.now(), url: "", state: "idle", pct: 0, err: "", stage: "", importId: null, originalUrl: "", startedAt: null, lastUpdatedAt: null, debugLog: [] },
     ]);
     const wsRef = useRef(null);
     const timers = useRef({});
     const [expandedDebug, setExpandedDebug] = useState({});
     const [currentTime, setCurrentTime] = useState(Date.now());

     /* Update current time every second for elapsed/stale calculations */
     useEffect(() => {
       const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
       return () => clearInterval(interval);
     }, []);

     /* WebSocket connection for real-time progress */
     useEffect(() => {
       const connectWebSocket = () => {
         try {
           wsRef.current = new WebSocket(WS_URL);
           
           wsRef.current.onopen = () => {
             console.log('WebSocket connected for progress updates');
           };
           
           wsRef.current.onmessage = (event) => {
             try {
               const data = JSON.parse(event.data);
               if (data.type === 'progress') {
                 const { importId, stage, progress } = data;
                 const timestamp = Date.now();

                 console.log(`[${new Date(timestamp).toISOString()}] Progress update:`, { importId, stage, progress });

                 setItems(prev => prev.map(item => {
                   if (item.importId === importId) {
                     // Ensure progress only goes forward, never backwards
                     const newProgress = Math.max(item.pct || 0, progress);

                     // Add to debug log
                     const debugEntry = {
                       timestamp,
                       stage,
                       progress: newProgress,
                       message: `${stage} - ${newProgress}%`
                     };

                     return {
                       ...item,
                       stage,
                       pct: newProgress,
                       lastUpdatedAt: timestamp,
                       state: newProgress >= 100 ? "done" : "busy",
                       err: stage.startsWith('Error') ? stage : "",
                       debugLog: [...(item.debugLog || []), debugEntry]
                     };
                   }
                   return item;
                 }));
               }
             } catch (e) {
               console.error('Error parsing WebSocket message:', e);
             }
           };
           
           wsRef.current.onclose = () => {
             console.log('WebSocket disconnected, attempting reconnect...');
             setTimeout(connectWebSocket, 3000);
           };
           
           wsRef.current.onerror = (error) => {
             console.error('WebSocket error:', error);
           };
         } catch (error) {
           console.error('Failed to create WebSocket connection:', error);
         }
       };
       
       connectWebSocket();
       
       return () => {
         if (wsRef.current) {
           wsRef.current.close();
         }
       };
     }, []);
   
     /* derived stats -------------------------------------------------- */
     const stat = useMemo(() => {
       const total = items.filter((i) => i.url.trim()).length;
       const done  = items.filter((i) => i.state === "done").length;
       const fail  = items.filter((i) => i.state === "error").length;
       const pct   = total ? Math.round(((done + fail) / total) * 100) : 0;
       const finished = total && done + fail === total;
       return { total, done, fail, pct, finished };
     }, [items]);
   
     /* helpers -------------------------------------------------------- */
     const addRow = () =>
       setItems((p) =>
         p.length >= MAX_ITEMS
           ? p
           : [...p, { id: Date.now(), url: "", state: "idle", pct: 0, err: "", stage: "", importId: null, originalUrl: "", startedAt: null, lastUpdatedAt: null, debugLog: [] }]
       );
   
     const setUrl = (id, url) =>
       setItems((p) => p.map((it) => (it.id === id ? { ...it, url } : it)));

     /* Cancel import function */
     const cancelImport = async (id, importId) => {
       if (!importId) return;

       try {
         console.log('Canceling import:', importId);

         const response = await fetch(`${API_URL}/api/cancel-import`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ importId })
         });

         if (!response.ok) {
           const error = await response.json();
           throw new Error(error.error || 'Failed to cancel import');
         }

         // Update item state
         setItems((p) =>
           p.map((it) => (it.id === id ? { ...it, state: "error", err: "Cancelled by user", stage: "Cancelled" } : it))
         );

         console.log('Import cancelled successfully');
       } catch (err) {
         console.error('Error canceling import:', err);
         alert(`Failed to cancel import: ${err.message}`);
       }
     };
   
     /* Real import function using new WebSocket API ------------------- */
     const doImport = async (id, url) => {
       try {
         const importId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
         const startTime = Date.now();

         // Store original URL and clear input immediately when import starts
         setItems((p) =>
           p.map((it) => (it.id === id ? { ...it, state: "busy", pct: 0, importId, stage: "Starting", originalUrl: url, url: "", startedAt: startTime, lastUpdatedAt: startTime, debugLog: [{ timestamp: startTime, stage: "Starting", progress: 0, message: "Import started" }] } : it))
         );
         
         // Subscribe to progress updates for this import
         if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
           wsRef.current.send(JSON.stringify({
             type: 'subscribe',
             importId
           }));
         }
         
         // Start the import
         const response = await fetch(`${API_URL}/api/transcribe-youtube`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ url, importId })
         });
         
         if (!response.ok) {
           const error = await response.json();
           throw new Error(error.error || 'Import failed');
         }
         
         // The progress will be handled by WebSocket messages
         console.log('Import started successfully');
         
       } catch (err) {
         setItems((p) =>
           p.map((it) =>
             it.id === id
               ? { ...it, state: "error", pct: 100, err: err.message, stage: "Error" }
               : it
           )
         );
       }
     };
   
     const importAll = async () => {
       const targets = items.filter((it) => it.url.trim());
       if (!targets.length) {
         alert("⚠️  Paste at least one YouTube URL first.");
         return;
       }
   
       // Process imports sequentially to avoid overwhelming the API
       for (const target of targets) {
         await doImport(target.id, target.url.trim());
         // Add a small delay between imports
         await new Promise(resolve => setTimeout(resolve, 1000));
       }
   
       // Wait for all imports to complete, then show results
       const checkComplete = () => {
         const currentItems = items.filter(i => i.url.trim());
         const completed = currentItems.filter(i => i.state === "done" || i.state === "error");
         
         if (completed.length === currentItems.length) {
           const finalStats = {
             done: currentItems.filter(i => i.state === "done").length,
             fail: currentItems.filter(i => i.state === "error").length
           };
           
           alert(`✅ ${finalStats.done} imported   ❌ ${finalStats.fail} failed`);
           onDone?.();
         } else {
           setTimeout(checkComplete, 2000);
         }
       };
       
       setTimeout(checkComplete, 2000);
     };
   
     /* Progress Stage Components ------------------------------------ */
     const getStageStatus = (stageName, currentStage, progress) => {
       const stages = [
         { name: 'Extracting', range: [0, 10] },
         { name: 'Downloading', range: [10, 30] }, 
         { name: 'Transcribing', range: [30, 85] },
         { name: 'Saving', range: [85, 100] }
       ];
       
       const stage = stages.find(s => s.name === stageName);
       if (!stage) return 'upcoming';
       
       // Special case: if progress is 100, all stages are complete
       if (progress >= 100) return 'complete';
       
       // A stage is complete when progress has moved beyond its range
       if (progress > stage.range[1]) return 'complete';
       
       // A stage is current if we're in its range or the current stage matches
       if ((progress >= stage.range[0] && progress <= stage.range[1]) || currentStage.includes(stageName)) {
         return 'current';
       }
       
       return 'upcoming';
     };
     
     const getStageProgress = (stageName, currentStage, overallProgress) => {
       const stages = [
         { name: 'Extracting', range: [0, 10] },
         { name: 'Downloading', range: [10, 30] }, 
         { name: 'Transcribing', range: [30, 85] },
         { name: 'Saving', range: [85, 100] }
       ];
       
       const stage = stages.find(s => s.name === stageName);
       if (!stage) return 0;
       
       const [min, max] = stage.range;
       
       if (overallProgress <= min) return 0;
       if (overallProgress >= max) return 100;
       
       // Calculate progress within this stage
       return Math.round(((overallProgress - min) / (max - min)) * 100);
     };
     
     function classNames(...classes) {
       return classes.filter(Boolean).join(' ');
     }

     /* Time formatting helpers ---------------------------------------- */
     const formatElapsedTime = (startTime) => {
       if (!startTime) return '';
       const elapsedMs = currentTime - startTime;
       const seconds = Math.floor(elapsedMs / 1000);
       const minutes = Math.floor(seconds / 60);
       const hours = Math.floor(minutes / 60);

       if (hours > 0) {
         return `${hours}h ${minutes % 60}m`;
       } else if (minutes > 0) {
         return `${minutes}m ${seconds % 60}s`;
       } else {
         return `${seconds}s`;
       }
     };

     const isStale = (lastUpdated) => {
       if (!lastUpdated) return false;
       return (currentTime - lastUpdated) > STALE_THRESHOLD_MS;
     };

     const getTimeSinceUpdate = (lastUpdated) => {
       if (!lastUpdated) return '';
       return formatElapsedTime(lastUpdated);
     };

     const StageIndicators = ({ currentStage, overallProgress, startedAt, lastUpdatedAt, showStaleWarning, importId, itemId, onCancel }) => {
       const stages = ['Extracting', 'Downloading', 'Transcribing', 'Saving'];
       const elapsedTime = formatElapsedTime(startedAt);
       const timeSinceUpdate = getTimeSinceUpdate(lastUpdatedAt);

       return (
         <div className="mt-2 space-y-2">
           {/* Elapsed time and stale warning */}
           <div className="flex justify-between items-center text-xs gap-2">
             <div className="text-gray-600">
               {elapsedTime && <span>Elapsed: {elapsedTime}</span>}
             </div>
             <div className="flex items-center gap-2">
               {showStaleWarning && (
                 <div className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                   <AlertCircle size={14} />
                   <span>No updates for {timeSinceUpdate}</span>
                 </div>
               )}
               {importId && onCancel && (
                 <button
                   onClick={() => onCancel(itemId, importId)}
                   className="text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-md transition-colors"
                 >
                   Cancel
                 </button>
               )}
             </div>
           </div>

           <nav aria-label="Progress">
             <ol role="list" className="flex items-center">
               {stages.map((stage, stepIdx) => {
                 const status = getStageStatus(stage, currentStage, overallProgress);
                 const stageProgress = getStageProgress(stage, currentStage, overallProgress);
                 
                 return (
                   <li key={stage} className="relative flex-1 flex items-center">
                     {/* Progress bar first */}
                     <div className="flex-1">
                       <div className="h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                         <div 
                           className="h-1 bg-indigo-600 transition-all duration-300 rounded-full"
                           style={{ width: `${stageProgress}%` }}
                         />
                       </div>
                     </div>
                     
                     {/* Circle at the end of progress bar */}
                     {status === 'complete' ? (
                       <div className="flex size-6 items-center justify-center rounded-full bg-indigo-600">
                         <CheckIcon aria-hidden="true" className="size-3 text-white" />
                       </div>
                     ) : status === 'current' ? (
                       <div className="flex size-6 items-center justify-center rounded-full border-2 border-indigo-600 bg-white">
                         <span aria-hidden="true" className="size-2 rounded-full bg-indigo-600" />
                       </div>
                     ) : (
                       <div className="flex size-6 items-center justify-center rounded-full border-2 border-gray-300 bg-white">
                         <span aria-hidden="true" className="size-2 rounded-full bg-transparent" />
                       </div>
                     )}
                   </li>
                 );
               })}
             </ol>
           </nav>
           
           {/* Stage labels and progress percentages only */}
           <div className="grid grid-cols-4 gap-2 text-[9px]">
             {stages.map((stage) => {
               const stageProgress = getStageProgress(stage, currentStage, overallProgress);
               const status = getStageStatus(stage, currentStage, overallProgress);
               
               return (
                 <div key={stage} className="text-center">
                   <div className={`font-medium ${status === 'current' ? 'text-indigo-600' : status === 'complete' ? 'text-indigo-600' : 'text-gray-400'}`}>
                     {stage}
                   </div>
                   <div className="mt-1 text-[8px] text-gray-500">
                     {stageProgress}%
                   </div>
                 </div>
               );
             })}
           </div>
         </div>
       );
     };
   
     /* ---------------------------------------------------------------- */
     return (
       <div className="space-y-4">
         {/* Persistent status banner */}
         {activeJob && (
           <div
             className={`rounded-md p-3 text-sm font-medium ${
               activeJob.state === 'DONE'
                 ? 'bg-green-100 text-green-800'
                 : activeJob.state === 'ERROR'
                 ? 'bg-red-100 text-red-800'
                 : 'bg-blue-100 text-blue-800'
             }`}
           >
             <div className="flex justify-between items-center gap-2">
               <span>
                 {activeJob.state === 'DONE'
                   ? 'Import completed'
                   : activeJob.state === 'ERROR'
                   ? activeJob.stage || 'Import error'
                   : `Importing…  ${activeJob.stage}`}
               </span>
               <span>{activeJob.progress ?? 0}%</span>
             </div>
             {activeJob.state !== 'ERROR' && (
               <div className="h-2 bg-white/40 rounded-full mt-2">
                 <div
                   className="h-2 bg-current rounded-full transition-all duration-300"
                   style={{ width: `${activeJob.progress}%` }}
                 />
               </div>
             )}
           </div>
         )}

         {/* Video URL inputs */}
         <div className="space-y-3">
           {items.map((it, idx) => (
             <input
               key={it.id}
               type="text"
               placeholder={`YouTube URL #${idx + 1}`}
               value={it.url}
               disabled={it.state === "busy" || isImporting}
               onChange={(e) => setUrl(it.id, e.target.value)}
               className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
             />
           ))}
         </div>

         {/* Controls */}
         <div className="flex flex-wrap gap-3">
           <button
             onClick={addRow}
             disabled={items.length >= MAX_ITEMS || isImporting}
             className="flex items-center gap-1 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
           >
             <PlusIcon size={18} />
             Add video
           </button>

           <button
             onClick={importAll}
             disabled={isImporting}
             className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
           >
             {isImporting ? "Importing..." : "Import"}
           </button>
         </div>

         <p className="text-gray-500 text-sm">
           You can queue up to {MAX_ITEMS} videos.
         </p>

         {/* Show importing videos with improved styling */}
         {items.filter(it => it.state !== "idle").map((it) => (
           <div key={`importing-${it.id}`} className="space-y-3 border-t border-gray-200 pt-4">
             {/* Show URL being imported */}
             {it.originalUrl && (
               <div className="text-sm text-gray-600 truncate bg-gray-50 p-2 rounded-md">
                 {it.originalUrl}
               </div>
             )}

             {/* Stage indicators for both busy and completed states */}
             {(it.state === "busy" || it.state === "done") && it.stage && (
               <>
                 <StageIndicators
                   currentStage={it.stage}
                   overallProgress={it.pct}
                   startedAt={it.startedAt}
                   lastUpdatedAt={it.lastUpdatedAt}
                   showStaleWarning={it.state === "busy" && isStale(it.lastUpdatedAt)}
                   importId={it.importId}
                   itemId={it.id}
                   onCancel={it.state === "busy" ? cancelImport : null}
                 />

                 {/* Debug panel toggle */}
                 {it.debugLog && it.debugLog.length > 0 && (
                   <div className="mt-2">
                     <button
                       onClick={() => setExpandedDebug(prev => ({ ...prev, [it.id]: !prev[it.id] }))}
                       className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 transition-colors"
                     >
                       {expandedDebug[it.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                       <span>{expandedDebug[it.id] ? 'Hide' : 'Show'} debug log ({it.debugLog.length} events)</span>
                     </button>

                     {/* Expandable debug log */}
                     {expandedDebug[it.id] && (
                       <div className="mt-2 bg-gray-900 text-green-400 p-3 rounded-md text-xs font-mono max-h-48 overflow-y-auto">
                         {it.debugLog.map((entry, idx) => (
                           <div key={idx} className="mb-1">
                             <span className="text-gray-500">
                               [{new Date(entry.timestamp).toLocaleTimeString()}]
                             </span>{' '}
                             <span className="text-blue-400">{entry.stage}</span> -{' '}
                             <span className="text-yellow-400">{entry.progress}%</span>
                             {entry.message && (
                               <span className="text-green-400"> - {entry.message}</span>
                             )}
                           </div>
                         ))}
                       </div>
                     )}
                   </div>
                 )}
               </>
             )}

             {/* Error display */}
             {it.state === "error" && (
               <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md border border-red-200">
                 <strong>Error:</strong> {it.err}
               </div>
             )}
           </div>
         ))}
       </div>
     );
   }