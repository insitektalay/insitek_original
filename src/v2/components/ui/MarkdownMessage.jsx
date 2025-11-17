import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * MarkdownMessage Component
 *
 * Renders AI chat responses with rich Markdown formatting and Insitek's indigo theme.
 * Inspired by ParentLens formatting system with multi-stage text preprocessing.
 *
 * Features:
 * - Multi-stage preprocessing pipeline (normalization, streaming sanitization, emoji styling)
 * - Custom indigo theme matching Insitek brand colors
 * - Streaming-ready with incomplete syntax handling
 * - Auto-styles emojis in indigo color
 * - Handles edge cases (blockquotes after lists, dangling bold markers)
 */
function MarkdownMessage({ content, isStreaming = false }) {
  /**
   * Multi-stage preprocessing pipeline
   * Transforms raw markdown text before rendering
   */
  const processedContent = React.useMemo(() => {
    // Stage 1: Normalize line endings
    const normalized = content.replace(/\r\n/g, '\n')

    // Stage 2: Streaming sanitization (balance incomplete syntax during streaming)
    const sanitized = isStreaming ? sanitizeStreamingMarkdown(normalized) : normalized

    // Stage 3: Emoji styling (wrap emojis in bold for indigo color)
    const emojiStyled = wrapEmojisInIndigoColor(sanitized)

    // Stage 4: Blockquote spacing fix (add newlines after lists before blockquotes)
    const quoteFixed = fixQuotesAfterListItems(emojiStyled)

    return quoteFixed.trim()
  }, [content, isStreaming])

  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={indigoThemeComponents}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}

/**
 * Stage 2: Streaming Sanitization
 *
 * Handles incomplete Markdown syntax during streaming to prevent visual glitches.
 * - Balances dangling ** bold markers
 * - Removes incomplete list markers at end of stream
 * - Prevents broken rendering during token-by-token streaming
 */
function sanitizeStreamingMarkdown(text) {
  let result = text

  // Balance dangling bold markers at end of stream
  // Example: "This is **bol" → "This is bol" (removes incomplete bold)
  const boldMatches = result.match(/\*\*/g)
  if (boldMatches && boldMatches.length % 2 !== 0) {
    // Odd number of ** markers - remove the last one
    const lastBoldIndex = result.lastIndexOf('**')
    if (lastBoldIndex !== -1) {
      result = result.slice(0, lastBoldIndex) + result.slice(lastBoldIndex + 2)
    }
  }

  // Remove incomplete list markers at end (e.g., "- " with no content after)
  result = result.replace(/(\n- |\n\d+\. )$/, '\n')

  return result
}

/**
 * Stage 3: Emoji Color Wrapping
 *
 * Wraps all emojis in bold Markdown syntax (**emoji**) so they render in indigo color.
 * Detects full Unicode emoji ranges including:
 * - Emoticons (😀-🙏)
 * - Symbols (🎯, 💡, ✅, ⚠️, etc.)
 * - Flags
 * - Extended pictographs
 *
 * Example: "✅ Good idea" → "**✅** Good idea"
 * Visual result: Indigo checkmark + black text
 */
function wrapEmojisInIndigoColor(text) {
  // Comprehensive emoji regex covering all Unicode emoji ranges
  const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gu

  return text.replace(emojiRegex, (match) => {
    // Don't double-wrap if already wrapped in bold
    const beforeMatch = text.slice(Math.max(0, text.indexOf(match) - 2), text.indexOf(match))
    const afterMatch = text.slice(text.indexOf(match) + match.length, text.indexOf(match) + match.length + 2)

    if (beforeMatch === '**' && afterMatch === '**') {
      return match // Already wrapped
    }

    return `**${match}**`
  })
}

/**
 * Stage 4: Blockquote Spacing Fix
 *
 * Fixes Markdown parser edge case: blockquotes immediately after lists.
 * Adds extra newline between list items and blockquotes for proper visual separation.
 *
 * Example:
 * Before: "- List item\n> Quote"
 * After:  "- List item\n\n> Quote"
 */
function fixQuotesAfterListItems(text) {
  // Add newline between list items and blockquotes
  return text.replace(/(\n[-*] .+)\n(> )/g, '$1\n\n$2')
           .replace(/(\n\d+\. .+)\n(> )/g, '$1\n\n$2')
}

/**
 * Indigo Theme Components
 *
 * Custom React components for react-markdown that apply Insitek's indigo color scheme.
 * Maps Markdown elements to styled React components.
 */
const indigoThemeComponents = {
  // Paragraphs - gray text with bottom margin
  p: ({ children }) => (
    <p className="text-gray-700 mb-4 leading-relaxed">
      {children}
    </p>
  ),

  // Bold text - indigo color for emphasis (also used for emojis)
  strong: ({ children }) => (
    <strong className="font-semibold text-indigo-600">
      {children}
    </strong>
  ),

  // Italic text - medium weight for subtle emphasis
  em: ({ children }) => (
    <em className="font-medium italic">
      {children}
    </em>
  ),

  // H1 headings - Document title
  h1: ({ children }) => (
    <h1 className="text-3xl font-bold text-gray-900 mt-8 mb-6">
      {children}
    </h1>
  ),

  // H2 headings - Major sections
  h2: ({ children }) => (
    <h2 className="text-2xl font-semibold text-gray-900 mt-7 mb-5">
      {children}
    </h2>
  ),

  // H3 headings - Main sections
  h3: ({ children }) => (
    <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-4">
      {children}
    </h3>
  ),

  // H4 headings - Subsections
  h4: ({ children }) => (
    <h4 className="text-lg font-semibold text-gray-900 mt-5 mb-3">
      {children}
    </h4>
  ),

  // H5 headings - Sub-subsections
  h5: ({ children }) => (
    <h5 className="text-base font-semibold text-gray-900 mt-4 mb-2">
      {children}
    </h5>
  ),

  // Unordered lists - indigo bullets
  ul: ({ children }) => (
    <ul className="space-y-2 mb-4 ml-5">
      {children}
    </ul>
  ),

  // List items - indigo bullet color
  li: ({ children }) => (
    <li className="text-gray-700 leading-relaxed" style={{ listStyleType: 'disc', color: '#4f46e5' }}>
      <span style={{ color: '#374151' }}>{children}</span>
    </li>
  ),

  // Ordered lists
  ol: ({ children }) => (
    <ol className="list-decimal space-y-2 mb-4 ml-5 text-gray-700">
      {children}
    </ol>
  ),

  // Blockquotes - indigo left border with gray text
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-indigo-600 pl-4 py-2 my-4 text-gray-600 italic bg-gray-50">
      {children}
    </blockquote>
  ),

  // Inline code - monospace with gray background
  code: ({ inline, children }) => {
    if (inline) {
      return (
        <code className="px-1.5 py-0.5 bg-gray-100 text-gray-800 rounded text-sm font-mono">
          {children}
        </code>
      )
    }
    // Block code handled by pre element
    return <code>{children}</code>
  },

  // Code blocks - monospace with gray background and rounded corners
  pre: ({ children }) => (
    <pre className="bg-gray-100 rounded-lg p-4 overflow-x-auto my-4 text-sm font-mono text-gray-800">
      {children}
    </pre>
  ),

  // Links - indigo color with underline
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-indigo-600 underline hover:text-indigo-700"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),

  // Horizontal rules
  hr: () => (
    <hr className="my-6 border-t border-gray-300" />
  ),

  // Strikethrough (via remark-gfm)
  del: ({ children }) => (
    <del className="text-gray-500 line-through">
      {children}
    </del>
  ),
}

export default MarkdownMessage
