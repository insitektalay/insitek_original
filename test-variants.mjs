#!/usr/bin/env node
// test-variants.mjs
// Test script to compare baseline vs scalable variants

const API_URL = 'http://localhost:3001';

// Test configuration
const TEST_TRANSCRIPTS = [
  '2121847e-23b2-4264-b29a-d37b1dbf0abf', // Build Hour: Agentic Tool Calling (48k words)
  '9027dd7b-eee1-4e30-8898-64c9c22f128e', // How to Build Reliable AI Agents in 2025 (30k words)
  '9cc4eb09-3636-4761-83b3-0df74369ab9f'  // Doug Casey: Profit from Monetary Reset (44k words)
];

const DOCUMENT_TYPE = 'AI Agents Investment Guide';

const CUSTOM_INSTRUCTIONS = `
Create a comprehensive guide with the following structure:

1. Introduction to AI Agents (1-2 paragraphs)
2. Current State of AI Agent Technology (2-3 paragraphs with examples)
3. Investment Opportunities (2-3 paragraphs with specific examples)
4. Risks and Challenges (2 paragraphs)
5. Actionable Recommendations (bulleted list with 5-7 items)

Each section should include:
- Specific quotes or data points from the transcripts
- Real-world examples
- Clear, actionable insights

Target length: 1500-2000 words total.
Tone: Professional but accessible.
`;

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bright');
  console.log('='.repeat(80));
}

