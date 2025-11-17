// src/v2/components/ui/ImageUploadPanel.jsx
import { useState, useRef, useEffect } from "react";
import { ImageIcon, Upload, X, CheckCircle, AlertCircle, Loader } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001";
const MAX_IMAGES = 10;

export default function ImageUploadPanel({ onDone }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadResults, setUploadResults] = useState(null);
  const [importId, setImportId] = useState(null);
  const [progressPercent, setProgressPercent] = useState(0);

  const fileInputRef = useRef(null);
  const wsRef = useRef(null);

  // WebSocket connection for progress updates
  useEffect(() => {
    if (!importId) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected for image upload");
      ws.send(JSON.stringify({ type: 'subscribe', importId }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'progress' && data.importId === importId) {
          setUploadProgress(data.stage);
          setProgressPercent(data.progress || 0);
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [importId]);

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files);

    if (files.length > MAX_IMAGES) {
      alert(`You can only upload up to ${MAX_IMAGES} images at once.`);
      return;
    }

    // Validate file types
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic'];
    const invalidFiles = files.filter(file => !validTypes.includes(file.type));

    if (invalidFiles.length > 0) {
      alert(`Invalid file type(s). Only JPG, PNG, and HEIC images are allowed.`);
      return;
    }

    setSelectedFiles(files);
    setUploadResults(null);
  };

  const handleRemoveFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      alert("Please select at least one image to upload");
      return;
    }

    setIsUploading(true);
    setUploadProgress("Starting upload...");
    setProgressPercent(0);

    const newImportId = `image-${Date.now()}`;
    setImportId(newImportId);

    try {
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('images', file);
      });
      formData.append('importId', newImportId);

      const response = await fetch(`${API_URL}/api/transcribe-images`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      setUploadResults(data);
      setUploadProgress("Completed");
      setProgressPercent(100);

      // Clear selected files on success
      if (data.processedCount > 0) {
        setSelectedFiles([]);
      }

      // Notify parent component that transcripts were created
      if (onDone) {
        setTimeout(() => onDone(), 1500); // Small delay to show success message
      }

    } catch (error) {
      console.error("Upload error:", error);
      setUploadProgress(`Error: ${error.message}`);
      setUploadResults({
        success: false,
        processedCount: 0,
        errorCount: selectedFiles.length,
        errors: [{ error: error.message }]
      });
    } finally {
      setIsUploading(false);
      setImportId(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    if (imageFiles.length > 0) {
      handleFileSelect({ target: { files: imageFiles } });
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 bg-purple-500/20 rounded-lg">
          <ImageIcon size={24} className="text-purple-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white mb-1">Upload Images</h3>
          <p className="text-sm text-gray-400">
            Extract text from images using OCR. Upload photos of documents, recipes, notes, or any text-containing images (max {MAX_IMAGES} at once).
          </p>
        </div>
      </div>

      {/* File Upload Area */}
      <div
        className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-purple-500 transition-colors cursor-pointer"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={48} className="mx-auto mb-4 text-gray-400" />
        <p className="text-white mb-2">
          <span className="font-semibold">Click to upload</span> or drag and drop
        </p>
        <p className="text-sm text-gray-400">
          JPG, PNG, or HEIC (max {MAX_IMAGES} images, 10MB each)
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/heic"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          disabled={isUploading}
        />
      </div>

      {/* Selected Files List */}
      {selectedFiles.length > 0 && !isUploading && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-white">
              Selected Images ({selectedFiles.length}/{MAX_IMAGES})
            </h4>
            <button
              onClick={() => setSelectedFiles([])}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Clear All
            </button>
          </div>
          {selectedFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between bg-slate-700 rounded p-3"
            >
              <div className="flex items-center gap-3">
                <ImageIcon size={20} className="text-purple-400" />
                <div>
                  <p className="text-sm text-white">{file.name}</p>
                  <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFile(index);
                }}
                className="text-gray-400 hover:text-red-400 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Button */}
      {selectedFiles.length > 0 && !isUploading && !uploadResults && (
        <button
          onClick={handleUpload}
          className="mt-4 w-full bg-purple-600 hover:bg-purple-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <Upload size={18} />
          Upload and Process {selectedFiles.length} Image{selectedFiles.length !== 1 ? 's' : ''}
        </button>
      )}

      {/* Progress Display */}
      {isUploading && (
        <div className="mt-4 bg-slate-700 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <Loader size={18} className="text-purple-400 animate-spin" />
            <p className="text-sm text-white font-semibold">{uploadProgress}</p>
          </div>
          <div className="w-full bg-slate-600 rounded-full h-2 overflow-hidden">
            <div
              className="bg-purple-500 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{progressPercent}% complete</p>
        </div>
      )}

      {/* Results Display */}
      {uploadResults && (
        <div className="mt-4 bg-slate-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            {uploadResults.processedCount > 0 ? (
              <CheckCircle size={20} className="text-green-400 mt-0.5" />
            ) : (
              <AlertCircle size={20} className="text-red-400 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="text-white font-semibold mb-2">
                {uploadResults.processedCount > 0 ? 'Upload Complete!' : 'Upload Failed'}
              </p>

              {uploadResults.processedCount > 0 && (
                <p className="text-sm text-gray-300 mb-2">
                  Successfully processed {uploadResults.processedCount} image{uploadResults.processedCount !== 1 ? 's' : ''}.
                  Transcripts have been created and are ready to view.
                </p>
              )}

              {uploadResults.errorCount > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-red-400 mb-1">
                    {uploadResults.errorCount} error{uploadResults.errorCount !== 1 ? 's' : ''}:
                  </p>
                  <div className="space-y-1">
                    {uploadResults.errors.map((err, idx) => (
                      <p key={idx} className="text-xs text-gray-400">
                        {err.filename ? `${err.filename}: ` : ''}{err.error}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {uploadResults.results && uploadResults.results.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-gray-400 font-semibold mb-1">Created Transcripts:</p>
                  {uploadResults.results.map((result, idx) => (
                    <p key={idx} className="text-xs text-gray-300">
                      • {result.title} ({result.textLength} characters)
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => {
              setUploadResults(null);
              setUploadProgress("");
              setProgressPercent(0);
            }}
            className="mt-4 w-full bg-slate-600 hover:bg-slate-500 text-white py-2 px-4 rounded font-semibold transition-colors"
          >
            Upload More Images
          </button>
        </div>
      )}
    </div>
  );
}
