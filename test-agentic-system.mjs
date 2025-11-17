#!/usr/bin/env node

/**
 * Test script for the Agentic Document Generation System
 *
 * This script demonstrates the complete workflow:
 * 1. Start agent document generation
 * 2. Poll for progress updates
 * 3. Display final document and analytics
 */

const API_BASE = 'http://localhost:3001';

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

function log(emoji, color, message) {
  console.log(`${emoji} ${color}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
  console.log('='.repeat(60) + '\n');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startGeneration(transcriptIds, documentType, preferences) {
  logSection('🚀 Starting Agent Document Generation');

  const response = await fetch(`${API_BASE}/api/agent-documents/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcriptIds, documentType, preferences })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const result = await response.json();
  log('✅', colors.green, `Document ID: ${result.documentId}`);
  log('📝', colors.blue, result.message);

  return result.documentId;
}

async function pollStatus(documentId) {
  logSection('📊 Monitoring Agent Progress');

  let isComplete = false;
  let iteration = 0;

  while (!isComplete) {
    iteration++;

    const response = await fetch(`${API_BASE}/api/agent-documents/${documentId}/status`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const status = await response.json();

    // Display progress
    const progressBar = '█'.repeat(Math.floor(status.progress / 2)) +
                       '░'.repeat(50 - Math.floor(status.progress / 2));

    process.stdout.write(`\r${colors.yellow}[${progressBar}] ${status.progress}%${colors.reset} - ${status.currentStage || 'Working...'} | Tool Calls: ${status.stats?.toolCallCount || 0} | Sections: ${status.stats?.sectionsCreated || 0}/${status.stats?.sectionsWithContent || 0}`);

    if (status.status === 'COMPLETE') {
      isComplete = true;
      console.log('\n');
      log('🎉', colors.green, 'Generation complete!');
      log('📈', colors.cyan, `Total tool calls: ${status.stats.toolCallCount}`);
      log('📝', colors.cyan, `Sections created: ${status.stats.sectionsCreated}`);
      log('📋', colors.cyan, `Notes collected: ${status.stats.notesCollected}`);
      log('💰', colors.cyan, `Total cost: $${status.stats.totalCost?.toFixed(4) || '0.0000'}`);
      return status;
    }

    if (status.status === 'FAILED') {
      console.log('\n');
      log('❌', colors.red, `Generation failed: ${status.errorMessage}`);
      throw new Error(status.errorMessage);
    }

    await sleep(3000); // Poll every 3 seconds
  }
}

async function getDocument(documentId) {
  const response = await fetch(`${API_BASE}/api/agent-documents/${documentId}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function getAnalysis(documentId) {
  const response = await fetch(`${API_BASE}/api/agent-documents/${documentId}/analysis`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function displayResults(documentId) {
  logSection('📄 Final Document');

  const document = await getDocument(documentId);

  console.log(`${colors.bright}Title:${colors.reset} ${document.title}`);
  console.log(`${colors.bright}Type:${colors.reset} ${document.documentType}`);
  console.log(`${colors.bright}Word Count:${colors.reset} ${document.wordCount} words`);
  console.log(`${colors.bright}Generation Time:${colors.reset} ${document.generationTime}s`);
  console.log(`${colors.bright}Sections:${colors.reset} ${document.sections.length}`);
  console.log('\n' + colors.cyan + document.content.substring(0, 500) + '...' + colors.reset);

  logSection('📊 Agent Behavior Analysis');

  const analysis = await getAnalysis(documentId);

  console.log(`${colors.bright}Tool Usage Breakdown:${colors.reset}`);
  Object.entries(analysis.toolCallBreakdown).forEach(([tool, count]) => {
    console.log(`  • ${tool}: ${count}`);
  });

  console.log(`\n${colors.bright}Reading Pattern:${colors.reset}`);
  analysis.readingPattern.forEach((item, idx) => {
    console.log(`  ${idx + 1}. Transcript ${item.transcriptId.substring(0, 8)}... (${new Date(item.timestamp).toLocaleTimeString()})`);
  });

  console.log(`\n${colors.bright}Note Utilization:${colors.reset}`);
  console.log(`  • Total notes: ${analysis.noteUtilization.total}`);
  console.log(`  • Used in final: ${analysis.noteUtilization.used}`);
  console.log(`  • Utilization rate: ${(analysis.noteUtilization.utilizationRate * 100).toFixed(1)}%`);

  console.log(`\n${colors.bright}Section Evolution:${colors.reset}`);
  analysis.sectionEvolution.forEach(section => {
    console.log(`  • "${section.title}": ${section.finalWordCount} words, ${section.revisionCount} revisions`);
  });
}

// Main execution
async function main() {
  try {
    console.log('\n' + colors.bright + colors.blue);
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     AGENTIC DOCUMENT GENERATION SYSTEM - TEST SUITE        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(colors.reset);

    // Test configuration
    const transcriptIds = [
      'db7471f5-c138-4c32-83f8-2c034fbf9c79', // Jamie Oliver autumn recipes
      'a76ab69e-fc7b-4d59-a05f-359e3beed2ec'  // Jamie Oliver squash & bean stew
    ];

    const documentType = 'Recipe Collection Analysis';
    const preferences = {
      tone: 'informative',
      depth: 'detailed',
      audience: 'food enthusiasts'
    };

    log('📋', colors.blue, `Document type: ${documentType}`);
    log('📚', colors.blue, `Using ${transcriptIds.length} transcripts`);
    log('🎯', colors.blue, `Preferences: ${JSON.stringify(preferences)}`);

    // Step 1: Start generation
    const documentId = await startGeneration(transcriptIds, documentType, preferences);

    // Step 2: Poll for completion
    await pollStatus(documentId);

    // Step 3: Display results
    await displayResults(documentId);

    logSection('✨ Test Complete');
    log('🎯', colors.green, `Document generated successfully: ${documentId}`);
    log('📖', colors.cyan, `View full document at: ${API_BASE}/api/agent-documents/${documentId}`);

  } catch (error) {
    console.error('\n' + colors.red + '❌ Error:', error.message + colors.reset);
    process.exit(1);
  }
}

main();
