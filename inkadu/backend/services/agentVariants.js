// services/agentVariants.js
// Configuration system for A/B testing different agent approaches

/**
 * Variant Definitions
 *
 * Each variant represents a different approach to document generation.
 * This allows A/B testing to measure the impact of new features.
 */

export const VARIANT_DEFINITIONS = {
  // ========================================
  // BASELINE: Original approach (pre-scaling)
  // ========================================
  baseline: {
    id: 'baseline',
    name: 'Baseline (Original)',
    description: 'Original document generation approach without scalability enhancements',

    features: {
      // Scalability features
      transcriptChunking: false,
      scalableTranscriptTools: false, // list_available, search, read_chunk
      workflowPlanning: false,

      // Note management
      noteImportance: false,
      noteSearch: false,

      // Reasoning
      narrativeReasoning: true, // Keep this - it's valuable for all variants
    },

    tools: {
      // Only classic tools
      enabled: [
        'read_transcript',
        'take_note',
        'create_section',
        'write_section',
        'get_current_document_state',
        'update_progress',
        'finalize_document'
      ],
      disabled: [
        'list_available_transcripts',
        'search_transcripts',
        'read_transcript_chunk',
        'create_workflow_plan',
        'search_notes'
      ]
    },

    systemPrompt: {
      includeWorkflowStep: false,
      includeNoteImportance: false,
      emphasizeScalableTools: false
    },

    limitations: {
      maxTranscripts: 5, // Realistically, baseline can't handle more
      expectedToolCalls: '20-40'
    }
  },

  // ========================================
  // SCALABLE: Full new feature set
  // ========================================
  scalable: {
    id: 'scalable',
    name: 'Scalable (All Features)',
    description: 'New approach with chunking, workflow planning, importance ratings, and search',

    features: {
      // Scalability features
      transcriptChunking: true,
      scalableTranscriptTools: true,
      workflowPlanning: true,

      // Note management
      noteImportance: true,
      noteSearch: true,

      // Reasoning
      narrativeReasoning: true,
    },

    tools: {
      // All tools enabled
      enabled: [
        'list_available_transcripts',
        'search_transcripts',
        'read_transcript_chunk',
        'read_transcript',
        'take_note',
        'search_notes',
        'create_workflow_plan',
        'create_section',
        'write_section',
        'get_current_document_state',
        'update_progress',
        'finalize_document'
      ],
      disabled: []
    },

    systemPrompt: {
      includeWorkflowStep: true,
      includeNoteImportance: true,
      emphasizeScalableTools: true
    },

    limitations: {
      maxTranscripts: 50, // Can handle much more
      expectedToolCalls: '50-150'
    }
  },

  // ========================================
  // HYBRID: Middle ground for comparison
  // ========================================
  hybrid: {
    id: 'hybrid',
    name: 'Hybrid (Selective Features)',
    description: 'Uses scalable transcript tools but not workflow planning or importance',

    features: {
      // Scalability features
      transcriptChunking: true,
      scalableTranscriptTools: true,
      workflowPlanning: false, // Test if planning helps

      // Note management
      noteImportance: false, // Test if importance ratings help
      noteSearch: false,

      // Reasoning
      narrativeReasoning: true,
    },

    tools: {
      enabled: [
        'list_available_transcripts',
        'search_transcripts',
        'read_transcript_chunk',
        'read_transcript',
        'take_note',
        'create_section',
        'write_section',
        'get_current_document_state',
        'update_progress',
        'finalize_document'
      ],
      disabled: [
        'create_workflow_plan',
        'search_notes'
      ]
    },

    systemPrompt: {
      includeWorkflowStep: false,
      includeNoteImportance: false,
      emphasizeScalableTools: true
    },

    limitations: {
      maxTranscripts: 30,
      expectedToolCalls: '40-80'
    }
  }
};

/**
 * Get variant configuration by ID
 */
export function getVariant(variantId) {
  if (!variantId || variantId === 'default') {
    return VARIANT_DEFINITIONS.scalable; // Default to scalable
  }

  const variant = VARIANT_DEFINITIONS[variantId];
  if (!variant) {
    throw new Error(`Unknown variant: ${variantId}. Available: ${Object.keys(VARIANT_DEFINITIONS).join(', ')}`);
  }

  return variant;
}

/**
 * Check if a tool is enabled for a variant
 */
export function isToolEnabled(variantId, toolName) {
  const variant = getVariant(variantId);
  return variant.tools.enabled.includes(toolName);
}

/**
 * Get list of all available variants for UI display
 */
export function getAllVariants() {
  return Object.values(VARIANT_DEFINITIONS).map(v => ({
    id: v.id,
    name: v.name,
    description: v.description,
    maxTranscripts: v.limitations.maxTranscripts
  }));
}

/**
 * Validate if variant can handle requested number of transcripts
 */
export function validateVariantForTranscripts(variantId, transcriptCount) {
  const variant = getVariant(variantId);

  if (transcriptCount > variant.limitations.maxTranscripts) {
    return {
      valid: false,
      message: `Variant "${variant.name}" supports max ${variant.limitations.maxTranscripts} transcripts. You requested ${transcriptCount}. Consider using "scalable" variant.`
    };
  }

  return { valid: true };
}

/**
 * Get recommended variant based on transcript count
 */
export function getRecommendedVariant(transcriptCount) {
  if (transcriptCount <= 5) {
    return 'baseline'; // Baseline works fine for small sets
  } else if (transcriptCount <= 15) {
    return 'hybrid'; // Hybrid is good middle ground
  } else {
    return 'scalable'; // Scalable for large sets
  }
}

/**
 * Generate comparison report for two variants
 */
export function compareVariants(variantId1, variantId2) {
  const v1 = getVariant(variantId1);
  const v2 = getVariant(variantId2);

  return {
    variants: [v1.name, v2.name],
    features: {
      transcriptChunking: [v1.features.transcriptChunking, v2.features.transcriptChunking],
      scalableTools: [v1.features.scalableTranscriptTools, v2.features.scalableTranscriptTools],
      workflowPlanning: [v1.features.workflowPlanning, v2.features.workflowPlanning],
      noteImportance: [v1.features.noteImportance, v2.features.noteImportance],
      noteSearch: [v1.features.noteSearch, v2.features.noteSearch]
    },
    toolCount: [v1.tools.enabled.length, v2.tools.enabled.length],
    maxTranscripts: [v1.limitations.maxTranscripts, v2.limitations.maxTranscripts]
  };
}
