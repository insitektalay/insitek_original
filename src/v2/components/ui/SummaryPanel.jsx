import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export default function SummaryPanel({ onClose, transcript, onTranscriptSelected }) {
  const [list, setList] = useState([]);
  const [current, setCurrent] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [bulletCount, setBulletCount] = useState(6);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/transcripts`).then((r) => r.json()).then(setList);
  }, []);

  useEffect(() => {
    if (transcript) {
      setCurrent(transcript);
      setSelectedId(transcript.id);
    }
  }, [transcript?.id]);

  useEffect(() => {
    if (!selectedId) return;
    if (current && current.id === selectedId && current.text) return;
    fetch(`${API_URL}/api/transcripts/${selectedId}`)
      .then((r) => r.json())
      .then((t) => {
        setCurrent(t);
        onTranscriptSelected?.(t);
      });
  }, [selectedId, current]);

  // Helper function to force split text into exact number of bullet points
  const forceSplitIntoBulletPoints = (text, numPoints) => {
    // Clean the text (remove the bullet if it exists)
    let cleanText = text.trim();
    if (cleanText.startsWith("•")) {
      cleanText = cleanText.substring(1).trim();
    }
    
    // Calculate approximate length per bullet point
    const totalLength = cleanText.length;
    const lengthPerPoint = Math.floor(totalLength / numPoints);
    
    // Find good split points (end of sentences) near our target lengths
    let bulletPoints = [];
    let startIndex = 0;
    
    for (let i = 0; i < numPoints - 1; i++) {
      const targetIndex = startIndex + lengthPerPoint;
      
      // Look for a period, question mark, or exclamation point after the target index
      let endIndex = cleanText.indexOf('. ', targetIndex);
      if (endIndex === -1) endIndex = cleanText.indexOf('? ', targetIndex);
      if (endIndex === -1) endIndex = cleanText.indexOf('! ', targetIndex);
      
      // If we couldn't find a good split point, just use approximate length
      if (endIndex === -1) {
        endIndex = targetIndex;
        // Try to avoid splitting words
        while (endIndex < cleanText.length && cleanText[endIndex] !== ' ') {
          endIndex++;
        }
      } else {
        // Include the period in this segment
        endIndex += 1;
      }
      
      // Extract the segment and add it as a bullet point
      const segment = cleanText.substring(startIndex, endIndex).trim();
      bulletPoints.push(`• ${segment}`);
      
      // Update start index for next segment
      startIndex = endIndex + 1;
    }
    
    // Add the last segment
    const lastSegment = cleanText.substring(startIndex).trim();
    bulletPoints.push(`• ${lastSegment}`);
    
    return bulletPoints;
  };

  const handleGenerate = async () => {
    if (!current?.text) return alert("Transcript not loaded yet.");
    setLoading(true);
    setLines([]);

    // Much clearer prompt that emphasizes separate bullet points
    const prompt = `Summarize this transcript into EXACTLY ${bulletCount} SEPARATE bullet points. Format requirements:
- Each point MUST be on its own line
- Each point MUST start with "• " (bullet symbol + space)
- Keep each bullet point concise and focused on ONE key idea only
- DO NOT combine multiple ideas into a single bullet point
- Each bullet point should be 1-2 sentences maximum
- NEVER include any end markers like [END_SUMMARY]

Transcript:
${current.text}

Summary:`;

    try {
      const res = await fetch(`${API_URL}/api/chat/completion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          temperature: 0.3,
          stop: ["</s>", "Summary:", "[END_", "END_"],
          n_predict: 1024,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let full = "";
      let newLines = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop();

        for (const line of parts) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;

          try {
            const { content } = JSON.parse(payload);
            if (content) {
              // Skip content with end markers
              if (content.includes("[END_") || content.includes("END_")) continue;
              
              full += content;
              // Clean the text of any end markers
              const cleanText = full.replace(/\[END_.*?\]/g, "");
              
              // Extract bullet points - look for lines that start with bullet points
              let extractedBullets = cleanText
                .split(/\n+/)
                .map(s => s.trim())
                .filter(s => s.length > 0)
                .map(s => s.startsWith("•") ? s : `• ${s}`);
              
              // If we have at least one bullet point but fewer than requested
              if (extractedBullets.length >= 1 && extractedBullets.length < bulletCount) {
                // Check if we have one big bullet point that needs to be split
                if (extractedBullets.length === 1 && extractedBullets[0].length > 100) {
                  // Force split the long bullet point into the requested number
                  extractedBullets = forceSplitIntoBulletPoints(extractedBullets[0], bulletCount);
                }
              }
              
              // Update the display lines, limiting to bulletCount
              newLines = extractedBullets.slice(0, bulletCount);
              
              // If we still don't have enough points, pad with placeholders
              while (newLines.length < bulletCount) {
                newLines.push(`• ...`);
              }
              
              setLines([...newLines]);
            }
          } catch {}
        }
      }

      // Final cleanup - ensure we have the exact number of bullet points
      if (full && full.length > 0) {
        const cleanText = full.replace(/\[END_.*?\]/g, "");
        
        let finalBullets = cleanText
          .split(/\n+/)
          .map(s => s.trim())
          .filter(s => s.length > 0)
          .map(s => s.startsWith("•") ? s : `• ${s}`);
        
        // If we only have one bullet point but it's long, force split it
        if (finalBullets.length === 1 && finalBullets[0].length > 100) {
          finalBullets = forceSplitIntoBulletPoints(finalBullets[0], bulletCount);
        }
        
        // Ensure we have exactly the requested number
        finalBullets = finalBullets.slice(0, bulletCount);
        while (finalBullets.length < bulletCount) {
          finalBullets.push(`• `);
        }
        
        setLines([...finalBullets]);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to generate summary.");
    }

    setLoading(false);
  };

  return (
    <div className="p-4 h-full flex flex-col space-y-4 text-xs relative">
      {/* Close button removed */}

      <div className="flex-1 overflow-auto space-y-4">
        <div>
          <label className="block text-xs font-bold mb-1">Select Transcript:</label>
          <select
            value={selectedId || ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
            className="w-full border rounded px-2 py-1 border-gray-300 text-xs"
          >
            <option value="">-- choose --</option>
            {list.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>

        {current && (
          <div className="flex flex-wrap gap-1">
            <span className="bg-green-100 text-green-600 text-[10px] px-2 py-[2px] rounded-full">
              {current.channel}
            </span>
            {current.publishDate && (
              <span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-[2px] rounded-full">
                {new Date(current.publishDate).toLocaleDateString()}
              </span>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-bold mb-1">Bullet points:</label>
          <input
            type="number"
            min="1"
            value={bulletCount}
            onChange={(e) => setBulletCount(Number(e.target.value))}
            className="w-full border rounded px-2 py-1 border-gray-300 text-xs"
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={!current || loading}
          className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold py-1.5 rounded text-xs"
        >
          {loading ? "Generating…" : "Generate Summary"}
        </button>

        {lines.length > 0 && (
          <div className="space-y-3 pt-3 text-xs text-gray-800">
            {lines.map((line, i) => (
              <div key={i} className="flex items-start">
                <div className="flex-shrink-0 w-4 mr-1">{line.charAt(0)}</div>
                <div className="flex-1">{line.substring(1).trim()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}