async function generateDocument(variantId, variantName) {
  logSection(`Testing Variant: ${variantName}`);

  try {
    log(`📤 Sending generation request...`, 'cyan');

    const response = await fetch(`${API_URL}/api/agent-documents/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcriptIds: TEST_TRANSCRIPTS,
        documentType: DOCUMENT_TYPE,
        variantId,
        preferences: {
          customInstructions: CUSTOM_INSTRUCTIONS,
          tone: 'professional',
          depth: 'detailed'
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Generation failed');
    }

    const data = await response.json();
    log(`✅ Document generation started: ${data.documentId}`, 'green');

    return data.documentId;
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    throw error;
  }
}

async function pollDocumentStatus(documentId, variantName) {
  log(`\n⏳ Monitoring ${variantName} generation...`, 'yellow');

  let isComplete = false;
  let lastProgress = -1;
  const startTime = Date.now();

  while (!isComplete) {
    try {
      const response = await fetch(`${API_URL}/api/agent-documents/${documentId}/status`);
      const status = await response.json();

      // Show progress update if changed
      if (status.progress !== lastProgress) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        log(
          `  ${status.status} | Progress: ${status.progress}% | ` +
          `Tool Calls: ${status.stats?.toolCallCount || 0} | ` +
          `Sections: ${status.stats?.sectionsWithContent || 0}/${status.stats?.sectionsCreated || 0} | ` +
          `Elapsed: ${elapsed}s`,
          'cyan'
        );
        lastProgress = status.progress;
      }

      if (status.status === 'COMPLETE') {
        isComplete = true;
        const totalTime = Math.floor((Date.now() - startTime) / 1000);
        log(`\n✅ ${variantName} completed in ${totalTime}s!`, 'green');
        return status;
      }

      if (status.status === 'FAILED') {
        throw new Error(status.errorMessage || 'Generation failed');
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error) {
      log(`❌ Error polling status: ${error.message}`, 'red');
      throw error;
    }
  }
}

async function getDocumentAnalysis(documentId) {
  try {
    const response = await fetch(`${API_URL}/api/agent-documents/${documentId}/analysis`);
    if (!response.ok) throw new Error('Failed to fetch analysis');
    return await response.json();
  } catch (error) {
    log(`⚠️  Could not fetch analysis: ${error.message}`, 'yellow');
    return null;
  }
}

async function compareResults(baselineId, scalableId) {
  logSection('📊 Comparison Results');

  try {
    // Fetch both documents
    const [baselineRes, scalableRes] = await Promise.all([
      fetch(`${API_URL}/api/agent-documents/${baselineId}`),
      fetch(`${API_URL}/api/agent-documents/${scalableId}`)
    ]);

    const baseline = await baselineRes.json();
    const scalable = await scalableRes.json();

    // Fetch analyses
    const [baselineAnalysis, scalableAnalysis] = await Promise.all([
      getDocumentAnalysis(baselineId),
      getDocumentAnalysis(scalableId)
    ]);

    console.log('\n📈 Generation Metrics:');
    console.log('─'.repeat(80));
    console.log(`                    ${'Baseline'.padEnd(20)} ${'Scalable'.padEnd(20)}`);
    console.log('─'.repeat(80));

    const metrics = [
      ['Tool Calls', baseline.toolCallCount, scalable.toolCallCount],
      ['Total Tokens', baseline.totalTokens, scalable.totalTokens],
      ['Cost (USD)', `$${baseline.totalCost?.toFixed(4) || '0'}`, `$${scalable.totalCost?.toFixed(4) || '0'}`],
      ['Word Count', baseline.wordCount, scalable.wordCount],
      ['Sections', baseline.sections?.length || 0, scalable.sections?.length || 0],
      ['Notes Collected', baseline.notes?.length || 0, scalable.notes?.length || 0],
      ['Generation Time', `${Math.floor(baseline.generationTimeMs / 1000)}s`, `${Math.floor(scalable.generationTimeMs / 1000)}s`]
    ];

    metrics.forEach(([label, baseVal, scaleVal]) => {
      console.log(`${label.padEnd(20)} ${String(baseVal).padEnd(20)} ${String(scaleVal).padEnd(20)}`);
    });

    // Show scalable-specific metrics
    if (scalableAnalysis) {
      console.log('\n🔍 Scalable Variant Features:');
      console.log('─'.repeat(80));

      if (scalable.workflowPlan) {
        log(`✓ Workflow Plan Created: ${scalable.workflowPlan.steps?.length || 0} steps`, 'green');
      }

      if (scalable.notes) {
        const byImportance = scalable.notes.reduce((acc, note) => {
          acc[note.importance] = (acc[note.importance] || 0) + 1;
          return acc;
        }, {});

        log(`✓ Notes by Importance:`, 'green');
        Object.entries(byImportance).forEach(([importance, count]) => {
          console.log(`    ${importance}: ${count}`);
        });
      }

      if (scalableAnalysis.toolUsagePatterns) {
        log(`✓ Tool Usage Patterns:`, 'green');
        const patterns = scalableAnalysis.toolUsagePatterns;
        console.log(`    Transcript searches: ${patterns.search_transcripts || 0}`);
        console.log(`    Chunk reads: ${patterns.read_transcript_chunk || 0}`);
        console.log(`    Note searches: ${patterns.search_notes || 0}`);
      }
    }

    console.log('\n📄 Document IDs:');
    console.log(`  Baseline: ${baselineId}`);
    console.log(`  Scalable: ${scalableId}`);

    log('\n✅ Comparison complete!', 'green');
    log('View full documents at:', 'cyan');
    log(`  http://localhost:3001/api/agent-documents/${baselineId}`, 'blue');
    log(`  http://localhost:3001/api/agent-documents/${scalableId}`, 'blue');

  } catch (error) {
    log(`❌ Error comparing results: ${error.message}`, 'red');
  }
}

async function main() {
  logSection('🧪 Agentic Document Generation - Variant Testing');

  console.log('\nTest Configuration:');
  console.log(`  Transcripts: ${TEST_TRANSCRIPTS.length}`);
  console.log(`  Document Type: ${DOCUMENT_TYPE}`);
  console.log(`  Variants: baseline vs scalable\n`);

  try {
    // Generate with baseline variant
    const baselineId = await generateDocument('baseline', 'Baseline');
    const baselineStatus = await pollDocumentStatus(baselineId, 'Baseline');

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Generate with scalable variant
    const scalableId = await generateDocument('scalable', 'Scalable');
    const scalableStatus = await pollDocumentStatus(scalableId, 'Scalable');

    // Compare results
    await compareResults(baselineId, scalableId);

  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();
