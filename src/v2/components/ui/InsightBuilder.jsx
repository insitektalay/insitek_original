import { useEffect, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Heading from "@tiptap/extension-heading";
import BulletList from "@tiptap/extension-bullet-list";
import ListItem from "@tiptap/extension-list-item";
import Link from "@tiptap/extension-link";
import { BookmarkIcon, SparklesIcon, ListBulletIcon, HashtagIcon, PencilSquareIcon, FolderIcon, ChevronDownIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useDroppable } from '@dnd-kit/core';
import { useNavigation } from '../../contexts/NavigationContext';
import { SourceReference } from '../../extensions/SourceReference';
import { PreserveStyles } from '../../extensions/PreserveStyles';
import { RawHTML } from '../../extensions/RawHTML';

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// AI will generate tags based on editor content

export default function InsightBuilder({ onClose, editingInsight, onSaved, autoCapturedContent, transcript }) {
  console.log("🚀 INSIGHT BUILDER - Insight-centric mode");
  console.log("🔄 COMPONENT RENDER:", {
    timestamp: Date.now(),
    editingInsightId: editingInsight?.id,
    hasAutoCapturedContent: !!autoCapturedContent,
    transcriptId: transcript?.id
  });

  const { handleSelectTranscript, navigateTo } = useNavigation();

  const [selectedInsightId, setSelectedInsightId] = useState(editingInsight?.id || null);
  const [selectedInsightName, setSelectedInsightName] = useState(editingInsight?.insightName || "");
  const [availableInsights, setAvailableInsights] = useState([]);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newInsightName, setNewInsightName] = useState("");
  const [tags, setTags] = useState(editingInsight?.tags || []);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [aiGeneratedTags, setAiGeneratedTags] = useState([]);
  const [isGeneratingTags, setIsGeneratingTags] = useState(false);
  const [showInsightDropdown, setShowInsightDropdown] = useState(false);

  const processedContentRef = useRef(new Set());
  const tagGenerationTimeoutRef = useRef(null);
  const editorContainerRef = useRef(null);

  // Fetch available insights
  const fetchInsights = async () => {
    try {
      const response = await fetch(`${API_URL}/api/insights`);
      if (response.ok) {
        const insights = await response.json();
        setAvailableInsights(insights);
      }
    } catch (error) {
      console.error('Failed to fetch insights:', error);
    }
  };

  // Load insights on component mount
  useEffect(() => {
    fetchInsights();
  }, []);

  // Generate AI tags based on editor content
  const generateAITags = async (content) => {
    if (!content || content.length < 50) {
      setAiGeneratedTags([]);
      return;
    }

    setIsGeneratingTags(true);
    
    try {
      const prompt = `Analyze this insight content and generate 3-8 relevant, specific tags that describe the key topics, themes, or concepts. Focus on concrete subjects rather than generic terms.

Content:
"${content}"

Generate tags as single words or short phrases (2-3 words max), separated by commas. Focus on:
- Specific topics mentioned
- Key concepts or themes
- Industry/domain terms
- Action items or outcomes

Example response: economics, federal-reserve, inflation, monetary-policy, debt-crisis

Tags:`;

      const response = await fetch(`${API_URL}/api/chat/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          temperature: 0.3,
          n_predict: 150,
          stop: ['Content:', 'Example:', 'Generate', '\n\n'],
        }),
      });

      if (!response.ok) {
        console.error('Tag generation failed:', response.status);
        setAiGeneratedTags([]);
        return;
      }

      const data = await response.json();
      const result = data.content || data.completion || '';
      
      // Parse the comma-separated tags
      const generatedTags = result
        .split(/[,\n]/)
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 2 && tag.length < 25)
        .filter(tag => !tags.includes(tag)) // Exclude already added tags
        .slice(0, 8) // Limit to 8 tags max
        .map((name, index) => ({ id: Date.now() + index, name }));

      console.log('🏷️ Generated AI tags:', generatedTags.map(t => t.name));
      setAiGeneratedTags(generatedTags);
      
    } catch (error) {
      console.error('Tag generation error:', error);
      setAiGeneratedTags([]);
    } finally {
      setIsGeneratingTags(false);
    }
  };

  // Debounced tag generation - triggers 2 seconds after user stops typing
  const debouncedGenerateTags = (content) => {
    if (tagGenerationTimeoutRef.current) {
      clearTimeout(tagGenerationTimeoutRef.current);
    }
    
    tagGenerationTimeoutRef.current = setTimeout(() => {
      generateAITags(content);
    }, 2000);
  };

  // Filter AI generated tags based on query and exclude already added tags
  const filteredTags = tagQuery === '' 
    ? aiGeneratedTags.filter(tag => !tags.includes(tag.name))
    : aiGeneratedTags.filter((tag) => 
        tag.name.toLowerCase().includes(tagQuery.toLowerCase()) && 
        !tags.includes(tag.name)
      );

  // Handle adding suggested tag
  const handleTagSelect = (tagName) => {
    if (!tags.includes(tagName)) {
      setTags(prev => [...prev, tagName]);
    }
    setShowTagSuggestions(false);
    setTagQuery('');
  };

  // Format selected text to bullet points
  const formatToBulletList = async () => {
    if (!editor) return;
    
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);
    
    if (selectedText && selectedText.length > 0) {
      // Check if it's a paragraph that needs to be broken down
      const lines = selectedText.split('\n').filter(line => line.trim().length > 0);
      
      if (lines.length === 1 && selectedText.length > 100) {
        // Single long paragraph - use AI to break it into bullet points
        setStatus('Converting to bullet points...');
        
        try {
          const prompt = `Convert this text into 3-6 concise bullet points. Each bullet should capture a key point or idea. 

IMPORTANT: Return ONLY the bullet points, one per line, starting with "• ". Do not include any code, explanations, or other text.

Text to convert:
${selectedText}

Bullet points:`;

          const response = await fetch(`${API_URL}/api/chat/completion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt,
              temperature: 0.3,
              n_predict: 200,
              stop: ['Text to convert:', 'Bullet points:', '\n\n\n'],
            }),
          });

          if (response.ok) {
            const data = await response.json();
            let rawResponse = (data.content || data.completion || '').trim();
            
            console.log('🔥 Raw bullet response:', rawResponse);
            
            // Clean up the response more aggressively
            let bulletText = rawResponse
              .replace(/\|/g, '') // Remove pipe characters
              .replace(/[_\-]{3,}/g, '') // Remove long dashes/underscores
              .replace(/```[\s\S]*?```/g, '') // Remove code blocks
              .replace(/def\s+\w+\(.*?\):/g, '') // Remove Python function definitions
              .replace(/import\s+\w+/g, '') // Remove import statements
              .split('\n')
              .filter(line => {
                const trimmed = line.trim();
                // Filter out code-like lines and very short lines
                return trimmed.length > 5 && 
                       !trimmed.includes('print(') && 
                       !trimmed.includes('def ') &&
                       !trimmed.includes('import ') &&
                       !trimmed.includes('```');
              })
              .map(line => {
                let cleaned = line.trim();
                // Remove existing bullets and add new ones
                cleaned = cleaned.replace(/^[•\-\*]\s*/, '');
                return cleaned.length > 0 ? `• ${cleaned}` : '';
              })
              .filter(line => line.length > 3) // Remove empty or very short bullets
              .join('\n');
            
            console.log('🎯 Cleaned bullet text:', bulletText);
            
            if (bulletText.length > 20 && bulletText.includes('•')) {
              // Replace the selected text with bullet points using a more reliable method
              console.log('✅ Replacing selected text with AI bullets');
              console.log('🎯 AI Selection range:', { from, to, selectedLength: to - from });
              
              // Method 1: Try using insertContentAt which is more precise
              try {
                editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, bulletText).run();
                setStatus('Converted to bullet points!');
                setTimeout(() => setStatus(''), 2000);
                return;
              } catch (error) {
                console.log('Method 1 failed, trying method 2:', error);
                
                // Method 2: Manual deletion then insertion
                try {
                  editor.chain().focus().setTextSelection({ from, to }).deleteSelection().run();
                  setTimeout(() => {
                    editor.chain().focus().insertContent(bulletText).run();
                  }, 50);
                  setStatus('Converted to bullet points!');
                  setTimeout(() => setStatus(''), 2000);
                  return;
                } catch (error2) {
                  console.log('Method 2 also failed:', error2);
                }
              }
            } else {
              console.log('❌ Invalid bullet response');
              setStatus('AI bullet conversion failed - using fallback');
            }
          }
        } catch (error) {
          console.error('AI bullet conversion failed:', error);
        }
        
        // Fallback: Break paragraph into sentences manually
        console.log('💡 Using fallback sentence splitting...');
        const sentences = selectedText
          .split(/\.\s+/) // Split on period followed by space
          .map(s => s.trim())
          .filter(s => s.length > 15) // Longer minimum to avoid fragments
          .slice(0, 5); // Max 5 bullets
        
        if (sentences.length > 1) {
          const fallbackBullets = sentences
            .map(sentence => {
              // Clean up and ensure sentence ends properly
              let cleaned = sentence.trim();
              if (!cleaned.endsWith('.') && !cleaned.endsWith('!') && !cleaned.endsWith('?')) {
                cleaned += '.';
              }
              return `• ${cleaned}`;
            })
            .join('\n');
          
          console.log('📝 Fallback bullets:', fallbackBullets);
          console.log('🎯 Selection range:', { from, to, selectedLength: to - from });
          
          // Replace selected text with bullet points using more reliable method
          try {
            editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, fallbackBullets).run();
          } catch (error) {
            console.log('Fallback method 1 failed, trying method 2:', error);
            editor.chain().focus().setTextSelection({ from, to }).deleteSelection().run();
            setTimeout(() => {
              editor.chain().focus().insertContent(fallbackBullets).run();
            }, 50);
          }
          
          // Verify the replacement worked
          setTimeout(() => {
            const newContent = editor.getText();
            console.log('✅ Content after replacement:', newContent.substring(Math.max(0, from - 50), from + 200));
          }, 100);
          
          setStatus('Converted to bullets (sentence split)');
          setTimeout(() => setStatus(''), 2000);
          return;
        }
        
        setStatus('');
      }
      
      if (lines.length > 1) {
        // Multiple lines - convert each to a bullet point
        const bulletText = lines.map(line => `• ${line.trim()}`).join('\n');
        console.log('🔧 Multi-line bullet conversion');
        try {
          editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, bulletText).run();
        } catch (error) {
          editor.chain().focus().setTextSelection({ from, to }).deleteSelection().run();
          setTimeout(() => editor.chain().focus().insertContent(bulletText).run(), 50);
        }
      } else {
        // Single line - just add bullet point
        const bulletText = `• ${selectedText.trim()}`;
        console.log('🔧 Single-line bullet conversion');
        try {
          editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, bulletText).run();
        } catch (error) {
          editor.chain().focus().setTextSelection({ from, to }).deleteSelection().run();
          setTimeout(() => editor.chain().focus().insertContent(bulletText).run(), 50);
        }
      }
    } else {
      // No selection - toggle bullet list at cursor position
      editor.chain().focus().toggleBulletList().run();
    }
  };

  // Generate AI title based on all editor content
  const generateAITitle = async () => {
    if (!editor) return;
    
    const fullContent = editor.getText();
    
    if (!fullContent || fullContent.length < 50) {
      setStatus('Need more content to generate a title (50+ characters)');
      setTimeout(() => setStatus(''), 2000);
      return;
    }

    setStatus('Generating title...');
    
    try {
      const prompt = `Write a compelling title for this content. The title should capture the main topic or key insight directly.

DO NOT write "the text discusses" or "this content covers" - write the title as if it's a headline or article title.

Examples of good titles:
- "Bretton Woods System: How It Shaped Global Finance"
- "The Rise and Fall of the Gold Standard" 
- "Understanding Federal Reserve Policy Changes"

Content: ${fullContent.substring(0, 800)}

Title:`;

      console.log('📝 Sending title generation request...');
      
      const response = await fetch(`${API_URL}/api/chat/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          temperature: 0.4,
          n_predict: 50,
          stop: ['Content:', '\n', 'Title:', '##'],
        }),
      });

      console.log('📡 Response status:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('📋 Raw AI title response:', data);
      
      const rawResponse = (data.content || data.completion || '').trim();
      console.log('🔍 Raw title response before cleaning:', `"${rawResponse}"`);
      
      if (!rawResponse || rawResponse.length < 3) {
        console.log('❌ AI server returned empty response, using fallback');
        throw new Error('Empty AI response');
      }
      
      let generatedTitle = rawResponse
        .replace(/^["'`]|["'`]$/g, '') // Remove quotes
        .replace(/^#+\s*/, '') // Remove markdown headers  
        .replace(/[_\-]{5,}/g, '') // Remove long dashes/underscores
        .replace(/^\s*Title:\s*/i, '') // Remove "Title:" prefix
        .replace(/^\s*Header:\s*/i, '') // Remove "Header:" prefix
        .replace(/\s*\|\s*\[.*?\].*$/i, '') // Remove "| [Your Name]" and similar patterns
        .replace(/\s*\|\s*.*$/i, '') // Remove anything after a pipe character
        .split('\n')[0] // Take only first line
        .trim();
      
      console.log('🎯 Cleaned title:', `"${generatedTitle}"`);
      
      if (generatedTitle.length > 5 && generatedTitle.length < 150) {
        setTitle(generatedTitle);
        setStatus('Title generated successfully!');
      } else {
        console.log('❌ Invalid title - length:', generatedTitle.length, 'content:', generatedTitle);
        // Fallback: Use first few words of content
        const fallbackTitle = fullContent
          .split(/[.!?]/)[0] // Take first sentence
          .split(' ')
          .slice(0, 10) // First 10 words max
          .join(' ')
          .replace(/[.,!?:;]$/g, '') // Remove trailing punctuation
          .trim();
        
        if (fallbackTitle.length > 5) {
          setTitle(fallbackTitle);
          setStatus('Title created (AI gave invalid response - used content summary)');
        } else {
          setStatus('Could not generate a valid title');
        }
      }
      
    } catch (error) {
      console.error('Title generation error:', error);
      
      // Always try fallback when AI fails
      console.log('🔄 AI failed, using fallback title generation...');
      
      try {
        const fullContent = editor.getText();
        const fallbackTitle = fullContent
          .split(/[.!?]/)[0] // Take first sentence
          .split(' ')
          .slice(0, 10) // First 10 words max
          .join(' ')
          .replace(/[.,!?:;]$/g, '') // Remove trailing punctuation
          .trim();
        
        if (fallbackTitle.length > 5) {
          setTitle(fallbackTitle);
          setStatus('Title created (AI offline - used content summary)');
          setTimeout(() => setStatus(''), 3000);
          return;
        }
      } catch (fallbackError) {
        console.error('Fallback title generation also failed:', fallbackError);
      }
      
      setStatus(`Title generation failed: ${error.message}`);
      setTimeout(() => setStatus(''), 5000);
    }
    
    setTimeout(() => setStatus(''), 3000);
  };

  // Generate AI header for selected text
  const generateAIHeader = async () => {
    if (!editor) return;
    
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);
    
    if (!selectedText || selectedText.length < 10) {
      setStatus('Please select some text to generate a header for');
      setTimeout(() => setStatus(''), 2000);
      return;
    }

    setStatus('Generating header...');
    
    try {
      const prompt = `Write a short title for this text. Return only the title, nothing else.

Text: ${selectedText.substring(0, 400)}

Title:`;

      console.log('📝 Sending header generation request...');
      console.log('🔗 Request URL:', `${API_URL}/api/chat/completion`);
      console.log('📋 Request payload:', {
        prompt: prompt.substring(0, 100) + '...',
        temperature: 0.3,
        n_predict: 30
      });
      
      const response = await fetch(`${API_URL}/api/chat/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          temperature: 0.3,
          n_predict: 30,
          stop: ['Content:', '\n', 'Title:', '##'],
        }),
      });

      console.log('📡 Response status:', response.status);
      console.log('📡 Response headers:', response.headers);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('📋 Raw AI response (full):', data);
      
      const rawResponse = (data.content || data.completion || '').trim();
      console.log('🔍 Raw response before cleaning:', `"${rawResponse}"`);
      
      if (!rawResponse || rawResponse.length < 3) {
        console.log('❌ AI server returned empty response, using fallback');
        // Skip AI and go straight to fallback
        throw new Error('Empty AI response');
      }
      
      let header = rawResponse
        .replace(/^["'`]|["'`]$/g, '') // Remove quotes
        .replace(/^#+\s*/, '') // Remove markdown headers  
        .replace(/[_\-]{5,}/g, '') // Remove long underscores/dashes
        .replace(/^\s*Title:\s*/i, '') // Remove "Title:" prefix
        .replace(/^\s*Header:\s*/i, '') // Remove "Header:" prefix
        .replace(/\s*\|\s*\[.*?\].*$/i, '') // Remove "| [Your Name]" and similar patterns
        .replace(/\s*\|\s*.*$/i, '') // Remove anything after a pipe character
        .split('\n')[0] // Take only first line
        .trim();
      
      console.log('🎯 Cleaned header:', `"${header}"`);
      
      // If header is still empty after cleaning, try a fallback
      if (!header || header.length < 3) {
        // Use the first few words of the selected text as a fallback
        const fallbackHeader = selectedText
          .split(' ')
          .slice(0, 6)
          .join(' ')
          .replace(/[.,!?]$/, ''); // Remove trailing punctuation
        
        if (fallbackHeader.length > 10) {
          header = fallbackHeader + '...';
          console.log('🔄 Using fallback header:', header);
        } else {
          setStatus('Could not generate a valid header');
          return;
        }
      }
      
      if (header.length > 3 && header.length < 120) {
        // Insert the header above the selected text as a separate heading
        editor.chain().focus().setTextSelection(from).insertContent(header).setHeading({ level: 2 }).insertContent('<p></p>').run();
        setStatus('Header generated successfully!');
      } else {
        console.log('❌ Invalid header - length:', header.length, 'content:', header);
        setStatus(`Header too ${header.length < 3 ? 'short' : 'long'}: "${header}"`);
      }
      
    } catch (error) {
      console.error('Header generation error:', error);
      
      // Always try fallback when AI fails
      console.log('🔄 AI failed, using fallback header generation...');
      
      try {
        // Create a simple header from the selected text
        const fallbackHeader = selectedText
          .split(/[.!?]/)[0] // Take first sentence
          .split(' ')
          .slice(0, 8) // First 8 words max
          .join(' ')
          .replace(/[.,!?:;]$/g, '') // Remove trailing punctuation
          .trim();
        
        if (fallbackHeader.length > 5) {
          editor.chain().focus().setTextSelection(from).insertContent(fallbackHeader).setHeading({ level: 2 }).insertContent('<p></p>').run();
          setStatus('Header created (AI offline - used text summary)');
          setTimeout(() => setStatus(''), 3000);
          return;
        }
      } catch (fallbackError) {
        console.error('Fallback header generation also failed:', fallbackError);
      }
      
      setStatus(`Header generation failed: ${error.message}`);
      setTimeout(() => setStatus(''), 5000);
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: {
          HTMLAttributes: {
            class: null,
          },
        },
        bulletList: {
          HTMLAttributes: {
            class: null,
          },
        },
        listItem: {
          HTMLAttributes: {
            class: null,
          },
        },
      }),
      Bold.configure({
        HTMLAttributes: {
          class: null,
        },
      }),
      Italic.configure({
        HTMLAttributes: {
          class: null,
        },
      }),
      Heading.configure({
        levels: [1, 2, 3],
        HTMLAttributes: {
          class: null,
        },
      }),
      BulletList.configure({
        HTMLAttributes: {
          class: null,
        },
      }),
      ListItem.configure({
        HTMLAttributes: {
          class: null,
        },
      }),
      Link.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            style: {
              default: null,
              parseHTML: element => element.getAttribute('style'),
              renderHTML: attributes => {
                if (!attributes.style) {
                  return {};
                }
                return {
                  style: attributes.style,
                };
              },
            },
            class: {
              default: null,
              parseHTML: element => element.getAttribute('class'),
              renderHTML: attributes => {
                if (!attributes.class) {
                  return {};
                }
                return {
                  class: attributes.class,
                };
              },
            },
          };
        },
      }),
      SourceReference,
      PreserveStyles,
    ],
    content: editingInsight?.content || "",
    onUpdate: ({ editor }) => {
      // Temporarily disabled to prevent infinite re-renders
      // TODO: Re-enable with better debouncing
      // const content = editor.getText();
      // debouncedGenerateTags(content);
    },
    // Configure editor to preserve data attributes and custom spans
    parseOptions: {
      preserveWhitespace: 'full',
    },
    enableInputRules: false,
    enablePasteRules: false,
    editorProps: {
      transformPastedHTML(html) {
        // Don't transform - keep original HTML
        return html;
      },
      handleDrop: (view, event, slice, moved) => {
        console.log('📦 TiptapJS handleDrop triggered!');
        console.log('📦 event:', event);
        console.log('📦 slice:', slice);
        console.log('📦 transcript:', transcript);

        // Prevent default TiptapJS drop behavior
        event.preventDefault();

        // Try to get HTML first to preserve formatting, fallback to plain text
        let droppedHTML = event.dataTransfer?.getData('text/html');
        const droppedText = event.dataTransfer?.getData('text/plain') || slice.content.textBetween(0, slice.content.size, '\n');

        console.log('📦 ====== DRAG DATA DEBUG ======');
        console.log('📦 droppedHTML (first 500 chars):', droppedHTML?.substring(0, 500));
        console.log('📦 droppedText:', droppedText);
        console.log('📦 Available data types:', event.dataTransfer?.types);
        console.log('📦 ============================');

        if (!droppedHTML && !droppedText) return false;

        // Create inline metadata HTML if transcript is available
        let metadataHTML = '';
        if (transcript) {
          const publishDate = transcript.publishDate
            ? new Date(transcript.publishDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })
            : 'Date unknown';

          const videoTitle = transcript.title || 'Unknown video';
          const channelName = transcript.channel || 'Unknown channel';
          const transcriptId = transcript.id || '';

          console.log('🔍 Creating source reference:', {
            videoTitle,
            channelName,
            publishDate,
            transcriptId
          });

          // Inline '[i]' reference at end of text - tooltip format: "Video Title | Channel | Date"
          const tooltipText = `${videoTitle} | ${channelName} | ${publishDate}`;
          metadataHTML = ` <span style="color: #6b7280; font-size: 0.875rem; cursor: pointer; margin-left: 0.25rem;"
                class="source-info-icon"
                data-transcript-id="${transcriptId}"
                data-title="${videoTitle.replace(/"/g, '&quot;')}"
                data-channel="${channelName.replace(/"/g, '&quot;')}"
                title="${tooltipText.replace(/"/g, '&quot;')}">[i]</span>`;
        }

        // Insert on a new line at the end
        const currentText = view.state.doc.textContent;
        const hasContent = currentText.length > 0;

        // Use HTML if available (preserves formatting), otherwise use plain text
        let contentToInsert;
        if (droppedHTML) {
          // Clean up the HTML - remove meta tags
          let cleanHTML = droppedHTML
            .replace(/^<meta[^>]*>/, '') // Remove meta tags
            .replace(/^<!--.*?-->/, '') // Remove comments
            .trim();

          console.log('📦 Cleaned HTML (first 300 chars):', cleanHTML.substring(0, 300));

          // Filter inline styles - keep only structural styles, remove colors and fonts
          cleanHTML = cleanHTML.replace(/style="([^"]*)"/g, (match, styleContent) => {
            const allowedProperties = [
              'margin',
              'padding',
              'display',
              'flex',
              'grid',
              'border',
              'background-color',
              'text-align',
              'line-height',
              'list-style',
            ];

            // Filter and keep only allowed CSS properties
            const filteredStyles = styleContent
              .split(';')
              .map(prop => prop.trim())
              .filter(prop => {
                const propName = prop.split(':')[0].trim();
                // Keep if it matches any allowed property
                return allowedProperties.some(allowed => propName.startsWith(allowed));
              })
              .join('; ');

            return filteredStyles ? `style="${filteredStyles}"` : '';
          });

          console.log('📦 HTML with filtered styles (first 300 chars):', cleanHTML.substring(0, 300));

          // Find the last closing tag to insert [i] before it
          const lastClosingTagMatch = cleanHTML.match(/<\/(p|li|h[1-6]|ul|ol)>(?![\s\S]*<\/(p|li|h[1-6]|ul|ol)>)/i);

          if (lastClosingTagMatch && metadataHTML) {
            // Insert [i] before the last closing tag
            const insertPosition = lastClosingTagMatch.index;
            contentToInsert =
              cleanHTML.substring(0, insertPosition) +
              metadataHTML +
              cleanHTML.substring(insertPosition);
          } else {
            // No suitable tag found, append [i] at the end
            contentToInsert = cleanHTML + metadataHTML;
          }
        } else {
          // Fallback to plain text
          contentToInsert = `<p>${droppedText}${metadataHTML}</p>`;
        }

        // Insert using TiptapJS
        if (!hasContent) {
          view.dispatch(view.state.tr.insertText(''));
          editor.chain().focus().insertContent(contentToInsert).run();
        } else {
          const endPos = view.state.doc.content.size;
          editor.chain()
            .focus()
            .setTextSelection({ from: endPos, to: endPos })
            .insertContent(`<p></p>${contentToInsert}`)
            .run();
        }

        return true; // Prevent default handling
      }
    }
  });

  // Drop zone functionality for drag-and-drop from chat
  const { isOver, setNodeRef: setDroppableRef } = useDroppable({
    id: 'insight-editor-dropzone',
  })

  useEffect(() => {
    if (!editingInsight || !editor) return;
    editor.commands.setContent(editingInsight.content);
    setSelectedInsightId(editingInsight.id);
    setSelectedInsightName(editingInsight.insightName);
    setTags(editingInsight.tags);
    processedContentRef.current.clear();
  }, [editingInsight, editor]);

  useEffect(() => {
    if (autoCapturedContent && editor) {
      console.log("⚡ V39-SUPER-DEFENSIVE-LOGIC: Processing content");
      
      const contentHash = autoCapturedContent.content.length + '-' + autoCapturedContent.timestamp;
      if (processedContentRef.current.has(contentHash)) {
        console.log("Content already processed, skipping");
        return;
      }
      processedContentRef.current.add(contentHash);

      if (!selectedInsightName && autoCapturedContent.suggestedTitle) {
        setNewInsightName(autoCapturedContent.suggestedTitle);
        setIsCreatingNew(true);
      }

      const newContent = autoCapturedContent.content;

      // Extract transcript metadata
      console.log("🔍 DEBUG autoCapturedContent:", autoCapturedContent);
      console.log("🔍 DEBUG transcript:", autoCapturedContent.transcript);
      const transcriptMeta = autoCapturedContent.transcript;
      let metadataHTML = '';

      if (transcriptMeta) {
        const publishDate = transcriptMeta.publishDate
          ? new Date(transcriptMeta.publishDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })
          : 'Date unknown';

        const videoTitle = transcriptMeta.title || 'Unknown video';
        const channelName = transcriptMeta.channel || 'Unknown channel';
        const transcriptId = transcriptMeta.id || '';

        console.log('🔍 Creating source reference (auto-capture):', {
          videoTitle,
          channelName,
          publishDate,
          transcriptId
        });

        // Inline '[i]' reference at end of text - tooltip format: "Video Title | Channel | Date"
        const tooltipText = `${videoTitle} | ${channelName} | ${publishDate}`;
        metadataHTML = ` <span style="color: #6b7280; font-size: 0.875rem; cursor: pointer; margin-left: 0.25rem;"
              class="source-info-icon"
              data-transcript-id="${transcriptId}"
              data-title="${videoTitle.replace(/"/g, '&quot;')}"
              data-channel="${channelName.replace(/"/g, '&quot;')}"
              title="${tooltipText.replace(/"/g, '&quot;')}">[i]</span>`;
      }

      // Force a delay to let any re-renders settle
      setTimeout(() => {
        const currentText = editor.getText();
        const hasContent = currentText.length > 0;

        console.log("📊 CONTENT CHECK:", {
          "currentText.length": currentText.length,
          "hasContent": hasContent,
          "willAppend": hasContent,
          "hasMetadata": !!transcriptMeta
        });

        // NUCLEAR OPTION: Always use insertContent with manual positioning
        // Always insert on a NEW LINE with inline metadata
        if (!hasContent) {
          console.log("📝 FIRST INSERT - editor is empty");
          editor.chain().focus().insertContent(`<p>${newContent}${metadataHTML}</p>`).run();
        } else {
          console.log("➕ APPENDING - moving to end first");
          // Move to absolute end and insert with line break and inline metadata
          const endPos = editor.state.doc.content.size;
          editor.chain()
            .focus()
            .setTextSelection({ from: endPos, to: endPos })
            .insertContent(`<p></p><p>${newContent}${metadataHTML}</p>`)
            .run();
        }

        setTimeout(() => {
          console.log("🔍 FINAL RESULT:", {
            editorTextLength: editor.getText().length,
            lastPartOfText: editor.getText().slice(-100)
          });
        }, 200);
      }, 100);

      // Removed automatic tag generation

      const sourceLabel = autoCapturedContent.source?.includes('condensed') ?
        'Condensed content captured from chat!' :
        autoCapturedContent.source === 'chat_smart_selective' ?
          'Smart insight extracted from chat!' : 'Content auto-captured from chat!';

      setStatus(sourceLabel);
      setTimeout(() => setStatus(""), 3000);
      
      // Generate tags for the newly added content
      setTimeout(() => {
        const fullContent = editor.getText();
        if (fullContent.length > 50) {
          debouncedGenerateTags(fullContent);
        }
      }, 1000);
    }
  }, [autoCapturedContent, editor]);

  // Add click handler for source info icons
  useEffect(() => {
    if (!editor) return;

    const handleInfoIconClick = async (event) => {
      const target = event.target;
      if (target.classList.contains('source-info-icon')) {
        const transcriptId = target.getAttribute('data-transcript-id');
        if (transcriptId) {
          try {
            await handleSelectTranscript(transcriptId);
            navigateTo('Chat');
          } catch (error) {
            console.error('Failed to navigate to transcript:', error);
          }
        }
      }
    };

    // Attach listener to the editor's DOM element
    const editorElement = editor.view.dom;
    editorElement.addEventListener('click', handleInfoIconClick);

    // Cleanup
    return () => {
      editorElement.removeEventListener('click', handleInfoIconClick);
    };
  }, [editor, handleSelectTranscript, navigateTo]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (tagGenerationTimeoutRef.current) {
        clearTimeout(tagGenerationTimeoutRef.current);
      }
    };
  }, []);

  const commitInput = () => {
    const add = input.split(",").map(s => s.trim()).filter(Boolean)
      .filter(t => !tags.includes(t));
    if (add.length) setTags([...tags, ...add]);
    setInput("");
  };

  const save = async () => {
    // Determine insight name
    const insightName = isCreatingNew ? newInsightName.trim() : selectedInsightName;

    if (!insightName) {
      return alert("Please select or create an insight");
    }

    commitInput();

    const content = editor?.getHTML() || "";

    try {
      if (isCreatingNew && !selectedInsightId) {
        // Creating new insight with first source
        const payload = {
          insightName,
          content,
          tags,
          transcriptId: transcript?.id,
          contentSnippet: content
        };

        const response = await fetch(`${API_URL}/api/insights`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const error = await response.json();
          if (error.existingId) {
            // Insight already exists, switch to that one
            setSelectedInsightId(error.existingId);
            setSelectedInsightName(insightName);
            setIsCreatingNew(false);
            setStatus(`Insight "${insightName}" already exists, using existing.`);
            setTimeout(() => setStatus(""), 3000);
            return;
          }
          throw new Error(error.error || "Failed to create insight");
        }

        const newInsight = await response.json();
        setStatus("New insight created!");
        setSelectedInsightId(newInsight.id);
        setSelectedInsightName(newInsight.insightName);
        setIsCreatingNew(false);
      } else if (selectedInsightId) {
        // Updating existing insight
        const payload = {
          insightName,
          content,
          tags
        };

        const response = await fetch(`${API_URL}/api/insights/${selectedInsightId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Failed to update insight");

        setStatus("Insight updated!");
      }

      setTimeout(() => setStatus(""), 2000);
      onSaved?.();
      fetchInsights(); // Refresh insights list
    } catch (error) {
      console.error("Save error:", error);
      setStatus(`Save failed: ${error.message}`);
      setTimeout(() => setStatus(""), 3000);
    }
  };

  return (
    <div className="h-full w-full flex flex-col text-xs relative">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-auto p-4 pb-20">
        <div className="space-y-3">
          {/* Insight Selector */}
          <div className="relative mb-4">
            <button
              onClick={() => setShowInsightDropdown(!showInsightDropdown)}
              className="w-full text-left px-4 py-2 border border-gray-300 rounded-lg hover:border-indigo-500 transition-colors flex justify-between items-center"
            >
              <span className="text-sm text-gray-700">
                {isCreatingNew
                  ? 'Creating new insight...'
                  : (selectedInsightName || 'Select an insight')}
              </span>
              <ChevronDownIcon className="w-4 h-4 text-gray-400" />
            </button>

            {showInsightDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                {/* Create New Option */}
                <div
                  onClick={() => {
                    setIsCreatingNew(true);
                    setSelectedInsightId(null);
                    setSelectedInsightName("");
                    setShowInsightDropdown(false);
                  }}
                  className="px-4 py-2 hover:bg-indigo-50 cursor-pointer border-b border-gray-100"
                >
                  <div className="flex items-center gap-2">
                    <PlusIcon className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-medium text-indigo-600">Create New Insight</span>
                  </div>
                </div>

                {/* Existing Insights */}
                {availableInsights.map((insight) => (
                  <div
                    key={insight.id}
                    onClick={() => {
                      setSelectedInsightId(insight.id);
                      setSelectedInsightName(insight.insightName);
                      setIsCreatingNew(false);
                      setShowInsightDropdown(false);
                      setTags(insight.tags || []);
                      if (editor) {
                        editor.commands.setContent(insight.content);
                      }
                    }}
                    className={`px-4 py-2 hover:bg-gray-50 cursor-pointer ${
                      selectedInsightId === insight.id ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <div className="text-sm font-medium">{insight.insightName}</div>
                    {insight.sourceCount > 0 && (
                      <div className="text-xs text-gray-500">{insight.sourceCount} source(s)</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Click outside to close */}
            {showInsightDropdown && (
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowInsightDropdown(false)}
              />
            )}
          </div>

          {/* Insight Name Display or Input */}
          {isCreatingNew ? (
            <div>
              <input
                type="text"
                value={newInsightName}
                onChange={(e) => setNewInsightName(e.target.value)}
                placeholder="Enter insight name (e.g., Gold, Economy, Microsoft)..."
                className="w-full rounded px-3 py-2 border border-indigo-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                style={{
                  color: "#32302B",
                  fontSize: "24px",
                  fontWeight: "600"
                }}
                autoFocus
              />
            </div>
          ) : selectedInsightName ? (
            <div>
              <h1 style={{
                color: "#32302B",
                fontSize: "30px",
                lineHeight: "36px",
                fontWeight: "700"
              }}>
                {selectedInsightName}
              </h1>
            </div>
          ) : null}

          <div
            ref={setDroppableRef}
            className="rounded"
            style={{
              minHeight: "300px",
              border: isOver ? '2px solid #4f46e5' : '2px solid transparent',
              backgroundColor: isOver ? '#f0f0ff' : 'transparent',
              transition: 'all 0.2s ease'
            }}
          >
            <EditorContent
              editor={editor}
              className="px-3 py-2 insight-editor-no-outline"
              style={{
                fontSize: "12px !important",
                lineHeight: "18px !important",
                color: "#32302B"
              }}
            />
          </div>
          
          <style jsx>{`
            .insight-editor-no-outline .ProseMirror {
              outline: none !important;
              border: none !important;
              box-shadow: none !important;
              color: #32302B !important;
              font-size: 12px !important;
              line-height: 18px !important;
            }
            .insight-editor-no-outline .ProseMirror:focus {
              outline: none !important;
              border: none !important;
              box-shadow: none !important;
              color: #32302B !important;
              font-size: 12px !important;
              line-height: 18px !important;
            }
            .insight-editor-no-outline .ProseMirror h2 {
              font-size: 16px !important;
              line-height: 24px !important;
              font-weight: 600 !important;
              color: #32302B !important;
              margin: 16px 0 8px 0 !important;
              font-family: inherit !important;
            }
            .insight-editor-no-outline .ProseMirror h2 * {
              font-weight: 600 !important;
            }
          `}</style>

          {status && <div className={`text-xs mt-2 ${status.includes('failed') ? 'text-red-600' : 'text-green-600'}`}>{status}</div>}
        </div>
      </div>

      {/* Fixed bottom section with formatting, tags and save icon */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
        {/* Formatting Icons Row */}
        <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
          {/* Left side - Formatting buttons */}
          <div className="flex gap-2">
            <button
              onClick={formatToBulletList}
              className="flex items-center justify-center w-8 h-8 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
              title="Convert to bullet list"
            >
              <ListBulletIcon className="w-4 h-4" />
            </button>
            
            <button
              onClick={generateAIHeader}
              className="flex items-center justify-center w-8 h-8 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
              title="Generate AI header for selected text"
            >
              <HashtagIcon className="w-4 h-4" />
            </button>
            
            <button
              onClick={generateAITitle}
              className="flex items-center justify-center w-8 h-8 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
              title="Generate AI title based on content"
            >
              <PencilSquareIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="flex justify-between items-center">
          {/* Left side - Tags */}
          <div className="flex flex-wrap gap-1 items-center flex-1 mr-4 relative">
            {tags.map(t => (
              <span key={t}
                className="bg-indigo-100 text-indigo-600 text-[10px] px-2 py-[2px] rounded-full flex items-center gap-1">
                {t}
                <button onClick={() => setTags(tags.filter(x => x !== t))} className="text-[10px]">×</button>
              </span>
            ))}
            
            {/* Tag input with AI suggestions trigger */}
            <div className="flex items-center gap-1">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commitInput(); } }}
                onBlur={commitInput}
                placeholder="add tag…" className="border rounded px-1 text-[10px] w-24" />
              
              {/* AI Tag Suggestions Trigger */}
              <div className="relative">
                <button
                  onClick={() => setShowTagSuggestions(!showTagSuggestions)}
                  className="inline-flex items-center p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                  title="Show AI tag suggestions"
                >
                  <SparklesIcon className="h-3 w-3" />
                </button>

                {/* Suggestions Panel - positioned above */}
                {showTagSuggestions && (
                  <div className="absolute bottom-full mb-2 w-80 z-50">
                    <div className="transform rounded-xl bg-white p-2 shadow-2xl ring-1 ring-black/5">
                      {/* Filter Input */}
                      <input
                        autoFocus
                        className="w-full rounded-md bg-gray-100 px-4 py-2.5 text-gray-900 outline-none placeholder:text-gray-500 text-sm"
                        placeholder="Filter suggestions or add tag..."
                        value={tagQuery}
                        onChange={(e) => setTagQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && tagQuery.trim()) {
                            handleTagSelect(tagQuery.trim());
                          }
                          if (e.key === "Escape") {
                            setShowTagSuggestions(false);
                            setTagQuery('');
                          }
                        }}
                      />
                      
                      {/* Loading State */}
                      {isGeneratingTags && (
                        <div className="px-4 py-8 text-center">
                          <div className="inline-flex items-center">
                            <SparklesIcon className="animate-spin h-5 w-5 text-indigo-600 mr-2" />
                            <p className="text-sm text-gray-600">Analyzing content...</p>
                          </div>
                        </div>
                      )}
                      
                      {/* Suggestions List */}
                      {!isGeneratingTags && filteredTags.length > 0 && (
                        <div className="-mb-2 max-h-72 scroll-py-2 overflow-y-auto py-2 text-sm text-gray-800">
                          {filteredTags.map((tag) => (
                            <div
                              key={tag.id}
                              onClick={() => handleTagSelect(tag.name)}
                              className="cursor-pointer rounded-md px-4 py-2 select-none hover:bg-indigo-600 hover:text-white transition-colors"
                            >
                              <div className="flex items-center">
                                <span className="inline-flex items-center rounded-full bg-gray-100 hover:bg-white px-2.5 py-0.5 text-xs font-medium text-gray-800">
                                  {tag.name}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Empty States */}
                      {!isGeneratingTags && aiGeneratedTags.length === 0 && !editor?.getText()?.length && (
                        <div className="px-4 py-8 text-center">
                          <SparklesIcon className="mx-auto h-6 w-6 text-gray-400" />
                          <p className="mt-2 text-sm text-gray-900">No content to analyze yet</p>
                          <p className="text-xs text-gray-500">Start typing in the editor to generate relevant tags</p>
                        </div>
                      )}
                      
                      {!isGeneratingTags && aiGeneratedTags.length === 0 && editor?.getText()?.length > 0 && editor?.getText()?.length < 50 && (
                        <div className="px-4 py-8 text-center">
                          <SparklesIcon className="mx-auto h-6 w-6 text-gray-400" />
                          <p className="mt-2 text-sm text-gray-900">Add more content for AI suggestions</p>
                          <p className="text-xs text-gray-500">Need at least 50 characters to generate tags</p>
                        </div>
                      )}
                      
                      {/* No matches found */}
                      {!isGeneratingTags && tagQuery !== '' && filteredTags.length === 0 && aiGeneratedTags.length > 0 && (
                        <div className="px-4 py-8 text-center">
                          <SparklesIcon className="mx-auto h-6 w-6 text-gray-400" />
                          <p className="mt-2 text-sm text-gray-900">No matching suggestions found.</p>
                          <p className="text-xs text-gray-500">Press Enter to add "{tagQuery}" as a custom tag</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Click-outside handler */}
                {showTagSuggestions && (
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => {
                      setShowTagSuggestions(false);
                      setTagQuery('');
                    }}
                  />
                )}
              </div>
            </div>
          </div>
          
          {/* Right side - Save Icon */}
          <button onClick={save}
            className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded transition-colors"
            title="Save Insight">
            <BookmarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}