import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export default function SourceContextPanel({ onClose, transcript, selectedSuggestion }) {
  const [contexts, setContexts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedSuggestion && transcript?.text) {
      extractContexts(selectedSuggestion, transcript.text);
    }
  }, [selectedSuggestion, transcript]);

  const extractContexts = async (suggestion, transcriptText) => {
    setLoading(true);
    try {
      const prompt = `Given this AI-generated question: "${suggestion}"

And this transcript:
${transcriptText}

Identify 2-4 specific excerpts from the transcript that this question is referencing or relates to. For each excerpt:
1. Find the exact text (50-150 words each)
2. Explain briefly why it's relevant to the question

Format your response as:
EXCERPT 1:
[exact text from transcript]
RELEVANCE: [brief explanation]

EXCERPT 2:
[exact text from transcript]
RELEVANCE: [brief explanation]

Only use text that actually appears in the transcript.`;

      const response = await fetch(`${API_URL}/api/chat/completion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          temperature: 0.3,
          n_predict: 800,
          stop: ["EXCERPT 5:", "END", "CONCLUSION"]
        })
      });

      if (!response.ok) throw new Error("Failed to extract contexts");

      const data = await response.json();
      const content = data.content || data.completion || "";
      
      const excerptMatches = content.match(/EXCERPT \d+:\s*(.*?)\s*RELEVANCE:\s*(.*?)(?=EXCERPT \d+:|$)/gs);
      
      if (excerptMatches) {
        const parsedContexts = excerptMatches.map((match, index) => {
          const lines = match.trim().split('\n');
          let excerptText = '';
          let relevance = '';
          let isExcerpt = false;
          let isRelevance = false;

          for (const line of lines) {
            if (line.startsWith('EXCERPT')) {
              isExcerpt = true;
              isRelevance = false;
              continue;
            }
            if (line.startsWith('RELEVANCE:')) {
              isExcerpt = false;
              isRelevance = true;
              relevance = line.replace('RELEVANCE:', '').trim();
              continue;
            }
            if (isExcerpt) {
              excerptText += line + ' ';
            } else if (isRelevance) {
              relevance += ' ' + line;
            }
          }

          return {
            id: index + 1,
            excerpt: excerptText.trim(),
            relevance: relevance.trim(),
            highlighted: highlightKeyTerms(excerptText.trim(), suggestion)
          };
        }).filter(ctx => ctx.excerpt.length > 20);

        setContexts(parsedContexts);
      } else {
        const fallbackContexts = findKeywordMatches(suggestion, transcriptText);
        setContexts(fallbackContexts);
      }
    } catch (error) {
      console.error("Error extracting contexts:", error);
      const fallbackContexts = findKeywordMatches(suggestion, transcriptText);
      setContexts(fallbackContexts);
    } finally {
      setLoading(false);
    }
  };

  const findKeywordMatches = (suggestion, text) => {
    const keyTerms = suggestion
      .toLowerCase()
      .replace(/[?.,!]/g, '')
      .split(' ')
      .filter(word => word.length > 3 && !['what', 'how', 'why', 'does', 'the', 'and', 'are', 'for', 'with', 'this', 'that'].includes(word));

    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 50);
    const matches = [];

    sentences.forEach((sentence, index) => {
      const lowerSentence = sentence.toLowerCase();
      const matchCount = keyTerms.filter(term => lowerSentence.includes(term)).length;
      
      if (matchCount >= 2) {
        const startIndex = Math.max(0, index - 1);
        const endIndex = Math.min(sentences.length, index + 2);
        const context = sentences.slice(startIndex, endIndex).join('. ').trim();
        
        matches.push({
          id: matches.length + 1,
          excerpt: context,
          relevance: `Contains ${matchCount} key terms from the question`,
          highlighted: highlightKeyTerms(context, suggestion),
          score: matchCount
        });
      }
    });

    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  };

  const highlightKeyTerms = (text, suggestion) => {
    const keyTerms = suggestion
      .toLowerCase()
      .replace(/[?.,!]/g, '')
      .split(' ')
      .filter(word => word.length > 3 && !['what', 'how', 'why', 'does', 'the', 'and', 'are', 'for', 'with', 'this', 'that'].includes(word));

    let highlightedText = text;
    keyTerms.forEach(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      highlightedText = highlightedText.replace(regex, `<mark class="bg-yellow-200 px-1 rounded">$&</mark>`);
    });

    return highlightedText;
  };

  return (
    <div className="p-4 h-full flex flex-col space-y-4 text-xs relative">
      {/* Close button removed */}

      <div className="flex-1 overflow-auto space-y-4">
        {!selectedSuggestion ? (
          <div className="text-gray-500 italic text-center py-8">
            Click the source icon (🔍) next to an AI suggestion to see the relevant transcript sections.
          </div>
        ) : (
          <>
            <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded">
              <div className="font-bold text-blue-800 mb-1 text-xs">Selected Question:</div>
              <div className="text-blue-700 text-xs italic">"{selectedSuggestion}"</div>
            </div>

            {loading ? (
              <div className="text-center text-gray-500 py-4">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                <div className="mt-2">Analyzing transcript...</div>
              </div>
            ) : contexts.length === 0 ? (
              <div className="text-gray-500 italic text-center py-4">
                No specific references found in the transcript.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-gray-700 font-bold text-xs">
                  Found {contexts.length} relevant section{contexts.length !== 1 ? 's' : ''}:
                </div>
                
                {contexts.map((context) => (
                  <div key={context.id} className="border rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="bg-blue-500 text-white text-[9px] px-2 py-1 rounded-full font-bold">
                        #{context.id}
                      </span>
                      <span className="text-[10px] text-gray-600 font-medium">
                        {context.relevance}
                      </span>
                    </div>
                    
                    <div 
                      className="text-xs text-gray-800 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: context.highlighted }}
                    />
                  </div>
                ))}
              </div>
            )}

            {transcript && (
              <div className="border-t pt-3 mt-4">
                <div className="flex flex-wrap gap-1">
                  <span className={`text-[10px] px-2 py-1 rounded-full ${
                    transcript.source === 'PODCAST' 
                      ? 'bg-purple-100 text-purple-600' 
                      : 'bg-green-100 text-green-600'
                  }`}>
                    {transcript.channel}
                  </span>
                  <span className={`text-[9px] px-1 py-1 rounded-full uppercase font-bold ${
                    transcript.source === 'PODCAST' 
                      ? 'bg-purple-200 text-purple-700' 
                      : 'bg-red-200 text-red-700'
                  }`}>
                    {transcript.source === 'PODCAST' ? 'POD' : 'YT'}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}