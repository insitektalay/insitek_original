// src/v2/hooks/useTransferFunctions.js

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function useTransferFunctions() {

    // Manual transfer functions
    const transferLastResponse = (messages, onCaptureInsight, transcript = null) => {
      const lastAIMessage = [...messages].reverse().find(m => m.role === 'assistant');
      if (!lastAIMessage) return alert('No AI response to transfer');

      onCaptureInsight?.({
        content: lastAIMessage.content,
        suggestedTitle: "Full Response from Chat",
        source: 'chat_manual_full',
        timestamp: Date.now(),
        transcript
      });
    };
  
    const transferSelectedText = (onCaptureInsight, transcript = null) => {
      const selectedText = window.getSelection().toString().trim();
      if (!selectedText) return alert('Please select some text first');
      if (selectedText.length < 20) return alert('Please select more text');

      onCaptureInsight?.({
        content: selectedText,
        suggestedTitle: "Selected Text from Chat",
        source: 'chat_manual_selected',
        timestamp: Date.now(),
        transcript
      });
    };
  
    // Condensed transfer functions
    const transferCondensedResponse = async (messages, compressionLevel, onCaptureInsight, transcript = null) => {
      console.log("🎯 transferCondensedResponse called!", { compressionLevel, messagesCount: messages.length });
      const lastAIMessage = [...messages].reverse().find(m => m.role === 'assistant');
      if (!lastAIMessage) {
        console.log("❌ No AI message found");
        return alert('No AI response to condense');
      }
      console.log("✅ Found AI message, starting condensation...");

      try {
        const compressionPrompts = {
          0.75: "Condense this response to 75% of its length while keeping all key points:",
          0.5: "Condense this response to 50% of its length, keeping only the most important information:",
          0.25: "Create a very concise summary of this response (25% length), including only the essential points:"
        };

        const prompt = `${compressionPrompts[compressionLevel]}

  "${lastAIMessage.content}"

  Condensed version:`;

        console.log("📡 Making API call to condense...");
        const response = await fetch(`${API_URL}/api/chat/completion`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            temperature: 0.3,
            n_predict: Math.floor(lastAIMessage.content.length * compressionLevel * 0.8),
            stop: ["Condensed version:", "Original:", "\n\n"],
            stream: false
          })
        });

        console.log("📬 Response received:", response.status, response.ok);
        if (!response.ok) {
          const errorText = await response.text();
          console.error("❌ Response not OK:", response.status, errorText);
          throw new Error("Condensing failed");
        }

        const data = await response.json();
        const condensedContent = (data.content || "").trim();

        // Clean up any weird characters or artifacts
        const cleanContent = condensedContent
          .replace(/\|+/g, '') // Remove pipe characters
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .replace(/["']/g, '') // Remove extra quotes
          .trim();

        if (cleanContent && cleanContent.length > 20) {
          onCaptureInsight?.({
            content: cleanContent,
            suggestedTitle: `Condensed Insight (${Math.round(compressionLevel * 100)}%)`,
            source: `chat_condensed_${compressionLevel}`,
            timestamp: Date.now(),
            transcript
          });
        } else {
          alert("Failed to generate condensed version");
        }
      } catch (error) {
        console.error("Condensing error:", error);
        alert("Failed to condense response");
      }
    };
  
    return {
      transferLastResponse,
      transferSelectedText,
      transferCondensedResponse
    };
  }